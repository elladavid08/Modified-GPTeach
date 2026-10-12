// Deterministic teacher: Mode A stays fixed; Mode B question routing, answer-at-most-once, hints,
// neutral acknowledgement, antecedent fallback and decision logging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, MOVES } from '../config/scenarios.js';
import { openQuestions, routeQuestion, classifyQuestions, misconceptionClaims, teacherTurnA, teacherTurnB, createTeacherState, ANSWER_BANK, KEY_FACT } from '../lib/teacher.js';

const plan = (id) => SCENARIOS.find((s) => s.id === id);
const CAST = ['רועי', 'דנה', 'מעיין'];
const reply = (student, message) => ({ student, message });

test('open-question detection: interrogative + "?"; tag questions and statements are not open questions', () => {
  assert.deepEqual(openQuestions('אני לא בטוחה. איך אפשר לבדוק את הזוויות כשזה ככה?'), ['איך אפשר לבדוק את הזוויות כשזה ככה?']);
  assert.deepEqual(openQuestions('אז ריבוע הוא מלבן, נכון?'), []);
  assert.deepEqual(openQuestions('אז זה מעוין.'), []);
  assert.equal(openQuestions('למה דווקא במעוין? ומה ההבדל בין דלתון למעוין?').length, 2);
});

test('routing to scenario categories', () => {
  assert.equal(routeQuestion(4, 'אבל למה דווקא במעוין וריבוע?').category, 'WHY');
  assert.equal(routeQuestion(3, 'איך אני יודעת שהזוויות ישרות?').category, 'HOW_CHECK');
  assert.equal(routeQuestion(5, "מה זה אומר 'חוצים זה את זה'?").category, 'MEANING');
  assert.equal(routeQuestion(2, 'אז מה עוד צריך?').category, 'WHAT_ELSE');
  assert.equal(routeQuestion(1, 'למה מלבן לא יכול להיות ריבוע?').category, 'RECT_SQUARE');
  assert.equal(routeQuestion(6, 'מה ההבדל בין דלתון למעוין?').category, 'DIFF');
  assert.equal(routeQuestion(2, 'מה זה בכלל?'), null);
});

test('Mode A is the fixed script whatever the students say', () => {
  for (const p of SCENARIOS) {
    for (let i = 0; i < 12; i++) {
      const t = teacherTurnA(p, i, CAST);
      assert.equal(t.text, t.scriptedText);
      assert.deepEqual(t.decision, { mode: 'A', adaptive: false });
    }
  }
  assert.equal(teacherTurnA(plan(4), 1, CAST).text, 'רועי, האם במלבן האלכסונים חוצים את הזוויות?');
});

test('Mode B: a question before its planned discovery gets the hint; later the full answer; never twice', () => {
  const p = plan(4);
  const state = createTeacherState();
  const why = [reply('דנה', 'רגע, אבל למה דווקא במעוין וריבוע?')];
  const t6 = teacherTurnB(p, 5, CAST, why, state); // T6 "נכון" (probe) -> hint replaces it
  assert.equal(t6.decision.answered.category, 'WHY');
  assert.equal(t6.decision.answered.stage, 'hint');
  assert.equal(t6.decision.probeReplaced, true);
  assert.equal(t6.text, `דנה, ${ANSWER_BANK[4][0][4]}`);
  const t7 = teacherTurnB(p, 6, CAST, why, state); // asked again before T10: hint already given -> scripted move
  assert.equal(t7.decision.answered, null);
  assert.equal(t7.decision.questions[0].action, 'hint_already_given');
  assert.equal(t7.text, t7.scriptedText);
  const t10 = teacherTurnB(p, 9, CAST, why, state); // T10: full answer, then the planned question
  assert.equal(t10.decision.answered.stage, 'full');
  assert.equal(t10.text, `דנה, ${ANSWER_BANK[4][0][2]} ${t10.scriptedText}`);
  const t11 = teacherTurnB(p, 10, CAST, why, state); // after the full answer: not answered again
  assert.equal(t11.decision.answered, null);
  assert.equal(t11.decision.questions[0].action, 'repeat_after_answered');
  assert.equal(t11.text, t11.scriptedText);
  assert.equal(t11.decision.stateAfter.WHY, 'full');
});

test('Mode B: a content move keeps the planned progression after the answer', () => {
  const state = createTeacherState();
  const t = teacherTurnB(plan(3), 9, CAST, [reply('מעיין', 'איך אפשר לבדוק את הזוויות כשהוא מסובב?')], state);
  assert.match(t.text, /^מעיין, בודקים כל פינה/);
  assert.ok(t.text.endsWith(t.scriptedText));
  assert.equal(t.decision.probeReplaced, false);
});

test('Mode B: one answer per turn; other questions are deferred; generic key fact once per student', () => {
  const state = createTeacherState();
  const prev = [reply('רועי', 'מה זה בכלל?'), reply('דנה', "מה זה אומר 'חוצים זה את זה'?")];
  const t = teacherTurnB(plan(5), 2, CAST, prev, state);
  assert.equal(t.decision.answered.category, 'MEANING'); // specific category preferred over generic
  assert.deepEqual(t.decision.questions.map((q) => q.action), ['deferred', 'answered_full']);
  const g = teacherTurnB(plan(5), 3, CAST, [reply('רועי', 'מה זה בכלל?')], state); // T4: before the explanation
  assert.equal(g.decision.answered.category, 'GENERIC');
  assert.equal(g.decision.answered.stage, 'hint');
  const gFull = teacherTurnB(plan(5), 6, CAST, [reply('רועי', 'מה זה בכלל?')], state); // T7: key fact
  assert.equal(gFull.decision.answered.stage, 'full');
  assert.ok(gFull.text.includes(KEY_FACT[5]));
  const g2 = teacherTurnB(plan(5), 7, CAST, [reply('רועי', 'מה זה בכלל?')], state);
  assert.equal(g2.decision.answered, null);
  assert.equal(g2.decision.questions[0].action, 'unmatched_generic_already_used');
});

test('Mode B: "נכון"/"יפה" never confirm a detected misconception claim', () => {
  const p2 = plan(2);
  const claim = [reply('רועי', 'כן, אם האלכסונים מאונכים זה תמיד מעוין.')];
  const t3 = teacherTurnB(p2, 2, CAST, claim, createTeacherState()); // T3 "יפה"
  assert.equal(t3.text, 'אוקיי');
  assert.equal(t3.decision.neutralized.from, 'יפה');
  assert.equal(t3.decision.neutralized.claims[0].student, 'רועי');
  // a negated claim is not a misconception
  const negated = [reply('רועי', 'זה לא אומר שאם האלכסונים מאונכים זה מעוין.')];
  assert.equal(teacherTurnB(p2, 2, CAST, negated, createTeacherState()).text, 'יפה');
  // no claim -> the scripted validation stays
  assert.equal(teacherTurnB(plan(1), 5, CAST, [reply('דנה', 'ריבוע הוא מלבן כי כל הזוויות ישרות.')], createTeacherState()).text, 'נכון');
  // per-scenario claim detection
  assert.equal(misconceptionClaims(1, 'אני חושבת שריבוע הוא לא מלבן.').length, 1);
  assert.equal(misconceptionClaims(4, 'אז בכל מרובע האלכסונים חוצים את הזוויות.').length, 1);
  assert.equal(misconceptionClaims(4, 'אז לא בכל מרובע האלכסונים חוצים את הזוויות.').length, 0);
  assert.equal(misconceptionClaims(6, 'מעוין הוא לא דלתון, הם נראים שונה.').length, 1);
});

test('Mode B: peer question re-anchored when the previous turn had no reply', () => {
  const t = teacherTurnB(plan(1), 3, CAST, [], createTeacherState()); // T4 "{B}, מה דעתך על מה שנאמר?"
  assert.equal(t.text, 'דנה, מה דעתך על השאלה ששאלתי את רועי?');
  assert.equal(t.decision.antecedentFallback, true);
  // with a reply it stays scripted
  assert.equal(teacherTurnB(plan(1), 3, CAST, [reply('רועי', 'לא, ריבוע זה משהו אחר.')], createTeacherState()).text, 'דנה, מה דעתך על מה שנאמר?');
});

test('Mode B: no pending question and no claim -> exactly the scripted move; every decision is logged', () => {
  const t = teacherTurnB(plan(6), 7, CAST, [reply('דנה', 'כן, מעוין הוא דלתון כי כל הצלעות שוות.')], createTeacherState());
  assert.equal(t.text, t.scriptedText);
  for (const k of ['mode', 'turn', 'move', 'questions', 'answered', 'probeReplaced', 'neutralized', 'antecedentFallback', 'reason', 'stateAfter']) assert.ok(k in t.decision, k);
  assert.equal(t.decision.move, MOVES.CONTENT_Q);
});

// ─── regressions found in the first live smoke run (smoke-B-1) ───

test('smoke-1: misconception claims seen live are detected; correct statements are not', () => {
  // s4: rectangle diagonal "does" bisect the angle (asked as a hesitant question) -> claim
  assert.equal(misconceptionClaims(4, 'רגע, במלבן יש 4 זוויות ישרות. האלכסון מחלק את הזווית הישרה לשתים. אז... כן? הוא כן חוצה את הזווית?').length, 1);
  assert.equal(misconceptionClaims(4, 'רק במעוין ובריבוע האלכסונים חוצים את הזוויות. במלבן הם לא חוצים.').length, 0);
  // s5: "equal and perpendicular is enough for a square" in two sentences / "sounds like a square"
  assert.equal(misconceptionClaims(5, 'כן, שווים ומאונכים. זה מספיק כדי שזה יהיה ריבוע, נכון?').length, 1);
  assert.equal(misconceptionClaims(5, 'רגע, אם האלכסונים שווים ומאונכים, אז זה כבר יותר ממה שיש למלבן. זה נשמע לי כמו ריבוע.').length, 1);
  assert.equal(misconceptionClaims(5, 'אם האלכסונים שווים ומאונכים אבל לא חוצים זה את זה, זה לא ריבוע.').length, 0);
  // s2: the correct criterion is not a misconception
  assert.equal(misconceptionClaims(2, 'אם האלכסונים מאונכים וגם הם חוצים אחד את השני, אז זה מעוין.').length, 0);
  assert.equal(misconceptionClaims(2, 'אם האלכסונים נפגשים בניצב, אז זה מעוין.').length, 1);
  // s3: "always long" / "if it is not like that it is not a rectangle"
  assert.ok(misconceptionClaims(3, 'כן, מלבן זה תמיד כזה, עם צלע ארוכה וצלע קצרה. אם זה לא ככה, זה לא מלבן.').length >= 1);
  assert.equal(misconceptionClaims(3, 'מלבן לא חייב להיות ארוך.').length, 0);
});

test('smoke-1: the s4 T3 "יפה" after a rectangle-bisects claim is neutralized', () => {
  const t = teacherTurnB(plan(4), 2, CAST, [reply('רועי', 'אז... כן? במלבן הוא כן חוצה את הזווית?')], createTeacherState());
  // the claim is phrased as a question without an interrogative word: no answer, so the gate applies
  assert.equal(t.text, 'אוקיי');
});

test('smoke-1: core-misconception and planned-discovery categories are only hinted before their turn', () => {
  const s3 = teacherTurnB(plan(3), 2, CAST, [reply('רועי', 'אבל אם זה לא ארוך וצר, מה זה?')], createTeacherState());
  assert.equal(s3.decision.answered.category, 'LONG');
  assert.equal(s3.decision.answered.stage, 'hint'); // full only from the explanation (T5)
  const s3b = teacherTurnB(plan(3), 5, CAST, [reply('דנה', 'איך אני אמורה לדעת שהזוויות ישרות?')], createTeacherState());
  assert.equal(s3b.decision.answered.stage, 'hint'); // students first answer the T8 "how will you check?"
});

test('smoke-1: generic answers are staged (acknowledge before the explanation) and never pre-empt the explanation', () => {
  const early = teacherTurnB(plan(2), 2, CAST, [reply('רועי', 'אז זה לא בהכרח מעוין? למה?')], createTeacherState());
  assert.equal(early.decision.answered.category, 'GENERIC');
  assert.equal(early.decision.answered.stage, 'hint');
  assert.ok(!/דלתון/.test(early.text), 'the kite counterexample is not revealed before T5');
  const atExplain = teacherTurnB(plan(4), 4, CAST, [reply('מעיין', 'מה זה אומר בדיוק?')], createTeacherState());
  assert.equal(atExplain.text, atExplain.scriptedText);
  assert.equal(atExplain.decision.questions[0].action, 'covered_by_explanation');
  const late = teacherTurnB(plan(5), 7, CAST, [reply('רועי', 'אז מה אמרת מקודם? שזה לא מספיק?')], createTeacherState());
  assert.match(late.text, /^רועי, נחזור להגדרה: ריבוע הוא מרובע שהאלכסונים שלו שווים, מאונכים וחוצים זה את זה\./);
});

test('smoke-1: routing uses the preceding sentence as context ("…\'חוצים זה את זה\'? מה זה אומר בדיוק?")', () => {
  const t = teacherTurnB(plan(4), 3, CAST, [reply('מעיין', "רגע, זה תנאי חדש? 'אלכסונים חוצים זה את זה'? מה זה אומר בדיוק?")], createTeacherState());
  assert.equal(t.decision.answered.category, 'MEANING_EACH_OTHER');
});

test('smoke-1: when the student asked a planned content question is unsure, the teacher gives that answer next', () => {
  const state = createTeacherState();
  const t11 = teacherTurnB(plan(4), 10, CAST, [reply('מעיין', 'שאלה טובה. אני לא כל כך בטוח. זה קצת מבלבל.')], state); // T10 asked C (=מעיין in CAST) "why"
  assert.equal(t11.decision.answered.category, 'WHY');
  assert.equal(t11.decision.answered.stage, 'full');
  assert.equal(t11.decision.questions[0].action, 'answered_full_after_unsure');
  assert.ok(t11.text.endsWith(t11.scriptedText));
  // a confident answer is left to the plan
  const ok = teacherTurnB(plan(4), 10, CAST, [reply('מעיין', 'כי במעוין כל הצלעות שוות, אז המשולשים חופפים.')], createTeacherState());
  assert.equal(ok.decision.answered, null);
});

test('every category whose full answer is delayed has a hint (no early reveal through a missing hint)', () => {
  for (const [scenario, entries] of Object.entries(ANSWER_BANK)) {
    for (const [category, , , earliest, hint] of entries) if (earliest > 1) assert.ok(hint, `s${scenario} ${category}`);
  }
  const t3 = teacherTurnB(plan(2), 2, CAST, [reply('רועי', 'מה ההבדל בין דלתון למעוין?')], createTeacherState());
  assert.equal(t3.decision.answered.stage, 'hint');
});

// ─── regressions found in the second live smoke run (smoke-B-2) ───

test('smoke-2: routing misfires seen live are fixed', () => {
  const cq = (s, text) => classifyQuestions(s, text).map((q) => q.category);
  // "מה שקובע … מאונכים" is not a question about the meaning of "perpendicular"
  assert.deepEqual(cq(2, 'אז מה שקובע שזה מעוין זה לא רק האלכסונים המאונכים, אלא גם שכל הצלעות שוות?'), [null]);
  assert.deepEqual(cq(2, "רגע, מה זה בדיוק אומר 'מאונכים'?"), ['MEANING_PERP']);
  // "what is special about the square" asks why, not about parallelograms
  assert.deepEqual(cq(4, 'רגע, אם במלבן האלכסונים לא חוצים זוויות, אבל בריבוע כן, אז מה המיוחד בריבוע שגורם לזה לקרות?'), ['WHY']);
  // s5: "why also bisect?" is a why-question; "לחצות" asks for the meaning
  assert.deepEqual(cq(5, 'אבל אם האלכסונים שווים ומאונכים, זה לא ריבוע? למה צריך גם לחצות?'), ['WHY']);
  assert.deepEqual(cq(5, "ומה זה אומר 'לחצות זה את זה'?"), ['MEANING']);
  // context is only used for short/deictic questions
  assert.deepEqual(cq(6, 'רגע, אז ההבדל הוא שבדלתון רק שני זוגות צלעות סמוכות שוות, אבל במעוין כל ארבע הצלעות שוות? אז למה קודם אמרתם שמעוין הוא דלתון?'), ['WHY_INCLUSION']);
  assert.deepEqual(cq(5, "אז אם נקודת המפגש היא בדיוק באמצע של שני האלכסונים, זה התנאי של 'חוצים זה את זה'? אז מה ההבדל ביניהם לריבוע?"), [null]);
});

test('smoke-2: the s4 parallelogram answer waits for the drawing; s6 visual-difference claim gates "יפה"', () => {
  const t = teacherTurnB(plan(4), 7, CAST, [reply('דנה', 'ומה לגבי מקבילית? גם שם?')], createTeacherState()); // T8 drawing turn
  assert.equal(t.decision.answered.stage, 'hint');
  assert.equal(misconceptionClaims(6, 'אני לא בטוחה, הם נראים שונה. מעוין נראה כמו ריבוע עקום כזה.').length >= 1, true);
  assert.equal(teacherTurnB(plan(6), 2, CAST, [reply('רועי', 'אני לא בטוחה, הם נראים שונה. מעוין נראה כמו ריבוע עקום כזה.')], createTeacherState()).text, 'אוקיי');
});

test('smoke-2 (labels): confirmation questions ("…, נכון?") are not open questions; "אז מה ההבדל?" does not borrow context', () => {
  assert.deepEqual(classifyQuestions(5, 'אז מה שציירת קודם, עם האלכסונים ששווים ומאונכים אבל לא חוצים, זה לא ריבוע כי חסר התנאי של החציחה, נכון?'), []);
  assert.deepEqual(classifyQuestions(5, 'רגע, לא, במלבן הם כן חצי חצי. אז מה ההבדל?').map((q) => q.category), [null]);
  assert.deepEqual(classifyQuestions(5, "'חוצים זה את זה'? מה זה אומר?").map((q) => q.category), ['MEANING']);
  assert.deepEqual(openQuestions('אז זה מלבן, לא?'), []);
});

// ─── regressions found in the third live smoke run (smoke-B-3) ───

test('smoke-3: nothing is prepended to the explanation turn (the explanation is the answer)', () => {
  const t = teacherTurnB(plan(5), 4, CAST, [reply('הילה', 'אם האלכסונים שווים ומאונכים, אז זה ריבוע, נכון? למה זה לא מספיק?')], createTeacherState());
  assert.equal(t.text, t.scriptedText);
  assert.deepEqual(t.decision.questions.map((q) => q.action), ['covered_by_explanation']);
});

test('smoke-3: s6 routing (definition, sufficiency, converse, inclusion) and a narrow adjacent/opposite category', () => {
  const cq = (text) => classifyQuestions(6, text).map((q) => q.category);
  assert.deepEqual(cq('רגע, מה ההגדרה המדויקת?'), ['DEF']);
  assert.deepEqual(cq('אם כל הצלעות במעוין שוות, אז זה אומר שיש לו שני זוגות של צלעות סמוכות שוות, אבל האם זה מספיק כדי להיות דלתון?'), ['WHY_INCLUSION']);
  assert.deepEqual(cq('אם בדלתון יש שני זוגות של צלעות סמוכות שוות, אבל לא בהכרח כל הצלעות שוות, אז איך הוא יכול להיות מעוין שבו כן כל הצלעות שוות?'), ['CONVERSE']);
  assert.deepEqual(cq("מה זה אומר 'יחסי הכלה'?"), ['INCLUSION']);
  assert.deepEqual(cq('מה ההבדל בין צלעות סמוכות לצלעות נגדיות?'), ['ADJ_OPP']);
});

// ─── regressions found in the fourth live smoke run (smoke-B-4) ───

test('smoke-4: s5 sufficiency claims in other wordings are detected', () => {
  assert.equal(misconceptionClaims(5, 'כן, בטח! אם הם גם שווים וגם מאונכים, אז זה בוודאות ריבוע. אין מצב שזה לא יהיה ריבוע.').length >= 1, true);
  assert.equal(misconceptionClaims(5, 'אבל למה? אם האלכסונים שווים ומאונכים, זה כבר מספיק בשבילי.').length, 1);
  assert.equal(misconceptionClaims(5, 'ברור שכן! אם האלכסונים שווים, אז זה ריבוע.').length, 1);
  assert.equal(misconceptionClaims(5, 'אם האלכסונים שווים ומאונכים, זה לא מספיק?').length, 0);
});

test('smoke-4: "איך זה יכול להיות?" after a rhombus/kite statement routes to WHY_INCLUSION', () => {
  assert.deepEqual(classifyQuestions(6, 'רגע, אז אתם אומרים שכל מעוין הוא גם דלתון? איך זה יכול להיות?').map((q) => q.category), ['WHY_INCLUSION']);
});
