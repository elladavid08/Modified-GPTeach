// Retry / timeout policy engine (1.3.6). Unit-level: a fake model object and an injected policy,
// so attempt limits, timeouts and the total budget can be verified precisely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LLM_CALL_POLICY,
  callModelWithPolicy,
  classifyModelError,
  interpretCandidate,
} from '../llm_call_policy.js';
import { validateStudentOutputText } from '../student_output_contract.js';

const FAST = { maxAttempts: 2, perAttemptTimeoutMs: 80, totalBudgetMs: 400, rateLimitBackoffMs: 10, minAttemptMs: 5 };
const result = (text, finishReason = 'STOP') => ({ response: { candidates: [{ content: { parts: [{ text }] }, finishReason }] } });
const hang = () => new Promise(() => {});
const later = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

function fakeModel(responders) {
  let i = 0;
  const model = {
    calls: 0,
    generateContent: async () => {
      model.calls += 1;
      const responder = responders[Math.min(i, responders.length - 1)];
      i += 1;
      return responder();
    },
  };
  return model;
}

// Accept any non-empty text as valid output (the endpoint-specific interpreters are tested elsewhere).
const acceptText = (r) => {
  const c = interpretCandidate(r);
  return c.ok ? { ok: true, value: c.text } : c;
};

function run(model, policy = FAST, interpret = acceptText) {
  return callModelWithPolicy({ agent: 'pck', model, modelId: 'test-model', request: {}, interpret, policy });
}

test('policy defaults match the provisional decision (20 s / 2 attempts / 45 s budget)', () => {
  assert.equal(LLM_CALL_POLICY.perAttemptTimeoutMs, 20000);
  assert.equal(LLM_CALL_POLICY.maxAttempts, 2);
  assert.equal(LLM_CALL_POLICY.totalBudgetMs, 45000);
  assert.ok(Object.isFrozen(LLM_CALL_POLICY));
});

test('the client hard timeout exceeds the server budget, and two attempts fit the budget', () => {
  const clientSrc = readFileSync(new URL('../../src/config/llmCallPolicy.js', import.meta.url), 'utf8');
  const clientTimeout = Number(clientSrc.match(/DEFAULT_CLIENT_TIMEOUT_MS\s*=\s*(\d+)/)[1]);
  assert.equal(clientTimeout, 50000);
  assert.ok(clientTimeout > LLM_CALL_POLICY.totalBudgetMs);
  const p = LLM_CALL_POLICY;
  assert.ok(p.maxAttempts * p.perAttemptTimeoutMs + p.rateLimitBackoffMs <= p.totalBudgetMs);
});

test('success on the first attempt', async () => {
  const m = fakeModel([() => result('ok')]);
  const r = await run(m);
  assert.equal(r.ok, true);
  assert.equal(r.value, 'ok');
  assert.equal(r.telemetry.attempts, 1);
  assert.equal(r.telemetry.finishReason, 'STOP');
  assert.equal(m.calls, 1);
});

test('timeout then success on the second attempt', async () => {
  const m = fakeModel([hang, () => result('ok')]);
  const r = await run(m);
  assert.equal(r.ok, true);
  assert.equal(r.telemetry.attempts, 2);
  assert.ok(r.telemetry.latencyMs >= FAST.perAttemptTimeoutMs);
});

test('429 then success (with the rate-limit back-off)', async () => {
  const m = fakeModel([() => { throw Object.assign(new Error('[VertexAI.ClientError]: got status: 429 Too Many Requests'), {}); }, () => result('ok')]);
  const r = await run(m);
  assert.equal(r.ok, true);
  assert.equal(r.telemetry.attempts, 2);
});

test('5xx / transient model error then success', async () => {
  const m = fakeModel([() => { throw new Error('[VertexAI.GoogleGenerativeAIError]: got status: 503 Service Unavailable'); }, () => result('ok')]);
  const r = await run(m);
  assert.equal(r.ok, true);
  assert.equal(r.telemetry.attempts, 2);
});

test('empty model response then success', async () => {
  const m = fakeModel([() => ({ response: { candidates: [] } }), () => result('ok')]);
  const r = await run(m);
  assert.equal(r.ok, true);
  assert.equal(r.telemetry.attempts, 2);
});

test('two failed attempts → final failure carrying the last failure, attempts and latency', async () => {
  const m = fakeModel([hang, hang]);
  const r = await run(m);
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'timeout');
  assert.equal(r.telemetry.attempts, 2);
  assert.equal(m.calls, 2);
  assert.ok(Number.isInteger(r.telemetry.latencyMs));
});

test('non-retryable: a 4xx request error is attempted once', async () => {
  const m = fakeModel([() => { throw new Error('[VertexAI.ClientError]: got status: 400 Bad Request. {"error":{"status":"INVALID_ARGUMENT"}}'); }]);
  const r = await run(m);
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'bad_request');
  assert.equal(r.failure.retryable, false);
  assert.equal(m.calls, 1);
  assert.equal(r.telemetry.attempts, 1);
});

test('non-retryable: safety-blocked output is attempted once', async () => {
  for (const blocked of [
    { response: { candidates: [{ finishReason: 'SAFETY' }] } },
    { response: { promptFeedback: { blockReason: 'SAFETY' }, candidates: [] } },
  ]) {
    const m = fakeModel([() => blocked, () => result('ok')]);
    const r = await run(m);
    assert.equal(r.ok, false);
    assert.equal(r.failure.kind, 'safety');
    assert.equal(m.calls, 1);
  }
});

test('an interpreter rejection (parse/schema) is retried once', async () => {
  let n = 0;
  const interpret = (res) => {
    n += 1;
    return n === 1 ? { ok: false, kind: 'parse', retryable: true, message: 'bad' } : acceptText(res);
  };
  const m = fakeModel([() => result('first'), () => result('second')]);
  const r = await run(m, FAST, interpret);
  assert.equal(r.ok, true);
  assert.equal(r.value, 'second');
  assert.equal(r.telemetry.attempts, 2);
});

test('never more than maxAttempts model calls, even if every attempt fails retryably', async () => {
  const m = fakeModel([() => { throw new Error('UNAVAILABLE'); }]);
  const r = await run(m, { ...FAST, maxAttempts: 2 });
  assert.equal(m.calls, 2);
  assert.equal(r.telemetry.attempts, 2);
});

test('the total budget bounds the whole call: a second attempt is cut to the remaining budget', async () => {
  const policy = { maxAttempts: 2, perAttemptTimeoutMs: 150, totalBudgetMs: 200, rateLimitBackoffMs: 0, minAttemptMs: 5 };
  const m = fakeModel([hang, hang]);
  const started = Date.now();
  const r = await run(m, policy);
  const elapsed = Date.now() - started;
  assert.equal(r.ok, false);
  assert.ok(elapsed < policy.totalBudgetMs + 60, `elapsed ${elapsed}`);
  assert.ok(m.calls <= 2);
});

test('no second attempt is started when the remaining budget is below the minimum', async () => {
  const policy = { maxAttempts: 2, perAttemptTimeoutMs: 100, totalBudgetMs: 105, rateLimitBackoffMs: 0, minAttemptMs: 20 };
  const m = fakeModel([hang, () => result('ok')]);
  const r = await run(m, policy);
  assert.equal(r.ok, false);
  assert.equal(m.calls, 1);
  assert.equal(r.telemetry.attempts, 1);
});

test('a slow-but-successful attempt within the timeout is not retried', async () => {
  const m = fakeModel([() => later(30, result('ok'))]);
  const r = await run(m);
  assert.equal(r.ok, true);
  assert.equal(m.calls, 1);
});

test('classifyModelError matrix', () => {
  const k = (e) => { const c = classifyModelError(e); return [c.kind, c.retryable]; };
  assert.deepEqual(k(Object.assign(new Error('x'), { name: 'LLMAttemptTimeoutError' })), ['timeout', true]);
  assert.deepEqual(k(new Error('got status: 429 Too Many Requests')), ['rate_limit', true]);
  assert.deepEqual(k(new Error('RESOURCE_EXHAUSTED: quota')), ['rate_limit', true]);
  assert.deepEqual(k(Object.assign(new Error('x'), { status: 429 })), ['rate_limit', true]);
  assert.deepEqual(k(new Error('got status: 500 Internal Server Error')), ['model_error', true]);
  assert.deepEqual(k(new Error('got status: 503 Service Unavailable')), ['model_error', true]);
  assert.deepEqual(k(new TypeError('fetch failed')), ['model_error', true]);
  assert.deepEqual(k(new Error('read ECONNRESET')), ['model_error', true]);
  assert.deepEqual(k(new Error('got status: 400 Bad Request')), ['bad_request', false]);
  assert.deepEqual(k(new Error('got status: 403 Forbidden')), ['bad_request', false]);
  assert.deepEqual(k(new Error('got status: 404 Not Found')), ['bad_request', false]);
});

test('student output validation: minimal {responses:[{student, message}]} structure', () => {
  const ok = (t) => validateStudentOutputText(t).ok;
  assert.equal(ok(JSON.stringify({ responses: [{ student: 'נועה', message: 'היי' }] })), true);
  assert.equal(ok(JSON.stringify({ responses: [] })), true); // silence stays valid
  assert.equal(ok(JSON.stringify({ responses: [{ student: 'נועה' }] })), true); // incomplete entries: skipped by the client, as before
  assert.equal(ok('```json\n' + JSON.stringify({ responses: [] }) + '\n```'), true);
  for (const [bad, kind] of [
    ['{"responses": [{"student": "נועה", "message": "אני', 'parse'],
    ['Here: {"responses": []}', 'parse'],
    ['', 'parse'],
    [JSON.stringify({ thinking: {} }), 'schema'],
    [JSON.stringify({ responses: {} }), 'schema'],
    [JSON.stringify([]), 'schema'],
    [JSON.stringify({ responses: ['נועה'] }), 'schema'],
    [JSON.stringify({ responses: [{ student: 5, message: 'x' }] }), 'schema'],
    [JSON.stringify({ responses: [{ student: 'נועה', message: { text: 'x' } }] }), 'schema'],
  ]) {
    const v = validateStudentOutputText(bad);
    assert.equal(v.ok, false, bad);
    assert.equal(v.kind, kind, bad);
  }
});
