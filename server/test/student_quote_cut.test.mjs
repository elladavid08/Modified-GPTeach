// Quote-cut detector (1.3.13, detection only): pure functions, no model calls.
// Shapes from student_quote_truncation_investigation.md / student_quote_safety_experiment.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSuspectedQuoteCut, countSuspectedQuoteCuts, isSpacePaddedTokenLimit, PADDED_TOKEN_LIMIT_MIN_SPACES } from '../student_quote_cut.js';

test('flags an abbreviation cut: a 1-2-letter Hebrew fragment and no final punctuation', () => {
  for (const m of ['בטח. מלבן עם צלע אחת באורך 5 ס', 'אז 12 מ', 'זה קמ', 'אני חושבת ש', 'נכון? וה', '(נניח 5 ס']) {
    assert.equal(isSuspectedQuoteCut(m), true, m);
  }
});

test('flags a quoted-word cut: whitespace left at the end of the raw message string', () => {
  for (const m of ['אבל מה זה אומר ', 'אני לא בטוחה מה זה אומר בדיוק... האם ', 'אולי ', 'אם זה לא נראה כמו מלבן ']) {
    assert.equal(isSuspectedQuoteCut(m), true, JSON.stringify(m));
  }
});

test('does not flag complete replies', () => {
  for (const m of [
    'מלבן עם צלעות של 7 ס"מ ו-4 ס"מ.', 'מלבן עם צלע של 5 ס״מ וצלע של 3 ס״מ.', '15 קמ״ש', 'קמ״ש. 15 קמ״ש. ', 'תודה', 'ביי', 'בכיף!',
    'כן.', 'לא?', 'אממ...', 'מלבן עם צלעות 5 ו-3', 'זה 12 מ״ר', "'חוצים זה את זה' זה שהם נפגשים באמצע, נכון?", 'אוקיי (הבנתי)', '',
  ]) {
    assert.equal(isSuspectedQuoteCut(m), false, JSON.stringify(m));
  }
  assert.equal(isSuspectedQuoteCut(undefined), false);
  assert.equal(isSuspectedQuoteCut(null), false);
});

test('known false-positive limitation: a bare 1-2-letter last word without punctuation is flagged', () => {
  // Accepted: telemetry only. No such reply in the synthetic corpus (2,355 unique replies).
  assert.equal(isSuspectedQuoteCut('כן'), true);
  assert.equal(isSuspectedQuoteCut('אוקיי, אז גם'), true);
});

test('counts suspected cuts per reply; ignores malformed entries', () => {
  assert.equal(countSuspectedQuoteCuts([{ student: 'א', message: 'זה קמ' }, { student: 'ב', message: 'קמ/שעה, ברור.' }, { student: 'ג', message: 'אולי ' }]), 2);
  assert.equal(countSuspectedQuoteCuts([]), 0);
  assert.equal(countSuspectedQuoteCuts([{ student: 'א' }, null, 'x', { message: 5 }]), 0);
  assert.equal(countSuspectedQuoteCuts(undefined), 0);
});

test('space-padded token-limit attempt: a closed quote then only whitespace until MAX_TOKENS', () => {
  const padded = '{\n  "responses": [\n    {\n      "student": "עדי",\n      "message": "אני לא בטוחה שאני מבינה מה זה "' + ' '.repeat(900);
  assert.equal(isSpacePaddedTokenLimit(padded, 'MAX_TOKENS'), true);
  assert.equal(isSpacePaddedTokenLimit(padded, 'STOP'), false); // only when the token limit was hit
  assert.equal(isSpacePaddedTokenLimit('{"responses":[{"student":"א","message":"' + 'ב'.repeat(600), 'MAX_TOKENS'), false); // ordinary long output cut by the limit
  assert.equal(isSpacePaddedTokenLimit('"' + ' '.repeat(PADDED_TOKEN_LIMIT_MIN_SPACES - 1), 'MAX_TOKENS'), false);
  assert.equal(isSpacePaddedTokenLimit(null, 'MAX_TOKENS'), false);
});
