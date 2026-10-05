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
