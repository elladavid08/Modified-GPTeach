/**
 * PCK Stage 2 policy (A1i, behind PCK_STAGE2): what the server returns for a turn Stage 1 shows, after the Stage-2 call.
 * Port of the frozen research files research/simulator_audit/pck_eval/x12/final_pipeline.cjs (finalizeTurn),
 * stage2_dep.cjs (signalFromRows), student_view.cjs (studentPckView, the student data contract tested in X12E) and
 * to_stage1_shape.mjs (the display shape). Parity: server/test/pck_stage2_parity.test.mjs.
 *
 *   Stage 2 failed (after its allowed attempts) -> the Stage-1 analysis, unchanged (exactly 1.5.1).
 *   Stage-2 rows, after the leveraging guard, with no displayable row -> no feedback this turn: the Stage-1 analysis
 *     with should_provide_feedback false and no message (the students read none of those two fields, so they are
 *     steered exactly as on a 1.5.1 turn without feedback).
 *   Otherwise -> one analysis object for display AND students:
 *     skills_assessment = the Stage-2 rows (relevance, 0/1/2 scores, teacher-facing text);
 *     every current-turn quality statement the student prompt prints (src/utils/ai.js) = studentPckView of the same
 *     rows and their signal; no Stage-1 assessment text; feedback_message_hebrew emptied (it would contradict the rows).
 */
import { STAGE2_SKILL_IDS } from './pck_stage2.js';
import { applyLeveragingGuard } from './pck_leveraging_guard.js';

/** none: the error went unnoticed (identification 0) or every row is 0; strong: at least one skill fully done (2); else partial. */
export function signalFromRows(rows) {
  if (!rows || !rows.length) return null;
  const by = Object.fromEntries(rows.map((r) => [r.skillId, r.score]));
  if (by['error-identification'] === 0 || rows.every((r) => r.score === 0)) return 'none';
  return rows.some((r) => r.score === 2) ? 'strong' : 'partial';
}

const LEVEL = { understanding_progress: 3, partial_understanding: 2, cautious_clarification: 2,
  persistent_confusion: 1, reinforced_acceptance: 1, misapplied_new_rule: 1 };
const CEILING = { strong: 3, partial: 2, none: 1 };
const CEILING_TYPE = { 2: 'partial_understanding', 1: 'persistent_confusion' };
const NEGATIVE_UNDERSTANDING = ['confused', 'more_confused', 'misconception_reinforced'];
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

/** A reaction type never above the signal's ceiling; types at or below it are kept (carrier and Mode B behaviours). */
export function capReaction(type, signal) {
  const level = LEVEL[type] || 3; // an unknown type is treated as progress, so it is capped
  return level > CEILING[signal] ? CEILING_TYPE[CEILING[signal]] : type;
}

/**
 * The student data contract (pck_a1i_implementation_plan.md §1a): the level comes from the Stage-2 signal; Stage-1
 * fields Stage 2 does not produce stay only as context and never imply more progress; no Stage-1 assessment text.
 */
export function studentPckView(stage1, rows, signal) {
  if (!stage1 || !rows || !rows.length || !CEILING[signal]) throw new Error('studentPckView needs Stage-1 context, Stage-2 rows and a signal');
  const ps = stage1.predicted_student_state || {};
  const addressed = signal === 'strong' ? stage1.addressed_misconception === true : false;
  return {
    ...stage1,
    pedagogical_quality: signal === 'strong' ? 'positive' : signal === 'partial' ? 'neutral' : stage1.pedagogical_quality === 'problematic' ? 'problematic' : 'neutral',
    addressed_misconception: addressed,
    how_addressed: addressed && nonEmpty(stage1.how_addressed) ? stage1.how_addressed : '',
    demonstrated_skills: rows.filter((r) => r.score >= 1).map((r) => ({ skill_id: r.skillId, evidence: r.positive })),
    missed_opportunities: rows.filter((r) => r.score === 0).map((r) => ({ skill_id: r.skillId, what_could_have_been_done: r.improvement })),
    predicted_student_state: {
      ...ps,
      understanding_level: signal === 'strong' ? 'improved' : signal === 'partial' ? 'same'
        : NEGATIVE_UNDERSTANDING.includes(ps.understanding_level) ? ps.understanding_level : 'same',
      student_reaction_hints: (ps.student_reaction_hints || []).map((h) => ({ student: h.student, reaction_type: capReaction(h.reaction_type, signal), ...(h.likelihood ? { likelihood: h.likelihood } : {}) })),
      likely_reactions: [],
    },
  };
}

/** The Stage-2 rows in the 1.5.1 skills_assessment shape (every view of feedback reads this field). */
export function toSkillsAssessment(rows) {
  const byId = Object.fromEntries(rows.map((r) => [r.skillId, r]));
  return STAGE2_SKILL_IDS.map((id) => (byId[id]
    ? { skill_id: id, is_relevant: true, score: byId[id].score, evidence: byId[id].positive || '', what_could_be_better: byId[id].improvement || '' }
    : { skill_id: id, is_relevant: false }));
}

const hasText = (r) => nonEmpty(r.positive) || nonEmpty(r.improvement);

/**
 * @param {{teacherMessage: string, stage1Analysis: object, stage2: {ok: boolean, rows?: object[]}}} args
 *   stage1Analysis: the 1.5.1 analysis after the bare-acknowledgement guard, on a turn it shows.
 * @returns {{analysis, source: 'stage2'|'fallback_stage1', suppressed, guardDropped, signal}}
 */
export function finalizeStage2Turn({ teacherMessage, stage1Analysis, stage2 }) {
  if (!stage2 || !stage2.ok) return { analysis: stage1Analysis, source: 'fallback_stage1', suppressed: false, guardDropped: false, signal: null };
  const g = applyLeveragingGuard(teacherMessage, stage2.rows);
  const rows = g.rows.filter(hasText);
  if (rows.length === 0) {
    return { analysis: { ...stage1Analysis, should_provide_feedback: false, feedback_message_hebrew: '' }, source: 'stage2', suppressed: true, guardDropped: g.dropped, signal: null };
  }
  const signal = signalFromRows(rows);
  const analysis = { ...studentPckView(stage1Analysis, rows, signal), should_provide_feedback: true, skills_assessment: toSkillsAssessment(rows), feedback_message_hebrew: '' };
  return { analysis, source: 'stage2', suppressed: false, guardDropped: g.dropped, signal };
}
