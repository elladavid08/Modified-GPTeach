// Invariant B3 (student response interface) and B4 inputs: what the client sends to the student
// model and how a well-formed model reply becomes chat messages. The backend call is mocked.
//
// Deliberately NOT asserted (defects, invariants.md §C): the fixed fallback text on malformed
// output (C6), newline stripping (C5), missing duplicate detection, the hard-coded persona
// tiers in the prompt (C12), or how malformed entries (missing student/message) are handled
// (may become validation/retry logic). Those are expected to change.
import callAI from "../utils/ai.js";
import ChatMessage from "../objects/ChatMessage";
import { generateWithGenAI } from "../services/genai";
import personas from "../config/students/personas";
import scenarios from "../config/scenarios/geometry_scenarios";

jest.mock("../services/genai", () => ({
	generateWithGenAI: jest.fn(),
	generateWithGenAICompletion: jest.fn(),
}));

const students = Object.values(personas.students).slice(0, 3);
const scenario = scenarios.scenarios[0];

function historyOf(messages) {
	return { toAIformat: () => messages.map((m) => m.toAIformat()), toString: () => messages.join("\n") };
}

function runCallAI({ messages = [], impact = null, addendum = "" } = {}) {
	return new Promise((resolve) => {
		callAI(historyOf(messages), students, scenario, addendum, impact, (msgs, code, studs) =>
			resolve({ msgs, code, studs })
		);
	});
}

beforeEach(() => jest.clearAllMocks());

describe("student agent request", () => {
	it("sends one system prompt followed by the history in order", async () => {
		generateWithGenAI.mockResolvedValue(JSON.stringify({ responses: [] }));
		const teacher = new ChatMessage("Teacher", "מה ההגדרה של מלבן?", "user");
		const student = new ChatMessage(students[0].name, "ארבע זוויות ישרות", "assistant");
		await runCallAI({ messages: [teacher, student] });

		const sent = generateWithGenAI.mock.calls[0][0];
		expect(sent[0].role).toBe("system");
		expect(sent.slice(1)).toEqual([teacher.toAIformat(), student.toAIformat()]);
	});

	it("system prompt includes every cast member's persona and the lesson topic", async () => {
		generateWithGenAI.mockResolvedValue(JSON.stringify({ responses: [] }));
		await runCallAI();
		const system = generateWithGenAI.mock.calls[0][0][0].content;
		for (const s of students) expect(system).toContain(s.description);
		expect(system).toContain(scenario.text);
		expect(system).toContain("עברית"); // Hebrew-language requirement (B4)
	});

	it("passes the PCK impact analysis into the student prompt (PCK-first, B1)", async () => {
		generateWithGenAI.mockResolvedValue(JSON.stringify({ responses: [] }));
		await runCallAI({
			impact: {
				pedagogical_quality: "positive",
				predicted_student_state: {
					understanding_level: "improved",
					response_tone: "thoughtful",
					student_reaction_hints: [{ student: students[1].name, reaction_type: "IMPACT-HINT-MARKER", likelihood: "high" }],
				},
			},
		});
		const system = generateWithGenAI.mock.calls[0][0][0].content;
		expect(system).toContain("**Overall Pedagogical Quality**: positive");
		expect(system).toContain("IMPACT-HINT-MARKER");
	});

	it("omits the impact block when no PCK analysis is passed (B1: block present iff provided)", async () => {
		generateWithGenAI.mockResolvedValue(JSON.stringify({ responses: [] }));
		await runCallAI({ impact: null });
		expect(generateWithGenAI.mock.calls[0][0][0].content).not.toContain("Overall Pedagogical Quality");
	});
});

describe("student agent response interface", () => {
	it("turns each {student, message} into an assistant ChatMessage, in order", async () => {
		generateWithGenAI.mockResolvedValue(
			JSON.stringify({
				responses: [
					{ student: students[0].name, message: "  אבל ריבוע נראה אחרת  " },
					{ student: students[2].name, message: "רגע, אז ריבוע הוא מלבן?" },
				],
			})
		);
		const { msgs } = await runCallAI();
		expect(msgs).toHaveLength(2);
		msgs.forEach((m) => expect(m).toBeInstanceOf(ChatMessage));
		expect(msgs.map((m) => [m.agent, m.role, m.text])).toEqual([
			[students[0].name, "assistant", "אבל ריבוע נראה אחרת"],
			[students[2].name, "assistant", "רגע, אז ריבוע הוא מלבן?"],
		]);
		expect(msgs[0].name).toBe(students[0].name);
	});


	it("never invents student messages when the backend call fails", async () => {
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		generateWithGenAI.mockRejectedValue(new Error("backend down"));
		const { msgs } = await runCallAI();
		// Only "no fabricated messages" is protected; how the failure is surfaced may change (C7).
		expect(msgs || []).toHaveLength(0);
		errorSpy.mockRestore();
	});
});

describe("callAI completion signal (lets the caller release the turn lock, C2/C3)", () => {
	it("returns a promise that settles after onResponse was called", async () => {
		generateWithGenAI.mockResolvedValue(JSON.stringify({ responses: [{ student: students[0].name, message: "היי" }] }));
		const onResponse = jest.fn();
		await callAI(historyOf([]), students, scenario, "", null, onResponse);
		expect(onResponse).toHaveBeenCalledTimes(1);
	});

	it("returns a rejecting promise when the request cannot be built", async () => {
		const onResponse = jest.fn();
		await expect(callAI(historyOf([]), students, null, "", null, onResponse)).rejects.toThrow();
		expect(generateWithGenAI).not.toHaveBeenCalled();
	});
});

describe("ChatMessage AI format (drawing path to the student model)", () => {
	it("text-only message", () => {
		const m = new ChatMessage("Teacher", "שלום", "user");
		expect(m.toAIformat()).toEqual({ role: "user", content: "שלום", name: "Teacher" });
	});

	it("message with drawing becomes multimodal text + inline PNG", () => {
		const m = new ChatMessage("Teacher", "הסתכלו", "user", "iVBORbase64");
		expect(m.toAIformat()).toEqual({
			role: "user",
			name: "Teacher",
			content: [{ text: "הסתכלו" }, { inline_data: { mime_type: "image/png", data: "iVBORbase64" } }],
		});
	});
});
