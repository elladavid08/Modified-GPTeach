// Regression fixture: student replies silently cut at a Hebrew abbreviation written with an ASCII double
// quote (gershayim), e.g. ס"מ / קמ"ש. Found in the 1.3.12 Mode B baseline (student_stability_replay.md §11.5).
//
// The raw outputs below are verbatim Gemini responses (gemini-2.5-flash-lite, JSON mode with the student
// responseSchema), captured before any parsing in the unmodified server (truncation investigation,
// 2026-10-12). Under constrained JSON decoding, the `"` the model meant as gershayim closes the `message`
// string; the decoder then completes valid JSON. finishReason is STOP and nothing is lost after the model,
// so the server's contract check passes and the cut text reaches the client unchanged.
//
// Since 1.3.13: the student prompt asks for Hebrew gershayim in abbreviations (prevention), and the server
// counts suspected cuts in content-free telemetry (detection only: no retry, no rewrite, no drop). A cut
// that still happens is served as before, now with `quoteCutSuspected` > 0.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, postJson } from '../test-support/startServer.mjs';
import { textResult } from '../test-support/fakes/vertexai.mjs';
import { validateStudentOutputText } from '../student_output_contract.js';

// Captured raw model text (exact bytes, including the whitespace the decoder emitted after the cut)
export const RAW_CUT_NEWLINE = '{\n  "responses": [\n    {\n      "student": "יובל",\n      "message": "בטח. מלבן עם צלע אחת באורך 5 ס"\n    }\n  ]\n}';
export const RAW_CUT_SPACES = '{\n  "responses": [\n    {\n      "student": "יובל",\n      "message": "אממ... מלבן עם צלע אחת באורך 5 ס"  }\n  ]\n}';
export const RAW_CUT_ONE_OF_THREE = '{\n  "responses": [\n    {\n      "student": "יובל",\n      "message": "אממ... מהירות? אני לא בטוח. אולי קמ/שעה?"\n    },\n    {\n      "student": "נועה",\n      "message": "זה קמ"\n    },\n    {\n      "student": "דנה",\n      "message": "קמ/שעה, ברור. 15 קמ/שעה."\n    }\n  ]\n}';
// Control: the same model escaping the quote correctly (no loss)
export const RAW_ESCAPED_OK = '{\n  "responses": [\n    {\n      "student": "מעיין",\n      "message": "מלבן עם צלעות של 7 ס\\"מ ו-4 ס\\"מ. כל הזוויות שלו ישרות, אבל הצלעות לא שוות, אז הוא לא ריבוע."\n    }\n  ]\n}';

test('the captured raw outputs are valid JSON: the abbreviation is already cut in the model text', () => {
  const messages = (raw) => JSON.parse(raw).responses.map((r) => r.message);
  assert.deepEqual(messages(RAW_CUT_NEWLINE), ['בטח. מלבן עם צלע אחת באורך 5 ס']);
  assert.deepEqual(messages(RAW_CUT_SPACES), ['אממ... מלבן עם צלע אחת באורך 5 ס']);
  assert.equal(messages(RAW_CUT_ONE_OF_THREE)[1], 'זה קמ');
  assert.equal(messages(RAW_ESCAPED_OK)[0], 'מלבן עם צלעות של 7 ס"מ ו-4 ס"מ. כל הזוויות שלו ישרות, אבל הצלעות לא שוות, אז הוא לא ריבוע.');
});

test('the student output contract accepts the cut outputs (a structural check cannot see the loss)', () => {
  for (const raw of [RAW_CUT_NEWLINE, RAW_CUT_SPACES, RAW_CUT_ONE_OF_THREE, RAW_ESCAPED_OK]) {
    assert.equal(validateStudentOutputText(raw).ok, true);
  }
});

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
beforeEach(() => srv.fakeModel.reset());

const ask = () => postJson(srv.baseUrl, '/api/generate', {
  messages: [
    { role: 'system', content: 'SYSTEM' },
    { role: 'user', content: 'יובל, תן או תני דוגמה למלבן שאינו ריבוע.', name: 'Teacher' },
  ],
  options: { stop: ['Teacher:'] },
});

test('1.3.13: a cut reply is still served verbatim after one attempt, and counted in quoteCutSuspected', async () => {
  for (const raw of [RAW_CUT_NEWLINE, RAW_CUT_SPACES, RAW_CUT_ONE_OF_THREE]) {
    srv.fakeModel.reset();
    srv.fakeModel.respond = () => textResult(raw, 'STOP');
    const res = await ask();
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.text, raw); // nothing after the model changes the text
    assert.equal(res.body.meta.attempts, 1); // no retry: the output is valid
    assert.equal(srv.fakeModel.calls.length, 1);
    assert.equal(res.body.meta.duplicateOutcome, 'none');
    assert.equal(res.body.meta.quoteCutSuspected, 1); // detection only: no retry, no rewrite, no drop
    assert.equal(res.body.meta.quoteCutPaddedAttempts, 0);
  }
});

test('1.3.13: a complete reply (escaped quote or gershayim) reports quoteCutSuspected 0', async () => {
  const gershayim = JSON.stringify({ responses: [{ student: 'יובל', message: 'מלבן עם צלע של 5 ס״מ וצלע של 3 ס״מ.' }] });
  for (const raw of [RAW_ESCAPED_OK, gershayim]) {
    srv.fakeModel.reset();
    srv.fakeModel.respond = () => textResult(raw, 'STOP');
    const res = await ask();
    assert.equal(res.status, 200);
    assert.equal(res.body.text, raw);
    assert.equal(res.body.meta.quoteCutSuspected, 0);
    assert.equal(res.body.meta.attempts, 1);
  }
});

// Captured shape (student_quote_safety_experiment.md §9): the string closes at an opening quote, then the
// decoder emits whitespace until the token limit. Invalid JSON, so the existing policy retries it.
const RAW_PADDED = '{\n  "responses": [\n    {\n      "student": "עדי",\n      "message": "אני לא בטוחה שאני מבינה מה זה "' + ' '.repeat(900);
const VALID = JSON.stringify({ responses: [{ student: 'עדי', message: 'אני לא בטוחה מה זה נקודת המפגש.' }] });

test('1.3.13: a space-padded token-limit attempt is retried by the existing policy and counted', async () => {
  let i = 0;
  srv.fakeModel.respond = () => (i++ === 0 ? textResult(RAW_PADDED, 'MAX_TOKENS') : textResult(VALID, 'STOP'));
  const res = await ask();
  assert.equal(res.status, 200);
  assert.equal(res.body.text, VALID);
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.equal(res.body.meta.attempts, 2);
  assert.equal(res.body.meta.quoteCutPaddedAttempts, 1);
  assert.equal(res.body.meta.quoteCutSuspected, 0);
});

test('1.3.13: two space-padded attempts fail as before (no third attempt, no new failure mode)', async () => {
  srv.fakeModel.respond = () => textResult(RAW_PADDED, 'MAX_TOKENS');
  const res = await ask();
  assert.equal(res.status, 500);
  assert.equal(res.body.success, false);
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.equal(res.body.meta.attempts, 2);
});

test('1.3.13: a duplicate re-ask whose answer is cut keeps the 2-attempt cap and is counted', async () => {
  const DANA = 'אז רק במעוין וריבוע האלכסונים חוצים זוויות? זה קצת מבלבל.';
  const cut = JSON.stringify({ responses: [{ student: 'דנה', message: 'אז מלבן עם צלע של 5 ס' }] });
  let i = 0;
  srv.fakeModel.respond = () => (i++ === 0 ? textResult(JSON.stringify({ responses: [{ student: 'דנה', message: DANA }] })) : textResult(cut));
  const res = await postJson(srv.baseUrl, '/api/generate', { messages: [
    { role: 'system', content: 'SYSTEM' },
    { role: 'user', content: 'באילו מרובעים האלכסונים חוצים את הזוויות?', name: 'Teacher' },
    { role: 'assistant', content: DANA, name: 'דנה' },
    { role: 'user', content: 'נכון', name: 'Teacher' },
  ] });
  assert.equal(res.status, 200);
  assert.equal(res.body.text, cut);
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.equal(res.body.meta.attempts, 2);
  assert.equal(res.body.meta.duplicateOutcome, 'resolved');
  assert.equal(res.body.meta.quoteCutSuspected, 1);
});

test('1.3.13: the quote-cut telemetry is content-free (integers only, no reply text)', async () => {
  srv.fakeModel.respond = () => textResult(RAW_CUT_ONE_OF_THREE, 'STOP');
  const res = await ask();
  for (const key of ['quoteCutSuspected', 'quoteCutPaddedAttempts']) assert.ok(Number.isInteger(res.body.meta[key]) && res.body.meta[key] >= 0, key);
  const metaText = JSON.stringify(res.body.meta);
  for (const fragment of ['קמ', 'נועה', 'דנה', 'יובל']) assert.ok(!metaText.includes(fragment), fragment);
});
