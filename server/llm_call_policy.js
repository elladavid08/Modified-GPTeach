/**
 * Retry / timeout policy for the per-turn LLM calls (/api/pck-feedback, /api/generate). Since 1.3.6.
 *
 * Provisional values from the 120-call latency baseline (research/simulator_audit/latency_baseline.md).
 * They are centralised here and can be overridden by environment variables, so production telemetry
 * can tune them without code changes.
 *
 * This is the ONLY retry layer for these calls: the browser sends exactly one request per agent
 * (with a hard timeout, src/config/llmCallPolicy.js), and the legacy `withRetry` in server.js is not
 * used for them. So a call never makes more than `maxAttempts` model requests.
 */

const positive = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const LLM_CALL_POLICY = Object.freeze({
  maxAttempts: Math.min(2, positive('LLM_MAX_ATTEMPTS', 2)), // decided maximum: 2 total attempts
  perAttemptTimeoutMs: positive('LLM_ATTEMPT_TIMEOUT_MS', 20000),
  totalBudgetMs: positive('LLM_TOTAL_BUDGET_MS', 45000),
  rateLimitBackoffMs: positive('LLM_RATE_LIMIT_BACKOFF_MS', 1000),
  // Do not start another attempt with less time than this left in the budget
  minAttemptMs: positive('LLM_MIN_ATTEMPT_MS', 1000),
});

/** Finish reasons / block reasons that mean the output was withheld; retrying will not help. */
const BLOCKED_FINISH_REASONS = ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'RECITATION'];

const failure = (kind, retryable, message, extra = {}) => ({ ok: false, kind, retryable, message, ...extra });

/**
 * Classify a thrown model-call error.
 * - timeout (our per-attempt timer, or an SDK abort): retryable
 * - 429 / RESOURCE_EXHAUSTED / quota: retryable (after a short back-off)
 * - explicit 4xx: not retryable (bad request / auth / not found)
 * - 5xx, network errors and anything else from the model call: retryable once
 */
export function classifyModelError(error) {
  const message = (error && error.message) || String(error);
  if (error && (error.name === 'LLMAttemptTimeoutError' || error.name === 'AbortError')) {
    return failure('timeout', true, message);
  }
  const statusMatch = message.match(/got status: (\d{3})/);
  const status = (error && Number.isInteger(error.status) && error.status) || (statusMatch ? Number(statusMatch[1]) : null);
  if (status === 429 || /RESOURCE_EXHAUSTED|Too Many Requests|quota/i.test(message) || /\b429\b/.test(message)) {
    return failure('rate_limit', true, message);
  }
  if (status && status >= 400 && status < 500) {
    return failure('bad_request', false, message);
  }
  return failure('model_error', true, message);
}

/**
 * Generic checks on a Vertex result: blocked output (not retryable), missing / empty text (retryable).
 * @returns {{ok: true, text: string, finishReason}|{ok: false, kind, retryable, message}}
 */
export function interpretCandidate(result) {
  const response = result && result.response;
  const blockReason = response && response.promptFeedback && response.promptFeedback.blockReason;
  if (blockReason) {
    return failure('safety', false, `Prompt blocked: ${blockReason}`);
  }
  const candidate = response && response.candidates && response.candidates[0];
  const finishReason = (candidate && candidate.finishReason) || null;
  if (finishReason && BLOCKED_FINISH_REASONS.includes(finishReason)) {
    return failure('safety', false, `Output blocked: ${finishReason}`);
  }
  const text = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;
  if (typeof text !== 'string' || text.trim() === '') {
    return failure('empty', true, 'Model returned an empty response');
  }
  return { ok: true, text, finishReason };
}

function finishReasonOf(result) {
  const candidate = result && result.response && result.response.candidates && result.response.candidates[0];
  return (candidate && candidate.finishReason) || null;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Model call timed out after ${ms} ms`);
      error.name = 'LLMAttemptTimeoutError';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call the model with at most `policy.maxAttempts` attempts. Each attempt is bounded by
 * min(perAttemptTimeoutMs, remaining budget). Retries only retryable failures.
 *
 * @param {object} args
 * @param {'pck'|'student'} args.agent
 * @param {{generateContent: Function}} args.model
 * @param {string} args.modelId
 * @param {object} args.request  generateContent request
 * @param {(result, {attempt, isFinalAttempt}) => ({ok: true, value}|{ok: false, kind, retryable, message})} args.interpret
 *        endpoint-specific output validation (parse / schema). Since 1.3.11 a failed outcome may also carry:
 *        - `nextRequest`: the request to use for the next attempt (the student duplicate re-ask);
 *        - `fallback: {value}`: a usable value to return if no later attempt succeeds.
 *        Neither adds attempts: the loop still stops at `policy.maxAttempts`.
 * @returns {Promise<{ok: true, value, telemetry, usedFallback?, failure?}|{ok: false, failure, telemetry}>}
 *   telemetry = {agent, model, latencyMs, finishReason, attempts}; latencyMs covers all attempts + back-off
 */
export async function callModelWithPolicy({ agent, model, modelId, request, interpret, policy = LLM_CALL_POLICY }) {
  const started = Date.now();
  const telemetry = { agent, model: modelId, latencyMs: null, finishReason: null, attempts: 0 };
  let lastFailure = null;
  let currentRequest = request;
  let fallback = null;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    if (attempt > 1) {
      const backoff = lastFailure && lastFailure.kind === 'rate_limit' ? policy.rateLimitBackoffMs : 0;
      if (policy.totalBudgetMs - (Date.now() - started) - backoff < policy.minAttemptMs) {
        break; // not enough budget left for a meaningful attempt
      }
      if (backoff > 0) {
        await sleep(backoff);
      }
    }
    const attemptTimeoutMs = Math.min(policy.perAttemptTimeoutMs, policy.totalBudgetMs - (Date.now() - started));
    telemetry.attempts = attempt;

    let outcome;
    try {
      const result = await withTimeout(Promise.resolve().then(() => model.generateContent(currentRequest)), attemptTimeoutMs);
      telemetry.finishReason = finishReasonOf(result);
      outcome = interpret(result, { attempt, isFinalAttempt: attempt >= policy.maxAttempts });
    } catch (error) {
      telemetry.finishReason = null;
      outcome = classifyModelError(error);
    }

    if (outcome.ok) {
      telemetry.latencyMs = Date.now() - started;
      return { ok: true, value: outcome.value, telemetry };
    }
    lastFailure = outcome;
    if (outcome.fallback) {
      fallback = outcome.fallback;
    }
    if (outcome.nextRequest) {
      currentRequest = outcome.nextRequest;
    }
    console.warn(`⚠️ ${agent} attempt ${attempt}/${policy.maxAttempts} failed (${outcome.kind}${outcome.retryable ? ', retryable' : ''}): ${String(outcome.message).slice(0, 200)}`);
    if (!outcome.retryable) {
      break;
    }
  }

  telemetry.latencyMs = Date.now() - started;
  if (fallback) {
    // An earlier attempt produced usable output; a later failure must not turn it into a failed call
    return { ok: true, value: fallback.value, telemetry, usedFallback: true, failure: lastFailure };
  }
  return { ok: false, failure: lastFailure, telemetry };
}
