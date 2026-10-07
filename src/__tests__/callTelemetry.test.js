// LLM-call telemetry (A17, REVIEW): a strict, bounded whitelist of timing metadata.
import { buildCallTelemetry, TELEMETRY_KEYS, TELEMETRY_BASE_KEYS, TELEMETRY_DUPLICATE_KEYS, DUPLICATE_OUTCOMES } from "../services/callTelemetry";

const META = {
	agent: "pck",
	model: "gemini-2.5-flash-lite",
	latencyMs: 1234,
	finishReason: "STOP",
	attempts: 1,
	clientLatencyMs: 1500,
};

function hasUndefined(value) {
	if (value === undefined) return true;
	if (value && typeof value === "object") return Object.values(value).some(hasUndefined);
	return false;
}

describe("buildCallTelemetry", () => {
	it("keeps exactly the whitelisted fields for a successful call", () => {
		const t = buildCallTelemetry("ok", META);
		expect(t).toEqual({
			status: "ok",
			reason: null,
			model: "gemini-2.5-flash-lite",
			latencyMs: 1234,
			clientLatencyMs: 1500,
			finishReason: "STOP",
			attempts: 1,
		});
		expect(Object.keys(t).sort()).toEqual([...TELEMETRY_BASE_KEYS].sort());
	});

	it("records a skipped call with a reason and no metrics", () => {
		expect(buildCallTelemetry("skipped", null, "image_only")).toEqual({
			status: "skipped",
			reason: "image_only",
			model: null,
			latencyMs: null,
			clientLatencyMs: null,
			finishReason: null,
			attempts: null,
		});
	});

	it("drops any non-whitelisted content (prompts, raw text, teacher text)", () => {
		const t = buildCallTelemetry("failed", {
			...META,
			prompt: "SECRET-PROMPT",
			text: "SECRET-RAW-OUTPUT",
			teacherMessage: "SECRET-TEACHER",
			image: "iVBORsecret",
		});
		const json = JSON.stringify(t);
		expect(json).not.toMatch(/SECRET|iVBOR/);
		expect(Object.keys(t).sort()).toEqual([...TELEMETRY_BASE_KEYS].sort());
	});

	it("bounds strings and rejects invalid numbers", () => {
		const t = buildCallTelemetry("ok", { model: "m".repeat(500), finishReason: "f".repeat(500), latencyMs: -5, attempts: 1.5, clientLatencyMs: "100" });
		expect(t.model.length).toBeLessThanOrEqual(64);
		expect(t.finishReason.length).toBeLessThanOrEqual(64);
		expect(t.latencyMs).toBeNull();
		expect(t.attempts).toBeNull();
		expect(t.clientLatencyMs).toBeNull();
		expect(hasUndefined(t)).toBe(false);
	});

	it("ignores a reason unless the call was skipped", () => {
		expect(buildCallTelemetry("ok", META, "image_only").reason).toBeNull();
	});
});

describe("student duplicate-guard telemetry (1.3.11, A17 additive)", () => {
	const STUDENT_META = { ...META, agent: "student", attempts: 2, duplicateRetries: 1, duplicateRepliesDropped: 1, duplicateRepliesKept: 0, duplicateOutcome: "dropped" };

	it("keeps the four content-free duplicate fields when the server reports them", () => {
		const t = buildCallTelemetry("ok", STUDENT_META);
		expect(t).toEqual({
			status: "ok",
			reason: null,
			model: "gemini-2.5-flash-lite",
			latencyMs: 1234,
			clientLatencyMs: 1500,
			finishReason: "STOP",
			attempts: 2,
			duplicateRetries: 1,
			duplicateRepliesDropped: 1,
			duplicateRepliesKept: 0,
			duplicateOutcome: "dropped",
		});
		expect(Object.keys(t).every((k) => TELEMETRY_KEYS.includes(k))).toBe(true);
	});

	it("omits them when the server did not report them (PCK calls, older servers): backward compatible", () => {
		expect(Object.keys(buildCallTelemetry("ok", META)).sort()).toEqual([...TELEMETRY_BASE_KEYS].sort());
		expect(TELEMETRY_KEYS).toEqual([...TELEMETRY_BASE_KEYS, ...TELEMETRY_DUPLICATE_KEYS]);
	});

	it("only accepts the known outcomes and non-negative integer counts; never text", () => {
		const t = buildCallTelemetry("ok", { ...STUDENT_META, duplicateOutcome: "דנה: אז רק במעוין…", duplicateRetries: -1, duplicateRepliesDropped: 1.5, duplicateRepliesKept: "2" });
		expect(t.duplicateOutcome).toBeNull();
		expect(t.duplicateRetries).toBeNull();
		expect(t.duplicateRepliesDropped).toBeNull();
		expect(t.duplicateRepliesKept).toBeNull();
		expect(DUPLICATE_OUTCOMES).toEqual(["none", "resolved", "dropped", "kept", "reask_failed"]);
		for (const outcome of DUPLICATE_OUTCOMES) expect(buildCallTelemetry("ok", { ...STUDENT_META, duplicateOutcome: outcome }).duplicateOutcome).toBe(outcome);
		expect(hasUndefined(t)).toBe(false);
	});
});
