// C7 phase 1: classification and data-minimisation of failed-attempt diagnostics (A16).
import { buildFailedAttempt, MAX_ERROR_MESSAGE_CHARS, MAX_RAW_OUTPUT_CHARS } from "../services/turnDiagnostics";

function tagged(message, props) {
	return Object.assign(new Error(message), props);
}

function hasUndefined(value) {
	if (value === undefined) return true;
	if (value && typeof value === "object") return Object.values(value).some(hasUndefined);
	return false;
}

const NOW = new Date("2026-10-05T12:00:00.000Z");

describe("buildFailedAttempt", () => {
	it("records a PCK HTTP failure with endpoint, status and timestamp", () => {
		const a = buildFailedAttempt({
			agent: "pck",
			error: tagged("Backend error (500): No candidates in response", {
				stage: "http",
				status: 500,
				endpoint: "/api/pck-feedback",
				serverError: "No candidates in response",
			}),
			teacherMessage: { text: "שאלה", image: null },
			now: NOW,
		});
		expect(a).toEqual(
			expect.objectContaining({
				agent: "pck",
				stage: "http",
				endpoint: "/api/pck-feedback",
				httpStatus: 500,
				errorName: "Error",
				errorMessage: "Backend error (500): No candidates in response",
				timestamp: "2026-10-05T12:00:00.000Z",
			})
		);
	});

	it("classifies the server's PCK JSON-parse failure as a parse failure", () => {
		const a = buildFailedAttempt({
			agent: "pck",
			error: tagged("Backend error (500): Failed to parse AI response as JSON", {
				stage: "http",
				status: 500,
				endpoint: "/api/pck-feedback",
				serverError: "Failed to parse AI response as JSON",
			}),
			now: NOW,
		});
		expect(a.stage).toBe("parse");
		expect(a.httpStatus).toBe(500);
	});

	it("classifies the server's PCK validation failure (C10) as a parse failure", () => {
		const a = buildFailedAttempt({
			agent: "pck",
			error: tagged("Backend error (500): Failed to parse AI response: invalid PCK analysis (2 problems)", {
				stage: "http",
				status: 500,
				endpoint: "/api/pck-feedback",
				serverError: "Failed to parse AI response: invalid PCK analysis (2 problems)",
			}),
			now: NOW,
		});
		expect(a.stage).toBe("parse");
	});

	it("records a network failure (no HTTP response)", () => {
		const a = buildFailedAttempt({
			agent: "student",
			error: tagged("Backend server not available.", { stage: "network", endpoint: "/api/generate" }),
			now: NOW,
		});
		expect(a.stage).toBe("network");
		expect(a.httpStatus).toBeNull();
		expect(a.endpoint).toBe("/api/generate");
	});

	it("records a student parse failure with a bounded raw-output excerpt", () => {
		const raw = "x".repeat(MAX_RAW_OUTPUT_CHARS + 500);
		const a = buildFailedAttempt({
			agent: "student",
			error: tagged("Invalid student agent output", { stage: "parse", endpoint: "/api/generate", rawOutput: raw }),
			now: NOW,
		});
		expect(a.stage).toBe("parse");
		expect(a.rawOutputChars).toBe(raw.length);
		expect(a.rawOutputExcerpt).toHaveLength(MAX_RAW_OUTPUT_CHARS);
	});

	it("classifies untagged errors (e.g. prompt construction) as client failures", () => {
		const a = buildFailedAttempt({ agent: "student", error: new TypeError("Cannot read properties of null"), now: NOW });
		expect(a.stage).toBe("client");
		expect(a.errorName).toBe("TypeError");
		expect(a.endpoint).toBeNull();
	});

	it("does not store teacher text, images, stacks or undefined values", () => {
		const error = tagged("y".repeat(MAX_ERROR_MESSAGE_CHARS + 100), { stage: "http", status: 503, endpoint: "/api/generate" });
		const a = buildFailedAttempt({
			agent: "student",
			error,
			teacherMessage: { text: "SECRET-TEACHER-TEXT", image: "iVBORbigimage" },
			pckFeedbackDisplayed: true,
			now: NOW,
		});
		const json = JSON.stringify(a);
		expect(json).not.toContain("SECRET-TEACHER-TEXT");
		expect(json).not.toContain("iVBORbigimage");
		expect(json).not.toContain(error.stack.split("\n")[1].trim());
		expect(a.teacherMessageChars).toBe("SECRET-TEACHER-TEXT".length);
		expect(a.teacherHasDrawing).toBe(true);
		expect(a.pckFeedbackDisplayed).toBe(true);
		expect(a.errorMessage).toHaveLength(MAX_ERROR_MESSAGE_CHARS);
		expect(hasUndefined(a)).toBe(false); // Firestore rejects undefined fields
		expect(a).not.toHaveProperty("turnNumber"); // A3/A16
	});

	it("handles a missing error object and teacher message", () => {
		const a = buildFailedAttempt({ agent: "pck", error: undefined, now: NOW });
		expect(a.stage).toBe("client");
		expect(a.teacherMessageChars).toBeNull();
		expect(hasUndefined(a)).toBe(false);
	});
});
