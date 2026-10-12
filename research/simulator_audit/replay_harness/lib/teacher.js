// Deterministic benchmark teacher (harness review §3). No LLM.
//
// Mode A: the fixed 12-turn script, verbatim. Never adaptive.
// Mode B: the same 12-turn plan; before each scripted move the previous student turn is inspected:
//   1. pending open questions are detected and routed to a scenario answer-bank category;
//   2. the first answerable one is answered (a hint before the category's planned discovery turn,
//      the full answer from then on); every category's hint and full answer are given at most once;
//   3. a question whose full answer was already given is NOT answered again (its repetition is a
//      genuine loop candidate) and the planned move proceeds;
//   4. an unmatched question gets a staged generic answer once per student and stage: an acknowledgement
//      before the explanation turn, the scenario key fact after it; never at the explanation turn itself;
//   4b. if the student addressed by a planned question that declares `answerIfUnsure` is unsure or silent,
//      that category's full answer is given before the next planned move;
//   5. a validating probe ("נכון" / "יפה") after a detected misconception claim becomes "אוקיי";
//   6. "{B}, what do you think about what was said?" falls back to the T2 question if T(n-1) had no reply.
// Every decision is returned as a content-free-of-reasoning log record (what was detected and why).
import { MOVES, fillSlots } from '../config/scenarios.js';
import { sentences } from './text.js';

// Open question: a sentence ending in "?" that contains an interrogative. A pure tag question
// ("…, נכון?") is a claim seeking confirmation, not an open question.
const INTERROGATIVE = /(למה|איך|מה לגבי|מה עם|מה ההבדל|מה עוד|מה כן|מה זה|מה צריך|מה התנאי|מה ההגדרה|מה המיוחד|מה המשותף|איזו|איזה|האם|אז מה|מה הקשר|במה)/;
const CONFIRMATION = /(,|\s)(נכון|לא|כן)\s*\?$/; // "…, נכון?" / "…, לא?" seeks confirmation of a claim
const isOpenQuestion = (s) => s.endsWith('?') && INTERROGATIVE.test(s) && !CONFIRMATION.test(s);
export function openQuestions(reply) {
  return sentences(reply).filter(isOpenQuestion);
}
// A question that only points back ("מה זה אומר?", "למה?", "איך?") may be routed with the preceding sentence
const DEICTIC = /^(אז |רגע,? |ו)?(מה זה( אומר)?( בדיוק)?|מה הכוונה|למה|איך|למה זה|איך זה( יכול להיות| אפשרי)?)\s*\??$/;

// Answer bank: [category, trigger, full answer, earliest turn for the full answer, hint before it]
export const ANSWER_BANK = {
  1: [
    ['DIFF', /(מה ההבדל|שני שמות|שמות שונים|בנפרד|הגדרות שונות|מה המיוחד)/, 'ריבוע הוא מלבן שיש לו גם ארבע צלעות שוות. לכן יש לו את כל התכונות של מלבן, ועוד תכונה אחת.', 5, 'שאלה טובה. נבדוק את זה לפי ההגדרה עוד רגע.'],
    ['RECT_SQUARE', /(כל מלבן.*ריבוע|מלבן (לא )?(יכול להיות|הוא) ריבוע)/, 'לא כל מלבן הוא ריבוע: מלבן שצלעותיו 3 ו-5 הוא מלבן, אבל לא כל צלעותיו שוות.', 8, 'נגיע לזה עוד מעט: חשבו אם יש מלבן שאין לו ארבע צלעות שוות.'],
    ['DEF', /(מה ההגדרה|מה זה מלבן)/, 'מלבן הוא מרובע שכל זוויותיו ישרות.', 1, null],
    ['CROOKED', /(עקומ|לא ישרה)/, 'אם אחת הזוויות אינה ישרה, הצורה אינה מלבן, וגם לא ריבוע.', 1, null],
  ],
  2: [
    ['WHAT_ELSE', /(מה עוד|מה כן|מה מספיק|מה התנאי|מה צריך)/, 'אם האלכסונים מאונכים וגם חוצים זה את זה, המרובע הוא מעוין.', 8, 'חשבו מה ההבדל בין הדלתון שבשרטוט לבין מעוין: מה קורה בנקודה שבה האלכסונים נפגשים?'],
    ['KITE_RHOMBUS', /(דלתון|ההבדל בין)/, 'בדלתון רק אלכסון אחד חוצה את השני. במעוין כל אלכסון חוצה את השני, וכל הצלעות שוות.', 5, 'נגיע להבדל בין דלתון למעוין עוד רגע, עם שרטוט.'],
    ['NEC_SUF', /(הכרחי|מספיק)/, 'תנאי הכרחי מתקיים בכל מעוין. תנאי מספיק הוא תנאי שאם הוא מתקיים, הצורה בטוח מעוין.', 10, 'נגיע להבדל בין תנאי הכרחי לתנאי מספיק עוד מעט.'],
    ['MEANING_PERP', /מה (זה|פירוש)( בדיוק)?( אומר)? ['"]?מאונכ/, 'מאונכים פירושו שהאלכסונים נחתכים בזווית של 90 מעלות.', 1, null],
    ['EQUAL', /שווים/, 'במעוין האלכסונים לא חייבים להיות שווים. הם שווים רק בריבוע, שהוא מעוין מיוחד.', 1, null],
  ],
  3: [
    ['HOW_CHECK', /(איך|במה).*(בודק|לבדוק|למדוד|לדעת|יודע|בטוח)/, 'בודקים כל פינה במד-זווית או עם פינה של דף: אם כל ארבע הזוויות הן 90 מעלות, זה מלבן, גם כשהוא מסובב.', 9, 'חשבו באיזה כלי אפשר לבדוק שזווית היא ישרה.'],
    ['SQUARE_RECT', /(ריבוע.*מלבן|מלבן.*ריבוע)/, 'לריבוע יש ארבע זוויות ישרות, ולכן הוא מקיים את הגדרת המלבן. ההבדל הוא רק שבריבוע כל הצלעות שוות.', 1, null],
    ['LONG', /(ארוך|צר)/, 'ההגדרה לא אומרת כלום על אורך. רק ארבע זוויות ישרות.', 5, 'נבדוק את זה לפי ההגדרה עוד רגע.'],
  ],
  4: [
    ['WHY', /(למה|מה המיוחד|מה גורם|מה הסיבה)/, 'במעוין כל הצלעות שוות, ולכן האלכסון יוצר שני משולשים חופפים והוא חוצה את הזווית. במלבן ובמקבילית הצלעות הסמוכות לא שוות, אז זה לא קורה.', 10, 'נגיע לזה עוד מעט: חשבו מה מיוחד בצלעות של מעוין.'],
    ['MEANING_EACH_OTHER', /(חוצים זה את זה.*(מה זה|מה פירוש|מה אומר))|((מה זה|מה פירוש).*חוצים זה את זה)/, 'אלכסונים חוצים זה את זה אם נקודת המפגש היא האמצע של כל אחד מהם.', 1, null],
    ['MEANING', /מה (זה|פירוש)( בדיוק)?( אומר)? .{0,12}חוצ/, 'אלכסון חוצה זווית אם הוא מחלק אותה לשתי זוויות שוות.', 1, null],
    ['PARALLELOGRAM', /(מקבילית|מלבן)/, 'במלבן ובמקבילית האלכסונים חוצים זה את זה, אבל לא את הזוויות. בשרטוט האלכסון מחלק את הזווית לשני חלקים לא שווים.', 9, 'נבדוק את זה בשרטוט עוד רגע.'],
  ],
  5: [
    ['WHY', /(למה|מה הסיבה)/, 'כמו בשרטוט: האלכסונים שווים ומאונכים, אבל נקודת המפגש לא באמצע של אף אחד מהם, ולכן זה לא ריבוע.', 8, 'כי יש מרובעים שהאלכסונים שלהם שווים ומאונכים אבל לא נפגשים באמצע של שניהם. נראה אחד כזה על הלוח עוד מעט.'],
    ['MEANING', /(חוצים|לחצות|נחצים|חציה|חציחה|נפגשים באמצע|חצי חצי)/, '"חוצים זה את זה" פירושו שנקודת המפגש היא האמצע של כל אחד מהאלכסונים.', 1, null],
    ['WHAT_ELSE', /(מה עוד|מה כן|מה צריך|מה מספיק|מה התנאי)/, 'צריך שהאלכסונים יהיו שווים, מאונכים, וגם יחצו זה את זה.', 5, 'חשבו איפה האלכסונים נפגשים בריבוע.'],
    ['WHAT_SHAPE', /(מה זה כן|מה זה אז|איזו צורה|מה זה יכול להיות)/, 'זה מרובע כללי: לא ריבוע, לא מלבן ולא מעוין.', 8, 'נראה צורה כזאת על הלוח עוד מעט.'],
  ],
  6: [
    ['DEF', /(מה ההגדרה|מה זה דלתון)/, 'דלתון הוא מרובע עם שני זוגות של צלעות סמוכות שוות.', 1, null],
    ['INCLUSION', /הכלה/, 'יחס הכלה אומר שכל צורה מסוג אחד היא גם מהסוג השני: למשל, כל ריבוע הוא מלבן, אבל לא כל מלבן הוא ריבוע.', 5, 'נגיע לזה עוד רגע.'],
    ['CONVERSE', /(כל דלתון|(דלתון|הוא) יכול להיות מעו?י?ין|דלתון (הוא )?(גם |תמיד )?מעו?י?ין)/, 'לא כל דלתון הוא מעוין: דלתון שהצלעות שלו 3, 3, 5, 5 (שני זוגות סמוכים שווים) הוא דלתון, אבל לא מעוין.', 8, 'נבדוק את הכיוון ההפוך עוד מעט.'],
    ['WHY_INCLUSION', /((למה|איך).*מעו?י?ין (הוא |זה |יכול להיות )?(גם |כן )?דלתון)|(מעו?י?ין (הוא )?(גם )?דלתון.*(איך|למה))|(מספיק כדי להיות דלתון)/, 'כי במעוין כל ארבע הצלעות שוות, אז בפרט יש לו שני זוגות של צלעות סמוכות שוות, וזו בדיוק ההגדרה של דלתון.', 5, 'נבדוק את זה לפי ההגדרה עוד רגע.'],
    ['ADJ_OPP', /((מה (זה|ההבדל בין|הכוונה)|מה זה אומר).*(סמוכות|נגדיות))/, 'צלעות סמוכות נפגשות בקודקוד. צלעות נגדיות לא נוגעות זו בזו.', 1, null],
    ['DIFF', /(מה ההבדל|מה המשותף|מה המיוחד)/, 'במעוין כל ארבע הצלעות שוות. בדלתון מספיק ששני זוגות של צלעות סמוכות שווים.', 5, 'נבדוק את ההגדרות של שתי הצורות עוד רגע.'],
    ['PERP', /מאונכ/, 'גם בדלתון וגם במעוין האלכסונים מאונכים. זו תכונה משותפת, לא ההגדרה.', 1, null],
  ],
};

export const KEY_FACT = {
  1: 'מלבן הוא מרובע שכל זוויותיו ישרות.',
  2: 'אלכסונים מאונכים מתקיימים בכל מעוין, אבל גם בדלתון.',
  3: 'מלבן הוא מרובע שכל זוויותיו ישרות, בלי קשר לאיך שהוא נראה.',
  4: 'רק במעוין ובריבוע האלכסון חוצה את הזווית.',
  5: 'ריבוע הוא מרובע שהאלכסונים שלו שווים, מאונכים וחוצים זה את זה.',
  6: 'דלתון הוא מרובע עם שני זוגות של צלעות סמוכות שוות.',
};
export const GENERIC_HINT = 'שאלה טובה, נבדוק את זה עוד רגע.';
export const genericFull = (scenarioId) => `נחזור להגדרה: ${KEY_FACT[scenarioId]}`;

// Scenario misconception claims: keyword co-occurrence, with negations and correct qualifiers ruled
// out. Conservative by design (they gate validating probes and suggest ledger candidates; labels are
// confirmed manually). `reply` is the whole reply, for claims spread over two sentences.
const NEG2 = /(לא|חוצ|דלתון|אבל|רק אם)/;
export const MISCONCEPTION = {
  1: (s) => /ריבוע (הוא |זה )?(לא|אינו) (סוג של )?מלבן/.test(s) || (/ריבוע/.test(s) && /מלבן/.test(s) && /(שני (סוגים|דברים)|צורות) שונ/.test(s)),
  2: (s) => /(מאונכ|ניצב)/.test(s) && /מעו?י?ין/.test(s) && /(זה|הוא|בטוח|תמיד|כבר|בהכרח|מספיק)/.test(s) && !NEG2.test(s),
  3: (s) => (/(חייב|צריך|תמיד)/.test(s) && /(ארוך|צר|צלע ארוכה)/.test(s) && !/(לא חייב|לא צריך|לא תמיד)/.test(s)) || /אם (זה|הוא) לא (ארוך|ככה).*לא מלבן/.test(s),
  4: (s, reply) => /חוצ(ה|ים|ת)/.test(s) && /זווי/.test(s) && !/(לא|רק|מעו?י?ין|ריבוע)/.test(s) && /(מלבן|מקבילית|כל (ה)?מרובע|בכל (ה)?מרובע|תמיד)/.test(reply),
  5: (s, reply) => !/(לא|חוצ|אבל|רק אם|נפגשים באמצע)/.test(s) && (
    (/שווים/.test(reply) && /מאונכים/.test(reply) && /(ריבוע|מספיק)/.test(s) && /(זה|הוא|בטוח|בוודאות|נשמע|כבר|מספיק)/.test(s))
    || /שווים.*(זה|הוא) (בטוח |כבר |בוודאות )?ריבוע/.test(s)),
  6: (s, reply) => /מעו?י?ין (הוא |זה )?(לא|אינו) (סוג של )?דלתון/.test(s) || (/דלתון/.test(s) && /מעו?י?ין/.test(s) && /(שני (סוגים|דברים)|צורות) שונ/.test(s))
    || (/(נראים|נראה|נראית) (שונה|אחרת|שונים)/.test(s) && /(מעו?י?ין|דלתון|הם)/.test(s) && /(מעו?י?ין|דלתון)/.test(reply) && !/(אבל (זה )?(עדיין )?(כן )?דלתון|ההגדרה)/.test(reply)),
};
export function misconceptionClaims(scenarioId, text) {
  return sentences(text).filter((s) => MISCONCEPTION[scenarioId](s, text));
}

/** Route a question to its answer-bank category (first matching entry), or null. */
export function routeQuestion(scenarioId, question) {
  const entry = ANSWER_BANK[scenarioId].find(([, rx]) => rx.test(question));
  return entry ? { category: entry[0], entry } : null;
}

/** Open questions of a reply with their category; an unmatched question is routed again with the preceding sentence as context. */
export function classifyQuestions(scenarioId, reply) {
  const ss = sentences(reply);
  return ss.flatMap((s, i) => {
    if (!isOpenQuestion(s)) return [];
    const deictic = DEICTIC.test(s);
    const route = routeQuestion(scenarioId, s) || (i > 0 && deictic ? routeQuestion(scenarioId, `${ss[i - 1]} ${s}`) : null);
    return [{ question: s, category: route ? route.category : null }];
  });
}

export const PROBES = new Set([MOVES.PROBE_ACK, MOVES.PROBE_VALIDATE, MOVES.PROBE_QMARK]);
const UNSURE = /(לא (כל כך )?(יודע|בטוח|זוכר|מבין)|אין לי מושג|מבלבל)/;
const ANTECEDENT = /(מה דעתך על מה שנאמר|מה דעתך על התשובה|את או אתה מסכים)/;

/** Mode A: the scripted text, always. */
export function teacherTurnA(plan, turnIndex, cast) {
  const scripted = fillSlots(plan.turns[turnIndex].text, cast);
  return { text: scripted, scriptedText: scripted, decision: { mode: 'A', adaptive: false } };
}

/** Fresh per-conversation Mode B state. */
export function createTeacherState() {
  return { categories: {}, genericUsed: [] };
}

/**
 * Mode B: one teacher turn. `prevReplies` = [{student, message}] of the previous student turn.
 * Mutates `state` (answered categories); returns {text, scriptedText, decision}.
 */
export function teacherTurnB(plan, turnIndex, cast, prevReplies, state) {
  const turnNo = turnIndex + 1;
  const scenarioId = plan.id;
  const step = plan.turns[turnIndex];
  const scripted = fillSlots(step.text, cast);
  const decision = { mode: 'B', turn: turnNo, move: step.move, questions: [], answered: null, probeReplaced: false, neutralized: null, antecedentFallback: false, reason: 'scripted move' };

  // 1. detect and classify pending questions
  const explainTurn = plan.turns.findIndex((t) => t.move === MOVES.EXPLAIN) + 1;
  const prevStep = turnIndex > 0 ? plan.turns[turnIndex - 1] : null;
  if (prevStep && prevStep.answerIfUnsure) {
    // the planned question's addressed student was unsure (or silent): give that answer now
    const slot = (prevStep.text.match(/^\{([ABC])\}/) || [])[1];
    const addressed = slot ? cast['ABC'.indexOf(slot)] : null;
    const theirs = (prevReplies || []).find((r) => r.student === addressed);
    if (addressed && (!theirs || UNSURE.test(theirs.message))) {
      decision.questions.push({ student: addressed, question: theirs ? '(unsure answer to the planned question)' : '(no answer to the planned question)', category: prevStep.answerIfUnsure, action: null, forceFull: true });
    }
  }
  for (const r of prevReplies || []) {
    for (const q of classifyQuestions(scenarioId, r.message)) decision.questions.push({ student: r.student, question: q.question, category: q.category, action: null });
  }
  // 2. choose at most one answer: specific categories first (in order), then one staged generic answer.
  //    Nothing is added to the explanation turn: the explanation is the answer to what was asked before it.
  let answer = null;
  if (step.move === MOVES.EXPLAIN) for (const q of decision.questions) q.action = 'covered_by_explanation';
  for (const q of decision.questions) {
    if (!q.category || q.action) continue;
    const [, , full, earliest, hint] = ANSWER_BANK[scenarioId].find(([c]) => c === q.category);
    const given = state.categories[q.category];
    if (given === 'full') { q.action = 'repeat_after_answered'; continue; }
    const stage = q.forceFull || turnNo >= earliest || !hint ? 'full' : 'hint';
    if (stage === 'hint' && given === 'hint') { q.action = 'hint_already_given'; continue; }
    if (answer) { q.action = 'deferred'; continue; }
    answer = { category: q.category, stage, student: q.student, text: stage === 'full' ? full : hint };
    q.action = q.forceFull ? 'answered_full_after_unsure' : `answered_${stage}`;
  }
  for (const q of decision.questions) {
    if (q.category || q.action) continue;
    if (answer) { q.action = 'deferred'; continue; }
    const stage = turnNo < explainTurn ? 'hint' : 'full';
    if (state.genericUsed.includes(`${q.student}:${stage}`)) { q.action = 'unmatched_generic_already_used'; continue; }
    answer = { category: 'GENERIC', stage, student: q.student, text: stage === 'full' ? genericFull(scenarioId) : GENERIC_HINT };
    q.action = `answered_generic_${stage}`;
  }
  for (const q of decision.questions) delete q.forceFull;
  // 3. compose
  if (answer) {
    if (answer.category === 'GENERIC') state.genericUsed.push(`${answer.student}:${answer.stage}`);
    else state.categories[answer.category] = answer.stage === 'full' ? 'full' : state.categories[answer.category] === 'full' ? 'full' : 'hint';
    decision.answered = { category: answer.category, stage: answer.stage, student: answer.student };
    const answerText = `${answer.student}, ${answer.text}`;
    if (PROBES.has(step.move)) {
      decision.probeReplaced = true;
      decision.reason = `pending question answered (${answer.category}/${answer.stage}); probe "${scripted}" replaced`;
      return { text: answerText, scriptedText: scripted, decision: { ...decision, stateAfter: { ...state.categories } } };
    }
    decision.reason = `pending question answered (${answer.category}/${answer.stage}) before the planned move`;
    return { text: `${answerText} ${scripted}`, scriptedText: scripted, decision: { ...decision, stateAfter: { ...state.categories } } };
  }
  // 4. never confirm a misconception
  if (step.move === MOVES.PROBE_VALIDATE) {
    const claims = (prevReplies || []).flatMap((r) => misconceptionClaims(scenarioId, r.message).map((c) => ({ student: r.student, claim: c })));
    if (claims.length) {
      decision.neutralized = { from: scripted, to: 'אוקיי', claims };
      decision.reason = 'validating probe after a detected misconception claim: neutral acknowledgement';
      return { text: 'אוקיי', scriptedText: scripted, decision: { ...decision, stateAfter: { ...state.categories } } };
    }
  }
  // 5. missing antecedent for "what do you think about what was said?"
  if (step.move === MOVES.PEER_Q && (!prevReplies || prevReplies.length === 0) && ANTECEDENT.test(step.text)) {
    decision.antecedentFallback = true;
    decision.reason = 'no student reply to refer to: peer question re-anchored on the T2 question';
    return { text: `${cast[1]}, מה דעתך על השאלה ששאלתי את ${cast[0]}?`, scriptedText: scripted, decision: { ...decision, stateAfter: { ...state.categories } } };
  }
  if (decision.questions.length) decision.reason = 'pending question(s) not answered: ' + [...new Set(decision.questions.map((q) => q.action))].join(', ');
  return { text: scripted, scriptedText: scripted, decision: { ...decision, stateAfter: { ...state.categories } } };
}
