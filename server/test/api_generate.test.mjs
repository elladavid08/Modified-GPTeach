// Student agent endpoint: invariant B3 (student output interface) and the drawing path to the
// student model. Uses the real server.js with a fake Vertex model (no network).
//
// Deliberately NOT asserted (defects, invariants.md §C): that speaker names are dropped from
// history (C8), that the schema forbids a `thinking` field (C9), or any fallback text (C6).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, postJson, promptText } from '../test-support/startServer.mjs';
import { textResult, delayed } from '../test-support/fakes/vertexai.mjs';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
beforeEach(() => srv.fakeModel.reset());

const STUDENT_JSON = JSON.stringify({
  responses: [
    { student: 'נועה', message: 'אבל ריבוע נראה אחרת ממלבן' },
    { student: 'תמר', message: 'רגע, אז ריבוע הוא גם מלבן?' },
  ],
});

const baseMessages = [
  { role: 'system', content: 'SYSTEM-PROMPT-MARKER students persona text' },
  { role: 'user', content: 'שלום כיתה, מה ההגדרה של מלבן?', name: 'Teacher' },
];

test('returns the model text verbatim as {success, text} (plus additive meta)', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  const res = await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages, options: {} });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.text, STUDENT_JSON);
  assert.deepEqual(Object.keys(res.body).sort(), ['meta', 'success', 'text']);
});

test('requests JSON output with a responses[{student, message}] schema', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages });
  const { generationConfig } = srv.fakeModel.calls[0];
  assert.equal(generationConfig.responseMimeType, 'application/json');
  const schema = generationConfig.responseSchema;
  assert.ok(schema.required.includes('responses'));
  assert.equal(schema.properties.responses.type, 'array');
  const item = schema.properties.responses.items;
  assert.equal(item.properties.student.type, 'string');
  assert.equal(item.properties.message.type, 'string');
  assert.ok(item.required.includes('student') && item.required.includes('message'));
});

test('system prompt and teacher message both reach the model', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages });
  const text = promptText(srv.fakeModel.calls[0]);
  assert.ok(text.includes('SYSTEM-PROMPT-MARKER'));
  assert.ok(text.includes('שלום כיתה, מה ההגדרה של מלבן?'));
});

test('prior student turns are sent with the model role and teacher turns with the user role', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', {
    messages: [
      ...baseMessages,
      { role: 'assistant', content: 'מלבן זה ארבע זוויות ישרות', name: 'נועה' },
      { role: 'user', content: 'ומה עם ריבוע?', name: 'Teacher' },
    ],
  });
  const roles = srv.fakeModel.calls[0].contents.map((c) => c.role);
  assert.deepEqual(roles, ['user', 'model', 'user']);
});

test('an image attached to a teacher message is forwarded to the student model as inline PNG data', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', {
    messages: [
      baseMessages[0],
      {
        role: 'user',
        name: 'Teacher',
        content: [
          { text: 'הסתכלו על הציור' },
          { inline_data: { mime_type: 'image/png', data: 'iVBORfakeBase64' } },
        ],
      },
    ],
  });
  const parts = srv.fakeModel.calls[0].contents.flatMap((c) => c.parts);
  const image = parts.find((p) => p.inline_data);
  assert.deepEqual(image, { inline_data: { mime_type: 'image/png', data: 'iVBORfakeBase64' } });
  assert.ok(parts.some((p) => p.text && p.text.includes('הסתכלו על הציור')));
});

test('400 when messages is missing', async () => {
  const res = await postJson(srv.baseUrl, '/api/generate', {});
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(srv.fakeModel.calls.length, 0);
});

test('model failure is reported as success:false (never as a successful empty reply)', async () => {
  srv.fakeModel.respond = () => ({ response: { candidates: [] } });
  const res = await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages });
  assert.notEqual(res.status, 200);
  assert.equal(res.body.success, false);
});

// ─── Telemetry (latency / model / finish reason / attempts) ───────────────────

const META_KEYS = ['agent', 'attempts', 'finishReason', 'latencyMs', 'model'];

test('telemetry: a successful call reports agent, model, latency, finish reason and attempts', async () => {
  srv.fakeModel.respond = () => delayed(40, textResult(STUDENT_JSON, 'STOP'));
  const res = await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages });
  const { meta } = res.body;
  assert.deepEqual(Object.keys(meta).sort(), META_KEYS);
  assert.equal(meta.agent, 'student');
  assert.equal(meta.model, 'gemini-2.5-flash-lite');
  assert.equal(meta.finishReason, 'STOP');
  assert.equal(meta.attempts, 1);
  assert.ok(Number.isInteger(meta.latencyMs) && meta.latencyMs >= 35, String(meta.latencyMs));
});

test('telemetry: attempts counts the existing quota retries', async () => {
  let calls = 0;
  srv.fakeModel.respond = () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error('429 Too Many Requests'), { status: 429 });
    return textResult(STUDENT_JSON);
  };
  const res = await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages });
  assert.equal(res.status, 200);
  assert.equal(res.body.meta.attempts, 2);
});

test('telemetry: a blocked candidate reports its finish reason in the failure meta', async () => {
  srv.fakeModel.respond = () => ({ response: { candidates: [{ finishReason: 'SAFETY' }] } });
  const res = await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages });
  assert.equal(res.body.success, false);
  assert.equal(res.body.meta.finishReason, 'SAFETY');
  assert.equal(res.body.meta.agent, 'student');
  assert.equal(res.body.meta.attempts, 1);
});

test('telemetry: a thrown model error still reports timing and attempts', async () => {
  srv.fakeModel.respond = () => delayed(20, null).then(() => { throw new Error('UNAVAILABLE'); });
  const res = await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages });
  assert.equal(res.body.success, false);
  assert.deepEqual(Object.keys(res.body.meta).sort(), META_KEYS);
  assert.equal(res.body.meta.finishReason, null);
  assert.ok(res.body.meta.latencyMs >= 15);
});

test('telemetry: meta contains no prompt, response text or message content', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  const res = await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages });
  const json = JSON.stringify(res.body.meta);
  assert.ok(!json.includes('SYSTEM-PROMPT-MARKER'));
  assert.ok(!json.includes('שלום כיתה'));
  assert.ok(!json.includes('נועה'));
});

