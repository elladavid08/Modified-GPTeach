/**
 * Client side of the per-turn LLM call policy (since 1.3.6).
 *
 * The browser sends exactly ONE request per agent per turn to /api/pck-feedback and /api/generate.
 * The server is the only retry layer (server/llm_call_policy.js: at most 2 model attempts,
 * 20 s per attempt, 45 s total budget). The client hard timeout must stay above that budget.
 *
 * Provisional values from research/simulator_audit/latency_baseline.md; override at build time with
 * REACT_APP_LLM_CLIENT_TIMEOUT_MS.
 */
const DEFAULT_CLIENT_TIMEOUT_MS = 50000;

const fromEnv = Number(process.env.REACT_APP_LLM_CLIENT_TIMEOUT_MS);

export const CLIENT_TIMEOUT_MS = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_CLIENT_TIMEOUT_MS;
