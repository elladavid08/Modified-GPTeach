// Display consistency (B28): every researcher-facing view of already-generated PCK feedback shows the same
// per-skill text as the teacher sidebar, because all of them read src/services/pckDisplayRows.js.
// One synthetic conversation (pckDisplayContractConversation) goes through: the view-model, the teacher sidebar,
// the conversation-log viewer (ConversationDetail), the admin viewer (page render + "model output" CSV export)
// and the Excel export. Each view is reduced to [skill name, main text, improvement text] per row.
import React from "react";
import { act } from "react";
import * as XLSX from "xlsx-js-style";
import { PCKFeedbackSidebar } from "../components/PCKFeedbackSidebar";
import { ConversationDetail } from "../pages/ConversationLogs";
import AdminConversationLogs from "../pages/AdminConversationLogs";
import { exportConversationToExcel } from "../services/exportConversationExcel";
import { buildPckDisplayRows, pckRowText, PCK_IMPROVEMENT_LABEL } from "../services/pckDisplayRows";
import { getAllConversations, getConversation } from "../services/firestoreService";
import { pckDisplayContractConversation } from "../testUtils/conversationFixtures";
import { validateConversationDoc } from "../testUtils/conversationContract";
import { render, flush } from "../testUtils/dom";
import contract from "../testUtils/contracts/pckSkillsContract.json";

jest.mock("file-saver", () => ({ saveAs: jest.fn() }));
jest.mock("../services/firestoreService", () => ({
	getAllConversations: jest.fn(),
	getConversation: jest.fn(),
	getConversationsByUser: jest.fn(),
	deleteConversation: jest.fn(),
}));
jest.mock("../services/genai", () => ({ getPCKSummary: jest.fn() }));
jest.mock("../services/conversationLogger", () => ({ saveSummaryFeedback: jest.fn() }));
jest.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ currentUser: null }) }));
jest.mock("../components/PCKSummaryModal", () => ({ PCKSummaryModal: () => null }));

const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)); return Object.freeze(o); };

const SKILL_IDS = contract.skills.map((s) => s.skill_id);
const NAME = Object.fromEntries(contract.skills.map((s) => [s.skill_id, s.he]));
const nameOf = (skillId) => NAME[skillId] || skillId;
const IMPROVEMENT_PREFIX = "לשיפור: ";
const stripImprovement = (text) => (text.startsWith(IMPROVEMENT_PREFIX) ? text.slice(IMPROVEMENT_PREFIX.length) : text);

// The contract, written out by hand (not derived from the view-model): [skill_id, main text, improvement text].
const EXPECTED = {
	1: [
		["error-identification", "T1-EI-OWN", null],
		["error-characterization", "T1-EC-DEMO", null],
		["diagnostic-interpretation", "T1-DI-POS", "T1-DI-IMP"],
		["adapted-pedagogical-response", null, "T1-APR-IMP"],
		["error-leveraging", "T1-EL-IMP", null],
	],
	2: [
		["error-identification", null, null],
		["error-characterization", null, null],
		["diagnostic-interpretation", null, null],
		["adapted-pedagogical-response", null, null],
	],
	3: [
		["adapted-pedagogical-response", "T3-APR-DEMO", "T3-APR-IMP"],
		["error-identification", "T3-EI-NOSCORE", null],
	],
	4: [
		["error-identification", "T4-LEGACY-EV", null],
		["זיהוי תפיסה חזותית שגויה - מלבן", "T4-LEGACY-MISSED", null],
	],
	5: [],
	6: [],
};
const NEVER_SHOWN = ["T1-EI-REC", "T1-EL-NOT-SHOWN", "T2-EI-MISPLACED", "T2-AMBIG-A", "T2-AMBIG-B", "T2-OBJECT", "T2-WRONG-CASE", "T2-STRING", "T2-NO-ID", "T2-NOT-RELEVANT", "T6-NOT-RELEVANT"];

const expectedByName = (turnNumber) => EXPECTED[turnNumber].map(([id, main, imp]) => [nameOf(id), main, imp]);

let conversation;
let snapshot;
beforeEach(() => {
	conversation = deepFreeze(pckDisplayContractConversation());
	snapshot = JSON.stringify(conversation);
});
afterEach(() => {
	// No view mutates the stored PCK object (it is deep-frozen; this also checks nothing was replaced).
	expect(JSON.stringify(conversation)).toBe(snapshot);
});

const turnFeedback = (n) => conversation.turns.find((t) => t.turnNumber === n).pckFeedback;

// ─── View extractors ─────────────────────────────────────────────────────────

function viewModelRows(feedback) {
	return buildPckDisplayRows(feedback).map((row) => {
		const { main, improvement } = pckRowText(row);
		return [nameOf(row.skillId), main, improvement];
	});
}

/** Rows rendered as <strong>name</strong>: main + optional [data-testid="pck-row-improvement"] (sidebar and log viewer). */
function domRows(scope) {
	return Array.from(scope.querySelectorAll('[data-testid="pck-row"]')).map((el) => {
		const name = el.querySelector("strong").textContent;
		const improvementEl = el.querySelector('[data-testid="pck-row-improvement"]');
		const improvement = improvementEl ? improvementEl.textContent : "";
		const rest = el.textContent.slice(el.textContent.indexOf(name) + name.length, el.textContent.length - improvement.length);
		const main = rest.startsWith(": ") ? rest.slice(2) : rest;
		return [name, main || null, improvement ? stripImprovement(improvement) : null];
	});
}

/** Per turn number, the rows rendered inside that turn's block of ConversationDetail. */
function detailRowsByTurn(container) {
	const out = {};
	for (const span of container.querySelectorAll("span")) {
		const m = span.textContent.match(/^תור #(\d+)$/);
		if (m) out[m[1]] = domRows(span.parentElement.parentElement);
	}
	return out;
}

/** "Name [label]" + text lines, blocks separated by a blank line, after the feedback message. */
function excelRows(cell, feedbackMessage) {
	const blocks = cell ? cell.split("\n\n") : [];
	if (feedbackMessage && blocks[0] === feedbackMessage) blocks.shift();
	return blocks.map((block) => {
		const [header, ...lines] = block.split("\n");
		const m = header.match(/^(.*) \[(.*)\]$/);
		const main = lines.filter((l) => !l.startsWith(IMPROVEMENT_PREFIX));
		const improvement = lines.filter((l) => l.startsWith(IMPROVEMENT_PREFIX));
		expect(main.length).toBeLessThanOrEqual(1);
		expect(improvement.length).toBeLessThanOrEqual(1);
		return { label: m[2], row: [m[1], main[0] || null, improvement[0] ? stripImprovement(improvement[0]) : null] };
	});
}

function exportedTurnCells(conv) {
	const appendSpy = jest.spyOn(XLSX.utils, "book_append_sheet");
	try {
		exportConversationToExcel(conv, "משתתף_01");
		const grid = XLSX.utils.sheet_to_json(appendSpy.mock.calls[0][1], { header: 1, defval: "" });
		const headerIdx = grid.findIndex((r) => r[0] === "תור" && r[3] === "משוב PCK");
		const cells = {};
		for (let i = headerIdx + 1; i < grid.length && grid[i][0] !== ""; i++) cells[grid[i][0]] = grid[i][3];
		return cells;
	} finally {
		appendSpy.mockRestore();
	}
}

function parseCSV(text) {
	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
			else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ",") { row.push(field); field = ""; }
		else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
		else field += c;
	}
	row.push(field);
	rows.push(row);
	return rows;
}

const click = (el) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

/** Renders the admin page on the fixture, opens it, marks every turn and exports the model-output CSV. */
async function renderAdminAndExport() {
	getAllConversations.mockResolvedValue({ conversations: [conversation], error: null });
	getConversation.mockResolvedValue({ conversation, error: null });
	const blobs = [];
	const OriginalBlob = global.Blob;
	const originalCreateObjectURL = URL.createObjectURL;
	global.Blob = function CapturedBlob(parts) { blobs.push(parts.join("")); };
	URL.createObjectURL = jest.fn(() => "blob:test");
	const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
	const view = render(<AdminConversationLogs />);
	try {
		await flush();
		click(view.container.querySelector('div[style*="cursor: pointer"]'));
		await flush();
		const screenRows = detailRowsByTurn(view.container);
		const markButtons = Array.from(view.container.querySelectorAll("button")).filter((b) => b.textContent.includes("סמן לייצוא"));
		expect(markButtons).toHaveLength(conversation.turns.length);
		for (const button of markButtons) click(button);
		click(Array.from(view.container.querySelectorAll("button")).find((b) => b.textContent.includes("ייצא פלט מודל")));
		expect(blobs).toHaveLength(1);
		return { screenRows, csv: parseCSV(blobs[0].replace(/^﻿/, "")) };
	} finally {
		view.unmount();
		clickSpy.mockRestore();
		global.Blob = OriginalBlob;
		URL.createObjectURL = originalCreateObjectURL;
	}
}

/** CSV skill columns of one exported turn → { skill_id: { score, row } } for every non-"לא רלוונטי", non-empty pair. */
function csvSkillCells(csvRow) {
	const out = {};
	SKILL_IDS.forEach((id, k) => {
		const score = csvRow[5 + 2 * k];
		const explanation = csvRow[6 + 2 * k];
		if (score === "לא רלוונטי" || (score === "" && explanation === "")) return;
		const lines = explanation ? explanation.split("\n") : [];
		const main = lines.filter((l) => !l.startsWith(IMPROVEMENT_PREFIX));
		const improvement = lines.filter((l) => l.startsWith(IMPROVEMENT_PREFIX));
		out[id] = { score, row: [nameOf(id), main[0] || null, improvement[0] ? stripImprovement(improvement[0]) : null] };
	});
	return out;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("the view-model matches the hand-written contract", () => {
	it("the fixture is a valid stored conversation document apart from the deliberately malformed score-less row", () => {
		expect(validateConversationDoc(conversation)).toEqual(["turns[2]: skills_assessment[1] score undefined not in 0/1/2"]);
	});

	it.each([1, 2, 3, 4, 5, 6])("turn %i", (n) => {
		expect(viewModelRows(turnFeedback(n))).toEqual(expectedByName(n));
	});
});

describe("teacher sidebar", () => {
	it.each([1, 2, 3, 4, 6])("turn %i shows the same rows as the view-model", (n) => {
		const view = render(<PCKFeedbackSidebar feedback={turnFeedback(n)} isVisible={true} />);
		try {
			expect(domRows(view.container)).toEqual(expectedByName(n));
		} finally {
			view.unmount();
		}
	});
});

describe("conversation-log viewer (ConversationDetail)", () => {
	it("shows, per turn, the same rows as the sidebar / view-model, and none of the never-shown text", () => {
		const view = render(<ConversationDetail log={conversation} onExport={() => {}} onGenerateSummary={() => {}} onViewSummary={() => {}} isLoadingSummary={false} />);
		try {
			const byTurn = detailRowsByTurn(view.container);
			for (const n of [1, 2, 3, 4, 5, 6]) expect([n, byTurn[n]]).toEqual([n, expectedByName(n)]);
			for (const text of NEVER_SHOWN) expect(view.container.textContent).not.toContain(text);
		} finally {
			view.unmount();
		}
	});
});

describe("admin viewer", () => {
	it("on screen: the same rows as the sidebar / view-model", async () => {
		const { screenRows } = await renderAdminAndExport();
		for (const n of [1, 2, 3, 4, 5, 6]) expect([n, screenRows[n]]).toEqual([n, expectedByName(n)]);
	});

	it("model-output CSV: same score column and the same per-skill text (both parts of a score-1 row in one cell)", async () => {
		const { csv } = await renderAdminAndExport();
		const [header, ...rows] = csv;
		expect(header).toHaveLength(5 + 2 * SKILL_IDS.length + 1); // column structure unchanged
		expect(rows).toHaveLength(conversation.turns.length);
		for (const csvRow of rows) {
			const n = Number(csvRow[2]);
			const cells = csvSkillCells(csvRow);
			const feedback = turnFeedback(n);
			if (n === 4 || n === 5) {
				// Legacy feedback (no skills_assessment) and turns without feedback keep empty skill columns (unchanged).
				expect(cells).toEqual({});
				continue;
			}
			const expected = Object.fromEntries(EXPECTED[n].map(([id, main, imp]) => [id, [nameOf(id), main, imp]]));
			expect([n, Object.fromEntries(Object.entries(cells).map(([id, c]) => [id, c.row]))]).toEqual([n, expected]);
			for (const [id, c] of Object.entries(cells)) {
				const entry = feedback.skills_assessment.find((s) => s.skill_id === id);
				expect(c.score).toBe(entry.score === undefined ? "" : String(entry.score)); // score copied, never changed
			}
			expect(csvRow[csvRow.length - 1]).toBe(feedback.feedback_message);
		}
		for (const text of NEVER_SHOWN) expect(csv.flat().join("\n")).not.toContain(text);
	});
});

describe("Excel export", () => {
	it("each turn's PCK cell has the same rows, labels for the score, and both parts of a score-1 row", () => {
		const cells = exportedTurnCells(conversation);
		for (const n of [1, 2, 3, 4, 5, 6]) {
			const feedback = turnFeedback(n);
			const parsed = excelRows(cells[n], feedback && feedback.feedback_message);
			expect([n, parsed.map((p) => p.row)]).toEqual([n, expectedByName(n)]);
			const labels = parsed.map((p) => p.label);
			const scoreLabels = buildPckDisplayRows(feedback).map((r) => (contract.score_labels_he[r.score] !== undefined ? contract.score_labels_he[r.score] : ""));
			expect(labels).toEqual(scoreLabels);
		}
		expect(cells[3]).toContain("T3-APR-DEMO\nלשיפור: T3-APR-IMP");
		for (const text of NEVER_SHOWN) expect(Object.values(cells).join("\n")).not.toContain(text);
	});
});

describe("all views agree", () => {
	it("sidebar, conversation-log viewer, admin viewer and Excel export show identical per-skill text", async () => {
		const detail = render(<ConversationDetail log={conversation} onExport={() => {}} onGenerateSummary={() => {}} onViewSummary={() => {}} isLoadingSummary={false} />);
		const logRows = detailRowsByTurn(detail.container);
		detail.unmount();
		const { screenRows } = await renderAdminAndExport();
		const excel = exportedTurnCells(conversation);
		for (const n of [1, 2, 3, 4, 6]) {
			const feedback = turnFeedback(n);
			const sidebar = render(<PCKFeedbackSidebar feedback={feedback} isVisible={true} />);
			const sidebarRows = domRows(sidebar.container);
			sidebar.unmount();
			const excelView = excelRows(excel[n], feedback.feedback_message).map((p) => p.row);
			expect({ n, log: logRows[n], admin: screenRows[n], excel: excelView, model: viewModelRows(feedback) })
				.toEqual({ n, log: sidebarRows, admin: sidebarRows, excel: sidebarRows, model: sidebarRows });
		}
	});

	it("uses the shared improvement label", () => {
		expect(PCK_IMPROVEMENT_LABEL + " ").toBe(IMPROVEMENT_PREFIX);
	});
});
