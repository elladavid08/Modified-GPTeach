// A1i student data contract (research only; pck_a1i_implementation_plan.md §1a). On a turn whose teacher feedback comes
// from Stage 2, every current-turn PCK-quality statement the student prompt prints (src/utils/ai.js) is derived from the
// shown Stage-2 rows and their signal; Stage-1 fields that Stage 2 does not produce stay only as context and may never
// imply more progress than the signal allows; no Stage-1 assessment text reaches the students.
//   studentPckView(stage1, rows, signal) -> the analysis object for the student call
//   auditStudentInput(view, rows, signal) -> content-free consistency flags of an analysis object the students receive
// Not used on turns without Stage-2 rows (hidden, suppressed, fallback): those keep the 1.5.1 Stage-1 analysis.
'use strict';

const LEVEL = { understanding_progress: 3, partial_understanding: 2, cautious_clarification: 2,
  persistent_confusion: 1, reinforced_acceptance: 1, misapplied_new_rule: 1 };
const CEILING = { strong: 3, partial: 2, none: 1 };
const CEILING_TYPE = { 2: 'partial_understanding', 1: 'persistent_confusion' };
const NEGATIVE_UNDERSTANDING = ['confused', 'more_confused', 'misconception_reinforced'];
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

/** A reaction type never above the signal's ceiling; types at or below it are kept (carrier and Mode B behaviours). */
function capReaction(type, signal) {
  const level = LEVEL[type] || 3; // an unknown type is treated as progress, so it is capped
  return level > CEILING[signal] ? CEILING_TYPE[CEILING[signal]] : type;
}

function studentPckView(stage1, rows, signal) {
  if (!stage1 || !rows || !rows.length || !CEILING[signal]) throw new Error('studentPckView needs Stage-1 context, Stage-2 rows and a signal');
  const ps = stage1.predicted_student_state || {};
  const addressed = signal === 'strong' ? stage1.addressed_misconception === true : false;
  return {
    ...stage1,
    // level: from the Stage-2 signal; under "none" Stage 1 may only make it more negative
    pedagogical_quality: signal === 'strong' ? 'positive' : signal === 'partial' ? 'neutral' : stage1.pedagogical_quality === 'problematic' ? 'problematic' : 'neutral',
    addressed_misconception: addressed,
    how_addressed: addressed && nonEmpty(stage1.how_addressed) ? stage1.how_addressed : '',
    // skill lists: projected from the shown rows with Stage 1's own derivation rule (score >= 1 demonstrated, 0 missed)
    demonstrated_skills: rows.filter((r) => r.score >= 1).map((r) => ({ skill_id: r.skillId, evidence: r.positive })),
    missed_opportunities: rows.filter((r) => r.score === 0).map((r) => ({ skill_id: r.skillId, what_could_have_been_done: r.improvement })),
    predicted_student_state: {
      ...ps,
      understanding_level: signal === 'strong' ? 'improved' : signal === 'partial' ? 'same'
        : NEGATIVE_UNDERSTANDING.includes(ps.understanding_level) ? ps.understanding_level : 'same',
      // context kept: who is likely to speak and how likely; the type capped; the Stage-1 reason text dropped
      student_reaction_hints: (ps.student_reaction_hints || []).map((h) => ({ student: h.student, reaction_type: capReaction(h.reaction_type, signal), ...(h.likelihood ? { likelihood: h.likelihood } : {}) })),
      likely_reactions: [], // Stage-1 free text (printed only without hints)
      // response_tone and who_should_respond: Stage-1 context, unchanged
    },
    // misconception_risk: Stage-1 context (the mathematical risk of the move), unchanged
  };
}

/** Content-free flags for one analysis object the students receive on a Stage-2 turn (used for both A1i arms). */
function auditStudentInput(view, rows, signal) {
  const score = new Map(rows.map((r) => [r.skillId, r]));
  const dem = view.demonstrated_skills || []; const mis = view.missed_opportunities || [];
  const ps = view.predicted_student_state || {}; const hints = ps.student_reaction_hints || [];
  return {
    demonstratedButScore0: dem.some((d) => !score.has(d.skill_id) || score.get(d.skill_id).score === 0),
    demonstratedNotShown: dem.some((d) => !score.has(d.skill_id)),
    missedButCredited: mis.some((m) => !score.has(m.skill_id) || score.get(m.skill_id).score >= 1),
    listTextNotFromRows: dem.some((d) => !score.has(d.skill_id) || d.evidence !== score.get(d.skill_id).positive)
      || mis.some((m) => !score.has(m.skill_id) || m.what_could_have_been_done !== score.get(m.skill_id).improvement),
    notAddressedWithDescription: view.addressed_misconception !== true && nonEmpty(view.how_addressed),
    qualityAboveSignal: view.pedagogical_quality === 'positive' && signal !== 'strong',
    understandingAboveSignal: ps.understanding_level === 'improved' && signal !== 'strong',
    hintAboveSignal: hints.some((h) => (LEVEL[h.reaction_type] || 3) > CEILING[signal]),
    stage1HintReason: hints.some((h) => nonEmpty(h.reason)),
    stage1LikelyReactions: (ps.likely_reactions || []).some(nonEmpty),
  };
}

module.exports = { studentPckView, auditStudentInput, capReaction };
