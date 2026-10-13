/**
 * PCK sidebar display contract (1.4.3): a pure view-model over the PCK feedback object.
 * Research: research/simulator_audit/pck_row_text_contract_experiment.md (§7).
 *
 * Uses ONLY text the PCK model already returned. It never invents text, never changes a score, the relevance
 * of a skill or the show/hide decision, and never mutates the feedback object (the caller decides whether
 * feedback is shown at all; this only shapes the rows of feedback that is shown).
 *
 * One row per skills_assessment entry with is_relevant === true, in order:
 *   score 2      positive    = own `evidence`, else the matching `demonstrated_skills` evidence; improvement = none
 *   score 1      positive    = own `evidence`, else the matching `demonstrated_skills` evidence;
 *                improvement = own `what_could_be_better`
 *   score 0      improvement = own `what_could_be_better` (unchanged); positive = none
 *   other/none   as score 0 (unchanged legacy treatment)
 * `what_could_be_better` is never shown for score 2: its contract meaning is an improvement suggestion, and
 * deciding that a given text is "really" positive would require reading the text.
 *
 * Matching a `demonstrated_skills` item to a row (deterministic): exact `skill_id` equality (both are validated
 * against the same five skill ids by the server, B23), the id appears in exactly ONE item, and that item's
 * `evidence` is a non-empty string. Anything else: no fallback.
 *
 * Legacy feedback without any relevant skills_assessment entry keeps the previous fallback: rows from
 * `detected_skills` (shown as score 2) and `missed_opportunities` (score 0).
 */

const nonEmpty = (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/** The evidence of the single demonstrated_skills item whose skill_id equals `skillId`, or null. */
export function matchDemonstratedEvidence(demonstrated, skillId) {
	if (!Array.isArray(demonstrated)) {
		return null;
	}
	const matches = demonstrated.filter((item) => item && typeof item === "object" && item.skill_id === skillId);
	return matches.length === 1 ? nonEmpty(matches[0].evidence) : null;
}

/** Display rows: [{ skillId, score, positive, improvement, positiveSource }]. */
export function buildPckDisplayRows(feedback) {
	if (!feedback || typeof feedback !== "object") {
		return [];
	}
	const demonstrated = feedback.detected_skills;
	const relevant = (Array.isArray(feedback.skills_assessment) ? feedback.skills_assessment : []).filter((s) => s && s.is_relevant === true);

	if (relevant.length === 0) {
		return [
			...(Array.isArray(demonstrated) ? demonstrated : []).filter((s) => s && typeof s === "object").map((s) => ({
				skillId: s.skill_id, score: 2, positive: nonEmpty(s.evidence), improvement: null, positiveSource: nonEmpty(s.evidence) ? "detected_skills" : null,
			})),
			...(Array.isArray(feedback.missed_opportunities) ? feedback.missed_opportunities : []).filter((s) => s && typeof s === "object").map((s) => ({
				skillId: s.skill_id, score: 0, positive: null, improvement: nonEmpty(s.what_could_have_been_done), positiveSource: null,
			})),
		];
	}

	return relevant.map((s) => {
		if (s.score === 1 || s.score === 2) {
			const own = nonEmpty(s.evidence);
			const fallback = own ? null : matchDemonstratedEvidence(demonstrated, s.skill_id);
			return {
				skillId: s.skill_id,
				score: s.score,
				positive: own || fallback,
				improvement: s.score === 1 ? nonEmpty(s.what_could_be_better) : null,
				positiveSource: own ? "evidence" : fallback ? "demonstrated_skills" : null,
			};
		}
		return { skillId: s.skill_id, score: s.score, positive: null, improvement: nonEmpty(s.what_could_be_better), positiveSource: null };
	});
}

/** Content-free: number of rows that would be displayed without any text. */
export function countRowsWithoutText(rows) {
	return Array.isArray(rows) ? rows.filter((r) => r && !r.positive && !r.improvement).length : 0;
}
