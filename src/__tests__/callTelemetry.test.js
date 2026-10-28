// LLM-call telemetry (A17, REVIEW): a strict, bounded whitelist of timing metadata.
import { buildCallTelemetry, TELEMETRY_KEYS, TELEMETRY_BASE_KEYS, TELEMETRY_DUPLICATE_KEYS, TELEMETRY_QUOTE_CUT_KEYS, TELEMETRY_GARBLE_KEYS, TELEMETRY_SPEAKER_KEYS, TELEMETRY_PCK_DISPLAY_KEYS, TELEMETRY_PCK_ROW_TEXT_KEYS, DUPLICATE_OUTCOMES, countUnknownSpeakers } from "../services/callTelemetry";

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
		// 1.4.2 appends the garbled-text and unknown-speaker counters (additive)
		// 1.4.3 appends the PCK display counter (additive); the 1.5.1 row-text fix appends the
		// missing-positive display counter and the server's row-text re-ask counter (additive)
		expect(TELEMETRY_KEYS).toEqual([...TELEMETRY_BASE_KEYS, ...TELEMETRY_DUPLICATE_KEYS, ...TELEMETRY_QUOTE_CUT_KEYS, ...TELEMETRY_GARBLE_KEYS, ...TELEMETRY_SPEAKER_KEYS, ...TELEMETRY_PCK_DISPLAY_KEYS, ...TELEMETRY_PCK_ROW_TEXT_KEYS]);
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

describe("student quote-cut telemetry (1.3.13, A17 additive, detection only)", () => {
	const STUDENT_META = { ...META, agent: "student", duplicateRetries: 0, duplicateRepliesDropped: 0, duplicateRepliesKept: 0, duplicateOutcome: "none", quoteCutSuspected: 1, quoteCutPaddedAttempts: 0 };

	it("keeps the two content-free quote-cut counters when the server reports them", () => {
		const t = buildCallTelemetry("ok", STUDENT_META);
		expect(t.quoteCutSuspected).toBe(1);
		expect(t.quoteCutPaddedAttempts).toBe(0);
		expect(TELEMETRY_QUOTE_CUT_KEYS).toEqual(["quoteCutSuspected", "quoteCutPaddedAttempts"]);
		expect(Object.keys(t).every((k) => TELEMETRY_KEYS.includes(k))).toBe(true);
	});

	it("omits them when the server did not report them (PCK calls, servers before 1.3.13): backward compatible", () => {
		const { quoteCutSuspected, quoteCutPaddedAttempts, ...older } = STUDENT_META;
		const t = buildCallTelemetry("ok", older);
		expect("quoteCutSuspected" in t).toBe(false);
		expect("quoteCutPaddedAttempts" in t).toBe(false);
		expect(t.duplicateOutcome).toBe("none");
	});

	it("only accepts non-negative integer counts; never text", () => {
		const t = buildCallTelemetry("ok", { ...STUDENT_META, quoteCutSuspected: "יובל: …באורך 5 ס", quoteCutPaddedAttempts: -1 });
		expect(t.quoteCutSuspected).toBeNull();
		expect(t.quoteCutPaddedAttempts).toBeNull();
		expect(buildCallTelemetry("ok", { ...STUDENT_META, quoteCutSuspected: 1.5 }).quoteCutSuspected).toBeNull();
		expect(hasUndefined(t)).toBe(false);
	});
});

describe("student garbled-text telemetry (1.4.2, A17 additive, detection only)", () => {
	const GARBLE = { garbleForeignScript: 1, garbleMixedScriptToken: 0, garbleCantillation: 0, garbleRepeatedFunctionWord: 2, garbleMarkup: 0, garbleReplies: 2 };
	const STUDENT_META = { ...META, agent: "student", duplicateRetries: 0, duplicateRepliesDropped: 0, duplicateRepliesKept: 0, duplicateOutcome: "none", quoteCutSuspected: 0, quoteCutPaddedAttempts: 0, ...GARBLE, unknownSpeaker: 1 };

	it("keeps the six server garble counters and the client unknownSpeaker counter when reported", () => {
		const t = buildCallTelemetry("ok", STUDENT_META);
		for (const [key, value] of Object.entries(GARBLE)) expect(t[key]).toBe(value);
		expect(t.unknownSpeaker).toBe(1);
		expect(TELEMETRY_GARBLE_KEYS).toEqual(["garbleForeignScript", "garbleMixedScriptToken", "garbleCantillation", "garbleRepeatedFunctionWord", "garbleMarkup", "garbleReplies"]);
		expect(TELEMETRY_SPEAKER_KEYS).toEqual(["unknownSpeaker"]);
		expect(Object.keys(t).every((k) => TELEMETRY_KEYS.includes(k))).toBe(true);
		// earlier fields unchanged
		expect(t.duplicateOutcome).toBe("none");
		expect(t.quoteCutSuspected).toBe(0);
	});

	it("omits them when not reported (PCK calls, servers before 1.4.2): backward compatible", () => {
		const { unknownSpeaker, ...withoutSpeaker } = STUDENT_META;
		const older = Object.fromEntries(Object.entries(withoutSpeaker).filter(([k]) => !TELEMETRY_GARBLE_KEYS.includes(k)));
		const t = buildCallTelemetry("ok", older);
		for (const key of [...TELEMETRY_GARBLE_KEYS, "unknownSpeaker"]) expect(key in t).toBe(false);
		expect(t.quoteCutSuspected).toBe(0);
	});

	it("only accepts non-negative integer counts; never text", () => {
		const t = buildCallTelemetry("ok", { ...STUDENT_META, garbleForeignScript: "איזה יظה", garbleMarkup: -1, garbleReplies: 1.5, unknownSpeaker: "מעוין" });
		expect(t.garbleForeignScript).toBeNull();
		expect(t.garbleMarkup).toBeNull();
		expect(t.garbleReplies).toBeNull();
		expect(t.unknownSpeaker).toBeNull();
		expect(hasUndefined(t)).toBe(false);
	});

	it("countUnknownSpeakers counts replies whose speaker is not in the cast (content-free)", () => {
		const cast = [{ name: "תמר" }, { name: "מעיין" }, { name: "רועי" }];
		expect(countUnknownSpeakers([{ name: "תמר" }, { name: "מעוין" }, { name: "רועי" }, { name: "Student" }], cast)).toBe(2);
		expect(countUnknownSpeakers([{ name: "תמר" }, { name: "מעיין" }], cast)).toBe(0);
		expect(countUnknownSpeakers([], cast)).toBe(0);
		expect(countUnknownSpeakers(null, cast)).toBe(0);
		expect(countUnknownSpeakers([{ name: "תמר" }], null)).toBe(1);
	});
});

describe("PCK display telemetry (1.4.3, A17 additive, content-free)", () => {
	const PCK_META = { ...META, agent: "pck" };

	it("keeps pckRowsWithoutText when reported, as a non-negative integer", () => {
		expect(TELEMETRY_PCK_DISPLAY_KEYS).toEqual(["pckRowsWithoutText", "pckRowsMissingPositive"]);
		expect(buildCallTelemetry("ok", { ...PCK_META, pckRowsWithoutText: 2 }).pckRowsWithoutText).toBe(2);
		expect(buildCallTelemetry("ok", { ...PCK_META, pckRowsWithoutText: "תגובה פדגוגית" }).pckRowsWithoutText).toBeNull();
		expect(buildCallTelemetry("ok", { ...PCK_META, pckRowsWithoutText: -1 }).pckRowsWithoutText).toBeNull();
	});

	it("omits it when not reported (no feedback shown, older records)", () => {
		expect("pckRowsWithoutText" in buildCallTelemetry("ok", PCK_META)).toBe(false);
	});

	it("1.5.1: keeps pckRowsMissingPositive and the server's pckRowTextRetries as non-negative integers, omitted when not reported", () => {
		expect(TELEMETRY_PCK_ROW_TEXT_KEYS).toEqual(["pckRowTextRetries"]);
		const t = buildCallTelemetry("ok", { ...PCK_META, pckRowsMissingPositive: 1, pckRowTextRetries: 1 });
		expect(t.pckRowsMissingPositive).toBe(1);
		expect(t.pckRowTextRetries).toBe(1);
		expect(buildCallTelemetry("ok", { ...PCK_META, pckRowsMissingPositive: "חיובי", pckRowTextRetries: 0.5 })).toMatchObject({ pckRowsMissingPositive: null, pckRowTextRetries: null });
		const older = buildCallTelemetry("ok", PCK_META);
		expect("pckRowsMissingPositive" in older).toBe(false);
		expect("pckRowTextRetries" in older).toBe(false);
	});
});

