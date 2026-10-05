// Invariants A5 (skill ids / Hebrew names) and B11 (score vocabulary): the five-skill map is
// duplicated across several files; this catches drift. Also covers how the sidebar renders
// skills_assessment rows.
//
// Deliberately NOT asserted (B12, decided DO NOT PROTECT): that score-1 rows hide the
// improvement suggestion. Only "score-1 shows the evidence" is asserted, which stays true after
// the planned change. Also not asserted: the number of rows (the 1-2 cap is not enforced yet, B8),
// or the exact empty-state placeholder text (B10, REVIEW: waiting / no-feedback / failure states may
// be distinguished later).
import React from "react";
import fs from "fs";
import path from "path";
import { PCKFeedbackSidebar } from "../components/PCKFeedbackSidebar";
import { render } from "../testUtils/dom";
import contract from "../testUtils/contracts/pckSkillsContract.json";

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function extractSkillNameMap(source) {
	const block = source.match(/const SKILL_NAMES_HE = \{([\s\S]*?)\};/);
	if (!block) return null;
	const map = {};
	for (const [, id, he] of block[1].matchAll(/'([\w-]+)'\s*:\s*'([^']+)'/g)) map[id] = he;
	return map;
}

const CONTRACT_MAP = Object.fromEntries(contract.skills.map((s) => [s.skill_id, s.he]));

describe("skill name maps stay consistent with the contract", () => {
	it.each([
		"src/components/PCKFeedbackSidebar.jsx",
		"src/services/exportConversationExcel.js",
		"src/pages/ConversationLogs.jsx",
		"src/pages/AdminConversationLogs.jsx",
	])("%s", (file) => {
		expect(extractSkillNameMap(read(file))).toEqual(CONTRACT_MAP);
	});

	it("real-time PCK prompt lists every skill with its Hebrew name", () => {
		const server = read("server/server.js");
		for (const { skill_id, he } of contract.skills) expect(server).toContain(`${skill_id} → "${he}"`);
	});

	it("Excel score labels match the sidebar legend vocabulary", () => {
		const labels = read("src/services/exportConversationExcel.js").match(/const SCORE_LABELS = (\{[^}]*\})/)[1];
		for (const [score, label] of Object.entries(contract.score_labels_he)) expect(labels).toContain(`${score}: '${label}'`);
	});
});

describe("PCKFeedbackSidebar", () => {
	const feedback = {
		skills_assessment: [
			{ skill_id: "error-identification", is_relevant: true, score: 2, evidence: "EVIDENCE-2" },
			{ skill_id: "error-characterization", is_relevant: true, score: 1, evidence: "EVIDENCE-1", what_could_be_better: "SUGGESTION-1" },
			{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 0, what_could_be_better: "SUGGESTION-0" },
			{ skill_id: "error-leveraging", is_relevant: false, reason_not_relevant: "IRRELEVANT-REASON" },
		],
		detected_skills: [],
		missed_opportunities: [],
	};

	let view;
	afterEach(() => view && view.unmount());

	it("renders no skills or legend when there is no feedback", () => {
		view = render(<PCKFeedbackSidebar feedback={null} isVisible={true} />);
		for (const { he } of contract.skills) expect(view.container.textContent).not.toContain(he);
		for (const label of Object.values(contract.score_labels_he)) expect(view.container.textContent).not.toContain(label);
	});

	it("shows the 2/1/0 legend with the contract labels", () => {
		view = render(<PCKFeedbackSidebar feedback={feedback} isVisible={true} />);
		for (const label of Object.values(contract.score_labels_he)) expect(view.container.textContent).toContain(label);
	});

	it("renders relevant skills by Hebrew name with the right text per score", () => {
		view = render(<PCKFeedbackSidebar feedback={feedback} isVisible={true} />);
		const text = view.container.textContent;
		expect(text).toContain("זיהוי השגיאה: EVIDENCE-2");
		expect(text).toContain("אפיון סוג השגיאה");
		expect(text).toContain("EVIDENCE-1");
		expect(text).toContain("תגובה פדגוגית מותאמת: SUGGESTION-0");
	});

	it("does not render irrelevant skills", () => {
		view = render(<PCKFeedbackSidebar feedback={feedback} isVisible={true} />);
		expect(view.container.textContent).not.toContain("מינוף השגיאה ללמידה");
		expect(view.container.textContent).not.toContain("IRRELEVANT-REASON");
	});

	it("falls back to detected_skills / missed_opportunities for legacy feedback (A13)", () => {
		view = render(
			<PCKFeedbackSidebar
				isVisible={true}
				feedback={{
					detected_skills: [{ skill_id: "error-identification", evidence: "LEGACY-EVIDENCE" }],
					missed_opportunities: [{ skill_id: "error-leveraging", what_could_have_been_done: "LEGACY-MISSED" }],
				}}
			/>
		);
		expect(view.container.textContent).toContain("זיהוי השגיאה: LEGACY-EVIDENCE");
		expect(view.container.textContent).toContain("מינוף השגיאה ללמידה: LEGACY-MISSED");
	});
});
