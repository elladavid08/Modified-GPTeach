// Same-student duplicate guard (1.3.11): the detector, the regeneration note and the final fallback.
// Criterion and wording exactly as validated in research/simulator_audit/student_duplicate_guard_study.md
// and student_duplicate_reask_experiment.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DUPLICATE_MIN_CHARS,
  DUPLICATE_SIMILARITY_THRESHOLD,
  normalizeReply,
  normalizeReplyForEquality,
  editSimilarity,
  isSelfDuplicate,
  findSelfDuplicates,
  buildRegenerationNote,
  appendRegenerationNote,
  dropDuplicateReplies,
} from '../student_duplicate_guard.js';

const EARLIER = 'אז רק במעוין וריבוע האלכסונים חוצים זוויות? זה קצת מבלבל.'; // 57 chars
const history = (...items) => [
  { role: 'system', content: 'SYS' },
  { role: 'user', content: 'שאלה של המורה', name: 'Teacher' },
  ...items.map(([name, content]) => (name === 'Teacher' ? { role: 'user', content, name } : { role: 'assistant', content, name })),
  { role: 'user', content: 'אוקיי', name: 'Teacher' },
];
const responses = (...items) => items.map(([student, message]) => ({ student, message }));

test('criterion constants are the validated ones', () => {
  assert.equal(DUPLICATE_MIN_CHARS, 30);
  assert.equal(DUPLICATE_SIMILARITY_THRESHOLD, 0.9);
});

test('normalization: trim, collapse whitespace and line breaks, ignore trailing punctuation only', () => {
  assert.equal(normalizeReply('  שורה\r\nשנייה \t  ו\n\nשלישית  '), 'שורה שנייה ו שלישית');
  assert.equal(normalizeReplyForEquality('אז זה מלבן?!...  '), 'אז זה מלבן');
  assert.equal(normalizeReplyForEquality('"כן, זה מלבן" (נכון?)'), '"כן, זה מלבן" (נכון');
  // words and inner punctuation are never removed
  assert.equal(normalizeReplyForEquality('רגע, אז זה מלבן? כן.'), 'רגע, אז זה מלבן? כן');
});

test('1. an exact same-student repeat of >= 30 characters is a duplicate', () => {
  const dups = findSelfDuplicates(responses(['דנה', EARLIER]), history(['דנה', EARLIER]));
  assert.deepEqual(dups.map((d) => [d.index, d.student, d.earlier]), [[0, 'דנה', EARLIER]]);
});

test('2. whitespace, line-break and trailing-punctuation variants are duplicates', () => {
  const variant = '  אז רק במעוין   וריבוע האלכסונים\nחוצים זוויות?  זה קצת מבלבל!!  ';
  assert.equal(isSelfDuplicate(variant, EARLIER), true);
  assert.equal(findSelfDuplicates(responses(['דנה', variant]), history(['דנה', EARLIER])).length, 1);
});

test('3. edit similarity >= 0.90 is a duplicate (one changed word)', () => {
  const a = 'כן, זה מרובע ויש לו סימנים של זוויות ישרות בכל הפינות. אז זה מלבן.';
  const b = 'כן, זה מרובע ויש בו סימנים של זוויות ישרות בכל הפינות. אז זה מלבן.';
  assert.ok(editSimilarity(a, b) >= 0.9);
  assert.equal(isSelfDuplicate(a, b), true);
  // exactly at the threshold counts
  const base = 'א'.repeat(30);
  assert.equal(editSimilarity('א'.repeat(27) + 'בבב', base), 0.9);
  assert.equal(isSelfDuplicate('א'.repeat(27) + 'בבב', base), true);
});

test('4. similarity just below 0.90 is not a duplicate', () => {
  const base = 'א'.repeat(30);
  const four = 'א'.repeat(26) + 'בבבב'; // 1 - 4/30 = 0.867
  assert.ok(editSimilarity(four, base) < 0.9);
  assert.equal(isSelfDuplicate(four, base), false);
  // a real boundary pair from the study (edit similarity 0.89)
  const a = 'אז רגע, אם לריבוע יש ארבע זוויות ישרות, הוא כן מלבן? כי אני תמיד חשבתי שמלבן זה משהו ארוך כזה.';
  const b = 'אז אם לריבוע יש ארבע זוויות ישרות, הוא כן נחשב מלבן? כי אני תמיד חשבתי שמלבן זה משהו ארוך כזה.';
  const s = editSimilarity(a, b);
  assert.ok(s >= 0.85 && s < 0.9, String(s));
  assert.equal(isSelfDuplicate(a, b), false);
});

test('5. a reply shorter than 30 normalized characters never triggers', () => {
  const short = 'אוקיי, נראה מה תצייר לנו.'; // 25
  assert.ok(normalizeReply(short).length < 30);
  assert.equal(isSelfDuplicate(short, short), false);
  const twentyNine = 'אני מוכנה! בוא נראה את הציור.'; // 29, the longest natural repeat in the study
  assert.equal(normalizeReply(twentyNine).length, 29);
  assert.equal(isSelfDuplicate(twentyNine, twentyNine), false);
  // the 30-character minimum applies to the normalized reply (padding spaces do not count)
  assert.equal(isSelfDuplicate(`   ${twentyNine}    `, twentyNine), false);
});

test('6. natural short repeats (כן, לא, תודה, לא יודעת, אני לא בטוחה) never trigger', () => {
  for (const s of ['כן', 'כן.', 'לא', 'תודה', 'תודה רבה!', 'לא יודעת', 'אני לא בטוחה', 'כן, תודה!', 'היי']) {
    const dups = findSelfDuplicates(responses(['נועה', s]), history(['נועה', s], ['נועה', s]));
    assert.deepEqual(dups, [], s);
  }
});

test('7. the same text said earlier by a different student does not trigger (no cross-student check)', () => {
  assert.deepEqual(findSelfDuplicates(responses(['תמר', EARLIER]), history(['דנה', EARLIER])), []);
});

test('teacher messages and nameless (legacy) replies are not compared', () => {
  assert.deepEqual(findSelfDuplicates(responses(['דנה', EARLIER]), history(['Teacher', EARLIER])), []);
  const legacy = [{ role: 'assistant', content: EARLIER }, { role: 'user', content: 'אוקיי' }];
  assert.deepEqual(findSelfDuplicates(responses(['דנה', EARLIER]), legacy), []);
});

test('every earlier turn of the same student counts, not only the previous one', () => {
  const dups = findSelfDuplicates(responses(['דנה', EARLIER]), history(['דנה', EARLIER], ['Teacher', 'עוד שאלה'], ['דנה', 'משהו אחר לגמרי שדנה אמרה בתור הבא, באורך מספיק']));
  assert.equal(dups.length, 1);
  assert.equal(dups[0].earlier, EARLIER);
});

test('entries without a student or message are ignored; several flagged students are all reported', () => {
  const other = 'ומה לגבי מקבילית? גם שם האלכסונים חוצים זה את זה, נכון?';
  const dups = findSelfDuplicates(
    [{ student: 'דנה', message: EARLIER }, { message: EARLIER }, { student: 'יובל' }, { student: 'יובל', message: other }, { student: 'תמר', message: 'משהו חדש לגמרי שתמר עוד לא אמרה בשיעור הזה' }],
    history(['דנה', EARLIER], ['יובל', other])
  );
  assert.deepEqual(dups.map((d) => [d.index, d.student]), [[0, 'דנה'], [3, 'יובל']]);
});

// ─── regeneration note (wording validated in student_duplicate_reask_experiment.md) ───

test('single-student note: exact validated wording', () => {
  assert.equal(
    buildRegenerationNote([{ student: 'דנה', earlier: EARLIER }]),
    '[Regeneration note — not part of the conversation]\n' +
      `In your previous draft, דנה's reply repeated, word for word or almost, what דנה already said earlier in this conversation: "${EARLIER}".\n` +
      "Write the responses again. דנה must react to the teacher's latest message instead of restating that earlier reply. Keep דנה's current understanding, doubt or misconception unless the teacher's latest message changed it, but put it in new words: react to what the teacher just said, ask about a specific part, or give a brief natural reaction. Do not reuse the wording of any earlier student message. The output format is unchanged."
  );
});

test('several students: the tested concise plural form, one line per student', () => {
  const note = buildRegenerationNote([{ student: 'הילה', earlier: 'אחד' }, { student: 'רועי', earlier: 'שתיים' }, { student: 'יובל', earlier: 'שלוש' }]);
  assert.equal(
    note,
    '[Regeneration note — not part of the conversation]\n' +
      `In your previous draft, הילה's reply repeated, word for word or almost, what הילה already said earlier in this conversation: "אחד".\n` +
      `In your previous draft, רועי's reply repeated, word for word or almost, what רועי already said earlier in this conversation: "שתיים".\n` +
      `In your previous draft, יובל's reply repeated, word for word or almost, what יובל already said earlier in this conversation: "שלוש".\n` +
      "Write the responses again. הילה, רועי and יובל must each react to the teacher's latest message instead of restating their earlier reply. Keep each of these students' current understanding, doubt or misconception unless the teacher's latest message changed it, but put it in new words: react to what the teacher just said, ask about a specific part, or give a brief natural reaction. Do not reuse the wording of any earlier student message. The output format is unchanged."
  );
});

test('the quoted earlier reply is whitespace-normalized and cut to 150 characters', () => {
  const long = 'מ'.repeat(200);
  assert.ok(buildRegenerationNote([{ student: 'דנה', earlier: long }]).includes(`"${'מ'.repeat(150)}…"`));
  assert.ok(buildRegenerationNote([{ student: 'דנה', earlier: 'שורה\nשנייה' }]).includes('"שורה שנייה"'));
});

test('the note is appended after a blank line to the text of the last teacher content (as tested), on a copy', () => {
  const contents = [
    { role: 'user', parts: [{ text: 'SYS\n\nשאלה' }] },
    { role: 'model', parts: [{ text: 'דנה: תשובה' }] },
    { role: 'user', parts: [{ text: 'אוקיי' }, { inline_data: { mime_type: 'image/png', data: 'AAA' } }] },
  ];
  const before = JSON.stringify(contents);
  const out = appendRegenerationNote(contents, 'NOTE');
  assert.equal(JSON.stringify(contents), before, 'input not mutated');
  assert.deepEqual(out.slice(0, 2), contents.slice(0, 2));
  assert.deepEqual(out[2], { role: 'user', parts: [{ text: 'אוקיי\n\nNOTE' }, { inline_data: { mime_type: 'image/png', data: 'AAA' } }] });
});

// ─── final fallback on attempt 2 ───

test('fallback: only still-duplicate replies are dropped when another reply remains', () => {
  const value = { responses: responses(['דנה', EARLIER], ['תמר', 'תשובה חדשה של תמר']) };
  const r = dropDuplicateReplies(value, [{ index: 0, student: 'דנה', earlier: EARLIER }]);
  assert.deepEqual(r.value, { responses: responses(['תמר', 'תשובה חדשה של תמר']) });
  assert.deepEqual([r.dropped, r.kept], [1, 0]);
});

test('fallback: if dropping would leave no replies, the responses are kept unchanged', () => {
  const value = { responses: responses(['דנה', EARLIER], ['תמר', EARLIER + ' תמר']) };
  const dups = [{ index: 0, student: 'דנה', earlier: EARLIER }, { index: 1, student: 'תמר', earlier: EARLIER }];
  const r = dropDuplicateReplies(value, dups);
  assert.equal(r.value, value);
  assert.deepEqual([r.dropped, r.kept], [0, 2]);
});

test('fallback: an entry the client would skip (no student/message) does not count as a remaining reply', () => {
  const value = { responses: [{ student: 'דנה', message: EARLIER }, { student: 'תמר' }] };
  const r = dropDuplicateReplies(value, [{ index: 0, student: 'דנה', earlier: EARLIER }]);
  assert.equal(r.value, value);
  assert.deepEqual([r.dropped, r.kept], [0, 1]);
});
