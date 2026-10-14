// Retry / timeout policy at the endpoints (1.3.6): /api/pck-feedback and /api/generate.
// Short policy values via env so timeouts are fast; the real server.js with a fake model.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.LLM_ATTEMPT_TIMEOUT_MS = '150';
process.env.LLM_TOTAL_BUDGET_MS = '400';
process.env.LLM_RATE_LIMIT_BACKOFF_MS = '10';
process.env.LLM_MIN_ATTEMPT_MS = '5';

const { startServer, postJson } = await import('../test-support/startServer.mjs');
const { textResult } = await import('../test-support/fakes/vertexai.mjs');
const { VALID_ANALYSIS } = await import('../test-support/pckFixtures.mjs');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
beforeEach(() => srv.fakeModel.reset());

const STUDENT_JSON = JSON.stringify({ responses: [{ student: 'נועה', message: 'רגע, אז ריבוע הוא מלבן?' }] });
const hang = () => new Promise(() => {});
const sequence = (...responders) => {
  let i = 0;
  return () => responders[Math.min(i++, responders.length - 1)]();
};
const pck = () => postJson(srv.baseUrl, '/api/pck-feedback', { teacherMessage: 'מה ההגדרה של מלבן?', conversationHistory: [], scenario: {}, feedbackHistory: [] });
const gen = () => postJson(srv.baseUrl, '/api/generate', { messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'מה ההגדרה של מלבן?' }] });

test('per-turn model instance carries the per-attempt SDK timeout', async () => {
  const params = srv.fakeModel.modelParams;
  assert.ok(params.some((p) => p.requestOptions && p.requestOptions.timeout === 150), JSON.stringify(params));
});

test('PCK: timeout then success → success, attempts 2', async () => {
  srv.fakeModel.respond = sequence(hang, () => textResult(JSON.stringify(VALID_ANALYSIS)));
  const res = await pck();
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.analysis, VALID_ANALYSIS);
  assert.equal(res.body.meta.attempts, 2);
  assert.equal(srv.fakeModel.calls.length, 2);
});

test('PCK: parse failure then a valid second output → success, attempts 2', async () => {
  srv.fakeModel.respond = sequence(() => textResult('{"pedagogical_quality": "pos'), () => textResult(JSON.stringify(VALID_ANALYSIS)));
  const res = await pck();
  assert.equal(res.status, 200);
  assert.equal(res.body.meta.attempts, 2);
});

test('PCK: schema failure then a valid second output → success', async () => {
  srv.fakeModel.respond = sequence(() => textResult(JSON.stringify({ ...VALID_ANALYSIS, pedagogical_quality: 'excellent' })), () => textResult(JSON.stringify(VALID_ANALYSIS)));
  const res = await pck();
  assert.equal(res.status, 200);
  assert.equal(res.body.meta.attempts, 2);
});

test('PCK: 429 then success', async () => {
  srv.fakeModel.respond = sequence(() => { throw new Error('[VertexAI.ClientError]: got status: 429 Too Many Requests'); }, () => textResult(JSON.stringify(VALID_ANALYSIS)));
  const res = await pck();
  assert.equal(res.status, 200);
  assert.equal(res.body.meta.attempts, 2);
});

test('PCK: two timeouts → final failure with errorKind timeout, attempts 2, bounded by the budget', async () => {
  srv.fakeModel.respond = hang;
  const started = Date.now();
  const res = await pck();
  const elapsed = Date.now() - started;
  assert.equal(res.status, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.errorKind, 'timeout');
  assert.equal(res.body.meta.attempts, 2);
  assert.ok(Number.isInteger(res.body.meta.latencyMs));
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.ok(elapsed < 400 + 150, `elapsed ${elapsed}`);
});

test('PCK: invalid output twice → final failure keeps the B23 error shape', async () => {
  srv.fakeModel.respond = () => textResult(JSON.stringify({ ...VALID_ANALYSIS, skills_assessment: [{ skill_id: 'p1', is_relevant: true, score: 2 }] }));
  const res = await pck();
  assert.equal(res.status, 500);
  assert.equal(res.body.errorKind, 'schema');
  assert.match(res.body.error, /^Failed to parse AI response/);
  assert.ok(Array.isArray(res.body.problems));
  assert.equal(res.body.meta.attempts, 2);
});

test('PCK: safety block → one attempt only', async () => {
  srv.fakeModel.respond = () => ({ response: { candidates: [{ finishReason: 'SAFETY' }] } });
  const res = await pck();
  assert.equal(res.status, 500);
  assert.equal(res.body.errorKind, 'safety');
  assert.equal(res.body.meta.attempts, 1);
  assert.equal(srv.fakeModel.calls.length, 1);
});

test('PCK: request 4xx from the model API → one attempt only', async () => {
  srv.fakeModel.respond = () => { throw new Error('[VertexAI.ClientError]: got status: 400 Bad Request'); };
  const res = await pck();
  assert.equal(res.body.errorKind, 'bad_request');
  assert.equal(res.body.meta.attempts, 1);
  assert.equal(srv.fakeModel.calls.length, 1);
});

test('PCK: invalid client input (400) makes no model call', async () => {
  const res = await postJson(srv.baseUrl, '/api/pck-feedback', { conversationHistory: [] });
  assert.equal(res.status, 400);
  assert.equal(srv.fakeModel.calls.length, 0);
});

test('student: malformed structured output then valid → success with the valid text, attempts 2', async () => {
  srv.fakeModel.respond = sequence(() => textResult('{"responses": [{"student": "נועה", "message": "אני'), () => textResult(STUDENT_JSON));
  const res = await gen();
  assert.equal(res.status, 200);
  assert.equal(res.body.text, STUDENT_JSON);
  assert.equal(res.body.meta.attempts, 2);
});

test('student: schema failure (no responses array) then valid → success', async () => {
  srv.fakeModel.respond = sequence(() => textResult(JSON.stringify({ thinking: {} })), () => textResult(STUDENT_JSON));
  const res = await gen();
  assert.equal(res.status, 200);
  assert.equal(res.body.meta.attempts, 2);
});

test('student: 5xx then success', async () => {
  srv.fakeModel.respond = sequence(() => { throw new Error('[VertexAI.GoogleGenerativeAIError]: got status: 500 Internal Server Error'); }, () => textResult(STUDENT_JSON));
  const res = await gen();
  assert.equal(res.status, 200);
  assert.equal(res.body.meta.attempts, 2);
});

test('student: empty model text then success', async () => {
  srv.fakeModel.respond = sequence(() => textResult(''), () => textResult(STUDENT_JSON));
  const res = await gen();
  assert.equal(res.status, 200);
  assert.equal(res.body.meta.attempts, 2);
});

test('student: malformed twice → final parse failure with a bounded raw-output excerpt', async () => {
  const raw = '{"responses": [' + 'x'.repeat(3000);
  srv.fakeModel.respond = () => textResult(raw);
  const res = await gen();
  assert.equal(res.status, 500);
  assert.equal(res.body.errorKind, 'parse');
  assert.match(res.body.error, /^Failed to parse AI response/);
  assert.equal(res.body.meta.attempts, 2);
  assert.equal(res.body.rawOutputChars, raw.length);
  assert.ok(res.body.rawOutputExcerpt.length <= 1000);
});

test('student: silence (responses: []) is a valid first-attempt success', async () => {
  srv.fakeModel.respond = () => textResult(JSON.stringify({ responses: [] }));
  const res = await gen();
  assert.equal(res.status, 200);
  assert.equal(res.body.meta.attempts, 1);
});

test('student: safety block → one attempt only', async () => {
  srv.fakeModel.respond = () => ({ response: { promptFeedback: { blockReason: 'SAFETY' } } });
  const res = await gen();
  assert.equal(res.body.errorKind, 'safety');
  assert.equal(res.body.meta.attempts, 1);
});

test('no request exceeds 2 model attempts, whatever the failure mix', async () => {
  const failures = [
    () => { throw new Error('UNAVAILABLE'); },
    hang,
    () => ({ response: { candidates: [] } }),
    () => textResult('not json'),
  ];
  for (const f of failures) {
    srv.fakeModel.reset();
    srv.fakeModel.respond = f;
    const a = await pck();
    const pckCalls = srv.fakeModel.calls.length;
    srv.fakeModel.reset();
    srv.fakeModel.respond = f;
    const b = await gen();
    assert.ok(pckCalls <= 2 && srv.fakeModel.calls.length <= 2);
    assert.ok(a.body.meta.attempts <= 2 && b.body.meta.attempts <= 2);
  }
});
