/**
 * Compact LLM-call telemetry (latency measurement before choosing retry/timeout values).
 *
 * Built from a strict whitelist, so prompts, raw model output, teacher/student text, images
 * and histories can never be persisted through it. Strings are bounded; numbers must be
 * non-negative integers; unknown values become null (Firestore rejects undefined).
 */

export const TELEMETRY_STATUSES = ["ok", "failed", "skipped"];
export const TELEMETRY_KEYS = ["status", "reason", "model", "latencyMs", "clientLatencyMs", "finishReason", "attempts"];
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
