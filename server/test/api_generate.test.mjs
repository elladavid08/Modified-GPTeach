// Student agent endpoint: invariant B3 (student output interface) and the drawing path to the
// student model. Uses the real server.js with a fake Vertex model (no network).
//
// C8 (fixed, 1.3.8): past student replies reach the model attributed to their speaker.
// Deliberately NOT asserted (defects, invariants.md §C): that the schema forbids a `thinking`
// field (C9), or any fallback text (C6).
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
// 1.3.11: a successful student call also reports the content-free duplicate-guard counters (A17)
const SUCCESS_META_KEYS = [...META_KEYS, 'duplicateOutcome', 'duplicateRepliesDropped', 'duplicateRepliesKept', 'duplicateRetries'].sort();

test('telemetry: a successful call reports agent, model, latency, finish reason and attempts', async () => {
  srv.fakeModel.respond = () => delayed(40, textResult(STUDENT_JSON, 'STOP'));
  const res = await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages });
  const { meta } = res.body;
  assert.deepEqual(Object.keys(meta).sort(), SUCCESS_META_KEYS);
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

// ─── C8: student speaker identity in the model-facing history ────────────────

const turnsOf = (request) => request.contents.map((c) => ({ role: c.role, text: c.parts.map((p) => p.text).join('|') }));

test('C8: a past student reply reaches the model with that student\'s name', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', {
    messages: [...baseMessages, { role: 'assistant', content: 'מרובע עם ארבע זוויות ישרות', name: 'נועה' }, { role: 'user', content: 'ומה עם ריבוע?', name: 'Teacher' }],
  });
  const contents = srv.fakeModel.calls[0].contents;
  assert.deepEqual(contents[1], { role: 'model', parts: [{ text: 'נועה: מרובע עם ארבע זוויות ישרות' }] });
});

test('C8: several students across turns keep their name-message pairing and order', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', {
    messages: [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'מה ההגדרה של מלבן?', name: 'Teacher' },
      { role: 'assistant', content: 'מרובע עם ארבע זוויות ישרות', name: 'נועה' },
      { role: 'assistant', content: 'אבל ריבוע זה לא מלבן', name: 'תמר' },
      { role: 'user', content: 'תמר, למה את חושבת כך?', name: 'Teacher' },
      { role: 'assistant', content: 'כי הוא נראה אחרת', name: 'תמר' },
      { role: 'assistant', content: 'אני חושב שהוא כן מלבן', name: 'יובל' },
      { role: 'user', content: 'נבדוק ביחד.', name: 'Teacher' },
    ],
  });
  assert.deepEqual(turnsOf(srv.fakeModel.calls[0]), [
    { role: 'user', text: 'SYS\n\nמה ההגדרה של מלבן?' },
    { role: 'model', text: 'נועה: מרובע עם ארבע זוויות ישרות' },
    { role: 'model', text: 'תמר: אבל ריבוע זה לא מלבן' },
    { role: 'user', text: 'תמר, למה את חושבת כך?' },
    { role: 'model', text: 'תמר: כי הוא נראה אחרת' },
    { role: 'model', text: 'יובל: אני חושב שהוא כן מלבן' },
    { role: 'user', text: 'נבדוק ביחד.' },
  ]);
});

test('C8: teacher messages are unchanged (no speaker prefix, system prompt only on the first)', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', {
    messages: [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'שורה ראשונה\nשורה שנייה', name: 'Teacher' },
      { role: 'assistant', content: 'כן', name: 'נועה' },
      { role: 'user', content: 'יפה', name: 'Teacher' },
    ],
  });
  const t = turnsOf(srv.fakeModel.calls[0]);
  assert.equal(t[0].text, 'SYS\n\nשורה ראשונה\nשורה שנייה');
  assert.equal(t[2].text, 'יפה');
  assert.ok(!JSON.stringify(srv.fakeModel.calls[0].contents).includes('Teacher'));
});

test('C8: Hebrew text and punctuation are preserved exactly after the speaker prefix', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  const text = 'רגע, אז "ריבוע" הוא גם מלבן?! (לפי ההגדרה)';
  await postJson(srv.baseUrl, '/api/generate', { messages: [...baseMessages, { role: 'assistant', content: text, name: 'הילה' }] });
  assert.equal(srv.fakeModel.calls[0].contents[1].parts[0].text, `הילה: ${text}`);
});

test('C8: image (drawing) history is unchanged', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', {
    messages: [
      { role: 'system', content: 'SYS' },
      { role: 'user', name: 'Teacher', content: [{ text: 'הסתכלו' }, { inline_data: { mime_type: 'image/png', data: 'iVBORx' } }] },
      { role: 'assistant', content: 'זה מעוין', name: 'נועה' },
      { role: 'user', name: 'Teacher', content: [{ text: '' }, { inline_data: { mime_type: 'image/png', data: 'iVBORy' } }] },
    ],
  });
  const c = srv.fakeModel.calls[0].contents;
  assert.deepEqual(c[0], { role: 'user', parts: [{ text: 'SYS\n\nהסתכלו' }, { inline_data: { mime_type: 'image/png', data: 'iVBORx' } }] });
  assert.deepEqual(c[2], { role: 'user', parts: [{ inline_data: { mime_type: 'image/png', data: 'iVBORy' } }] });
});

test('C8: messages without a speaker name (legacy) are converted as before', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', {
    messages: [...baseMessages, { role: 'assistant', content: 'בלי שם' }, { role: 'assistant', content: 'שם ריק', name: '' }, { role: 'assistant', content: 'שם רווחים', name: '   ' }],
  });
  const t = turnsOf(srv.fakeModel.calls[0]);
  assert.deepEqual(t.slice(1).map((x) => x.text), ['בלי שם', 'שם ריק', 'שם רווחים']);
});

test('C8: no metadata beyond the simulated student name enters the model context', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', {
    messages: [
      ...baseMessages,
      { role: 'assistant', content: 'תשובה', name: 'נועה', userId: 'SECRET-UID', email: 'secret@x', timestamp: 123, agent: 'נועה' },
    ],
  });
  const c = srv.fakeModel.calls[0].contents[1];
  assert.deepEqual(Object.keys(c).sort(), ['parts', 'role']);
  assert.deepEqual(c.parts, [{ text: 'נועה: תשובה' }]);
  assert.ok(!JSON.stringify(srv.fakeModel.calls[0].contents).match(/SECRET|secret@|123/));
});

// ─── C9: schema and generation config unchanged; no native thinking ──────────

test('C9: the response schema is exactly {responses: [{student, message}]} (no reasoning field)', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages });
  const { responseSchema } = srv.fakeModel.calls[0].generationConfig;
  assert.deepEqual(Object.keys(responseSchema.properties), ['responses']);
  assert.deepEqual(responseSchema.required, ['responses']);
  assert.deepEqual(Object.keys(responseSchema.properties.responses.items.properties).sort(), ['message', 'student']);
  assert.ok(!JSON.stringify(responseSchema).match(/thinking|reason|rationale|analysis/i));
});

test('C9: model, temperature, token limit unchanged and no native thinking configuration', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', { messages: baseMessages });
  const { generationConfig } = srv.fakeModel.calls[0];
  assert.equal(generationConfig.temperature, 0.7);
  assert.equal(generationConfig.maxOutputTokens, 512);
  assert.equal(generationConfig.topP, 1);
  assert.equal(generationConfig.thinkingConfig, undefined);
  assert.ok(srv.fakeModel.modelParams.every((p) => p.model === 'gemini-2.5-flash-lite' && !p.generationConfig?.thinkingConfig));
  const { readFileSync } = await import('node:fs');
  assert.ok(!readFileSync(new URL('../server.js', import.meta.url), 'utf8').includes('thinkingConfig'));
});


// ─── 1.3.10: conversational-move rule (prompt text only; the server does not classify messages) ───

test('1.3.10: a system prompt with the conversational-move rule and short teacher messages are forwarded verbatim; C8 prefix still applied', async () => {
  const RULE = "When the teacher's latest message is primarily an acknowledgement, praise, thanks, or closing rather than a new content question, respond naturally to that conversational move. Do not restate an earlier answer verbatim. If the student is still confused, preserve that underlying state without forcing the same misconception or wording to be repeated.";
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', {
    messages: [
      { role: 'system', content: `SYS\n- ${RULE}` },
      { role: 'user', content: 'האם ריבוע הוא מלבן?', name: 'Teacher' },
      { role: 'assistant', content: 'לא, הוא נראה אחרת', name: 'נועה' },
      { role: 'user', content: '?', name: 'Teacher' },
      { role: 'assistant', content: 'כי כל הצלעות שוות', name: 'נועה' },
      { role: 'user', content: 'יפה, תודה לכם.', name: 'Teacher' },
    ],
  });
  assert.deepEqual(turnsOf(srv.fakeModel.calls[0]), [
    { role: 'user', text: `SYS\n- ${RULE}\n\nהאם ריבוע הוא מלבן?` },
    { role: 'model', text: 'נועה: לא, הוא נראה אחרת' },
    { role: 'user', text: '?' },
    { role: 'model', text: 'נועה: כי כל הצלעות שוות' },
    { role: 'user', text: 'יפה, תודה לכם.' },
  ]);
});
