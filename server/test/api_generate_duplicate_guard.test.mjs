// /api/generate same-student duplicate guard (1.3.11): one re-ask inside the existing 2-attempt
// policy (B24), the final fallback, and content-free telemetry. Real server.js, fake Vertex model.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.LLM_ATTEMPT_TIMEOUT_MS = '150';
process.env.LLM_TOTAL_BUDGET_MS = '400';
process.env.LLM_RATE_LIMIT_BACKOFF_MS = '10';
process.env.LLM_MIN_ATTEMPT_MS = '5';

const { startServer, postJson } = await import('../test-support/startServer.mjs');
const { textResult } = await import('../test-support/fakes/vertexai.mjs');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
beforeEach(() => srv.fakeModel.reset());

const DANA = 'אז רק במעוין וריבוע האלכסונים חוצים זוויות? זה קצת מבלבל.';
const TAMAR = 'אני חושבת שבמלבן האלכסונים שווים, אבל הם לא חוצים את הזוויות.';
const FRESH_DANA = 'רגע, אז מה מיוחד במעוין שגורם לאלכסונים לחצות את הזוויות?';
const FRESH_TAMAR = 'אז במקבילית זה גם לא קורה, נכון?';
const SYSTEM = 'SYSTEM-PROMPT-MARKER';
const MESSAGES = [
  { role: 'system', content: SYSTEM },
  { role: 'user', content: 'באילו מרובעים האלכסונים חוצים את הזוויות?', name: 'Teacher' },
  { role: 'assistant', content: DANA, name: 'דנה' },
  { role: 'assistant', content: TAMAR, name: 'תמר' },
  { role: 'user', content: 'נכון', name: 'Teacher' },
];
const out = (...items) => JSON.stringify({ responses: items.map(([student, message]) => ({ student, message })) });
const hang = () => new Promise(() => {});
const sequence = (...responders) => {
  let i = 0;
  return () => responders[Math.min(i++, responders.length - 1)]();
};
const gen = (messages = MESSAGES) => postJson(srv.baseUrl, '/api/generate', { messages, options: { stop: ['Teacher:'] } });
const lastUserText = (request) => {
  const users = request.contents.filter((c) => c.role === 'user');
  return users[users.length - 1].parts.find((p) => typeof p.text === 'string').text;
};
const NOTE_HEAD = '[Regeneration note — not part of the conversation]';
const DUP_KEYS = ['duplicateOutcome', 'duplicateRepliesDropped', 'duplicateRepliesKept', 'duplicateRetries'];
const dupMeta = (meta) => Object.fromEntries(DUP_KEYS.map((k) => [k, meta[k]]));

test('no duplicate: one model call, output unchanged, outcome "none"', async () => {
  const text = out(['דנה', FRESH_DANA]);
  srv.fakeModel.respond = () => textResult(text);
  const res = await gen();
  assert.equal(res.status, 200);
  assert.equal(res.body.text, text);
  assert.equal(srv.fakeModel.calls.length, 1);
  assert.equal(res.body.meta.attempts, 1);
  assert.deepEqual(dupMeta(res.body.meta), { duplicateOutcome: 'none', duplicateRepliesDropped: 0, duplicateRepliesKept: 0, duplicateRetries: 0 });
});

test('1. an exact same-student duplicate triggers one regeneration with the validated note', async () => {
  srv.fakeModel.respond = sequence(() => textResult(out(['דנה', DANA])), () => textResult(out(['דנה', FRESH_DANA])));
  const res = await gen();
  assert.equal(res.status, 200);
  assert.equal(srv.fakeModel.calls.length, 2);
  const [first, second] = srv.fakeModel.calls;
  assert.ok(!lastUserText(first).includes(NOTE_HEAD));
  assert.ok(lastUserText(second).startsWith('נכון\n\n' + NOTE_HEAD));
  assert.ok(lastUserText(second).includes(`what דנה already said earlier in this conversation: "${DANA}".`));
});

test('2./3. a whitespace/punctuation variant and a near-exact (>= 0.90) reply also trigger', async () => {
  srv.fakeModel.respond = sequence(() => textResult(out(['דנה', `  ${DANA.replace(' ', '\n')}!! `], ['תמר', TAMAR.replace('שווים', 'שוים')])), () => textResult(out(['דנה', FRESH_DANA])));
  const res = await gen();
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.equal(res.body.meta.duplicateRetries, 1);
  assert.match(lastUserText(srv.fakeModel.calls[1]), /דנה and תמר must each react/);
});

test('5./6./7. short replies and another student\'s earlier text do not trigger', async () => {
  srv.fakeModel.respond = () => textResult(out(['דנה', 'כן'], ['תמר', DANA]));
  const res = await gen([...MESSAGES.slice(0, 4), { role: 'assistant', content: 'כן', name: 'דנה' }, MESSAGES[4]]);
  assert.equal(srv.fakeModel.calls.length, 1);
  assert.equal(res.body.meta.duplicateOutcome, 'none');
});

test('8./9./10. several duplicated students: one regeneration (plural note); attempt 2 returned verbatim', async () => {
  const second = out(['דנה', FRESH_DANA], ['תמר', FRESH_TAMAR]);
  srv.fakeModel.respond = sequence(() => textResult(out(['דנה', DANA], ['תמר', TAMAR])), () => textResult(second));
  const res = await gen();
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.match(lastUserText(srv.fakeModel.calls[1]), /דנה and תמר must each react to the teacher's latest message instead of restating their earlier reply\./);
  // normal output format, attempt-2 text unchanged
  assert.deepEqual(Object.keys(res.body).sort(), ['meta', 'success', 'text']);
  assert.equal(res.body.text, second);
  assert.equal(res.body.meta.attempts, 2);
  assert.deepEqual(dupMeta(res.body.meta), { duplicateOutcome: 'resolved', duplicateRepliesDropped: 0, duplicateRepliesKept: 0, duplicateRetries: 1 });
});

test('19. attempt 2 differs only by the note: same system prompt, C8-labelled history, config and model', async () => {
  srv.fakeModel.respond = sequence(() => textResult(out(['דנה', DANA])), () => textResult(out(['דנה', FRESH_DANA])));
  await gen();
  const [first, second] = srv.fakeModel.calls;
  assert.deepEqual(second.generationConfig, first.generationConfig);
  assert.deepEqual(second.contents.slice(0, -1), first.contents.slice(0, -1));
  assert.equal(second.contents.length, first.contents.length);
  assert.equal(first.contents[0].parts[0].text.startsWith(SYSTEM), true);
  assert.deepEqual(first.contents[1], { role: 'model', parts: [{ text: `דנה: ${DANA}` }] });
  const note = lastUserText(second).slice('נכון\n\n'.length);
  assert.equal(lastUserText(second), `נכון\n\n${note}`);
  assert.ok(note.startsWith(NOTE_HEAD));
  assert.equal(second.generationConfig.thinkingConfig, undefined);
});

test('11. one student still duplicate on attempt 2: only that reply is dropped', async () => {
  srv.fakeModel.respond = sequence(() => textResult(out(['דנה', DANA], ['תמר', TAMAR])), () => textResult(out(['דנה', DANA], ['תמר', FRESH_TAMAR])));
  const res = await gen();
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body.text), { responses: [{ student: 'תמר', message: FRESH_TAMAR }] });
  assert.deepEqual(dupMeta(res.body.meta), { duplicateOutcome: 'dropped', duplicateRepliesDropped: 1, duplicateRepliesKept: 0, duplicateRetries: 1 });
});

test('12. all replies still duplicate on attempt 2: attempt 2 is kept unchanged', async () => {
  const second = out(['דנה', DANA], ['תמר', TAMAR + ' ']);
  srv.fakeModel.respond = sequence(() => textResult(out(['דנה', DANA], ['תמר', TAMAR])), () => textResult(second));
  const res = await gen();
  assert.equal(res.status, 200);
  assert.equal(res.body.text, second);
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.deepEqual(dupMeta(res.body.meta), { duplicateOutcome: 'kept', duplicateRepliesDropped: 0, duplicateRepliesKept: 2, duplicateRetries: 1 });
});

for (const [label, failing] of [
  ['model error', () => { throw new Error('UNAVAILABLE'); }],
  ['parse failure', () => textResult('{"responses": [{"student": "דנה", "message": "חצי')],
  ['schema failure', () => textResult(JSON.stringify({ responses: 'not an array' }))],
  ['timeout', hang],
  ['empty output', () => textResult('')],
]) {
  test(`13. ${label} on the regeneration attempt: the usable attempt-1 output is returned`, async () => {
    const first = out(['דנה', DANA], ['תמר', FRESH_TAMAR]);
    srv.fakeModel.respond = sequence(() => textResult(first), failing);
    const res = await gen();
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.text, first);
    assert.equal(srv.fakeModel.calls.length, 2);
    assert.equal(res.body.meta.attempts, 2);
    assert.deepEqual(dupMeta(res.body.meta), { duplicateOutcome: 'reask_failed', duplicateRepliesDropped: 0, duplicateRepliesKept: 1, duplicateRetries: 1 });
  });
}

test('14./15. a technical retry on attempt 1, then a duplicate on attempt 2: no third attempt, fallback applied', async () => {
  srv.fakeModel.respond = sequence(() => { throw Object.assign(new Error('429 Too Many Requests'), { status: 429 }); }, () => textResult(out(['דנה', DANA], ['תמר', FRESH_TAMAR])), () => textResult(out(['דנה', FRESH_DANA])));
  const res = await gen();
  assert.equal(res.status, 200);
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.ok(!lastUserText(srv.fakeModel.calls[1]).includes(NOTE_HEAD), 'the technical retry is not a re-ask');
  assert.deepEqual(JSON.parse(res.body.text), { responses: [{ student: 'תמר', message: FRESH_TAMAR }] });
  assert.equal(res.body.meta.attempts, 2);
  assert.deepEqual(dupMeta(res.body.meta), { duplicateOutcome: 'dropped', duplicateRepliesDropped: 1, duplicateRepliesKept: 0, duplicateRetries: 0 });
});

test('14./15. a parse failure on attempt 1, then an all-duplicate attempt 2: kept, still 2 calls', async () => {
  const second = out(['דנה', DANA]);
  srv.fakeModel.respond = sequence(() => textResult('not json'), () => textResult(second), () => textResult(out(['דנה', FRESH_DANA])));
  const res = await gen();
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.equal(res.body.text, second);
  assert.deepEqual(dupMeta(res.body.meta), { duplicateOutcome: 'kept', duplicateRepliesDropped: 0, duplicateRepliesKept: 1, duplicateRetries: 0 });
});

test('14. a duplicate on every attempt never produces a third model call', async () => {
  srv.fakeModel.respond = () => textResult(out(['דנה', DANA]));
  const res = await gen();
  assert.equal(res.status, 200);
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.equal(res.body.meta.attempts, 2);
});

test('two technical failures still fail the call as before (no duplicate meta involved)', async () => {
  srv.fakeModel.respond = () => { throw new Error('UNAVAILABLE'); };
  const res = await gen();
  assert.equal(res.status, 500);
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.deepEqual(Object.keys(res.body.meta).sort(), ['agent', 'attempts', 'finishReason', 'latencyMs', 'model']);
});

test('17. telemetry contains no student, teacher or note text', async () => {
  srv.fakeModel.respond = sequence(() => textResult(out(['דנה', DANA], ['תמר', TAMAR])), () => textResult(out(['דנה', DANA], ['תמר', FRESH_TAMAR])));
  const res = await gen();
  const json = JSON.stringify(res.body.meta);
  for (const s of [SYSTEM, 'דנה', 'תמר', 'מעוין', 'נכון', 'Regeneration', 'draft']) assert.ok(!json.includes(s), s);
  assert.deepEqual(Object.keys(res.body.meta).sort(), ['agent', 'attempts', ...DUP_KEYS, 'finishReason', 'latencyMs', 'model'].sort());
  for (const k of ['duplicateRetries', 'duplicateRepliesDropped', 'duplicateRepliesKept']) assert.ok(Number.isInteger(res.body.meta[k]) && res.body.meta[k] >= 0);
});
