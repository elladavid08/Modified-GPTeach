// 1.5.1 row-text fix: the server copy of the PCK row-text rule (server/pck_row_text.js, used for the
// /api/pck-feedback completeness re-ask and the /api/pck-summary input) must give exactly the text the client
// view-model (src/services/pckDisplayRows.js, used by the sidebar, viewers and exports) gives. The server cannot
// import from src and CRA cannot import outside src, so the rule exists twice; this test keeps them identical.
import { buildAssessedPckRow, buildPckDisplayRows, isEmptyPckRow as clientIsEmpty } from "../services/pckDisplayRows";
import { buildPckRow, buildPckRows, isEmptyPckRow as serverIsEmpty, countEmptyShownRows } from "../../server/pck_row_text.js";

const ID = "diagnostic-interpretation";
const OTHER = "error-identification";
const TEXTS = [undefined, null, "", "   ", "TEXT", "  PADDED  ", 7];
const SCORES = [0, 1, 2, undefined, 3, "2"];
const LISTS = {
	absent: undefined,
	notArray: "DEMO",
	empty: [],
	single: (field) => [{ skill_id: ID, [field]: "LIST-TEXT" }],
	singleBlank: (field) => [{ skill_id: ID, [field]: "  " }],
	ambiguous: (field) => [{ skill_id: ID, [field]: "A" }, { skill_id: ID, [field]: "B" }],
	otherSkill: (field) => [{ skill_id: OTHER, [field]: "OTHER-TEXT" }],
	withJunk: (field) => [null, "x", { skill_id: ID, [field]: "LIST-TEXT" }],
};
const list = (kind, field) => (typeof LISTS[kind] === "function" ? LISTS[kind](field) : LISTS[kind]);
const textOf = (row) => ({ skillId: row.skillId, score: row.score, positive: row.positive, improvement: row.improvement });

describe("server and client build identical row text", () => {
	it("for every combination of score, own fields and fallback lists", () => {
		let cases = 0;
		for (const score of SCORES)
			for (const evidence of TEXTS)
				for (const better of TEXTS)
					for (const demoKind of Object.keys(LISTS))
						for (const missedKind of Object.keys(LISTS)) {
							const s = { skill_id: ID, is_relevant: true, score, evidence, what_could_be_better: better };
							const demonstrated = list(demoKind, "evidence");
							const missed = list(missedKind, "what_could_have_been_done");
							const client = buildAssessedPckRow(s, demonstrated, missed);
							const server = buildPckRow(s, demonstrated, missed);
							expect([score, evidence, better, demoKind, missedKind, server]).toEqual([score, evidence, better, demoKind, missedKind, textOf(client)]);
							expect(serverIsEmpty(server)).toBe(clientIsEmpty(client));
							cases++;
						}
		expect(cases).toBe(SCORES.length * TEXTS.length * TEXTS.length * Object.keys(LISTS).length ** 2);
	});

	it("over a whole analysis: the same relevant skills, in the same order, with the same text", () => {
		const skills = [
			{ skill_id: "error-identification", is_relevant: true, score: 2 },
			{ skill_id: "error-characterization", is_relevant: false, score: 0, what_could_be_better: "NOT-RELEVANT" },
			{ skill_id: "diagnostic-interpretation", is_relevant: true, score: 1, what_could_be_better: "DI-IMP" },
			null,
			{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 0 },
			{ skill_id: "error-leveraging", is_relevant: "true", score: 2, evidence: "STRING-RELEVANCE" },
		];
		const demonstrated = [{ skill_id: "error-identification", evidence: "EI-DEMO" }];
		const missed = [{ skill_id: "adapted-pedagogical-response", what_could_have_been_done: "APR-MISSED" }];
		const client = buildPckDisplayRows({ skills_assessment: skills, detected_skills: demonstrated, missed_opportunities: missed }).map(textOf);
		const server = buildPckRows(skills, demonstrated, missed);
		expect(server).toEqual(client);
		expect(server.map((r) => [r.skillId, r.positive, r.improvement])).toEqual([
			["error-identification", "EI-DEMO", null],
			["diagnostic-interpretation", null, "DI-IMP"],
			["adapted-pedagogical-response", null, "APR-MISSED"],
		]);
	});

	it("the server re-ask counts exactly the rows the teacher views leave out, and only for shown feedback", () => {
		const skills = [
			{ skill_id: "error-identification", is_relevant: true, score: 2 },
			{ skill_id: "diagnostic-interpretation", is_relevant: true, score: 1, what_could_be_better: "DI-IMP" },
			{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 0, what_could_be_better: "" },
		];
		const analysis = { should_provide_feedback: true, skills_assessment: skills, demonstrated_skills: [], missed_opportunities: [] };
		const feedback = { skills_assessment: skills, detected_skills: [], missed_opportunities: [] };
		const dropped = buildPckDisplayRows(feedback).length - buildPckDisplayRows(feedback, { dropEmpty: true }).length;
		expect(countEmptyShownRows(analysis)).toBe(dropped);
		expect(dropped).toBe(2);
		expect(countEmptyShownRows({ ...analysis, should_provide_feedback: false })).toBe(0);
		expect(countEmptyShownRows(null)).toBe(0);
	});
});
