// LLM-call telemetry (A17, REVIEW): a strict, bounded whitelist of timing metadata.
import { buildCallTelemetry, TELEMETRY_KEYS } from "../services/callTelemetry";

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
		expect(Object.keys(t).sort()).toEqual([...TELEMETRY_KEYS].sort());
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
		expect(Object.keys(t).sort()).toEqual([...TELEMETRY_KEYS].sort());
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
