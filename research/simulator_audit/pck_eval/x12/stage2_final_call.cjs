// X12 FINAL candidate: one live Stage-2 call for the opportunity bench (research only). The same request and policy as
// stage2_runner_final.mjs with rubric_final.FROZEN.json (FINAL_FREEZE.md): stage2_final.cjs prompt (score_first),
// stage2.cjs schema / validation, the production model and baseGenerationConfig (MINIMAL thinking), maxOutputTokens 1200,
// at most 2 attempts with the identical request. The guard and the no-feedback rule are applied by the caller
// (final_pipeline.cjs finalizeTurn), exactly as offline. Returns { status: 'stage2' | 'fallback_stage1' | 'no_context',
// rows, attempts, ms }. Same Vertex configuration as server.js.
'use strict';
const path = require('path');
const F = require('./stage2_final.cjs');

const ROOT = path.resolve(__dirname, '../../../..');
const { VertexAI } = require(path.join(ROOT, 'server/node_modules/@google-cloud/vertexai'));
const FR = F.loadRubric(path.join(__dirname, 'rubric_final.FROZEN.json'));

let model = null;
let generationConfig = null;
async function init() {
  if (model) return;
  const { GENERAL_MODEL_ID, VERTEX_LOCATION, VERTEX_API_ENDPOINT, baseGenerationConfig } = await import(path.join(ROOT, 'server/model_config.js'));
  const vertex = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT || 'cloud-run-455609', location: VERTEX_LOCATION, apiEndpoint: VERTEX_API_ENDPOINT,
    googleAuthOptions: { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT, 'server/service-account-key.json') } });
  model = vertex.getGenerativeModel({ model: GENERAL_MODEL_ID });
  generationConfig = { ...baseGenerationConfig(), maxOutputTokens: 1200, responseMimeType: 'application/json', responseSchema: F.buildSchema() };
}

async function runStage2Final(ctx) {
  const t0 = Date.now();
  if (!ctx) return { status: 'no_context', rows: null, attempts: [], ms: 0 };
  await init();
  const request = { contents: [{ role: 'user', parts: [{ text: F.buildPrompt(ctx, FR) }] }], generationConfig };
  const attempts = [];
  for (let a = 0; a < 2; a++) {
    const ta = Date.now(); const at = {};
    try {
      const res = await model.generateContent(request);
      const c = res.response.candidates && res.response.candidates[0];
      const v = F.validate(c && c.content && c.content.parts && c.content.parts[0] && c.content.parts[0].text);
      Object.assign(at, { ok: v.ok, reason: v.ok ? null : v.reason, rows: v.ok ? v.rows : null });
    } catch (e) { Object.assign(at, { ok: false, reason: 'call_error', error: String(e.message).slice(0, 160) }); }
    at.ms = Date.now() - ta;
    attempts.push(at);
    if (at.ok) break;
  }
  const final = attempts.find((x) => x.ok);
  return { status: final ? 'stage2' : 'fallback_stage1', rows: final ? final.rows : null, attempts: attempts.map(({ rows, ...x }) => x), ms: Date.now() - t0 };
}

module.exports = { runStage2Final };
