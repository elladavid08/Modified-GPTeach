// Student agent endpoint: invariant B3 (student output interface) and the drawing path to the
// student model. Uses the real server.js with a fake Vertex model (no network).
//
// Deliberately NOT asserted (defects, invariants.md §C): that speaker names are dropped from
// history (C8), that the schema forbids a `thinking` field (C9), or any fallback text (C6).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, postJson, promptText } from '../test-support/startServer.mjs';
import { textResult } from '../test-support/fakes/vertexai.mjs';

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

test('returns the model text verbatim as {success, text}', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  const res = await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages, options: {} });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { success: true, text: STUDENT_JSON });
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
