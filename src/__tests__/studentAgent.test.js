// Invariant B3 (student response interface) and B4 inputs: what the client sends to the student
// model and how a well-formed model reply becomes chat messages. The backend call is mocked.
//
// C7 phase 1 (fixed): failures reject callAI with a tagged error (request vs parse) instead of
// silently replying [] or persisting the fixed fallback text (C6 fallback removed for parse
// failures). Genuine silence (`responses: []`) is still a normal empty reply.
//
// Deliberately NOT asserted (defects, invariants.md §C): newline stripping (C5), missing duplicate detection, the hard-coded persona
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

describe("C9: reasoning is not requested in the output (1.3.9)", () => {
	async function systemPrompt() {
		generateWithGenAI.mockResolvedValue(JSON.stringify({ responses: [] }));
		await runCallAI();
		return generateWithGenAI.mock.calls[0][0][0].content;
	}

	it("no longer instructs the model to include a `thinking` field", async () => {
		const system = await systemPrompt();
		expect(system).not.toContain('INCLUDE the "thinking" field');
		expect(system).not.toContain("MUST INCLUDE IN OUTPUT");
	});

	it("keeps the decision checklist (lesson phase, teacher's latest message, student knowledge, answered questions, who responds)", async () => {
		const system = await systemPrompt();
		expect(system).toContain("STEP 0: Check lesson phase");
		expect(system).toContain("STEP 1: Summarize teacher's LATEST message");
		expect(system).toContain("STEP 2: Analyze context");
		expect(system).toContain("What does this student currently KNOW based on their previous responses?");
		expect(system).toContain("If they asked a question before, did the teacher answer it?");
		expect(system).toContain("Should they respond? (true/false)");
		expect(system).toContain("STEP 4: Generate responses ONLY for students who should respond");
	});

	it("says to work through the checklist silently and return only the responses JSON", async () => {
		const system = await systemPrompt();
		expect(system).toContain("DECISION PROCESS (think through these steps silently before answering; do NOT include them in the output):");
		expect(system).toContain('5. Return ONLY the "responses" array: no reasoning, analysis or explanation fields, and no text outside it');
	});

	it("the example outputs contain no `thinking` object but are otherwise kept", async () => {
		const system = await systemPrompt();
		expect(system).not.toMatch(/"thinking"\s*:/);
		expect(system).not.toContain("teacher_message_summary");
		expect(system).not.toContain("who_should_respond");
		for (const label of ["EXAMPLE 1 - Student understood the explanation:", "EXAMPLE 2 - Student still confused after explanation:", "EXAMPLE 3 - Student THINKS understood but has misconception:"]) {
			expect(system).toContain(label);
		}
		expect(system).toContain(`"responses": [{"student": "${students[0].name}", "message": "אה עכשיו הבנתי!`);
	});

	it("the browser no longer expects or warns about a missing `thinking` field", async () => {
		console.warn.mockClear();
		generateWithGenAI.mockResolvedValue(JSON.stringify({ responses: [{ student: students[0].name, message: "היי" }] }));
		const { msgs } = await runCallAI();
		expect(msgs).toHaveLength(1);
		const warnings = console.warn.mock.calls.map((c) => c.join(" "));
		expect(warnings.some((w) => /thinking/i.test(w))).toBe(false);
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


});

describe("student agent failures (C7 phase 1)", () => {
	let errorSpy;
	beforeEach(() => {
		errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => errorSpy.mockRestore());

	function callExpectingFailure() {
		const onResponse = jest.fn();
		return callAI(historyOf([]), students, scenario, "", null, onResponse).then(
			() => ({ error: null, onResponse }),
			(error) => ({ error, onResponse })
		);
	}

	it("a backend/request failure rejects with the request error and invents no messages", async () => {
		generateWithGenAI.mockRejectedValue(
			Object.assign(new Error("Backend error (500): x"), { stage: "http", status: 500, endpoint: "/api/generate" })
		);
		const { error, onResponse } = await callExpectingFailure();
		expect(error).toEqual(expect.objectContaining({ stage: "http", status: 500, endpoint: "/api/generate" }));
		expect(onResponse).not.toHaveBeenCalled();
	});

	it.each([
		["invalid JSON", "{\"responses\": [{\"student\": \"נועה\", \"message\": \"אני"],
		["JSON without responses", JSON.stringify({ thinking: {} })],
	])("%s rejects as a parse failure with the raw output, and no fallback message is produced", async (_label, raw) => {
		generateWithGenAI.mockResolvedValue(raw);
		const { error, onResponse } = await callExpectingFailure();
		expect(error).toEqual(expect.objectContaining({ stage: "parse", endpoint: "/api/generate", rawOutput: raw }));
		expect(onResponse).not.toHaveBeenCalled();
	});

	it("a parse failure carries the call's telemetry", async () => {
		const meta = { agent: "student", model: "gemini-2.5-flash-lite", latencyMs: 700, finishReason: "MAX_TOKENS", attempts: 1, clientLatencyMs: 750 };
		generateWithGenAI.mockImplementation(async (_m, options) => {
			options.onMeta(meta);
			return "{\"responses\": [";
		});
		const { error } = await callExpectingFailure();
		expect(error.stage).toBe("parse");
		expect(error.meta).toEqual(meta);
	});

	it("genuine silence (responses: []) is still a normal empty reply, not a failure", async () => {
		generateWithGenAI.mockResolvedValue(JSON.stringify({ responses: [] }));
		const { error, onResponse } = await callExpectingFailure();
		expect(error).toBeNull();
		expect(onResponse).toHaveBeenCalledTimes(1);
		expect(onResponse.mock.calls[0][0]).toEqual([]);
	});
});

describe("student call telemetry", () => {
	it("passes the call's telemetry to onResponse as the 4th argument", async () => {
		const meta = { agent: "student", model: "gemini-2.5-flash-lite", latencyMs: 600, finishReason: "STOP", attempts: 1, clientLatencyMs: 650 };
		generateWithGenAI.mockImplementation(async (_m, options) => {
			options.onMeta(meta);
			return JSON.stringify({ responses: [{ student: students[0].name, message: "היי" }] });
		});
		const onResponse = jest.fn();
		await callAI(historyOf([]), students, scenario, "", null, onResponse);
		expect(onResponse.mock.calls[0][3]).toEqual(meta);
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

	it("a student message keeps the client format {role, content, name} (C8: the server adds the speaker prefix)", () => {
		const m = new ChatMessage("נועה", "מרובע עם ארבע זוויות ישרות", "assistant");
		expect(m.toAIformat()).toEqual({ role: "assistant", content: "מרובע עם ארבע זוויות ישרות", name: "נועה" });
		expect(m.text).toBe("מרובע עם ארבע זוויות ישרות"); // stored/displayed text has no prefix
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
