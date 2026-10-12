/**
 * Bare-acknowledgement guard for real-time PCK feedback (1.4.1). See
 * research/simulator_audit/pck_missed_misconception_experiment.md.
 *
 * A bare acknowledgement ("אוקיי", "יפה", "נכון") cannot demonstrate a PCK skill, so the only valid
 * feedback on it is a missed error-identification: the student made an incorrect claim and the teacher
 * only acknowledged it. The PCK prompt decides whether that happened; this guard only filters the
 * display decision afterwards:
 *   - teacher message (trimmed) exactly one of BARE_ACKNOWLEDGEMENTS, feedback to be shown, and the
 *     analysis is NOT a missed error-identification  ->  display suppressed (should_provide_feedback false);
 *   - everything else  ->  analysis returned as is.
 * It never detects or infers a student error, never changes scores, skills, quality, student-impact
 * fields or any other content, and does not apply to any other teacher message (not even "?").
 */

export const BARE_ACKNOWLEDGEMENTS = Object.freeze(['אוקיי', 'יפה', 'נכון']);

/** The teacher message is exactly one bare acknowledgement (surrounding whitespace ignored). */
export function isBareAcknowledgement(teacherMessage) {
  return typeof teacherMessage === 'string' && BARE_ACKNOWLEDGEMENTS.includes(teacherMessage.trim());
}

/** The validated missed-identification shape: EI relevant with score 0, quality "problematic". */
export function isMissedErrorIdentification(analysis) {
  return analysis.pedagogical_quality === 'problematic'
    && (analysis.skills_assessment || []).some((s) => s.skill_id === 'error-identification' && s.is_relevant === true && s.score === 0);
}

/**
 * @returns {{ analysis: object, suppressed: boolean }} the same analysis object when the guard does not
 *   apply; otherwise a shallow copy with should_provide_feedback false (the caller empties the message).
 */
export function applyBareAcknowledgementGuard(teacherMessage, analysis) {
  if (!analysis.should_provide_feedback || !isBareAcknowledgement(teacherMessage) || isMissedErrorIdentification(analysis)) {
    return { analysis, suppressed: false };
  }
  return { analysis: { ...analysis, should_provide_feedback: false }, suppressed: true };
}
