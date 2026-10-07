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
export const TELEMETRY_KEYS = [...TELEMETRY_BASE_KEYS, ...TELEMETRY_DUPLICATE_KEYS];
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
	};
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

/** Sanitise a {pck, student} turn-telemetry object to the whitelist (or null). */
export function sanitizeTurnTelemetry(telemetry) {
	if (!telemetry || typeof telemetry !== "object") {
		return null;
	}
	const clean = (entry) => (entry && typeof entry === "object" ? buildCallTelemetry(entry.status, entry, entry.reason) : null);
	return { pck: clean(telemetry.pck), student: clean(telemetry.student) };
}
