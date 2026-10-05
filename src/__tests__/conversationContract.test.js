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
