// Invariants A1, A2, A5, A12, A13: conversation-document contract and backward compatibility
// of a downstream reader (the research Excel export).
import * as XLSX from "xlsx-js-style";
import { validateConversationDoc } from "../testUtils/conversationContract";
import { currentFormatConversation, legacyFormatConversation } from "../testUtils/conversationFixtures";
import { exportConversationToExcel } from "../services/exportConversationExcel";

jest.mock("file-saver", () => ({ saveAs: jest.fn() }));

describe("conversation document contract validator", () => {
	it("accepts the current (v1.3.0) format", () => {
		expect(validateConversationDoc(currentFormatConversation())).toEqual([]);
	});

	it("accepts the legacy (v1.0) format", () => {
		expect(validateConversationDoc(legacyFormatConversation(), { legacy: true })).toEqual([]);
	});

	it("allows additive fields (schema extensions must be additive)", () => {
		const doc = currentFormatConversation();
		doc.newTopLevelField = { anything: true };
		doc.turns[0].newTurnField = 1;
		doc.turns[1].pckFeedback.new_feedback_field = "x";
		expect(validateConversationDoc(doc)).toEqual([]);
	});

	it("accepts turn telemetry (A17) and turns without it", () => {
		const doc = currentFormatConversation();
		doc.turns[1].telemetry = {
			pck: { status: "ok", reason: null, model: "gemini-2.5-flash-lite", latencyMs: 2100, clientLatencyMs: 2300, finishReason: "STOP", attempts: 1 },
			student: { status: "ok", reason: null, model: "gemini-2.5-flash-lite", latencyMs: 900, clientLatencyMs: 1000, finishReason: "STOP", attempts: 1 },
		};
		doc.turns[0].telemetry = null;
		expect(validateConversationDoc(doc)).toEqual([]);
		expect(validateConversationDoc(legacyFormatConversation(), { legacy: true })).toEqual([]);
	});

	it.each([
		["telemetry with an unknown status", (t) => { t.telemetry = { pck: { status: "weird" }, student: null }; }],
		["telemetry with non-whitelisted content", (t) => { t.telemetry = { pck: { status: "ok", prompt: "x" }, student: null }; }],
		["telemetry with an unknown agent key", (t) => { t.telemetry = { summary: { status: "ok" } }; }],
		["telemetry with a negative latency", (t) => { t.telemetry = { pck: { status: "ok", latencyMs: -1 }, student: null }; }],
	])("rejects %s", (_label, mutate) => {
		const doc = currentFormatConversation();
		mutate(doc.turns[1]);
		expect(validateConversationDoc(doc).length).toBeGreaterThan(0);
	});

	it("accepts an additive failedAttempts list (A16) and documents without it (legacy)", () => {
		const doc = currentFormatConversation();
		doc.failedAttempts = [
			{ agent: "pck", stage: "parse", timestamp: "2026-01-01T10:03:00.000Z", precedingTurnNumber: 2, attemptNumber: 1 },
		];
		expect(validateConversationDoc(doc)).toEqual([]);
	});

	it.each([
		["failed attempt with a turnNumber", (d) => { d.failedAttempts = [{ agent: "pck", stage: "http", timestamp: "t", precedingTurnNumber: 0, turnNumber: 1 }]; }],
		["failed attempt with an unknown agent", (d) => { d.failedAttempts = [{ agent: "other", stage: "http", timestamp: "t", precedingTurnNumber: 0 }]; }],
		["failed attempt with an unknown stage", (d) => { d.failedAttempts = [{ agent: "pck", stage: "weird", timestamp: "t", precedingTurnNumber: 0 }]; }],
		["failedAttempts not an array", (d) => { d.failedAttempts = {}; }],
	])("rejects %s", (_label, mutate) => {
		const doc = currentFormatConversation();
		mutate(doc);
		expect(validateConversationDoc(doc).length).toBeGreaterThan(0);
	});

	it.each([
		["non-sequential turnNumber", (d) => { d.turns[1].turnNumber = 3; }],
		["missing teacher.message", (d) => { delete d.turns[0].teacher.message; }],
		["data-URL prefixed image", (d) => { d.turns[1].teacher.image = "data:image/png;base64,AAAA"; }],
		["unknown skill id", (d) => { d.turns[1].pckFeedback.skills_assessment[0].skill_id = "p1"; }],
		["score outside 0/1/2", (d) => { d.turns[1].pckFeedback.skills_assessment[0].score = 3; }],
		["malformed studentRefs", (d) => { d.studentRefs = ["noa"]; }],
		["malformed sessionId", (d) => { d.sessionId = "abc"; }],
		["summaryFeedback not a string", (d) => { d.summaryFeedback = { text: "x" }; }],
		["missing systemVersion", (d) => { delete d.systemVersion; }],
	])("rejects %s", (_label, mutate) => {
		const doc = currentFormatConversation();
		mutate(doc);
		expect(validateConversationDoc(doc).length).toBeGreaterThan(0);
	});
});

describe("Excel export reads both document formats", () => {
	let appendSpy;
	beforeEach(() => {
		appendSpy = jest.spyOn(XLSX.utils, "book_append_sheet");
	});
	afterEach(() => appendSpy.mockRestore());

	function exportedCells(conversation) {
		exportConversationToExcel(conversation, "משתתף_01");
		const ws = appendSpy.mock.calls[0][1];
		return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }).flat().join("\n");
	}

	it("includes turns, Hebrew skill names, score labels and summary sections (current format)", () => {
		const text = exportedCells(currentFormatConversation());
		expect(text).toContain("TEST-TEACHER-1");
		expect(text).toContain("TEST-STUDENT-2");
		expect(text).toContain("זיהוי השגיאה [קיים היטב]");
		expect(text).toContain("TEST-EVIDENCE-2");
		expect(text).toContain("תגובה פדגוגית מותאמת [חסר]");
		expect(text).toContain("TEST-SUGGESTION-0");
		expect(text).toContain("TEST-SUMMARY-BODY");
		expect(text).toContain("TEST-TIP");
	});

	it("handles legacy feedback without skills_assessment and with free-text skill ids", () => {
		const text = exportedCells(legacyFormatConversation());
		expect(text).toContain("LEGACY-TEACHER");
		expect(text).toContain("LEGACY-STUDENT");
		expect(text).toContain("LEGACY-MISSED");
	});
});
