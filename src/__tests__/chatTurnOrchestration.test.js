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
// Deliberately NOT asserted (defects, invariants.md §C): empty sends (C4), newline handling (C5),
// and how failures are surfaced to the teacher (C7).
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
