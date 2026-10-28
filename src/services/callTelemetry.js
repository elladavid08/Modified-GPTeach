/**
 * Compact LLM-call telemetry (latency measurement before choosing retry/timeout values).
 *
 * Built from a strict whitelist, so prompts, raw model output, teacher/student text, images
 * and histories can never be persisted through it. Strings are bounded; numbers must be
 * non-negative integers; unknown values become null (Firestore rejects undefined).
 */

export const TELEMETRY_STATUSES = ["ok", "failed", "skipped"];
export const TELEMETRY_BASE_KEYS = ["status", "reason", "model", "latencyMs", "clientLatencyMs", "finishReason", "attempts"];
// Student duplicate guard (1.3.11): optional, content-free; present only when the server reports them
export const TELEMETRY_DUPLICATE_KEYS = ["duplicateRetries", "duplicateRepliesDropped", "duplicateRepliesKept", "duplicateOutcome"];
// Student quote-cut detection (1.3.13): optional, content-free counters; present only when the server reports them
export const TELEMETRY_QUOTE_CUT_KEYS = ["quoteCutSuspected", "quoteCutPaddedAttempts"];
// Student garbled-text detection (1.4.2): optional, content-free server counters; present only when the server reports them
export const TELEMETRY_GARBLE_KEYS = ["garbleForeignScript", "garbleMixedScriptToken", "garbleCantillation", "garbleRepeatedFunctionWord", "garbleMarkup", "garbleReplies"];
// Unknown speaker (1.4.2): optional, content-free client counter; only the browser knows the active cast
export const TELEMETRY_SPEAKER_KEYS = ["unknownSpeaker"];
// PCK display (1.4.3): optional, content-free; relevant skill rows of shown feedback with no usable text. Since the
// 1.5.1 row-text fix these rows are left out of the display; pckRowsMissingPositive counts score-1 rows shown
// with the improvement only (no positive part anywhere in the output). Client counters, shown feedback only.
export const TELEMETRY_PCK_DISPLAY_KEYS = ["pckRowsWithoutText", "pckRowsMissingPositive"];
// PCK row-text re-ask (1.5.1): optional, content-free server field; 1 if the identical re-ask was sent
export const TELEMETRY_PCK_ROW_TEXT_KEYS = ["pckRowTextRetries"];
export const TELEMETRY_KEYS = [...TELEMETRY_BASE_KEYS, ...TELEMETRY_DUPLICATE_KEYS, ...TELEMETRY_QUOTE_CUT_KEYS, ...TELEMETRY_GARBLE_KEYS, ...TELEMETRY_SPEAKER_KEYS, ...TELEMETRY_PCK_DISPLAY_KEYS, ...TELEMETRY_PCK_ROW_TEXT_KEYS];
export const DUPLICATE_OUTCOMES = ["none", "resolved", "dropped", "kept", "reask_failed"];
const MAX_STRING_CHARS = 64;

const nonNegativeInt = (value) => (Number.isInteger(value) && value >= 0 ? value : null);
const shortString = (value) => (typeof value === "string" ? value.slice(0, MAX_STRING_CHARS) : null);

/** Timing fields shared by turn telemetry and failedAttempts entries. */
export function timingFields(meta, clientLatencyMs) {
	const m = meta && typeof meta === "object" ? meta : {};
	return {
		model: shortString(m.model),
		latencyMs: nonNegativeInt(m.latencyMs),
		clientLatencyMs: nonNegativeInt(clientLatencyMs !== undefined ? clientLatencyMs : m.clientLatencyMs),
		finishReason: shortString(m.finishReason),
		attempts: nonNegativeInt(m.attempts),
	};
}

/**
 * @param {"ok"|"failed"|"skipped"} status
 * @param {object|null} meta  server meta (+ clientLatencyMs) from genai.js
 * @param {string|null} reason  only kept for skipped calls (e.g. "image_only")
 */
export function buildCallTelemetry(status, meta = null, reason = null) {
	return {
		status: TELEMETRY_STATUSES.includes(status) ? status : null,
		reason: status === "skipped" ? shortString(reason) : null,
		...timingFields(meta),
		...duplicateFields(meta),
		...quoteCutFields(meta),
		...countersIfReported(meta, TELEMETRY_GARBLE_KEYS),
		...countersIfReported(meta, TELEMETRY_SPEAKER_KEYS),
		...countersIfReported(meta, TELEMETRY_PCK_DISPLAY_KEYS),
		...countersIfReported(meta, TELEMETRY_PCK_ROW_TEXT_KEYS),
	};
}

/** Non-negative integer counters for `keys`, only if any of them was reported (otherwise omitted). */
function countersIfReported(meta, keys) {
	if (!meta || typeof meta !== "object" || !keys.some((key) => key in meta)) {
		return {};
	}
	return Object.fromEntries(keys.map((key) => [key, nonNegativeInt(meta[key])]));
}

/**
 * Number of parsed student replies whose speaker is not one of the active cast (1.4.2, detection only).
 * Content-free: returns a count; the replies themselves are not changed.
 */
export function countUnknownSpeakers(messages, students) {
	if (!Array.isArray(messages)) {
		return 0;
	}
	const cast = new Set((Array.isArray(students) ? students : []).map((s) => s && s.name));
	return messages.filter((m) => !(m && cast.has(m.name))).length;
}

/** Duplicate-guard counters (student calls since 1.3.11), only if the server reported any of them. */
function duplicateFields(meta) {
	if (!meta || typeof meta !== "object" || !TELEMETRY_DUPLICATE_KEYS.some((key) => key in meta)) {
		return {};
	}
	return {
		duplicateRetries: nonNegativeInt(meta.duplicateRetries),
		duplicateRepliesDropped: nonNegativeInt(meta.duplicateRepliesDropped),
		duplicateRepliesKept: nonNegativeInt(meta.duplicateRepliesKept),
		duplicateOutcome: DUPLICATE_OUTCOMES.includes(meta.duplicateOutcome) ? meta.duplicateOutcome : null,
	};
}

/** Quote-cut counters (student calls since 1.3.13), only if the server reported any of them. */
function quoteCutFields(meta) {
	if (!meta || typeof meta !== "object" || !TELEMETRY_QUOTE_CUT_KEYS.some((key) => key in meta)) {
		return {};
	}
	return {
		quoteCutSuspected: nonNegativeInt(meta.quoteCutSuspected),
		quoteCutPaddedAttempts: nonNegativeInt(meta.quoteCutPaddedAttempts),
	};
}

/** Sanitise a {pck, student} turn-telemetry object to the whitelist (or null). */
export function sanitizeTurnTelemetry(telemetry) {
	if (!telemetry || typeof telemetry !== "object") {
		return null;
	}
	const clean = (entry) => (entry && typeof entry === "object" ? buildCallTelemetry(entry.status, entry, entry.reason) : null);
	return { pck: clean(telemetry.pck), student: clean(telemetry.student) };
}
