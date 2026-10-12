// Regression fixture: student replies silently cut at a Hebrew abbreviation written with an ASCII double
// quote (gershayim), e.g. ס"מ / קמ"ש. Found in the 1.3.12 Mode B baseline (student_stability_replay.md §11.5).
//
// The raw outputs below are verbatim Gemini responses (gemini-2.5-flash-lite, JSON mode with the student
// responseSchema), captured before any parsing in the unmodified server (truncation investigation,
// 2026-10-12). Under constrained JSON decoding, the `"` the model meant as gershayim closes the `message`
// string; the decoder then completes valid JSON. finishReason is STOP and nothing is lost after the model,
// so the server's contract check passes and the cut text reaches the client unchanged.
//
// CURRENT BEHAVIOUR (DEFECT): these tests document the failure path. When a fix lands, the endpoint test
// below is expected to change (see the investigation report for the proposed fix and its tests).
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

test('CURRENT BEHAVIOUR (defect): /api/generate serves a cut reply verbatim, as a success, after one attempt', async () => {
  for (const raw of [RAW_CUT_NEWLINE, RAW_CUT_SPACES, RAW_CUT_ONE_OF_THREE]) {
    srv.fakeModel.reset();
    srv.fakeModel.respond = () => textResult(raw, 'STOP');
    const res = await postJson(srv.baseUrl, '/api/generate', {
      messages: [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'יובל, תן או תני דוגמה למלבן שאינו ריבוע.', name: 'Teacher' },
      ],
      options: { stop: ['Teacher:'] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.text, raw); // nothing after the model changes the text
    assert.equal(res.body.meta.attempts, 1); // no retry: the output is valid
    assert.equal(srv.fakeModel.calls.length, 1);
    assert.equal(res.body.meta.duplicateOutcome, 'none');
  }
});
