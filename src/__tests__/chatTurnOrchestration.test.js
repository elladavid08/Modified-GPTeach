// Turn orchestration in the production page (pages/Chat.jsx). Protects:
//   B1  PCK analysis runs before student generation and its result steers the students
//   B7  a no-feedback decision shows no feedback; A4 (DECIDED) it is logged as pckFeedback: null;
//   A2  displayed feedback is logged with its fields
//   B9  previous feedback is cleared as soon as the teacher sends a new message
//   B5/A6 (DECIDED) the session's cast is fixed across turns and recorded; SYSTEM_VERSION stamped
//   B20 the teacher briefing is shown before the first message
//   drawing path: a board drawing is attached to the teacher message, and logged, only when opted in
//   C2/C3 (fixed) one simulation turn at a time: input/send locked and the typing indicator
//         visible until the turn finishes; extra submits ignored; unlock on success and on every
//         failure path; turn results and logging stay with their own turn; "סיים שיחה" is
//         unavailable during a turn and, after a turn, runs only once queued turn logging is done
//
// All services are mocked: no LLM, no Firestore, no auth.
//   C4 (fixed) a submit with no text (empty / whitespace) and no included drawing starts nothing
//
//   telemetry (A17, REVIEW) per-turn PCK/student call telemetry is passed to the logger with the
//       right turn; image-only turns record PCK as skipped, not failed; failures carry timing
//   C7 phase 1 (fixed) PCK / student failures are shown to the teacher (concise Hebrew, no
//       technical detail), recorded as failedAttempts diagnostics (A16), never logged as turns
//
// Deliberately NOT asserted (defects, invariants.md §C): newline handling (C5).
//   B22 (DECIDED) an image-only submit (opt-in ticked + a real drawing, no text) is a valid turn.
//       Until the PCK agent is multimodal, image-only turns skip the PCK call silently (E1).
//       Summary handling of drawings is NOT asserted (B17, future design).
// Also NOT asserted (REVIEW, undecided): what happens to students when the PCK call fails (B2),
// how the cast is selected beyond "3 distinct personas" (B5 mechanism), the exact sidebar
// placeholder text (B10), and whether the drawing opt-in resets after a send (B15).
import React from "react";
import { Chat } from "../pages/Chat";
import { AppContext } from "../objects/AppContext";
import { HistoryProvider } from "../objects/ChatHistory";
import ChatMessage from "../objects/ChatMessage";
import callAI from "../utils/ai.js";
import { getPCKFeedback } from "../services/genai.js";
import { ConversationLog } from "../services/conversationLogger";
import { SYSTEM_VERSION } from "../config/version";
import { FAILURE_MESSAGES_HE } from "../services/turnDiagnostics";
import personas from "../config/students/personas";
import scenarios from "../config/scenarios/geometry_scenarios";
import { render, flush, click, typeInto, submit, findButtonByText, deferred } from "../testUtils/dom";

jest.mock("../utils/ai.js", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/genai.js", () => ({ getPCKFeedback: jest.fn(), getPCKSummary: jest.fn() }));
jest.mock("../contexts/AuthContext", () => ({
	useAuth: () => ({ currentUser: { uid: "test-uid" }, userProfile: { fullName: "Test", role: "teacher" } }),
}));
jest.mock("../services/conversationLogger", () => {
	const instances = [];
	const ConversationLog = jest.fn(function ConversationLog(...args) {
		this.args = args;
		this.sessionId = "session_1_test";
		this.turns = [];
		this.stats = {};
		this.addTurn = jest.fn(async () => {});
		this.addFailedAttempt = jest.fn(async () => {});
		this.endSession = jest.fn();
		this.saveToLocalStorage = jest.fn();
		this.addSummaryFeedback = jest.fn();
		this.toJSON = jest.fn(() => ({}));
		instances.push(this);
	});
	ConversationLog.instances = instances;
	return { ConversationLog };
});
// fabric.js needs a real canvas; replace the board with a controllable stub exposing the same handle.
jest.mock("../components/DrawingBoard", () => {
	const React = require("react");
	const board = { include: false, image: null };
	const DrawingBoard = ({ onDrawingCapture }) => {
		React.useImperativeHandle(onDrawingCapture, () => ({
			exportAsImage: async () => board.image,
			shouldInclude: () => board.include,
			hasDrawing: () => Boolean(board.image),
			resizeCanvas: () => {},
			resetInclude: () => {
				board.include = false;
			},
		}));
		return null;
	};
	return { DrawingBoard, __board: board };
});
const { __board: board } = require("../components/DrawingBoard");

const allStudents = Object.values(personas.students);
const scenario = scenarios.scenarios[0];

const FEEDBACK_ANALYSIS = {
	pedagogical_quality: "positive",
	should_provide_feedback: true,
	predicted_student_state: { understanding_level: "improved", response_tone: "thoughtful", student_reaction_hints: [] },
	skills_assessment: [{ skill_id: "error-identification", is_relevant: true, score: 2, evidence: "SIDEBAR-EVIDENCE" }],
	demonstrated_skills: [{ skill_id: "error-identification", evidence: "SIDEBAR-EVIDENCE" }],
	missed_opportunities: [],
	feedback_message_hebrew: "FEEDBACK-MESSAGE",
	addressed_misconception: true,
};
const NO_FEEDBACK_ANALYSIS = {
	...FEEDBACK_ANALYSIS,
	pedagogical_quality: "neutral",
	should_provide_feedback: false,
	skills_assessment: [],
	demonstrated_skills: [],
	feedback_message_hebrew: "",
};

// callAI stub: record what history the student agent saw, then reply with one student.
const studentCalls = [];
function replyWith(text) {
	callAI.mockImplementation((history, students, scen, addendum, impact, onResponse) => {
		studentCalls.push({ messages: history.getMessages().slice(), students, impact });
		onResponse([new ChatMessage(students[0].name, text, "assistant")]);
	});
}

let view;
async function startLesson() {
	view = render(
		<AppContext.Provider value={{ students: allStudents, scenarios: scenarios.scenarios, TAname: "Teacher", UID: 1 }}>
			<HistoryProvider>
				<Chat />
			</HistoryProvider>
		</AppContext.Provider>
	);
	click(findButtonByText(view.container, scenario.text));
	click(findButtonByText(view.container, "התחל בשיעור"));
	await flush();
}

async function sendTeacherMessage(text) {
	typeInto(view.container.querySelector("textarea"), text);
	submit(view.container.querySelector("form"));
	await flush();
}

const sidebarText = () => view.container.textContent;
const logger = () => ConversationLog.instances[ConversationLog.instances.length - 1];

beforeEach(() => {
	jest.clearAllMocks();
	ConversationLog.instances.length = 0;
	studentCalls.length = 0;
	board.include = false;
	board.image = null;
	replyWith("STUDENT-REPLY");
});
afterEach(() => view && view.unmount());

it("shows the teacher briefing before the first message (B20)", async () => {
	await startLesson();
	expect(view.container.textContent).toContain(scenario.teacher_briefing.slice(0, 40));
	expect(callAI).not.toHaveBeenCalled();
	expect(getPCKFeedback).not.toHaveBeenCalled();
});

it("creates one logger per session with the scenario, the user and SYSTEM_VERSION (A6)", async () => {
	await startLesson();
	expect(ConversationLog).toHaveBeenCalledTimes(1);
	const [scen, , uid, profile, version] = logger().args;
	expect(scen).toBe(scenario);
	expect(uid).toBe("test-uid");
	expect(profile).toEqual({ fullName: "Test", role: "teacher" });
	expect(version).toBe(SYSTEM_VERSION);
});

it("keeps the cast fixed within the session and records it in the logger (B5, DECIDED)", async () => {
	getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
	await startLesson();
	await sendTeacherMessage("שאלה ראשונה");
	await sendTeacherMessage("שאלה שנייה");

	const recordedCast = logger().args[1];
	expect(recordedCast).toHaveLength(3);
	expect(new Set(recordedCast.map((s) => s.id)).size).toBe(3);
	recordedCast.forEach((s) => expect(allStudents).toContain(s));
	expect(studentCalls).toHaveLength(2);
	studentCalls.forEach((call) => expect(call.students).toEqual(recordedCast));
	expect(ConversationLog).toHaveBeenCalledTimes(1);
});

it("runs PCK analysis before the student agent and passes the analysis to it (B1)", async () => {
	const pck = deferred();
	getPCKFeedback.mockReturnValue(pck.promise);
	await startLesson();
	await sendTeacherMessage("בואו נבדוק - מה ההגדרה של מלבן?");

	expect(getPCKFeedback).toHaveBeenCalledTimes(1);
	const [teacherText, history, scen] = getPCKFeedback.mock.calls[0];
	expect(teacherText).toBe("בואו נבדוק - מה ההגדרה של מלבן?");
	expect(history[history.length - 1].text).toBe("בואו נבדוק - מה ההגדרה של מלבן?");
	expect(scen).toBe(scenario);
	expect(callAI).not.toHaveBeenCalled(); // students wait for the PCK result

	pck.resolve(FEEDBACK_ANALYSIS);
	await flush();
	expect(callAI).toHaveBeenCalledTimes(1);
	expect(studentCalls[0].impact).toBe(FEEDBACK_ANALYSIS);
	expect(studentCalls[0].messages.map((m) => [m.role, m.text])).toEqual([["user", "בואו נבדוק - מה ההגדרה של מלבן?"]]);
});


it("shows feedback and logs it with its fields when should_provide_feedback is true (A2)", async () => {
	getPCKFeedback.mockResolvedValue(FEEDBACK_ANALYSIS);
	await startLesson();
	await sendTeacherMessage("מה ההגדרה של מלבן?");

	expect(sidebarText()).toContain("SIDEBAR-EVIDENCE");
	expect(logger().addTurn).toHaveBeenCalledTimes(1);
	const [teacherText, studentsLogged, fb, image] = logger().addTurn.mock.calls[0];
	expect(teacherText).toBe("מה ההגדרה של מלבן?");
	expect(studentsLogged).toEqual([{ name: allStudents[0].name, text: "STUDENT-REPLY" }]);
	expect(fb).toEqual(
		expect.objectContaining({
			skills_assessment: FEEDBACK_ANALYSIS.skills_assessment,
			detected_skills: FEEDBACK_ANALYSIS.demonstrated_skills,
			missed_opportunities: [],
			feedback_message: "FEEDBACK-MESSAGE",
			feedback_type: "positive",
		})
	);
	expect(image).toBeNull();
});

it("neither shows nor logs feedback when should_provide_feedback is false (B7, A4 DECIDED)", async () => {
	getPCKFeedback.mockResolvedValue({
		...NO_FEEDBACK_ANALYSIS,
		// Content the model produced but decided not to show must not reach the sidebar.
		skills_assessment: [{ skill_id: "error-identification", is_relevant: true, score: 2, evidence: "HIDDEN-EVIDENCE" }],
	});
	await startLesson();
	await sendTeacherMessage("שלום לכולם!");

	expect(sidebarText()).not.toContain("HIDDEN-EVIDENCE");
	expect(sidebarText()).not.toContain("זיהוי השגיאה");
	expect(logger().addTurn).toHaveBeenCalledTimes(1);
	expect(logger().addTurn.mock.calls[0][2]).toBeNull();
});

it("clears the previous turn's feedback as soon as a new message is sent (B9)", async () => {
	getPCKFeedback.mockResolvedValueOnce(FEEDBACK_ANALYSIS);
	await startLesson();
	await sendTeacherMessage("מה ההגדרה של מלבן?");
	expect(sidebarText()).toContain("SIDEBAR-EVIDENCE");

	const pending = deferred();
	getPCKFeedback.mockReturnValueOnce(pending.promise);
	await sendTeacherMessage("ומה עם ריבוע?");
	expect(sidebarText()).not.toContain("SIDEBAR-EVIDENCE");
	pending.resolve(NO_FEEDBACK_ANALYSIS);
	await flush();
});

it("the student agent sees the previous student replies on the next turn", async () => {
	getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
	await startLesson();
	await sendTeacherMessage("שאלה ראשונה");
	replyWith("SECOND-REPLY");
	await sendTeacherMessage("שאלה שנייה");
	expect(studentCalls[1].messages.map((m) => [m.role, m.text])).toEqual([
		["user", "שאלה ראשונה"],
		["assistant", "STUDENT-REPLY"],
		["user", "שאלה שנייה"],
	]);
	expect(studentCalls[1].messages[1].agent).toBe(allStudents[0].name);
});

it("attaches an included drawing to the teacher message and logs it with the turn", async () => {
	getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
	board.include = true;
	board.image = "iVBORdrawing";
	await startLesson();
	await sendTeacherMessage("הסתכלו על הציור");

	expect(studentCalls[0].messages[0].image).toBe("iVBORdrawing");
	expect(logger().addTurn.mock.calls[0][3]).toBe("iVBORdrawing");
});

it("does not attach a drawing when the teacher did not opt in", async () => {
	getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
	board.include = false;
	board.image = "iVBORdrawing";
	await startLesson();
	await sendTeacherMessage("בלי ציור");
	expect(studentCalls[0].messages[0].image).toBeNull();
	expect(logger().addTurn.mock.calls[0][3]).toBeNull();
});

// ─── C2/C3: one simulation turn at a time ────────────────────────────────────

const textarea = () => view.container.querySelector("textarea");
const sendButton = () => view.container.querySelector('button[type="submit"]');
const typingIndicator = () => view.container.querySelector('img[alt="waiting for response..."]');
const isLocked = () => textarea().disabled && sendButton().disabled && Boolean(typingIndicator());
const isUnlocked = () => !textarea().disabled && !sendButton().disabled && !typingIndicator();

// callAI stub whose reply the test releases later.
function pendingStudents() {
	const pending = [];
	callAI.mockImplementation((history, students, scen, addendum, impact, onResponse) => {
		studentCalls.push({ messages: history.getMessages().slice(), students, impact });
		const d = deferred();
		pending.push(d);
		return d.promise.then((text) => onResponse(text === null ? [] : [new ChatMessage(students[0].name, text, "assistant")]));
	});
	return pending;
}

describe("turn lock (C2/C3)", () => {
	it("keeps input, send and the typing indicator locked from submit until the turn finishes", async () => {
		const pck = deferred();
		getPCKFeedback.mockReturnValueOnce(pck.promise);
		const students = pendingStudents();
		await startLesson();
		expect(isUnlocked()).toBe(true);

		await sendTeacherMessage("מה ההגדרה של מלבן?");
		expect(isLocked()).toBe(true); // waiting for PCK

		pck.resolve(NO_FEEDBACK_ANALYSIS);
		await flush();
		expect(callAI).toHaveBeenCalledTimes(1);
		expect(isLocked()).toBe(true); // waiting for students

		students[0].resolve("STUDENT-REPLY");
		await flush();
		expect(view.container.textContent).toContain("STUDENT-REPLY");
		expect(isUnlocked()).toBe(true);
	});

	it("ignores a second submit while the turn is pending (no extra PCK or student call)", async () => {
		const pck = deferred();
		getPCKFeedback.mockReturnValueOnce(pck.promise);
		const students = pendingStudents();
		await startLesson();

		await sendTeacherMessage("הודעה ראשונה");
		await sendTeacherMessage("SECOND-WHILE-PENDING"); // programmatic submit despite the lock
		expect(getPCKFeedback).toHaveBeenCalledTimes(1);

		pck.resolve(NO_FEEDBACK_ANALYSIS);
		await flush();
		await sendTeacherMessage("THIRD-WHILE-PENDING");
		students[0].resolve("STUDENT-REPLY");
		await flush();

		expect(getPCKFeedback).toHaveBeenCalledTimes(1);
		expect(callAI).toHaveBeenCalledTimes(1);
		expect(studentCalls[0].messages.map((m) => m.text)).toEqual(["הודעה ראשונה"]);
		expect(view.container.textContent).not.toContain("SECOND-WHILE-PENDING");
		expect(view.container.textContent).not.toContain("THIRD-WHILE-PENDING");
		expect(logger().addTurn).toHaveBeenCalledTimes(1);
	});

	it("unlocks after a successful turn and accepts the next message", async () => {
		getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
		await startLesson();
		await sendTeacherMessage("שאלה ראשונה");
		expect(isUnlocked()).toBe(true);
		await sendTeacherMessage("שאלה שנייה");
		expect(getPCKFeedback).toHaveBeenCalledTimes(2);
		expect(callAI).toHaveBeenCalledTimes(2);
	});

	it("unlocks after a PCK failure once the turn settles", async () => {
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		getPCKFeedback.mockRejectedValueOnce(new Error("pck down")).mockResolvedValue(NO_FEEDBACK_ANALYSIS);
		await startLesson();
		await sendTeacherMessage("שאלה ראשונה");
		expect(isUnlocked()).toBe(true);
		await sendTeacherMessage("שאלה שנייה");
		expect(getPCKFeedback).toHaveBeenCalledTimes(2);
		errorSpy.mockRestore();
	});

	it("unlocks after a student-generation failure that yields no messages", async () => {
		getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
		const students = pendingStudents();
		await startLesson();
		await sendTeacherMessage("שאלה ראשונה");
		students[0].resolve(null); // callAI reports failure as an empty reply
		await flush();
		expect(isUnlocked()).toBe(true);
		await sendTeacherMessage("שאלה שנייה");
		expect(callAI).toHaveBeenCalledTimes(2);
	});

	it("unlocks when student generation throws or rejects", async () => {
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
		callAI.mockImplementationOnce(() => {
			throw new Error("prompt build failed");
		});
		await startLesson();
		await sendTeacherMessage("שאלה ראשונה");
		expect(isUnlocked()).toBe(true);

		callAI.mockImplementationOnce(() => Promise.reject(new Error("generation rejected")));
		await sendTeacherMessage("שאלה שנייה");
		expect(isUnlocked()).toBe(true);
		await sendTeacherMessage("שאלה שלישית");
		expect(callAI).toHaveBeenCalledTimes(3);
		errorSpy.mockRestore();
	});

	it("keeps feedback and logging with their own turn, in send order, even when logging is slow", async () => {
		const FEEDBACK_B = {
			...FEEDBACK_ANALYSIS,
			skills_assessment: [{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 2, evidence: "EVIDENCE-B" }],
			demonstrated_skills: [{ skill_id: "adapted-pedagogical-response", evidence: "EVIDENCE-B" }],
			feedback_message_hebrew: "MESSAGE-B",
		};
		getPCKFeedback.mockResolvedValueOnce(FEEDBACK_ANALYSIS).mockResolvedValueOnce(FEEDBACK_B);
		await startLesson();
		const slowLog = deferred();
		logger().addTurn.mockImplementationOnce(() => slowLog.promise);

		await sendTeacherMessage("TURN-A");
		replyWith("REPLY-B");
		await sendTeacherMessage("TURN-B");
		expect(sidebarText()).toContain("EVIDENCE-B");
		expect(sidebarText()).not.toContain("SIDEBAR-EVIDENCE");
		// Turn B's log entry waits until turn A's entry has been written.
		expect(logger().addTurn).toHaveBeenCalledTimes(1);

		slowLog.resolve();
		await flush();
		const calls = logger().addTurn.mock.calls;
		expect(calls).toHaveLength(2);
		expect(calls[0][0]).toBe("TURN-A");
		expect(calls[0][1]).toEqual([{ name: allStudents[0].name, text: "STUDENT-REPLY" }]);
		expect(calls[0][2].feedback_message).toBe("FEEDBACK-MESSAGE");
		expect(calls[1][0]).toBe("TURN-B");
		expect(calls[1][1]).toEqual([{ name: allStudents[0].name, text: "REPLY-B" }]);
		expect(calls[1][2].feedback_message).toBe("MESSAGE-B");
	});

	describe("finish conversation (סיים שיחה) during and after a turn", () => {
		const finishButton = () => findButtonByText(view.container, "סיים שיחה");
		let alertSpy;
		beforeEach(() => {
			alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
		});
		afterEach(() => alertSpy.mockRestore());

		it("cannot be triggered while a turn is pending", async () => {
			const pck = deferred();
			getPCKFeedback.mockReturnValueOnce(pck.promise);
			const students = pendingStudents();
			await startLesson();
			await sendTeacherMessage("שאלה ראשונה");

			expect(finishButton().disabled).toBe(true); // waiting for PCK
			click(finishButton());
			pck.resolve(NO_FEEDBACK_ANALYSIS);
			await flush();
			expect(finishButton().disabled).toBe(true); // waiting for students
			click(finishButton());
			expect(logger().endSession).not.toHaveBeenCalled();
			expect(logger().saveToLocalStorage).not.toHaveBeenCalled();

			students[0].resolve("STUDENT-REPLY");
			await flush();
		});

		it("becomes available again after the turn completes", async () => {
			getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
			await startLesson();
			await sendTeacherMessage("שאלה ראשונה");

			expect(finishButton().disabled).toBe(false);
			click(finishButton());
			await flush();
			expect(logger().endSession).toHaveBeenCalledTimes(1);
			expect(logger().saveToLocalStorage).toHaveBeenCalledTimes(1);
		});

		it("does not bypass or reorder turn logging: it waits for queued log entries", async () => {
			getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
			await startLesson();
			const slowLog = deferred();
			logger().addTurn.mockImplementationOnce(() => slowLog.promise);
			await sendTeacherMessage("TURN-A");
			expect(isUnlocked()).toBe(true);

			click(finishButton());
			click(finishButton()); // repeated click while finishing is pending
			await flush();
			expect(logger().endSession).not.toHaveBeenCalled();

			slowLog.resolve();
			await flush();
			const { addTurn, endSession, saveToLocalStorage } = logger();
			expect(addTurn).toHaveBeenCalledTimes(1);
			expect(addTurn.mock.calls[0][0]).toBe("TURN-A");
			expect(endSession).toHaveBeenCalledTimes(1);
			expect(saveToLocalStorage).toHaveBeenCalledTimes(1);
			expect(addTurn.mock.invocationCallOrder[0]).toBeLessThan(endSession.mock.invocationCallOrder[0]);
		});
	});
});

// ─── C4: empty teacher messages ──────────────────────────────────────────────

describe("empty teacher messages (C4)", () => {
	const finishButton = () => findButtonByText(view.container, "סיים שיחה");

	function expectNothingStarted() {
		expect(getPCKFeedback).not.toHaveBeenCalled();
		expect(callAI).not.toHaveBeenCalled();
		expect(logger().addTurn).not.toHaveBeenCalled();
		// No teacher message in history: the pre-lesson briefing (shown only while history is
		// empty) is still visible and finish is still unavailable.
		expect(view.container.textContent).toContain(scenario.teacher_briefing.slice(0, 40));
		expect(finishButton().disabled).toBe(true);
		// Turn lock not activated.
		expect(view.container.querySelector("textarea").disabled).toBe(false);
		expect(view.container.querySelector('img[alt="waiting for response..."]')).toBeNull();
	}

	beforeEach(() => getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS));

	it.each([
		["an empty string", ""],
		["spaces only", "   "],
		["tabs and spaces", " \t  \t "],
		["line breaks only", "\n\n"],
	])("ignores %s with no drawing", async (_label, text) => {
		await startLesson();
		await sendTeacherMessage(text);
		expectNothingStarted();
	});

	it("ignores empty text when the drawing opt-in is ticked but the board is empty", async () => {
		board.include = true;
		board.image = null;
		await startLesson();
		await sendTeacherMessage("  ");
		expectNothingStarted();
	});

	it("a normal message after an ignored empty one starts a turn as usual", async () => {
		await startLesson();
		await sendTeacherMessage("   ");
		await sendTeacherMessage("מה ההגדרה של מלבן?");
		expect(getPCKFeedback).toHaveBeenCalledTimes(1);
		expect(getPCKFeedback.mock.calls[0][0]).toBe("מה ההגדרה של מלבן?");
		expect(callAI).toHaveBeenCalledTimes(1);
		expect(studentCalls[0].messages.map((m) => m.text)).toEqual(["מה ההגדרה של מלבן?"]);
		expect(logger().addTurn).toHaveBeenCalledTimes(1);
	});

	it("accepts an image-only submit with an included, non-empty drawing as a valid turn (B22)", async () => {
		board.include = true;
		board.image = "iVBORimageonly";
		await startLesson();
		await sendTeacherMessage("");

		expect(callAI).toHaveBeenCalledTimes(1);
		const teacherMsg = studentCalls[0].messages[0];
		expect(teacherMsg.role).toBe("user");
		expect(teacherMsg.text).toBe("");
		expect(teacherMsg.image).toBe("iVBORimageonly");
		expect(teacherMsg.toAIformat().content).toEqual([
			{ text: "" },
			{ inline_data: { mime_type: "image/png", data: "iVBORimageonly" } },
		]);

		expect(logger().addTurn).toHaveBeenCalledTimes(1);
		const [loggedText, loggedStudents, , loggedImage] = logger().addTurn.mock.calls[0];
		expect(loggedText).toBe("");
		expect(loggedStudents).toEqual([{ name: allStudents[0].name, text: "STUDENT-REPLY" }]);
		expect(loggedImage).toBe("iVBORimageonly");
		expect(view.container.textContent).not.toContain(scenario.teacher_briefing.slice(0, 40)); // now in history
	});

	it("keeps surrounding whitespace of a non-empty message unchanged", async () => {
		await startLesson();
		await sendTeacherMessage("  שאלה  ");
		expect(getPCKFeedback.mock.calls[0][0]).toBe("  שאלה  ");
	});
});

// ─── C7 phase 1: visible, diagnosable failures ───────────────────────────────

describe("failure visibility and diagnostics (C7 phase 1)", () => {
	const studentError = () => view.container.querySelector('[data-testid="turn-error"]');
	const pckError = () => view.container.querySelector('[data-testid="pck-error"]');
	let errorSpy;
	beforeEach(() => {
		errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => errorSpy.mockRestore());

	const httpError = (endpoint, serverError) =>
		Object.assign(new Error(`Backend error (500): ${serverError}`), { stage: "http", status: 500, endpoint, serverError });

	// B2 (what follows a PCK failure) is REVIEW: these tests deliberately do not assert whether
	// students are generated afterwards, only that the failure is visible, recorded, and the turn
	// settles without crashing.
	it("PCK failure: visible notice, failure recorded, lock released, turn settles without crashing", async () => {
		getPCKFeedback.mockRejectedValueOnce(httpError("/api/pck-feedback", "Failed to parse AI response as JSON"));
		await startLesson();
		await sendTeacherMessage("מה ההגדרה של מלבן?");

		expect(pckError().textContent).toBe(FAILURE_MESSAGES_HE.pck);
		expect(pckError().getAttribute("role")).toBe("alert");
		expect(isUnlocked()).toBe(true);

		const pckAttempts = logger().addFailedAttempt.mock.calls.map((c) => c[0]).filter((a) => a.agent === "pck");
		expect(pckAttempts).toHaveLength(1);
		expect(pckAttempts[0]).toEqual(
			expect.objectContaining({ agent: "pck", stage: "parse", endpoint: "/api/pck-feedback", httpStatus: 500, pckFeedbackDisplayed: false })
		);
		// If a turn is logged after a PCK failure, it carries no displayed feedback (A4).
		logger().addTurn.mock.calls.forEach((call) => expect(call[2]).toBeNull());

		// The session keeps working: a following message starts a new turn.
		getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
		await sendTeacherMessage("שאלה שנייה");
		expect(getPCKFeedback).toHaveBeenCalledTimes(2);
		expect(isUnlocked()).toBe(true);
	});

	it("student request failure: visible error, nothing logged as a turn, lock released, failure recorded", async () => {
		getPCKFeedback.mockResolvedValue(FEEDBACK_ANALYSIS);
		callAI.mockImplementationOnce(() => Promise.reject(httpError("/api/generate", "No candidates in response")));
		await startLesson();
		await sendTeacherMessage("מה ההגדרה של מלבן?");

		expect(studentError().textContent).toBe(FAILURE_MESSAGES_HE.student);
		expect(studentError().getAttribute("role")).toBe("alert");
		expect(isUnlocked()).toBe(true);
		expect(logger().addTurn).not.toHaveBeenCalled();
		expect(logger().addFailedAttempt).toHaveBeenCalledTimes(1);
		const recorded = logger().addFailedAttempt.mock.calls[0][0];
		expect(recorded).toEqual(
			expect.objectContaining({ agent: "student", stage: "http", endpoint: "/api/generate", httpStatus: 500, pckFeedbackDisplayed: true })
		);
		expect(typeof recorded.timestamp).toBe("string");
	});

	it("student parse failure: no fallback or fake reply is persisted; raw output excerpt recorded", async () => {
		getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
		callAI.mockImplementationOnce(() =>
			Promise.reject(Object.assign(new Error("Invalid student agent output"), { stage: "parse", endpoint: "/api/generate", rawOutput: "{\"responses\": [" }))
		);
		await startLesson();
		await sendTeacherMessage("מה ההגדרה של מלבן?");

		expect(studentError()).not.toBeNull();
		expect(logger().addTurn).not.toHaveBeenCalled();
		expect(view.container.textContent).not.toContain("אני צריך רגע לחשוב על זה");
		expect(logger().addFailedAttempt.mock.calls[0][0]).toEqual(
			expect.objectContaining({ agent: "student", stage: "parse", rawOutputExcerpt: "{\"responses\": [", rawOutputChars: 15 })
		);
	});

	it("the PCK failure notice contains no technical details", async () => {
		getPCKFeedback.mockRejectedValueOnce(httpError("/api/pck-feedback", "SECRET-PCK-DETAIL"));
		await startLesson();
		await sendTeacherMessage("שאלה");
		expect(pckError()).not.toBeNull();
		expect(view.container.textContent).not.toMatch(/SECRET-|Backend error|500|\/api\/|Error/);
	});

	it("the student failure notice contains no technical details", async () => {
		getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
		callAI.mockImplementationOnce(() => Promise.reject(httpError("/api/generate", "SECRET-STUDENT-DETAIL")));
		await startLesson();
		await sendTeacherMessage("שאלה");
		expect(studentError()).not.toBeNull();
		expect(view.container.textContent).not.toMatch(/SECRET-|Backend error|500|\/api\/|Error/);
	});

	it("a later successful turn clears stale errors and works normally; failures do not shift turn numbering", async () => {
		getPCKFeedback.mockResolvedValue(FEEDBACK_ANALYSIS);
		await startLesson();
		await sendTeacherMessage("TURN-1");

		// A student failure (PCK succeeded), then a PCK failure on the next attempt.
		callAI.mockImplementationOnce(() => Promise.reject(httpError("/api/generate", "y")));
		await sendTeacherMessage("FAILED-STUDENTS");
		expect(studentError()).not.toBeNull();
		getPCKFeedback.mockRejectedValueOnce(httpError("/api/pck-feedback", "x"));
		await sendTeacherMessage("FAILED-PCK");
		expect(pckError()).not.toBeNull();
		expect(studentError()).toBeNull(); // replaced when the new turn started

		await sendTeacherMessage("TURN-2");
		expect(studentError()).toBeNull();
		expect(pckError()).toBeNull();
		expect(sidebarText()).toContain("SIDEBAR-EVIDENCE");
		expect(view.container.textContent).toContain("STUDENT-REPLY");

		const { addTurn, addFailedAttempt } = logger();
		const logged = addTurn.mock.calls.map((c) => c[0]);
		expect(logged[0]).toBe("TURN-1");
		expect(logged[logged.length - 1]).toBe("TURN-2");
		expect(logged).not.toContain("FAILED-STUDENTS");
		const agents = addFailedAttempt.mock.calls.map((c) => c[0].agent);
		expect(agents.slice(0, 2)).toEqual(["student", "pck"]);
		// Order on the log queue: turn 1, then the failures, then turn 2.
		const turn2Order = addTurn.mock.invocationCallOrder[addTurn.mock.calls.length - 1];
		expect(addTurn.mock.invocationCallOrder[0]).toBeLessThan(addFailedAttempt.mock.invocationCallOrder[0]);
		expect(addFailedAttempt.mock.invocationCallOrder[1]).toBeLessThan(turn2Order);
	});
});

// ─── B22 / E1: image-only turns skip PCK until the PCK agent is multimodal ────

describe("PCK handling by turn type (B22 / E1)", () => {
	const pckError = () => view.container.querySelector('[data-testid="pck-error"]');

	beforeEach(() => getPCKFeedback.mockResolvedValue(FEEDBACK_ANALYSIS));

	it.each([
		["empty text", ""],
		["whitespace-only text", "   "],
	])("image-only turn (%s): PCK skipped silently; students get the drawing; turn logged normally", async (_label, text) => {
		board.include = true;
		board.image = "iVBORimageonly";
		await startLesson();
		await sendTeacherMessage(text);

		expect(getPCKFeedback).not.toHaveBeenCalled();
		expect(pckError()).toBeNull();
		expect(logger().addFailedAttempt).not.toHaveBeenCalled();

		expect(callAI).toHaveBeenCalledTimes(1);
		expect(studentCalls[0].messages[0].image).toBe("iVBORimageonly");
		expect(studentCalls[0].impact).toBeNull();

		expect(logger().addTurn).toHaveBeenCalledTimes(1);
		const [, loggedStudents, loggedFeedback, loggedImage] = logger().addTurn.mock.calls[0];
		expect(loggedStudents).toEqual([{ name: allStudents[0].name, text: "STUDENT-REPLY" }]);
		expect(loggedFeedback).toBeNull();
		expect(loggedImage).toBe("iVBORimageonly");

		expect(isUnlocked()).toBe(true);
	});

	it("image-only turn keeps the lock until students reply", async () => {
		board.include = true;
		board.image = "iVBORimageonly";
		const students = pendingStudents();
		await startLesson();
		await sendTeacherMessage("");
		expect(getPCKFeedback).not.toHaveBeenCalled();
		expect(isLocked()).toBe(true);
		students[0].resolve("STUDENT-REPLY");
		await flush();
		expect(isUnlocked()).toBe(true);
	});

	it("text-only turn still calls PCK exactly as before", async () => {
		await startLesson();
		await sendTeacherMessage("מה ההגדרה של מלבן?");
		expect(getPCKFeedback).toHaveBeenCalledTimes(1);
		const [teacherText, history, scen, feedbackHistory] = getPCKFeedback.mock.calls[0];
		expect(teacherText).toBe("מה ההגדרה של מלבן?");
		expect(history.map((m) => m.text)).toEqual(["מה ההגדרה של מלבן?"]);
		expect(scen).toBe(scenario);
		expect(feedbackHistory).toEqual([]);
		expect(studentCalls[0].impact).toBe(FEEDBACK_ANALYSIS);
	});

	it("text + drawing turn calls PCK with the text and sends the drawing to the students", async () => {
		board.include = true;
		board.image = "iVBORwithtext";
		await startLesson();
		await sendTeacherMessage("הסתכלו על הציור");
		expect(getPCKFeedback).toHaveBeenCalledTimes(1);
		expect(getPCKFeedback.mock.calls[0][0]).toBe("הסתכלו על הציור");
		expect(studentCalls[0].messages[0].image).toBe("iVBORwithtext");
		expect(studentCalls[0].impact).toBe(FEEDBACK_ANALYSIS);
		expect(logger().addTurn.mock.calls[0][3]).toBe("iVBORwithtext");
	});

	it("empty / whitespace submissions without a drawing are still blocked (C4)", async () => {
		await startLesson();
		await sendTeacherMessage("   ");
		expect(getPCKFeedback).not.toHaveBeenCalled();
		expect(callAI).not.toHaveBeenCalled();
		expect(logger().addTurn).not.toHaveBeenCalled();
	});
});

// ─── LLM-call telemetry (A17, REVIEW) ────────────────────────────────────────

describe("LLM call telemetry", () => {
	const META = (agent, latencyMs, extra = {}) => ({
		agent,
		model: "gemini-2.5-flash-lite",
		latencyMs,
		finishReason: "STOP",
		attempts: 1,
		clientLatencyMs: latencyMs + 50,
		...extra,
	});
	const expectedTelemetry = (meta) => ({
		status: "ok",
		reason: null,
		model: meta.model,
		latencyMs: meta.latencyMs,
		clientLatencyMs: meta.clientLatencyMs,
		finishReason: meta.finishReason,
		attempts: meta.attempts,
	});

	function pckWithMeta(meta, analysis = FEEDBACK_ANALYSIS) {
		getPCKFeedback.mockImplementationOnce(async (_t, _h, _s, _f, options) => {
			if (options && options.onMeta) options.onMeta(meta);
			return analysis;
		});
	}
	function studentsWithMeta(meta, text = "STUDENT-REPLY") {
		callAI.mockImplementationOnce((history, students, scen, addendum, impact, onResponse) => {
			studentCalls.push({ messages: history.getMessages().slice(), students, impact });
			onResponse([new ChatMessage(students[0].name, text, "assistant")], null, students, meta);
		});
	}
	const loggedTelemetry = (i) => logger().addTurn.mock.calls[i][4];
	let errorSpy;
	beforeEach(() => {
		errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => errorSpy.mockRestore());

	it("a successful turn logs PCK and student telemetry with the turn", async () => {
		const pckMeta = META("pck", 2100);
		const studentMeta = META("student", 900);
		pckWithMeta(pckMeta);
		studentsWithMeta(studentMeta);
		await startLesson();
		await sendTeacherMessage("מה ההגדרה של מלבן?");
		expect(loggedTelemetry(0)).toEqual({ pck: expectedTelemetry(pckMeta), student: expectedTelemetry(studentMeta) });
	});

	it("telemetry stays with the correct turn across turns", async () => {
		pckWithMeta(META("pck", 100));
		studentsWithMeta(META("student", 110));
		pckWithMeta(META("pck", 200), NO_FEEDBACK_ANALYSIS);
		studentsWithMeta(META("student", 220));
		await startLesson();
		await sendTeacherMessage("TURN-1");
		await sendTeacherMessage("TURN-2");
		const calls = logger().addTurn.mock.calls;
		expect(calls.map((c) => [c[0], c[4].pck.latencyMs, c[4].student.latencyMs])).toEqual([
			["TURN-1", 100, 110],
			["TURN-2", 200, 220],
		]);
	});

	it("image-only turn: PCK recorded as skipped (not failed), no failure diagnostic", async () => {
		board.include = true;
		board.image = "iVBORimageonly";
		studentsWithMeta(META("student", 900));
		await startLesson();
		await sendTeacherMessage("");
		expect(getPCKFeedback).not.toHaveBeenCalled();
		expect(logger().addFailedAttempt).not.toHaveBeenCalled();
		expect(loggedTelemetry(0).pck).toEqual({
			status: "skipped",
			reason: "image_only",
			model: null,
			latencyMs: null,
			clientLatencyMs: null,
			finishReason: null,
			attempts: null,
		});
		expect(loggedTelemetry(0).student.status).toBe("ok");
	});

	it("PCK failure: the failure diagnostic carries timing; a logged turn (if any) marks PCK as failed", async () => {
		const failureMeta = META("pck", 4100, { finishReason: "MAX_TOKENS" });
		getPCKFeedback.mockRejectedValueOnce(
			Object.assign(new Error("Backend error (500): Failed to parse AI response as JSON"), {
				stage: "http",
				status: 500,
				endpoint: "/api/pck-feedback",
				serverError: "Failed to parse AI response as JSON",
				meta: { ...failureMeta, clientLatencyMs: undefined },
				clientLatencyMs: 4300,
			})
		);
		await startLesson();
		await sendTeacherMessage("שאלה");
		expect(logger().addFailedAttempt.mock.calls[0][0]).toEqual(
			expect.objectContaining({ agent: "pck", latencyMs: 4100, clientLatencyMs: 4300, finishReason: "MAX_TOKENS", attempts: 1, model: "gemini-2.5-flash-lite" })
		);
		// B2 is REVIEW: whether a turn follows is not asserted; if one is logged, PCK is marked failed.
		logger().addTurn.mock.calls.forEach((call) => {
			expect(call[4].pck).toEqual(expect.objectContaining({ status: "failed", latencyMs: 4100, clientLatencyMs: 4300, finishReason: "MAX_TOKENS" }));
		});
	});

	it("student failure: the failure diagnostic carries timing; nothing is logged as a turn", async () => {
		getPCKFeedback.mockResolvedValue(NO_FEEDBACK_ANALYSIS);
		callAI.mockImplementationOnce(() =>
			Promise.reject(
				Object.assign(new Error("Backend error (500): No candidates"), {
					stage: "http",
					status: 500,
					endpoint: "/api/generate",
					meta: META("student", 3000, { finishReason: "SAFETY", clientLatencyMs: undefined }),
					clientLatencyMs: 3100,
				})
			)
		);
		await startLesson();
		await sendTeacherMessage("שאלה");
		expect(logger().addTurn).not.toHaveBeenCalled();
		expect(logger().addFailedAttempt.mock.calls[0][0]).toEqual(
			expect.objectContaining({ agent: "student", latencyMs: 3000, clientLatencyMs: 3100, finishReason: "SAFETY", attempts: 1 })
		);
	});

	it("persisted telemetry contains no teacher text, student text or drawing", async () => {
		board.include = true;
		board.image = "iVBORsecretdrawing";
		pckWithMeta(META("pck", 100));
		studentsWithMeta(META("student", 100), "SECRET-STUDENT-TEXT");
		await startLesson();
		await sendTeacherMessage("SECRET-TEACHER-TEXT");
		const json = JSON.stringify(loggedTelemetry(0));
		expect(json).not.toMatch(/SECRET|iVBOR/);
	});
});

