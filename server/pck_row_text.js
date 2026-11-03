/**
 * PCK row text on the server (1.5.1 feedback fix). The SAME rule as the client view-model
 * src/services/pckDisplayRows.js (buildAssessedPckRow); a parity test (src/__tests__/pckRowTextParity.test.js)
 * keeps the two identical. The server needs it for:
 *   - the completeness check of /api/pck-feedback: shown feedback must not contain a row with no text at all
 *     (one identical re-ask inside the existing 2-attempt policy, B24);
 *   - the summary input of /api/pck-summary: the summary model sees the text the teacher saw.
 *
 * Per relevant skills_assessment entry:
 *   score 2   positive    = own `evidence`, else the single matching `demonstrated_skills` evidence
 *   score 1   positive    = as score 2;  improvement = own `what_could_be_better`
 *   score 0   improvement = own `what_could_be_better`, else the single matching `missed_opportunities` text
 *   (other / missing score: as score 0)
 * Only text the PCK model returned is used; nothing is invented, and no score, relevance or decision changes.
 */

const nonEmpty = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

function singleMatch(items, skillId, field) {
  if (!Array.isArray(items)) return null;
  const matches = items.filter((item) => item && typeof item === 'object' && item.skill_id === skillId);
  return matches.length === 1 ? nonEmpty(matches[0][field]) : null;
}

/** The row of one relevant skills_assessment entry: { skillId, score, positive, improvement }. */
export function buildPckRow(s, demonstrated, missed) {
  if (s.score === 1 || s.score === 2) {
    const positive = nonEmpty(s.evidence) || singleMatch(demonstrated, s.skill_id, 'evidence');
    return { skillId: s.skill_id, score: s.score, positive, improvement: s.score === 1 ? nonEmpty(s.what_could_be_better) : null };
  }
  const improvement = nonEmpty(s.what_could_be_better) || singleMatch(missed, s.skill_id, 'what_could_have_been_done');
  return { skillId: s.skill_id, score: s.score, positive: null, improvement };
}

/**
 * Rows of every relevant skill. `demonstrated` is `demonstrated_skills` (model output) or the stored
 * `detected_skills`; `missed` is `missed_opportunities`.
 */
export function buildPckRows(skillsAssessment, demonstrated, missed) {
  return (Array.isArray(skillsAssessment) ? skillsAssessment : [])
    .filter((s) => s && s.is_relevant === true)
    .map((s) => buildPckRow(s, demonstrated, missed));
}

/** A row with no text at all (never shown to the teacher). */
export const isEmptyPckRow = (row) => !row || (!row.positive && !row.improvement);

/** Number of rows with no text at all in an analysis that will be SHOWN (0 when feedback is not shown). */
export function countEmptyShownRows(analysis) {
  if (!analysis || analysis.should_provide_feedback !== true) return 0;
  return buildPckRows(analysis.skills_assessment, analysis.demonstrated_skills, analysis.missed_opportunities).filter(isEmptyPckRow).length;
}
