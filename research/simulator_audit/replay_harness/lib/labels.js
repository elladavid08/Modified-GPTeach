// Behavioural labels (harness review §4). Automatic where the definition is mechanical; everything
// semantic is emitted as a MANUAL-REVIEW candidate with its evidence (never auto-scored).
//
//   exact_self_duplicate      automatic: equal (after whitespace/trailing-punctuation normalization) to an
//                             earlier reply of the same student
//   guard_match               automatic: production duplicate criterion (B26) against the same student's
//                             earlier replies, as the server applies it
//   semantic_repetition       MANUAL candidate: not a guard match, but edit similarity >= 0.5 or token
//                             Jaccard >= 0.5 to an earlier reply of the same student
//   repeated question         automatic status of a question category asked again by the same student:
//                               repeat_unanswered      the teacher never gave the full answer -> justified
//                               repeat_after_answered  the full answer was given before -> loop candidate
//   requested restatement     automatic context flag: the teacher turn re-asked / asked for a summary or was
//                             the ambiguous "?" probe -> restating is not loop evidence
//   misconception / target    automatic regex candidates (scenario claim / target idea); the resolution,
//                             persistence, regression and premature-correctness judgements are MANUAL, with
//                             auto-suggested candidate turns (see studentLedger)
//   contamination             MANUAL candidate: shares a 6-word sequence with another student's earlier reply
//                             that does not come from the teacher's messages, without naming that student
//   attribution               MANUAL candidate: "אמרת / הסברת / ציירת / המורה …"
//   prompt_example_copy       automatic: edit >= 0.6 (verbatim >= 0.9) or a shared 6-word sequence with a
//                             student-prompt example message of the run's SYSTEM_VERSION (promptExamplesFor);
//                             never counted as regression/contamination
//   placeholder_leak          automatic: the reply or speaker contains example scaffolding ("[", "]", "<", ">",
//                             the placeholder name)
//   invalid_student           automatic: the speaker is not in the cast
import { MOVES, SCENARIOS } from '../config/scenarios.js';
import { normalizeReplyForEquality, editSimilarity, isSelfDuplicate, jaccard, sharedNgram, ngrams, spellingInsensitiveSimilarity } from './text.js';
import { classifyQuestions, misconceptionClaims, ANSWER_BANK, KEY_FACT } from './teacher.js';

// Example messages of the student prompt (src/utils/ai.js makeProsePrompt). `slot` is the cast position
// the example names (null: a generic name placeholder). test/isolation.test.js fails if the current set
// drifts from production or from SYSTEM_VERSION.
const WRONG_EXAMPLE = { id: 'WRONG', slot: 0, text: 'אבל ריבוע זה מלבן?' };
// Up to 1.3.11 (and the pilot): bound to students[0], students[1], students[2].
export const PROMPT_EXAMPLES_1_3_11 = [
  { id: 'EX1', slot: 0, text: 'אה עכשיו הבנתי! אז כל ריבוע הוא גם מלבן כי יש לו 4 זוויות ישרות?' },
  { id: 'EX2', slot: 1, text: 'רגע, אני עדיין לא מבין למה דווקא במעויין האלכסונים מאונכים. מה המיוחד במעויין?' },
  { id: 'EX3', slot: 2, text: 'אוקיי, אז אם אני רואה מרובע שהאלכסונים שלו מאונכים, אני יודע שזה מעויין, נכון?' },
  WRONG_EXAMPLE,
];
// Since 1.3.12: content-neutral, no cast name (student_prompt_examples_experiment.md).
export const PROMPT_EXAMPLES = [
  { id: 'N-EX1', slot: null, text: 'אה, עכשיו הבנתי! אז [המסקנה מההסבר] כי [הסיבה שהמורה נתן/ה]?' },
  { id: 'N-EX2', slot: null, text: 'רגע, עדיין לא ברור לי למה דווקא [החלק המסוים שלא הובן]. מה מיוחד ב[מה שהמורה הזכיר]?' },
  { id: 'N-EX3', slot: null, text: 'אוקיי, אז בכל פעם ש[תכונה אחת מתקיימת], זה בטוח [מסקנה רחבה מדי], נכון?' },
  WRONG_EXAMPLE,
];
const versionKey = (v) => String(v).split('.').map(Number).reduce((k, n) => k * 1000 + n, 0);
/** The example set the student prompt of a run's SYSTEM_VERSION contained; both sets if unknown. */
export function promptExamplesFor(systemVersion) {
  if (!/^\d+\.\d+\.\d+$/.test(String(systemVersion))) return [...PROMPT_EXAMPLES_1_3_11, ...PROMPT_EXAMPLES.filter((e) => e !== WRONG_EXAMPLE)];
  return versionKey(systemVersion) >= versionKey('1.3.12') ? PROMPT_EXAMPLES : PROMPT_EXAMPLES_1_3_11;
}
// Example scaffolding copied into a reply (placeholder name or bracketed slot).
const PLACEHOLDER = /[[\]<>]|שם של אחד מהתלמידים/;

// Target idea of each lesson (regex candidates; confirmation is manual).
export const TARGET_IDEA = {
  1: /(כל )?ריבוע (הוא|זה) (גם |כן |באמת |סוג של |מקרה פרטי של )*מלבן/,
  2: /(מאונכים.*(לא מספיק|לא בהכרח|לא תמיד))|(מאונכים וגם חוצים)/,
  3: /(לא חייב|לא משנה|בלי קשר).*(ארוך|נראה|מסובב|צורה)|כל (ה)?זוויות (שלו |שלה )?ישרות/,
  4: /(רק במעוין|רק במעויין|רק בריבוע ובמעוין)|לא (בכל|כל) (ה)?מרובע/,
  5: /(שווים, מאונכים|שווים ומאונכים וגם חוצים|גם (יחצו|חוצים) זה את זה)/,
  6: /(כל )?מעו?י?ין (הוא|זה) (גם |כן |באמת |סוג של |מקרה פרטי של )*דלתון/,
};
// Canonical statements of each lesson: shared vocabulary, never contamination evidence.
export const CANONICAL = {
  1: ['כל ריבוע הוא מלבן אבל לא כל מלבן הוא ריבוע', 'לריבוע יש ארבע זוויות ישרות ולכן הוא מלבן'],
  2: ['אלכסונים מאונכים הם תנאי הכרחי אבל לא מספיק', 'אם האלכסונים מאונכים וגם חוצים זה את זה זה מעוין'],
  3: ['מלבן הוא מרובע שכל זוויותיו ישרות', 'מלבן לא חייב להיות ארוך וצר'],
  4: ['רק במעוין ובריבוע האלכסונים חוצים את הזוויות', 'במלבן ובמקבילית האלכסונים לא חוצים את הזוויות'],
  5: ['האלכסונים שווים מאונכים וחוצים זה את זה', 'אלכסונים שווים ומאונכים זה לא מספיק'],
  6: ['כל מעוין הוא דלתון אבל לא כל דלתון הוא מעוין', 'שני זוגות של צלעות סמוכות שוות'],
};
/** 6-grams of the lesson's own wording: the whole teacher plan, answer bank, key fact and canonical statements. */
export function lessonVocabulary(scenarioId) {
  const plan = SCENARIOS.find((s) => s.id === scenarioId);
  const texts = [...plan.turns.map((t) => t.text), ...ANSWER_BANK[scenarioId].flatMap(([, , full, , hint]) => [full, hint || '']), KEY_FACT[scenarioId], ...CANONICAL[scenarioId]];
  const vocab = new Set();
  for (const t of texts) for (const g of ngrams(t, 6)) vocab.add(g);
  return vocab;
}
const HEDGE = /(לא בטוח|עדיין|מבולבל|מתבלבל|לא מבין|לא הבנתי)/;
const ATTRIBUTION = /(אמרת|הסברת|ציירת|שאלת|לימדת|אמרתם|המורה)/;
const RESTATEMENT_MOVES = new Set([MOVES.CHECK, MOVES.SUMMARY, MOVES.PROBE_QMARK]);

/**
 * @param {object} conv  one conversation result: {scenarioId, cast, turns: [{turn, teacher, move, decision, replies:[{student,message}]}]}
 */
export function labelConversation(conv, { systemVersion } = {}) {
  const examples = promptExamplesFor(systemVersion);
  const { scenarioId, cast } = conv;
  const own = {};
  const all = []; // {turn, student, message}
  const asked = {}; // student -> Set(category)
  const replies = [];
  const teacherGrams = lessonVocabulary(scenarioId); // lesson wording (plan, bank, canonical) + actual teacher turns
  for (const t of conv.turns) {
    for (const g of ngrams(t.teacher || '', 6)) teacherGrams.add(g);
    const answeredState = (t.decision && t.decision.stateAfter) || {};
    const restatementRequested = RESTATEMENT_MOVES.has(t.move) && !(t.decision && t.decision.answered);
    for (const r of t.replies) {
      const s = r.student;
      const m = r.message;
      const earlier = own[s] || [];
      const lab = { turn: t.turn, student: s, message: m, teacherMove: t.move, restatementRequested };
      lab.exact_self_duplicate = earlier.some((e) => normalizeReplyForEquality(e) === normalizeReplyForEquality(m));
      lab.guard_match = earlier.some((e) => isSelfDuplicate(m, e));
      let best = { sim: 0, jac: 0, turn: null };
      for (const e of conv.turns.flatMap((tt) => tt.turn < t.turn ? tt.replies.filter((x) => x.student === s).map((x) => ({ turn: tt.turn, message: x.message })) : [])) {
        const sim = editSimilarity(m, e.message);
        const jac = jaccard(m, e.message);
        if (Math.max(sim, jac) > Math.max(best.sim, best.jac)) best = { sim, jac, turn: e.turn };
      }
      lab.semantic_repetition_candidate = !lab.guard_match && (best.sim >= 0.5 || best.jac >= 0.5) ? { ofTurn: best.turn, edit: +best.sim.toFixed(2), jaccard: +best.jac.toFixed(2), manual_review_required: true } : null;
      lab.questions = classifyQuestions(scenarioId, m).map(({ question: q, category }) => {
        let status = 'first';
        if (category && asked[s] && asked[s].has(category)) status = answeredState[category] === 'full' ? 'repeat_after_answered' : 'repeat_unanswered';
        return { question: q, category, status };
      });
      for (const q of lab.questions) if (q.category) (asked[s] = asked[s] || new Set()).add(q.category);
      lab.misconception_claims = misconceptionClaims(scenarioId, m);
      lab.target_idea = TARGET_IDEA[scenarioId].test(m) && !lab.misconception_claims.length;
      lab.hedged = HEDGE.test(m);
      lab.attribution_candidate = ATTRIBUTION.test(m) ? { manual_review_required: true } : null;
      const mine6 = ngrams(m, 6);
      const contamination = all
        .filter((x) => x.student !== s && x.turn < t.turn && !m.includes(x.student))
        .map((x) => ({ from: x.student, turn: x.turn, ngram: [...ngrams(x.message, 6)].find((g) => mine6.has(g) && !teacherGrams.has(g)) || null }))
        .find((x) => x.ngram);
      lab.contamination_candidate = contamination ? { ...contamination, manual_review_required: true } : null;
      const ex = examples.map((e) => ({ id: e.id, sim: spellingInsensitiveSimilarity(m, e.text), ngram: sharedNgram(m, e.text, 6), slotMatch: cast[e.slot] === s }))
        .filter((e) => e.sim >= 0.6 || e.ngram)
        .sort((a, b) => b.sim - a.sim)[0];
      lab.prompt_example_copy = ex ? { example: ex.id, edit: +ex.sim.toFixed(2), verbatim: ex.sim >= 0.9, slotMatch: ex.slotMatch } : null;
      lab.placeholder_leak = PLACEHOLDER.test(m) || PLACEHOLDER.test(s);
      lab.invalid_student = !cast.includes(s);
      replies.push(lab);
    }
    for (const r of t.replies) {
      (own[r.student] = own[r.student] || []).push(r.message);
      all.push({ turn: t.turn, student: r.student, message: r.message });
    }
  }
  return { conversationId: conv.conversationId, scenarioId, cast, replies, students: studentLedger(conv, replies), manualReview: manualQueue(conv, replies) };
}

/** Auto-suggested resolution / regression / premature-correctness candidates per student (manual confirmation). */
export function studentLedger(conv, replies) {
  const explain = conv.turns.find((t) => t.move === MOVES.EXPLAIN);
  const explainTurn = explain ? explain.turn : 5; // every plan explains at T5
  const moveAt = Object.fromEntries(conv.turns.map((t) => [t.turn, t.move]));
  const classMisconceptionBeforeExplain = replies.some((r) => r.turn < explainTurn && r.misconception_claims.length);
  const ledger = {};
  for (const s of conv.cast) {
    const mine = replies.filter((r) => r.student === s);
    const misconceptionTurns = mine.filter((r) => r.misconception_claims.length).map((r) => r.turn);
    const targetTurns = mine.filter((r) => r.target_idea).map((r) => r.turn);
    // resolution candidate: after the teacher addressed the misconception, a non-hedged target-idea reply to a content move
    const resolution = mine.find((r) => r.turn > explainTurn && r.target_idea && !r.hedged && ![MOVES.PROBE_ACK, MOVES.PROBE_VALIDATE, MOVES.CLOSING].includes(moveAt[r.turn]));
    const regression = resolution ? mine.find((r) => r.turn > resolution.turn && r.misconception_claims.length) : null;
    const isCarrier = s === conv.cast[0];
    const premature = isCarrier && !mine.some((r) => r.turn < explainTurn && r.misconception_claims.length) ? mine.find((r) => r.turn < explainTurn && r.target_idea) : null;
    ledger[s] = {
      slot: ['A', 'B', 'C'][conv.cast.indexOf(s)],
      misconceptionTurns,
      targetIdeaTurns: targetTurns,
      resolutionCandidateTurn: resolution ? resolution.turn : null,
      regressionCandidateTurn: regression ? regression.turn : null,
      persistentCandidate: misconceptionTurns.length > 0 && !resolution && misconceptionTurns.some((t) => t > explainTurn),
      prematureCorrectnessCandidateTurn: premature ? premature.turn : null,
      manual_review_required: true,
    };
  }
  return { explainTurn, classMisconceptionVoicedBeforeExplain: classMisconceptionBeforeExplain, perStudent: ledger };
}

function manualQueue(conv, replies) {
  const items = [];
  const push = (type, r, evidence) => items.push({ type, conversationId: conv.conversationId, turn: r.turn, student: r.student, evidence, verdict: null });
  for (const r of replies) {
    if (r.semantic_repetition_candidate && !r.restatementRequested) push('semantic_repetition', r, r.semantic_repetition_candidate);
    for (const q of r.questions) if (q.status !== 'first') push(q.status === 'repeat_after_answered' ? 'loop_candidate_repeat_after_answered' : 'justified_repeat_unanswered', r, q);
    if (r.contamination_candidate) push('contamination', r, r.contamination_candidate);
    if (r.attribution_candidate) push('teacher_attribution', r, null);
    if (r.prompt_example_copy) push('prompt_example_copy', r, r.prompt_example_copy);
  }
  return items;
}
