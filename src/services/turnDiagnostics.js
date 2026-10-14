/**
 * Turn failure diagnostics (C7 phase 1).
 *
 * Builds a compact, privacy-minimal record of a failed PCK / student-agent call. The record is
 * stored in the conversation's additive `failedAttempts` list (see ConversationLog) and never in
 * `turns[]`. It does not include teacher text, images, conversation history, stack traces or
 * credentials.
 */

import { timingFields } from "./callTelemetry";

export const MAX_ERROR_MESSAGE_CHARS = 300;
export const MAX_RAW_OUTPUT_CHARS = 1000;

/** Concise teacher-facing notices (no technical details). */
export const FAILURE_MESSAGES_HE = {
	pck: "לא ניתן היה לקבל משוב פדגוגי בגלל תקלה זמנית במערכת. אפשר להמשיך בשיחה ולנסות שוב בהודעה הבאה.",
	student: "אירעה תקלה זמנית במערכת והתלמידים לא הגיבו. אפשר לנסות לשלוח את ההודעה שוב.",
};

const KNOWN_STAGES = ["network", "http", "parse"];

/**
 * Failure stage:
 * - network: no HTTP response from the backend
 * - http: the backend returned an error (model/request execution failed server-side)
 * - parse: the model output could not be parsed (client-side for students; the server's
 *          explicit JSON-parse error for PCK)
 * - client: anything else, e.g. an exception while building the request
 */
function classifyStage(agent, error) {
	if (!error || !KNOWN_STAGES.includes(error.stage)) return "client";
	// The server's final output-parse / validation failures (PCK since C10, student since 1.3.6)
	if (error.stage === "http" && /Failed to parse AI response/i.test(error.serverError || "")) {
		return "parse";
	}
	return error.stage;
}

const truncate = (value, max) => (typeof value === "string" ? value.slice(0, max) : null);

export function buildFailedAttempt({ agent, error, teacherMessage = null, pckFeedbackDisplayed = false, now = new Date() }) {
	const rawOutput = error && typeof error.rawOutput === "string" ? error.rawOutput : null;
	return {
		agent,
		stage: classifyStage(agent, error),
		endpoint: (error && error.endpoint) || null,
		httpStatus: error && Number.isInteger(error.status) ? error.status : null,
		errorName: (error && error.name) || null,
		errorMessage: truncate(error && error.message, MAX_ERROR_MESSAGE_CHARS),
		timestamp: now.toISOString(),
		teacherMessageChars: teacherMessage && typeof teacherMessage.text === "string" ? teacherMessage.text.length : null,
		teacherHasDrawing: Boolean(teacherMessage && teacherMessage.image),
		pckFeedbackDisplayed: Boolean(pckFeedbackDisplayed),
		rawOutputExcerpt: truncate(rawOutput, MAX_RAW_OUTPUT_CHARS),
		rawOutputChars: rawOutput === null ? null : Number.isInteger(error.rawOutputChars) ? error.rawOutputChars : rawOutput.length,
		// Call telemetry where available (model, latencyMs, clientLatencyMs, finishReason, attempts)
		...timingFields(error && error.meta, error ? error.clientLatencyMs : undefined),
	};
}
