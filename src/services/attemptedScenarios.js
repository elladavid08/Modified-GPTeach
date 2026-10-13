/**
 * Which scenarios the current teacher has already attempted (pilot request #8, 1.4.4).
 *
 * Display only, for the scenario-selection screen: an attempted scenario looks different but stays
 * fully available. Nothing is stored and the conversation contract is unchanged.
 *
 * - Attempted = at least one saved conversation of this teacher with at least one logged turn for
 *   the scenario, finished ("סיים שיחה") or not. The conversation document is only created with the
 *   first logged turn (ConversationLog.addTurn), so opening a scenario alone is not an attempt.
 * - Conversations carry no scenario id (A9): they are matched on the stored scenario.text, which is
 *   compared with the current titles after normalisation. Before 2026-03-17 (commit 1eb3da6) the
 *   titles carried the prefix "השיעור של השבוע הוא על "; it is stripped so those records match.
 */

export const LEGACY_SCENARIO_TITLE_PREFIX = "השיעור של השבוע הוא על ";

/** Normalised title used for matching: NFC, single spaces, trimmed, legacy prefix removed. */
export function normalizeScenarioTitle(text) {
	if (typeof text !== "string") {
		return "";
	}
	const title = text.normalize("NFC").replace(/\s+/g, " ").trim();
	return title.startsWith(LEGACY_SCENARIO_TITLE_PREFIX)
		? title.slice(LEGACY_SCENARIO_TITLE_PREFIX.length).trim()
		: title;
}

/**
 * @param {Array<object>} conversations  conversation documents (e.g. from getConversationsByUser)
 * @param {string} userId                the current teacher; other users' documents are ignored
 * @param {Array<{text: string}>} scenarios  the current scenario list
 * @returns {Set<string>} the current `text` of every attempted scenario
 */
export function getAttemptedScenarioTexts(conversations, userId, scenarios) {
	const attempted = new Set();
	if (!userId || !Array.isArray(conversations) || !Array.isArray(scenarios)) {
		return attempted;
	}
	const byTitle = new Map();
	for (const scenario of scenarios) {
		const key = normalizeScenarioTitle(scenario && scenario.text);
		if (key) {
			byTitle.set(key, scenario.text);
		}
	}
	for (const conversation of conversations) {
		if (!conversation || typeof conversation !== "object" || conversation.userId !== userId) {
			continue;
		}
		if (!Array.isArray(conversation.turns) || conversation.turns.length === 0) {
			continue;
		}
		const key = normalizeScenarioTitle(conversation.scenario && conversation.scenario.text);
		if (byTitle.has(key)) {
			attempted.add(byTitle.get(key));
		}
	}
	return attempted;
}
