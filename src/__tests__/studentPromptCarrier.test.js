// 1.5.0 misconception carrier (research/simulator_audit/student_misconception_carrier_experiment.md, release
// validation §9). Protects:
//   - the session carrier is chosen once from the fixed cast by a fixed rule ("first-non-low-v1");
//   - with a carrier, the student system prompt is exactly the validated prototype v1 (frozen hashes in
//     fixtures/studentPromptCarrierV1.json, generated from the prototype applied to the 1.4.4 ai.js);
//   - without a carrier (no misconception_carrier on the scenario) it is exactly the 1.4.4 prompt;
//   - PCK steering cannot by itself resolve the carrier's misconception (header + exception paragraph), while the
//     PCK analysis is still passed through unchanged;
//   - the carrier changes the system prompt only (history untouched).
import crypto from "crypto";
import callAI from "../utils/ai.js";
import ChatMessage from "../objects/ChatMessage";
import { generateWithGenAI } from "../services/genai";
import personas from "../config/students/personas";
import scenarios from "../config/scenarios/geometry_scenarios";
import frozen from "./fixtures/studentPromptCarrierV1.json";
import {
	MISCONCEPTION_CARRIER_RULE,
	selectMisconceptionCarrier,
	withMisconceptionCarrier,
} from "../services/misconceptionCarrier";

jest.mock("../services/genai", () => ({
	generateWithGenAI: jest.fn(),
	generateWithGenAICompletion: jest.fn(),
}));

const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const cast = (names) => names.map((n) => personas.students[n]);
const teacher = new ChatMessage("Teacher", "שאלה?", "user");

async function systemPrompt(scenario, students, impact = null, addendum = "") {
	generateWithGenAI.mockClear();
	generateWithGenAI.mockResolvedValue(JSON.stringify({ responses: [] }));
	const history = { toAIformat: () => [teacher.toAIformat()], toString: () => "" };
	await new Promise((resolve) => callAI(history, students, scenario, addendum, impact, resolve));
	return generateWithGenAI.mock.calls[0][0];
}

describe("selectMisconceptionCarrier (session rule first-non-low-v1)", () => {
	const p = (id, baseline) => ({ id, name: `N-${id}`, participation: { baseline } });
	const focus = { misconception_focus: "M" };

	it("chooses the first cast member whose participation baseline is not low", () => {
		expect(selectMisconceptionCarrier([p("a", "low"), p("b", "high"), p("c", "medium")], focus)).toEqual({
			name: "N-b",
			personaId: "b",
			rule: MISCONCEPTION_CARRIER_RULE,
		});
		expect(selectMisconceptionCarrier([p("a", "medium"), p("b", "high")], focus).name).toBe("N-a");
	});

	it("falls back to the first cast member when all are low", () => {
		expect(selectMisconceptionCarrier([p("a", "low"), p("b", "low")], focus).name).toBe("N-a");
	});

	it("is deterministic for the same cast", () => {
		const students = cast(["רועי", "תמר", "הילה"]);
		expect(selectMisconceptionCarrier(students, scenarios.scenarios[0])).toEqual(
			selectMisconceptionCarrier(students, scenarios.scenarios[0])
		);
		expect(selectMisconceptionCarrier(students, scenarios.scenarios[0])).toEqual({
			name: "תמר",
			personaId: "tamar",
			rule: "first-non-low-v1",
		});
	});

	it("chooses nobody for a scenario without a misconception focus, or an empty cast", () => {
		expect(selectMisconceptionCarrier(cast(["תמר"]), { text: "x" })).toBeNull();
		expect(selectMisconceptionCarrier(cast(["תמר"]), null)).toBeNull();
		expect(selectMisconceptionCarrier([], focus)).toBeNull();
	});

	it("every configured scenario has a misconception focus, so every session gets a carrier", () => {
		for (const scenario of scenarios.scenarios) expect(scenario.misconception_focus).toBeTruthy();
	});

	it("withMisconceptionCarrier adds only the carrier name, on a copy; no carrier returns the scenario itself", () => {
		const scenario = scenarios.scenarios[0];
		const carrier = selectMisconceptionCarrier(cast(["רועי", "תמר", "הילה"]), scenario);
		const studentScenario = withMisconceptionCarrier(scenario, carrier);
		expect(studentScenario).toEqual({ ...scenario, misconception_carrier: "תמר" });
		expect(studentScenario).not.toBe(scenario);
		expect(scenario).not.toHaveProperty("misconception_carrier");
		expect(withMisconceptionCarrier(scenario, null)).toBe(scenario);
	});
});

describe("student system prompt is frozen to the validated prototype v1", () => {
	it("covers every configured scenario", () => {
		expect(new Set(frozen.cases.map((c) => c.scenarioIndex))).toEqual(new Set(scenarios.scenarios.map((_s, i) => i)));
	});

	it.each(frozen.cases.map((c) => [`s${c.scenarioIndex + 1} ${c.cast.join(",")} impact=${c.impact} addendum=${c.addendum}`, c]))(
		"%s",
		async (_label, c) => {
			const students = cast(c.cast);
			const scenario = scenarios.scenarios[c.scenarioIndex];
			const impact = frozen.impacts[c.impact];
			const addendum = frozen.addenda[c.addendum];
			const carrier = selectMisconceptionCarrier(students, scenario);
			expect(carrier.name).toBe(c.carrier);

			const withCarrier = (await systemPrompt(withMisconceptionCarrier(scenario, carrier), students, impact, addendum))[0].content;
			expect(withCarrier.length).toBe(c.carrierLength);
			expect(sha(withCarrier)).toBe(c.carrierSha256);

			const without = (await systemPrompt(scenario, students, impact, addendum))[0].content;
			expect(without.length).toBe(c.noCarrierLength);
			expect(sha(without)).toBe(c.noCarrierSha256); // unchanged 1.4.4 prompt
		}
	);
});

describe("carrier prompt content", () => {
	const scenario = scenarios.scenarios[1];
	const students = cast(["רועי", "תמר", "הילה"]);
	const studentScenario = withMisconceptionCarrier(scenario, selectMisconceptionCarrier(students, scenario));

	it("names exactly one carrier and replaces the 'ONE or TWO students' lifecycle and the watch-for line", async () => {
		const sys = (await systemPrompt(studentScenario, students))[0].content;
		expect(sys).toContain("MISCONCEPTION CARRIER FOR THIS LESSON (fixed for the whole lesson)");
		expect(sys).toContain(`תמר sincerely holds this misconception: ${scenario.misconception_focus}`);
		expect(sys).toContain("- תמר is the ONLY student who holds it. The other students (רועי, הילה) do not hold it");
		expect(sys).toContain("These are not teaching.");
		expect(sys).toContain("revises the misconception only after the teacher actually addresses the mathematical issue");
		expect(sys).not.toContain("ONE or TWO students should naturally express this misconception");
		expect(sys).not.toContain("Possible misconception to watch for");
	});

	it("PCK steering cannot by itself resolve the carrier's misconception; the analysis is still passed through", async () => {
		const impact = frozen.impacts.positive;
		const sys = (await systemPrompt(studentScenario, students, impact))[0].content;
		expect(sys).toContain("EXCEPT THE MISCONCEPTION CARRIER RULE: it cannot by itself resolve תמר's misconception.");
		expect(sys).not.toContain("TAKES PRIORITY OVER SCENARIO MISCONCEPTION INSTRUCTIONS!");
		expect(sys).toContain("**Exception - the misconception carrier (תמר):**");
		expect(sys).toContain('"Misconception WAS Addressed" does not apply to תמר.');
		// unchanged PCK pass-through
		expect(sys).toContain("**Overall Pedagogical Quality**: positive");
		expect(sys).toContain("**Misconception WAS Addressed**: HOW-ADDRESSED");
		expect(sys).toContain("HINT-REASON");
	});

	it("without a carrier the 1.4.4 texts are used", async () => {
		const sys = (await systemPrompt(scenario, students, frozen.impacts.positive))[0].content;
		expect(sys).toContain("Possible misconception to watch for");
		expect(sys).toContain("TAKES PRIORITY OVER SCENARIO MISCONCEPTION INSTRUCTIONS!");
		expect(sys).not.toContain("MISCONCEPTION CARRIER");
		expect(sys).not.toContain("Exception - the misconception carrier");
	});

	it("changes the system prompt only: the conversation history sent is the same", async () => {
		const a = await systemPrompt(scenario, students);
		const b = await systemPrompt(studentScenario, students);
		expect(b.slice(1)).toEqual(a.slice(1));
	});
});
