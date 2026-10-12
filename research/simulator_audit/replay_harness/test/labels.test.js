// Behavioural labels on small synthetic conversations (no model calls).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOVES } from '../config/scenarios.js';
import { labelConversation, PROMPT_EXAMPLES, PROMPT_EXAMPLES_1_3_11, promptExamplesFor } from '../lib/labels.js';

const turn = (n, move, replies, stateAfter = {}, answered = null) => ({ turn: n, move, teacher: '-', decision: { mode: 'B', stateAfter, answered }, replies: replies.map(([student, message]) => ({ student, message })) });
const LONG = 'אז רק במעוין וריבוע האלכסונים חוצים זוויות? זה קצת מבלבל אותי.';

test('exact duplicate and production guard match vs a near paraphrase (semantic candidate, manual)', () => {
  const conv = { conversationId: 'x', scenarioId: 4, cast: ['תמר', 'דנה', 'נועה'], turns: [
    turn(4, MOVES.PEER_Q, [['דנה', LONG]]),
    turn(5, MOVES.EXPLAIN, [['דנה', LONG + ' ']]),
    turn(6, MOVES.PROBE_VALIDATE, [['דנה', 'אז זה רק במעוין ובריבוע? עדיין מבלבל אותי קצת.']]),
  ] };
  const [a, b, c] = labelConversation(conv).replies;
  assert.equal(a.guard_match, false);
  assert.equal(b.exact_self_duplicate, true);
  assert.equal(b.guard_match, true);
  assert.equal(c.guard_match, false);
  assert.equal(c.semantic_repetition_candidate.manual_review_required, true);
});

test('a repeated question is justified while unanswered and a loop candidate after the full answer', () => {
  const q = 'אבל למה דווקא במעוין וריבוע?';
  const conv = { conversationId: 'x', scenarioId: 4, cast: ['תמר', 'דנה', 'נועה'], turns: [
    turn(5, MOVES.EXPLAIN, [['דנה', q]]),
    turn(6, MOVES.PROBE_VALIDATE, [['דנה', 'רגע, ' + q]], { WHY: 'hint' }),
    turn(10, MOVES.CONTENT_Q, [['דנה', 'עדיין, ' + q]], { WHY: 'full' }),
  ] };
  const l = labelConversation(conv);
  assert.deepEqual(l.replies.map((r) => r.questions[0].status), ['first', 'repeat_unanswered', 'repeat_after_answered']);
  assert.deepEqual(l.manualReview.filter((i) => i.type.includes('repeat')).map((i) => i.type), ['justified_repeat_unanswered', 'loop_candidate_repeat_after_answered']);
});

test('restating after a re-ask / summary / "?" is flagged as requested, not queued as semantic repetition', () => {
  const conv = { conversationId: 'x', scenarioId: 1, cast: ['רועי', 'תמר', 'הילה'], turns: [
    turn(2, MOVES.DIRECT_Q, [['רועי', 'ריבוע הוא מלבן כי יש לו ארבע זוויות ישרות.']]),
    turn(7, MOVES.CHECK, [['רועי', 'כן, ריבוע הוא מלבן כי יש לו ארבע זוויות ישרות לגמרי.']]),
  ] };
  const l = labelConversation(conv);
  assert.equal(l.replies[1].restatementRequested, true);
  assert.equal(l.manualReview.filter((i) => i.type === 'semantic_repetition').length, 0);
});

test('student ledger: resolution only after the explanation, by the same student, unhedged, on a content move; then regression', () => {
  const conv = { conversationId: 'x', scenarioId: 6, cast: ['רועי', 'תמר', 'מעיין'], turns: [
    turn(2, MOVES.DIRECT_Q, [['רועי', 'לא, מעוין הוא לא דלתון. הם נראים שונה.']]),
    turn(5, MOVES.EXPLAIN, [['רועי', 'אוקיי.']]),
    turn(6, MOVES.PROBE_VALIDATE, [['רועי', 'אז מעוין הוא דלתון.']]), // after a probe: not evidence
    turn(7, MOVES.CHECK, [['רועי', 'כן, מעוין הוא דלתון כי יש לו שני זוגות של צלעות סמוכות שוות.']]),
    turn(9, MOVES.PROBE_ACK, [['רועי', 'רגע, אז בעצם מעוין הוא לא דלתון?']]),
  ] };
  const s = labelConversation(conv).students.perStudent['רועי'];
  assert.deepEqual(s.misconceptionTurns, [2, 9]);
  assert.equal(s.resolutionCandidateTurn, 7);
  assert.equal(s.regressionCandidateTurn, 9);
  assert.equal(s.manual_review_required, true);
});

test('premature-correctness candidate: slot-A carrier states the target idea before the explanation without any misconception', () => {
  const conv = { conversationId: 'x', scenarioId: 1, cast: ['רועי', 'תמר', 'הילה'], turns: [
    turn(2, MOVES.DIRECT_Q, [['רועי', 'כן, כל ריבוע הוא מלבן.']]),
    turn(5, MOVES.EXPLAIN, [['תמר', 'הבנתי.']]),
  ] };
  const l = labelConversation(conv);
  assert.equal(l.students.perStudent['רועי'].prematureCorrectnessCandidateTurn, 2);
  assert.equal(l.students.classMisconceptionVoicedBeforeExplain, false);
});

test('prompt-example copies are detected (the 1.3.11 6a T6 case), with the cast-slot binding', () => {
  const conv = { conversationId: 'x', scenarioId: 6, cast: ['תמר', 'יונתן', 'עדי'], turns: [
    turn(6, MOVES.PROBE_VALIDATE, [
      ['תמר', 'אז זה אומר שכל מלבן הוא גם ריבוע כי יש לו 4 זוויות ישרות?'],
      ['יונתן', 'רגע, אני עדיין לא מבין למה דווקא במעוין האלכסונים מאונכים. מה המיוחד במעוין?'],
      ['עדי', PROMPT_EXAMPLES_1_3_11[2].text],
    ]),
  ] };
  const r = labelConversation(conv, { systemVersion: '1.3.11' }).replies;
  assert.deepEqual(r.map((x) => [x.prompt_example_copy.example, x.prompt_example_copy.verbatim, x.prompt_example_copy.slotMatch]), [['EX1', false, true], ['EX2', true, true], ['EX3', true, true]]);
});

test('the example set follows the run version: 1.3.0-1.3.11 the slot-bound examples, 1.3.12+ the neutral ones', () => {
  for (const v of ['1.3.0', '1.3.9', '1.3.11']) assert.equal(promptExamplesFor(v), PROMPT_EXAMPLES_1_3_11, v);
  for (const v of ['1.3.12', '1.3.13', '1.4.0', '2.0.0']) assert.equal(promptExamplesFor(v), PROMPT_EXAMPLES, v);
  // Unknown version: both sets are checked (never silently miss a copy)
  const both = promptExamplesFor(undefined).map((e) => e.id);
  for (const e of [...PROMPT_EXAMPLES, ...PROMPT_EXAMPLES_1_3_11]) assert.ok(both.includes(e.id), e.id);
  assert.equal(new Set(both).size, both.length);
  // The neutral examples are bound to no cast position; the unchanged WRONG example still is
  assert.deepEqual(PROMPT_EXAMPLES.map((e) => [e.id, e.slot]), [['N-EX1', null], ['N-EX2', null], ['N-EX3', null], ['WRONG', 0]]);
});

test('1.3.12 runs: a neutral-template echo is detected without slot binding, the old examples are not checked', () => {
  const conv = { conversationId: 'x', scenarioId: 6, cast: ['תמר', 'יונתן', 'עדי'], turns: [
    turn(6, MOVES.PROBE_VALIDATE, [
      ['תמר', 'אה, עכשיו הבנתי! אז [המסקנה מההסבר] כי [הסיבה שהמורה נתנה]?'],
      ['עדי', PROMPT_EXAMPLES_1_3_11[2].text],
    ]),
  ] };
  const [a, b] = labelConversation(conv, { systemVersion: '1.3.12' }).replies;
  assert.deepEqual([a.prompt_example_copy.example, a.prompt_example_copy.verbatim, a.prompt_example_copy.slotMatch], ['N-EX1', true, false]);
  assert.equal(b.prompt_example_copy, null);
  assert.equal(labelConversation(conv, { systemVersion: '1.3.11' }).replies[1].prompt_example_copy.example, 'EX3');
});

test('placeholder leakage and out-of-cast speaker names are flagged automatically', () => {
  const conv = { conversationId: 'x', scenarioId: 1, cast: ['תמר', 'יונתן', 'עדי'], turns: [
    turn(5, MOVES.EXPLAIN, [
      ['תמר', 'אז [המסקנה מההסבר] נכון?'],
      ['<שם של אחד מהתלמידים ברשימה>', 'אה, הבנתי.'],
      ['רועי', 'כן, כל ריבוע הוא מלבן.'],
      ['יונתן', 'אז ריבוע הוא מלבן, כי יש לו 4 זוויות ישרות (90 מעלות).'],
    ]),
  ] };
  const r = labelConversation(conv, { systemVersion: '1.3.12' }).replies;
  assert.deepEqual(r.map((x) => [x.placeholder_leak, x.invalid_student]), [[true, false], [true, true], [false, true], [false, false]]);
});

test('contamination candidate: a 6-word overlap with another student, not from the teacher, without naming them (manual)', () => {
  const conv = { conversationId: 'x', scenarioId: 2, cast: ['תמר', 'הילה', 'עדי'], turns: [
    turn(2, MOVES.DIRECT_Q, [['תמר', 'אני חושבת שאם האלכסונים מאונכים אז זה תמיד מעוין בכל מצב.']]),
    turn(3, MOVES.PROBE_ACK, [['עדי', 'כן, אם האלכסונים מאונכים אז זה תמיד מעוין בכל מצב לדעתי.'], ['הילה', 'תמר, האלכסונים מאונכים אז זה תמיד מעוין בכל מצב?']]),
  ] };
  const r = labelConversation(conv).replies;
  assert.equal(r[1].contamination_candidate.from, 'תמר');
  assert.equal(r[2].contamination_candidate, null); // names the peer -> engagement, not contamination
});

test('shared wording that comes from the teacher is not a contamination candidate', () => {
  const said = 'במלבן ובמקבילית האלכסונים חוצים זה את זה אבל לא חוצים את הזוויות';
  const conv = { conversationId: 'x', scenarioId: 4, cast: ['תמר', 'מעיין', 'רועי'], turns: [
    { ...turn(5, MOVES.EXPLAIN, [['תמר', `אה, ${said}, הבנתי.`]]), teacher: said },
    turn(6, MOVES.PROBE_VALIDATE, [['רועי', `כן, ${said}, נכון.`]]),
  ] };
  assert.equal(labelConversation(conv).replies[1].contamination_candidate, null);
});

test('canonical lesson statements (plan, answer bank, key facts) are shared vocabulary, not contamination', () => {
  const conv = { conversationId: 'x', scenarioId: 1, cast: ['רועי', 'תמר', 'הילה'], turns: [
    turn(8, MOVES.CONTENT_Q, [['תמר', 'כל ריבוע הוא מלבן אבל לא כל מלבן הוא ריבוע.']]),
    turn(9, MOVES.PROBE_QMARK, [['הילה', 'נכון, כל ריבוע הוא מלבן אבל לא כל מלבן הוא ריבוע.']]),
  ] };
  assert.equal(labelConversation(conv).replies[1].contamination_candidate, null);
});
