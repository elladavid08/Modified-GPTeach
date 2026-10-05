// Invariants A1-A4 (A3/A4 DECIDED), A6, A7, A10 (DECIDED), A11, A12, A14 (DECIDED) and B5 (DECIDED: cast recorded):
// what ConversationLog persists.
// Firestore is fully mocked: nothing is written anywhere.
//
// Deliberately NOT asserted: concurrent addTurn behaviour (C3), the `should_provide_feedback`
// field being absent from logged feedback (C1), or what happens to failed turns (C7).
import { ConversationLog } from "../services/conversationLogger";
import { saveConversation, saveOrGetStudentPersona } from "../services/firestoreService";
import { validateConversationDoc, SESSION_ID_RE } from "../testUtils/conversationContract";
import personas from "../config/students/personas";
import scenarios from "../config/scenarios/geometry_scenarios";

jest.mock("../services/firestoreService", () => ({
	saveConversation: jest.fn(async () => ({ error: null })),
	saveOrGetStudentPersona: jest.fn(async (student) => `v${student.version}_${student.id}`),
	addMessageToConversation: jest.fn(),
}));

const students = Object.values(personas.students).slice(0, 3);
const scenario = scenarios.scenarios[0];
const profile = { fullName: "Test Teacher", role: "teacher", email: "should-not-be-stored@test" };

function lastSavedDoc() {
	const calls = saveConversation.mock.calls;
	return calls[calls.length - 1][0];
}

// jsdom does not decode images; emulate a loaded image of the given width.
function mockImageWidth(width, height = 100) {
	global.Image = class {
		set src(_v) {
			this.width = width;
			this.height = height;
			setTimeout(() => this.onload && this.onload(), 0);
		}
	};
	window.Image = global.Image;
}

const feedback = {
	feedback_message: "msg",
	feedback_type: "positive",
	skills_assessment: [{ skill_id: "error-identification", is_relevant: true, score: 2, evidence: "ev" }],
	detected_skills: [{ skill_id: "error-identification", evidence: "ev" }],
	missed_opportunities: [],
};

beforeEach(() => {
	jest.clearAllMocks();
	localStorage.clear();
});

describe("ConversationLog", () => {
	it("generates a sessionId in the session_<ms>_<rand> format", () => {
		const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
		expect(log.sessionId).toMatch(SESSION_ID_RE);
	});

	it("does not save anything before the first logged turn (lazy init)", async () => {
		const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
		await log.endSession();
		expect(saveConversation).not.toHaveBeenCalled();
	});

	it("records the cast as persona refs and stamps systemVersion on first turn", async () => {
		const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
		await log.addTurn("שלום", [{ name: students[0].name, text: "היי" }], null);

		expect(saveOrGetStudentPersona).toHaveBeenCalledTimes(students.length);
		const doc = lastSavedDoc();
		expect(doc.studentRefs).toEqual(students.map((s) => `v${s.version}_${s.id}`));
		expect(doc.systemVersion).toBe("9.9.9");
		expect(doc.sessionId).toBe(log.sessionId);
		expect(doc.userId).toBe("u1");
	});

	it("stores only a minimal user snapshot {fullName, role}, not the full profile (A14, DECIDED)", async () => {
		const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
		await log.addTurn("שלום", [{ name: students[0].name, text: "היי" }], null);
		expect(lastSavedDoc().userSnapshot).toEqual({ fullName: "Test Teacher", role: "teacher" });
		expect(JSON.stringify(lastSavedDoc())).not.toContain("should-not-be-stored@test");
	});

	it("snapshots the scenario fields research depends on", async () => {
		const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
		await log.addTurn("שלום", [{ name: students[0].name, text: "היי" }], null);
		const s = lastSavedDoc().scenario;
		expect(s.text).toBe(scenario.text);
		expect(s.misconception_focus).toBe(scenario.misconception_focus);
		expect(s.target_pck_skills).toEqual(scenario.target_pck_skills);
		expect(s.initiated_by).toBe(scenario.initiated_by);
	});

	it("produces documents that satisfy the conversation contract after each turn", async () => {
		const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
		await log.addTurn("t1", [{ name: students[0].name, text: "s1" }], null);
		expect(validateConversationDoc(lastSavedDoc())).toEqual([]);
		await log.addTurn("t2", [{ name: students[1].name, text: "s2" }, { name: students[2].name, text: "s3" }], feedback);
		const doc = lastSavedDoc();
		expect(validateConversationDoc(doc)).toEqual([]);
		expect(doc.turns.map((t) => t.turnNumber)).toEqual([1, 2]);
		expect(saveOrGetStudentPersona).toHaveBeenCalledTimes(students.length); // init only once
	});

	it("maps turn fields: teacher.message, students[{name, message}], pckFeedback", async () => {
		const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
		await log.addTurn("teacher text", [{ name: "נועה", text: "student text" }], feedback);
		const turn = lastSavedDoc().turns[0];
		expect(turn.teacher.message).toBe("teacher text");
		expect(turn.teacher.image).toBeNull();
		expect(turn.students).toEqual([expect.objectContaining({ name: "נועה", message: "student text" })]);
		expect(turn.pckFeedback).toEqual(
			expect.objectContaining({
				feedback_message: "msg",
				feedback_type: "positive",
				skills_assessment: feedback.skills_assessment,
				detected_skills: feedback.detected_skills,
				missed_opportunities: [],
			})
		);
	});

	it("stores displayed feedback in the shape the summary consumes, without should_provide_feedback (A4, C1)", async () => {
		const fixture = require("../testUtils/contracts/loggedTurnWithFeedback.json");
		// What Chat.jsx passes for displayed feedback (formattedFeedback), including UI-only fields.
		const chatFeedback = {
			...fixture.pckFeedback,
			should_display: true,
			pedagogical_quality: "positive",
			misconception_addressed: true,
		};
		delete chatFeedback.timestamp;
		const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
		await log.addTurn(fixture.teacher.message, [{ name: "תמר", text: "s" }], chatFeedback);
		const stored = lastSavedDoc().turns[0].pckFeedback;
		for (const key of Object.keys(fixture.pckFeedback)) expect(stored).toHaveProperty(key);
		expect(stored).not.toHaveProperty("should_provide_feedback");
		expect(stored.skills_assessment).toEqual(fixture.pckFeedback.skills_assessment);
		expect(stored.feedback_message).toBe(fixture.pckFeedback.feedback_message);
	});

	it("stores pckFeedback as null when no feedback was displayed (A2, A4 DECIDED)", async () => {
		const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
		await log.addTurn("t", [{ name: "נועה", text: "s" }], null);
		expect(lastSavedDoc().turns[0].pckFeedback).toBeNull();
	});

	it("stores a small drawing as raw base64 without a data-URL prefix", async () => {
		mockImageWidth(300);
		const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
		await log.addTurn("t", [{ name: "נועה", text: "s" }], null, "iVBORsmallimage");
		expect(lastSavedDoc().turns[0].teacher.image).toBe("iVBORsmallimage");
	});

	it("downscales a wide drawing to 600px width and stores it without a prefix (A10)", async () => {
		mockImageWidth(1200, 400);
		const created = [];
		const realCreate = document.createElement.bind(document);
		const createSpy = jest.spyOn(document, "createElement").mockImplementation((tag) => {
			const el = realCreate(tag);
			if (tag === "canvas") {
				el.getContext = () => ({ drawImage: () => {} });
				el.toDataURL = () => "data:image/png;base64,iVBORdownscaled";
				created.push(el);
			}
			return el;
		});
		const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
		await log.addTurn("t", [{ name: "נועה", text: "s" }], null, "iVBORwideimage");
		createSpy.mockRestore();
		expect(created[0].width).toBe(600);
		expect(created[0].height).toBe(200);
		expect(lastSavedDoc().turns[0].teacher.image).toBe("iVBORdownscaled");
	});

	it("endSession sets endTime and saves; summary is persisted as a string (A12)", async () => {
		const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
		await log.addTurn("t", [{ name: "נועה", text: "s" }], null);
		await log.endSession();
		expect(typeof lastSavedDoc().endTime).toBe("string");
		await log.addSummaryFeedback("### סיכום\nטקסט");
		expect(lastSavedDoc().summaryFeedback).toBe("### סיכום\nטקסט");
	});

	describe("failed attempts (C7 phase 1, A16)", () => {
		const attempt = (agent, extra = {}) => ({
			agent,
			stage: "http",
			endpoint: agent === "pck" ? "/api/pck-feedback" : "/api/generate",
			httpStatus: 500,
			errorName: "Error",
			errorMessage: "Backend error (500)",
			timestamp: "2026-10-05T12:00:00.000Z",
			teacherMessageChars: 5,
			teacherHasDrawing: false,
			pckFeedbackDisplayed: false,
			rawOutputExcerpt: null,
			rawOutputChars: null,
			...extra,
		});

		it("keeps failures out of turns[] and does not affect turnNumber sequencing (A3)", async () => {
			const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
			await log.addTurn("t1", [{ name: "נועה", text: "s1" }], null);
			await log.addFailedAttempt(attempt("student"));
			await log.addTurn("t2", [{ name: "נועה", text: "s2" }], null);
			const doc = lastSavedDoc();
			expect(doc.turns.map((t) => [t.turnNumber, t.teacher.message])).toEqual([[1, "t1"], [2, "t2"]]);
			expect(doc.failedAttempts).toHaveLength(1);
			expect(doc.failedAttempts[0]).toEqual(
				expect.objectContaining({ agent: "student", attemptNumber: 1, precedingTurnNumber: 1, sessionId: log.sessionId })
			);
			expect(doc.failedAttempts[0]).not.toHaveProperty("turnNumber");
			expect(validateConversationDoc(doc)).toEqual([]);
		});

		it("saves a failure immediately once the conversation exists", async () => {
			const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
			await log.addTurn("t1", [{ name: "נועה", text: "s1" }], null);
			const saves = saveConversation.mock.calls.length;
			await log.addFailedAttempt(attempt("pck"));
			expect(saveConversation.mock.calls.length).toBe(saves + 1);
			expect(lastSavedDoc().failedAttempts[0].agent).toBe("pck");
		});

		it("does not create a conversation for failures alone; they are saved with the first logged turn (A11)", async () => {
			const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
			await log.addFailedAttempt(attempt("student"));
			expect(saveConversation).not.toHaveBeenCalled();
			await log.addTurn("t1", [{ name: "נועה", text: "s1" }], null);
			const doc = lastSavedDoc();
			expect(doc.turns).toHaveLength(1);
			expect(doc.failedAttempts).toEqual([expect.objectContaining({ agent: "student", precedingTurnNumber: 0 })]);
		});

		it("bounds the number of stored failures", async () => {
			const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
			await log.addTurn("t1", [{ name: "נועה", text: "s1" }], null);
			for (let i = 0; i < 60; i++) await log.addFailedAttempt(attempt("student"));
			const stored = lastSavedDoc().failedAttempts;
			expect(stored).toHaveLength(50);
			expect(stored[stored.length - 1].attemptNumber).toBe(60); // most recent kept
		});

		it("new conversations carry an empty failedAttempts list (additive field)", async () => {
			const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
			await log.addTurn("t1", [{ name: "נועה", text: "s1" }], null);
			expect(lastSavedDoc().failedAttempts).toEqual([]);
		});
	});

	describe("turn telemetry (A17, REVIEW)", () => {
		const okPck = { status: "ok", reason: null, model: "gemini-2.5-flash-lite", latencyMs: 2100, clientLatencyMs: 2300, finishReason: "STOP", attempts: 1 };
		const okStudent = { ...okPck, latencyMs: 900, clientLatencyMs: 1000 };

		it("stores telemetry with the logged turn it belongs to", async () => {
			const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
			await log.addTurn("t1", [{ name: "נועה", text: "s1" }], null, null, { pck: okPck, student: okStudent });
			await log.addTurn("t2", [{ name: "נועה", text: "s2" }], null, null, {
				pck: { ...okPck, status: "skipped", reason: "image_only", model: null, latencyMs: null, clientLatencyMs: null, finishReason: null, attempts: null },
				student: { ...okStudent, latencyMs: 444 },
			});
			const doc = lastSavedDoc();
			expect(doc.turns[0].telemetry).toEqual({ pck: okPck, student: okStudent });
			expect(doc.turns[1].telemetry.pck.status).toBe("skipped");
			expect(doc.turns[1].telemetry.student.latencyMs).toBe(444);
			expect(validateConversationDoc(doc)).toEqual([]);
		});

		it("sanitises telemetry to the whitelist (no raw content can be persisted)", async () => {
			const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
			await log.addTurn("t1", [{ name: "נועה", text: "s1" }], null, null, {
				pck: { ...okPck, prompt: "SECRET-PROMPT" },
				student: { ...okStudent, text: "SECRET-RAW" },
				extra: { teacherMessage: "SECRET-TEACHER" },
			});
			const t = lastSavedDoc().turns[0].telemetry;
			expect(JSON.stringify(t)).not.toContain("SECRET");
			expect(Object.keys(t).sort()).toEqual(["pck", "student"]);
			expect(validateConversationDoc(lastSavedDoc())).toEqual([]);
		});

		it("turns logged without telemetry store telemetry: null (backward compatible)", async () => {
			const log = new ConversationLog(scenario, students, "u1", profile, "9.9.9");
			await log.addTurn("t1", [{ name: "נועה", text: "s1" }], null);
			expect(lastSavedDoc().turns[0].telemetry).toBeNull();
			expect(validateConversationDoc(lastSavedDoc())).toEqual([]);
		});
	});
});

