// C7 phase 1: backend-call errors carry the information needed for diagnostics
// (endpoint, HTTP status, server error text, or a network marker). No real network.
import { getPCKFeedback, generateWithGenAI } from "../services/genai";

function jsonResponse(status, body) {
	return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const realFetch = global.fetch;
let errorSpy;
beforeEach(() => {
	errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	global.fetch = realFetch;
	errorSpy.mockRestore();
});

describe.each([
	["getPCKFeedback", () => getPCKFeedback("שאלה", [], {}, []), "/api/pck-feedback"],
	["generateWithGenAI", () => generateWithGenAI([{ role: "user", content: "x" }]), "/api/generate"],
])("%s", (_name, call, endpoint) => {
	it("tags HTTP failures with stage, status, endpoint and server error", async () => {
		global.fetch = jest.fn(async () => jsonResponse(500, { success: false, error: "Failed to parse AI response as JSON" }));
		const err = await call().then(() => null, (e) => e);
		expect(err).toBeInstanceOf(Error);
		expect(err).toEqual(
			expect.objectContaining({ stage: "http", status: 500, endpoint, serverError: "Failed to parse AI response as JSON" })
		);
	});

	it("tags network failures", async () => {
		global.fetch = jest.fn(async () => {
			throw new TypeError("Failed to fetch");
		});
		const err = await call().then(() => null, (e) => e);
		expect(err).toEqual(expect.objectContaining({ stage: "network", endpoint }));
	});
});

describe("telemetry delivery (onMeta)", () => {
	const META = { agent: "pck", model: "gemini-2.5-flash-lite", latencyMs: 900, finishReason: "STOP", attempts: 1 };

	it("getPCKFeedback returns the analysis and reports meta + client latency via onMeta", async () => {
		global.fetch = jest.fn(async () => jsonResponse(200, { success: true, analysis: { pedagogical_quality: "neutral" }, meta: META }));
		const onMeta = jest.fn();
		const analysis = await getPCKFeedback("שאלה", [], {}, [], { onMeta });
		expect(analysis).toEqual({ pedagogical_quality: "neutral" });
		expect(onMeta).toHaveBeenCalledWith(expect.objectContaining({ ...META, clientLatencyMs: expect.any(Number) }));
		// The callback is not sent to the server
		expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ teacherMessage: "שאלה", conversationHistory: [], scenario: {}, feedbackHistory: [] });
	});

	it("generateWithGenAI returns the text and reports meta via onMeta; onMeta is not sent", async () => {
		global.fetch = jest.fn(async () => jsonResponse(200, { success: true, text: "{}", meta: { ...META, agent: "student" } }));
		const onMeta = jest.fn();
		const text = await generateWithGenAI([{ role: "user", content: "x" }], { stop: ["Teacher:"], onMeta });
		expect(text).toBe("{}");
		expect(onMeta).toHaveBeenCalledWith(expect.objectContaining({ agent: "student", clientLatencyMs: expect.any(Number) }));
		expect(JSON.parse(global.fetch.mock.calls[0][1].body).options).toEqual({ stop: ["Teacher:"] });
	});

	it.each([
		["getPCKFeedback", () => getPCKFeedback("שאלה", [], {}, [])],
		["generateWithGenAI", () => generateWithGenAI([{ role: "user", content: "x" }])],
	])("%s errors carry the server meta and client latency", async (_name, call) => {
		global.fetch = jest.fn(async () => jsonResponse(500, { success: false, error: "UNAVAILABLE", meta: META }));
		const err = await call().then(() => null, (e) => e);
		expect(err.meta).toEqual(META);
		expect(Number.isInteger(err.clientLatencyMs)).toBe(true);
	});

	it("works without server meta (older servers): still reports client latency, no crash", async () => {
		global.fetch = jest.fn(async () => jsonResponse(200, { success: true, analysis: { pedagogical_quality: "neutral" } }));
		const onMeta = jest.fn();
		await getPCKFeedback("שאלה", [], {}, [], { onMeta });
		expect(onMeta).toHaveBeenCalledWith(expect.objectContaining({ clientLatencyMs: expect.any(Number) }));
	});
});

