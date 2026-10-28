// PCK sidebar display contract (1.4.3): a pure view-model that turns the PCK feedback object into display rows
// using ONLY text the model already returned. It never invents text, never changes score / relevance / the
// show-hide decision, and never mutates the feedback object. See research/simulator_audit/pck_row_text_contract_experiment.md.
// 1.5.1 row-text fix (post_1.5_feedback_investigation.md §A): score-0 rows fall back to the matching
// missed_opportunities text; rows with no text at all can be left out (dropEmpty, teacher-facing views); the
// per-score requirement is meetsPckRowContract (2 positive; 1 positive + improvement; 0 improvement).
import { buildPckDisplayRows, countRowsWithoutText, countRowsMissingPositive, formatPckRowText, isEmptyPckRow, matchDemonstratedEvidence, matchMissedImprovement, meetsPckRowContract, pckRowText } from "../services/pckDisplayRows";

const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)); return Object.freeze(o); };

const row = (rows, skillId) => rows.find((r) => r.skillId === skillId);

describe("score 0: what is missing / could be improved", () => {
	it("shows the skill's own improvement and no positive part", () => {
		const rows = buildPckDisplayRows({ skills_assessment: [{ skill_id: "error-identification", is_relevant: true, score: 0, what_could_be_better: "MISSED", evidence: "" }] });
		expect(rows).toEqual([{ skillId: "error-identification", score: 0, positive: null, improvement: "MISSED", positiveSource: null, improvementSource: "what_could_be_better" }]);
	});

	it("missing own improvement: falls back to the matching missed_opportunities item, never to demonstrated_skills", () => {
		const rows = buildPckDisplayRows({
			skills_assessment: [{ skill_id: "error-identification", is_relevant: true, score: 0, what_could_be_better: "" }],
			detected_skills: [{ skill_id: "error-identification", evidence: "SHOULD-NOT-SHOW" }],
			missed_opportunities: [{ skill_id: "error-identification", what_could_have_been_done: "FROM-MISSED" }],
		});
		expect(row(rows, "error-identification")).toEqual({ skillId: "error-identification", score: 0, positive: null, improvement: "FROM-MISSED", positiveSource: null, improvementSource: "missed_opportunities" });
	});

	it("own improvement wins over missed_opportunities", () => {
		const rows = buildPckDisplayRows({
			skills_assessment: [{ skill_id: "error-identification", is_relevant: true, score: 0, what_could_be_better: "OWN" }],
			missed_opportunities: [{ skill_id: "error-identification", what_could_have_been_done: "NOT-USED" }],
		});
		expect(rows[0].improvement).toBe("OWN");
	});

	it("an ambiguous or empty missed_opportunities item is not used", () => {
		expect(matchMissedImprovement([{ skill_id: "x", what_could_have_been_done: "A" }, { skill_id: "x", what_could_have_been_done: "B" }], "x")).toBeNull();
		expect(matchMissedImprovement([{ skill_id: "x", what_could_have_been_done: "  " }], "x")).toBeNull();
		expect(matchMissedImprovement(null, "x")).toBeNull();
	});
});

describe("score 1: what was done well AND what to improve", () => {
	it("both fields present: own evidence + own improvement", () => {
		const rows = buildPckDisplayRows({ skills_assessment: [{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 1, evidence: "DID-WELL", what_could_be_better: "TO-IMPROVE" }] });
		expect(rows[0]).toEqual({ skillId: "adapted-pedagogical-response", score: 1, positive: "DID-WELL", improvement: "TO-IMPROVE", positiveSource: "evidence", improvementSource: "what_could_be_better" });
	});

	it("missing evidence: the positive part falls back to the matching demonstrated_skills item", () => {
		const rows = buildPckDisplayRows({
			skills_assessment: [{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 1, what_could_be_better: "TO-IMPROVE" }],
			detected_skills: [{ skill_id: "error-identification", evidence: "OTHER-SKILL" }, { skill_id: "adapted-pedagogical-response", evidence: "FROM-DEMONSTRATED" }],
		});
		expect(rows[0]).toEqual({ skillId: "adapted-pedagogical-response", score: 1, positive: "FROM-DEMONSTRATED", improvement: "TO-IMPROVE", positiveSource: "demonstrated_skills", improvementSource: "what_could_be_better" });
	});

	it("no positive text anywhere: shows the improvement only (nothing invented)", () => {
		const rows = buildPckDisplayRows({ skills_assessment: [{ skill_id: "error-leveraging", is_relevant: true, score: 1, evidence: "  ", what_could_be_better: "TO-IMPROVE" }] });
		expect(rows[0]).toEqual({ skillId: "error-leveraging", score: 1, positive: null, improvement: "TO-IMPROVE", positiveSource: null, improvementSource: "what_could_be_better" });
	});
});

describe("score 2: positive evidence only, never a recommendation", () => {
	it("own evidence", () => {
		const rows = buildPckDisplayRows({ skills_assessment: [{ skill_id: "error-identification", is_relevant: true, score: 2, evidence: "DONE-WELL", what_could_be_better: "A-RECOMMENDATION" }] });
		expect(rows[0]).toEqual({ skillId: "error-identification", score: 2, positive: "DONE-WELL", improvement: null, positiveSource: "evidence", improvementSource: null });
	});

	it("missing evidence: falls back to the matching demonstrated_skills item", () => {
		const rows = buildPckDisplayRows({
			skills_assessment: [{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 2, what_could_be_better: "" }],
			detected_skills: [{ skill_id: "adapted-pedagogical-response", evidence: "FROM-DEMONSTRATED" }],
		});
		expect(rows[0]).toEqual({ skillId: "adapted-pedagogical-response", score: 2, positive: "FROM-DEMONSTRATED", improvement: null, positiveSource: "demonstrated_skills", improvementSource: null });
	});

	it("text only in what_could_be_better is NOT shown for score 2 (its contract meaning is an improvement)", () => {
		const rows = buildPckDisplayRows({ skills_assessment: [{ skill_id: "error-leveraging", is_relevant: true, score: 2, what_could_be_better: "MISPLACED-OR-RECOMMENDATION" }] });
		expect(rows[0]).toEqual({ skillId: "error-leveraging", score: 2, positive: null, improvement: null, positiveSource: null, improvementSource: null });
	});

	it("no usable text anywhere: an empty row, counted by countRowsWithoutText", () => {
		const rows = buildPckDisplayRows({ skills_assessment: [{ skill_id: "error-leveraging", is_relevant: true, score: 2 }], detected_skills: [] });
		expect(rows[0].positive).toBeNull();
		expect(countRowsWithoutText(rows)).toBe(1);
	});
});

describe("deterministic skill matching for demonstrated_skills", () => {
	it("matches only an exact skill_id with non-empty evidence", () => {
		const demonstrated = [
			{ skill_id: "error-identification", evidence: "EI" },
			{ skill_id: "Error-Identification", evidence: "WRONG-CASE" },
			{ skill_id: "adapted-pedagogical-response", evidence: "" },
		];
		expect(matchDemonstratedEvidence(demonstrated, "error-identification")).toBe("EI");
		expect(matchDemonstratedEvidence(demonstrated, "adapted-pedagogical-response")).toBeNull();
		expect(matchDemonstratedEvidence(demonstrated, "error-leveraging")).toBeNull();
	});

	it("an ambiguous skill_id (more than one item) is not used", () => {
		const demonstrated = [{ skill_id: "error-identification", evidence: "ONE" }, { skill_id: "error-identification", evidence: "TWO" }];
		expect(matchDemonstratedEvidence(demonstrated, "error-identification")).toBeNull();
	});

	it("tolerates missing or malformed arrays", () => {
		expect(matchDemonstratedEvidence(undefined, "error-identification")).toBeNull();
		expect(matchDemonstratedEvidence([null, { evidence: "X" }, "str"], "error-identification")).toBeNull();
		expect(matchDemonstratedEvidence([{ skill_id: "error-identification", evidence: { "מה קיים": "x" } }], "error-identification")).toBeNull();
	});
});

describe("never changes the PCK decision, relevance or scores", () => {
	const feedback = deepFreeze({
		skills_assessment: [
			{ skill_id: "error-identification", is_relevant: true, score: 2 },
			{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 1, what_could_be_better: "I" },
			{ skill_id: "error-leveraging", is_relevant: false, reason_not_relevant: "R" },
		],
		detected_skills: [{ skill_id: "error-identification", evidence: "E" }],
		missed_opportunities: [],
		should_display: true,
	});

	it("does not mutate the feedback object (deep-frozen input)", () => {
		expect(() => buildPckDisplayRows(feedback)).not.toThrow();
	});

	it("returns exactly the relevant skills, in order, with their scores unchanged", () => {
		const rows = buildPckDisplayRows(feedback);
		expect(rows.map((r) => [r.skillId, r.score])).toEqual([["error-identification", 2], ["adapted-pedagogical-response", 1]]);
	});

	it("no feedback means no rows (never turns hidden feedback into rows)", () => {
		expect(buildPckDisplayRows(null)).toEqual([]);
		expect(buildPckDisplayRows(undefined)).toEqual([]);
	});
});

describe("legacy stored feedback stays readable", () => {
	it("no relevant skills_assessment: rows from detected_skills (score 2) and missed_opportunities (score 0), as before", () => {
		const rows = buildPckDisplayRows({
			detected_skills: [{ skill_id: "error-identification", evidence: "LEGACY-EVIDENCE" }],
			missed_opportunities: [{ skill_id: "error-leveraging", what_could_have_been_done: "LEGACY-MISSED" }],
		});
		expect(rows).toEqual([
			{ skillId: "error-identification", score: 2, positive: "LEGACY-EVIDENCE", improvement: null, positiveSource: "detected_skills", improvementSource: null },
			{ skillId: "error-leveraging", score: 0, positive: null, improvement: "LEGACY-MISSED", positiveSource: null, improvementSource: "missed_opportunities" },
		]);
	});

	it("pilot-era rows that already carry evidence are shown exactly as before (score 2 / score 0), score 1 now also shows the improvement", () => {
		const rows = buildPckDisplayRows({
			skills_assessment: [
				{ skill_id: "error-identification", is_relevant: true, score: 2, evidence: "PILOT-2" },
				{ skill_id: "error-characterization", is_relevant: true, score: 1, evidence: "PILOT-1", what_could_be_better: "PILOT-1-IMPROVE" },
				{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 0, what_could_be_better: "PILOT-0" },
			],
		});
		expect(rows.map((r) => [r.positive, r.improvement])).toEqual([["PILOT-2", null], ["PILOT-1", "PILOT-1-IMPROVE"], [null, "PILOT-0"]]);
	});

	it("a relevant row with a missing or out-of-range score keeps the current treatment (text from what_could_be_better)", () => {
		const rows = buildPckDisplayRows({ skills_assessment: [{ skill_id: "error-identification", is_relevant: true, what_could_be_better: "NO-SCORE" }] });
		expect(rows[0]).toEqual({ skillId: "error-identification", score: undefined, positive: null, improvement: "NO-SCORE", positiveSource: null, improvementSource: "what_could_be_better" });
	});
});

describe("teacher-facing rows never include an empty row (1.5.1 fix)", () => {
	const feedback = {
		skills_assessment: [
			{ skill_id: "error-identification", is_relevant: true, score: 2, evidence: "SEEN" },
			{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 2 },
			{ skill_id: "error-leveraging", is_relevant: true, score: 1, what_could_be_better: "IMPROVE-ONLY" },
			{ skill_id: "error-characterization", is_relevant: true, score: 0 },
		],
		detected_skills: [],
		missed_opportunities: [],
	};

	it("dropEmpty leaves out rows with no text at all, keeping order, scores and partial rows", () => {
		const rows = buildPckDisplayRows(feedback, { dropEmpty: true });
		expect(rows.map((r) => [r.skillId, r.score])).toEqual([["error-identification", 2], ["error-leveraging", 1]]);
		rows.forEach((r) => expect(isEmptyPckRow(r)).toBe(false));
	});

	it("without dropEmpty every relevant skill keeps its row (research exports keep the scores)", () => {
		expect(buildPckDisplayRows(feedback).map((r) => r.skillId)).toEqual(["error-identification", "adapted-pedagogical-response", "error-leveraging", "error-characterization"]);
		expect(countRowsWithoutText(buildPckDisplayRows(feedback))).toBe(2);
	});

	it("meetsPckRowContract: 2 needs positive; 1 needs positive AND improvement; 0 needs improvement", () => {
		expect(meetsPckRowContract({ score: 2, positive: "P", improvement: null })).toBe(true);
		expect(meetsPckRowContract({ score: 2, positive: null, improvement: "I" })).toBe(false);
		expect(meetsPckRowContract({ score: 1, positive: "P", improvement: "I" })).toBe(true);
		expect(meetsPckRowContract({ score: 1, positive: null, improvement: "I" })).toBe(false);
		expect(meetsPckRowContract({ score: 1, positive: "P", improvement: null })).toBe(false);
		expect(meetsPckRowContract({ score: 0, positive: null, improvement: "I" })).toBe(true);
		expect(meetsPckRowContract({ score: 0, positive: null, improvement: null })).toBe(false);
		expect(meetsPckRowContract(null)).toBe(false);
	});

	it("countRowsMissingPositive counts score-1 rows shown with the improvement only", () => {
		expect(countRowsMissingPositive(buildPckDisplayRows(feedback))).toBe(1);
		expect(countRowsMissingPositive(null)).toBe(0);
	});
});

describe("countRowsWithoutText (content-free count)", () => {
	it("counts rows whose display has no text at all", () => {
		const rows = [
			{ score: 2, positive: "x", improvement: null },
			{ score: 2, positive: null, improvement: null },
			{ score: 1, positive: null, improvement: "y" },
			{ score: 1, positive: null, improvement: null },
			{ score: 0, positive: null, improvement: null },
			{ score: 0, positive: null, improvement: "z" },
		];
		expect(countRowsWithoutText(rows)).toBe(3);
		expect(countRowsWithoutText([])).toBe(0);
		expect(countRowsWithoutText(null)).toBe(0);
	});
});

describe("row text (shared by the sidebar, log viewers and exports)", () => {
	it("score 2: positive as the main text, no improvement", () => {
		const r = { score: 2, positive: "P", improvement: null };
		expect(pckRowText(r)).toEqual({ main: "P", improvement: null });
		expect(formatPckRowText(r)).toBe("P");
	});

	it("score 1 with both parts: positive, then the improvement on its own labelled line", () => {
		const r = { score: 1, positive: "P", improvement: "I" };
		expect(pckRowText(r)).toEqual({ main: "P", improvement: "I" });
		expect(formatPckRowText(r)).toBe("P\nלשיפור: I");
	});

	it("score 1 with the improvement only: just the labelled improvement line", () => {
		const r = { score: 1, positive: null, improvement: "I" };
		expect(pckRowText(r)).toEqual({ main: null, improvement: "I" });
		expect(formatPckRowText(r)).toBe("לשיפור: I");
	});

	it("score 0 / missing score: the improvement as the main text (unchanged)", () => {
		expect(pckRowText({ score: 0, positive: null, improvement: "I" })).toEqual({ main: "I", improvement: null });
		expect(formatPckRowText({ score: undefined, positive: null, improvement: "I" })).toBe("I");
	});

	it("a row without text, or no row: empty", () => {
		expect(pckRowText({ score: 2, positive: null, improvement: null })).toEqual({ main: null, improvement: null });
		expect(formatPckRowText({ score: 2, positive: null, improvement: null })).toBe("");
		expect(formatPckRowText(null)).toBe("");
	});
});
