// X3 candidate: a deterministic consistency layer over an already-validated PCK analysis (research only, offline).
// See research/simulator_audit/pck_consistency_layer_experiment.md.
//
// It only re-reads what the model already stated per skill in `skills_assessment` (is_relevant, score). It never
// decides whether a student erred, never sets relevance, never changes a score, never reads feedback text to infer a
// skill, never matches text, and keeps the 1.4.1 bare-acknowledgement guard (production module, unmodified) as the
// final display policy. The input analysis is never mutated.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applyBareAcknowledgementGuard } from '../../../../server/pck_bare_ack_guard.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
// The committed display view-model (B28), loaded unmodified from src/ (CRA source, not a Node package).
const VIEW = await import('data:text/javascript,' + encodeURIComponent(readFileSync(path.join(ROOT, 'src/services/pckDisplayRows.js'), 'utf8')));
export const { buildPckDisplayRows, matchDemonstratedEvidence } = VIEW;

export const CHAIN = ['error-identification', 'error-characterization', 'diagnostic-interpretation', 'adapted-pedagogical-response', 'error-leveraging'];
const nonEmpty = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const relevantOf = (a) => (Array.isArray(a.skills_assessment) ? a.skills_assessment : []).filter((s) => s && s.is_relevant === true);
const idsOf = (list) => (Array.isArray(list) ? list : []).filter((x) => x && typeof x === 'object').map((x) => x.skill_id);

/** Structural contradictions between fields of one analysis (content-free codes). */
export function contradictions(a, { shown = !!a.should_provide_feedback } = {}) {
  const rel = relevantOf(a);
  const pos = new Set(rel.filter((s) => s.score === 1 || s.score === 2).map((s) => s.skill_id));
  const zero = new Set(rel.filter((s) => s.score === 0).map((s) => s.skill_id));
  const dem = idsOf(a.demonstrated_skills);
  const mis = idsOf(a.missed_opportunities);
  const out = [];
  if (dem.some((id) => !pos.has(id))) out.push('demonstrated_not_relevant_positive');
  if ([...pos].some((id) => !dem.includes(id))) out.push('relevant_positive_not_in_demonstrated');
  if (mis.some((id) => !zero.has(id))) out.push('missed_not_relevant_zero');
  if ([...zero].some((id) => !mis.includes(id))) out.push('relevant_zero_not_in_missed');
  if (new Set(dem).size !== dem.length || new Set(mis).size !== mis.length) out.push('duplicate_list_skill');
  const ids = rel.map((s) => s.skill_id);
  if (new Set(ids).size !== ids.length) out.push('duplicate_relevant_skill');
  if (shown && rel.length === 0) out.push('shown_without_relevant_skill');
  if (rel.length > 2) out.push('more_than_2_relevant');
  if (shown && a.pedagogical_quality === 'neutral') out.push('shown_with_neutral_quality');
  if (shown && a.feedback_trigger == null) out.push('shown_without_trigger');
  if (!shown && a.feedback_trigger != null) out.push('hidden_with_trigger');
  const shownScores = shown ? rel.map((s) => s.score) : [];
  if (a.pedagogical_quality === 'positive' && shownScores.includes(0)) out.push('positive_quality_with_score_0_row');
  if (a.pedagogical_quality === 'problematic' && shownScores.length && shownScores.every((x) => x === 2)) out.push('problematic_quality_all_rows_2');
  return out;
}

/** R1/R2: demonstrated / missed lists derived from skills_assessment by the prompt's own derivation rule. */
export function deriveLists(a) {
  const rel = relevantOf(a);
  const textFrom = (list, id, field) => {
    const m = (Array.isArray(list) ? list : []).filter((x) => x && typeof x === 'object' && x.skill_id === id);
    return m.length === 1 ? nonEmpty(m[0][field]) : null;
  };
  return {
    demonstrated_skills: rel.filter((s) => s.score === 1 || s.score === 2)
      .map((s) => ({ skill_id: s.skill_id, evidence: nonEmpty(s.evidence) || textFrom(a.demonstrated_skills, s.skill_id, 'evidence') || '' })),
    missed_opportunities: rel.filter((s) => s.score === 0)
      .map((s) => ({ skill_id: s.skill_id, what_could_have_been_done: nonEmpty(s.what_could_be_better) || textFrom(a.missed_opportunities, s.skill_id, 'what_could_have_been_done') || '' })),
  };
}

/**
 * Candidate normalisation. Options:
 *   decision: 'model' (unchanged) | 'and' (model decision AND any relevant skill) | 'derived' (any relevant skill)
 *   lists:    false | true (replace demonstrated / missed by deriveLists)
 *   cap:      null | 2  (display at most N rows, keeping the earliest in the skill chain)
 *   continuity: false | true (hide a positive row whose skill scored >= 1 in the most recent feedback-history entry)
 * The bare-acknowledgement guard is applied last, to the normalised decision.
 * Returns { analysis, display: { shown, rows }, changed: {...} }; skills_assessment is passed through untouched.
 */
export function normalize(a, teacherMessage, { decision = 'and', lists = false, cap = null, continuity = false, feedbackHistory = [] } = {}) {
  const rel = relevantOf(a);
  let shown = !!a.should_provide_feedback;
  if (decision === 'and') shown = shown && rel.length > 0;
  if (decision === 'derived') shown = rel.length > 0;
  const out = { ...a, should_provide_feedback: shown };
  if (lists) Object.assign(out, deriveLists(a));
  const guarded = applyBareAcknowledgementGuard(teacherMessage, out).analysis;
  shown = !!guarded.should_provide_feedback;
  const formatted = { detected_skills: guarded.demonstrated_skills || [], missed_opportunities: guarded.missed_opportunities || [], skills_assessment: guarded.skills_assessment || [] };
  let rows = shown ? buildPckDisplayRows(formatted) : [];
  if (continuity && shown) {
    const last = feedbackHistory.length ? feedbackHistory[feedbackHistory.length - 1] : null;
    const praised = new Set(relevantOf(last || {}).filter((s) => s.score >= 1).map((s) => s.skill_id));
    rows = rows.filter((r) => !(r.score >= 1 && praised.has(r.skillId)));
    if (rows.length === 0) shown = false;
  }
  if (cap && rows.length > cap) rows = [...rows].sort((x, y) => CHAIN.indexOf(x.skillId) - CHAIN.indexOf(y.skillId)).slice(0, cap);
  const final = { ...guarded, should_provide_feedback: shown };
  if (!shown) final.feedback_message_hebrew = '';
  return {
    analysis: final,
    display: { shown, rows },
    changed: {
      decision: shown !== !!a.should_provide_feedback,
      demonstrated: JSON.stringify(idsOf(final.demonstrated_skills)) !== JSON.stringify(idsOf(a.demonstrated_skills)),
      demonstratedText: JSON.stringify(final.demonstrated_skills || []) !== JSON.stringify(a.demonstrated_skills || []),
      missed: JSON.stringify(idsOf(final.missed_opportunities)) !== JSON.stringify(idsOf(a.missed_opportunities)),
    },
  };
}
