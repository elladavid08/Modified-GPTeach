// Fake @google-cloud/vertexai. Tests control model output through `fakeModel`.
export const fakeModel = {
  calls: [],
  // Params passed to getGenerativeModel (model id, requestOptions), recorded at server start
  modelParams: [],
  // Replaced per test: (request) => result | Promise<result>
  respond: () => {
    throw new Error('fakeModel.respond not configured for this test');
  },
  reset() {
    this.calls = [];
    this.respond = () => {
      throw new Error('fakeModel.respond not configured for this test');
    };
  },
};

globalThis.__fakeModel = fakeModel;

export class VertexAI {
  constructor(options) {
    this.options = options;
  }

  getGenerativeModel(params) {
    fakeModel.modelParams.push(params);
    return {
      params,
      generateContent: async (request) => {
        fakeModel.calls.push(request);
        return fakeModel.respond(request);
      },
    };
  }
}

/** Build a Vertex-shaped result whose first candidate contains `text`. */
export function textResult(text, finishReason = 'STOP') {
  return { response: { candidates: [{ content: { parts: [{ text }] }, finishReason }] } };
}

/** Resolve `value` after `ms` milliseconds (simulated model latency). */
export function delayed(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
