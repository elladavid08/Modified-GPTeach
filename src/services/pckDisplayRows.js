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
 *   score 0      improvement = own `what_could_be_better`, else the matching `missed_opportunities` text
 *                (`what_could_have_been_done`; 1.5.1 feedback fix); positive = none
 *   other/none   as score 0 (legacy treatment)
 * `what_could_be_better` is never shown for score 2: its contract meaning is an improvement suggestion, and
 * deciding that a given text is "really" positive would require reading the text.
 *
 * Matching a `demonstrated_skills` / `missed_opportunities` item to a row (deterministic): exact `skill_id`
 * equality (all are validated against the same five skill ids by the server, B23), the id appears in exactly ONE
 * item, and that item's text is a non-empty string. Anything else: no fallback.
 *
 * Required text per score (the teacher-facing contract): 2 = positive; 1 = positive AND improvement;
 * 0 = improvement (meetsPckRowContract). A row with no text at all is EMPTY (isEmptyPckRow): it is never shown to
 * the teacher (sidebar, conversation-log viewer: `buildPckDisplayRows(feedback, { dropEmpty: true })`), and the
 * server re-asks the model once when shown feedback would contain one (server/pck_row_text.js, the same rule).
 * Research exports keep every relevant skill with its score; only the text follows this rule.
 *
 * Legacy feedback without any relevant skills_assessment entry keeps the previous fallback: rows from
 * `detected_skills` (shown as score 2) and `missed_opportunities` (score 0).
 *
 * Every view of already-generated feedback reads this module (B28): the teacher sidebar, the conversation-log
 * viewer (also used by the admin viewer), the admin "model output" CSV and the Excel export. The summary input on
 * the server uses the same rule (server/pck_row_text.js; parity test: pckRowTextParity.test.js). Row text is shown
 * the same way everywhere (pckRowText / formatPckRowText): the main text after the skill name, and for score 1
 * the improvement on its own line labelled "לשיפור:".
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

/** The what_could_have_been_done of the single missed_opportunities item whose skill_id equals `skillId`, or null. */
export function matchMissedImprovement(missed, skillId) {
	if (!Array.isArray(missed)) {
		return null;
	}
	const matches = missed.filter((item) => item && typeof item === "object" && item.skill_id === skillId);
	return matches.length === 1 ? nonEmpty(matches[0].what_could_have_been_done) : null;
}

/**
 * Display rows: [{ skillId, score, positive, improvement, positiveSource, improvementSource }].
 * `dropEmpty`: leave out rows with no text at all (teacher-facing views). Research exports keep every row.
 */
export function buildPckDisplayRows(feedback, { dropEmpty = false } = {}) {
	const rows = buildAllPckRows(feedback);
	return dropEmpty ? rows.filter((row) => !isEmptyPckRow(row)) : rows;
}

function buildAllPckRows(feedback) {
	if (!feedback || typeof feedback !== "object") {
		return [];
	}
	const demonstrated = feedback.detected_skills;
	const relevant = (Array.isArray(feedback.skills_assessment) ? feedback.skills_assessment : []).filter((s) => s && s.is_relevant === true);

	if (relevant.length === 0) {
		return [
			...(Array.isArray(demonstrated) ? demonstrated : []).filter((s) => s && typeof s === "object").map((s) => ({
				skillId: s.skill_id, score: 2, positive: nonEmpty(s.evidence), improvement: null, positiveSource: nonEmpty(s.evidence) ? "detected_skills" : null, improvementSource: null,
			})),
			...(Array.isArray(feedback.missed_opportunities) ? feedback.missed_opportunities : []).filter((s) => s && typeof s === "object").map((s) => ({
				skillId: s.skill_id, score: 0, positive: null, improvement: nonEmpty(s.what_could_have_been_done), positiveSource: null,
				improvementSource: nonEmpty(s.what_could_have_been_done) ? "missed_opportunities" : null,
			})),
		];
	}

	return relevant.map((s) => buildAssessedPckRow(s, demonstrated, feedback.missed_opportunities));
}

/** The display row of one skills_assessment entry (the caller has decided the entry is shown). */
export function buildAssessedPckRow(s, demonstrated, missed) {
	if (s.score === 1 || s.score === 2) {
		const own = nonEmpty(s.evidence);
		const fallback = own ? null : matchDemonstratedEvidence(demonstrated, s.skill_id);
		return {
			skillId: s.skill_id,
			score: s.score,
			positive: own || fallback,
			improvement: s.score === 1 ? nonEmpty(s.what_could_be_better) : null,
			positiveSource: own ? "evidence" : fallback ? "demonstrated_skills" : null,
			improvementSource: s.score === 1 && nonEmpty(s.what_could_be_better) ? "what_could_be_better" : null,
		};
	}
	const ownImprovement = nonEmpty(s.what_could_be_better);
	const missedImprovement = ownImprovement ? null : matchMissedImprovement(missed, s.skill_id);
	return {
		skillId: s.skill_id,
		score: s.score,
		positive: null,
		improvement: ownImprovement || missedImprovement,
		positiveSource: null,
		improvementSource: ownImprovement ? "what_could_be_better" : missedImprovement ? "missed_opportunities" : null,
	};
}

/** A row with no text at all. Never shown to the teacher. */
export function isEmptyPckRow(row) {
	return !row || (!row.positive && !row.improvement);
}

/** Whether a row carries the text its score requires: 2 positive; 1 positive AND improvement; 0 improvement. */
export function meetsPckRowContract(row) {
	if (!row) {
		return false;
	}
	if (row.score === 2) {
		return Boolean(row.positive);
	}
	if (row.score === 1) {
		return Boolean(row.positive && row.improvement);
	}
	return Boolean(row.improvement);
}

export const PCK_IMPROVEMENT_LABEL = "לשיפור:";

/** The text a row shows: `main` after the skill name; `improvement` (score 1 only) on its own labelled line. */
export function pckRowText(row) {
	if (!row) {
		return { main: null, improvement: null };
	}
	const positiveScore = row.score === 1 || row.score === 2;
	return {
		main: (positiveScore ? row.positive : row.improvement) || null,
		improvement: (row.score === 1 && row.improvement) || null,
	};
}

/** Plain-text form of a row's text for exports: the main text, then "לשיפור: <improvement>" ("" if no text). */
export function formatPckRowText(row) {
	const { main, improvement } = pckRowText(row);
	return [main, improvement ? `${PCK_IMPROVEMENT_LABEL} ${improvement}` : null].filter(Boolean).join("\n");
}

/** Content-free: number of rows with no text at all (since the 1.5.1 fix these rows are not displayed). */
export function countRowsWithoutText(rows) {
	return Array.isArray(rows) ? rows.filter((r) => r && isEmptyPckRow(r)).length : 0;
}

/** Content-free: score-1 rows without a positive part (shown with the improvement only). */
export function countRowsMissingPositive(rows) {
	return Array.isArray(rows) ? rows.filter((r) => r && r.score === 1 && !r.positive).length : 0;
}
