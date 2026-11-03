// X12: one frozen Stage-2 call for live benches (research only). The same request and policy as stage2_runner.mjs with
// --variant FROZEN: stage2.cjs prompt / schema / validation + rubric_v3.FROZEN.json, score_first, the production model
// and baseGenerationConfig (MINIMAL thinking), maxOutputTokens 1200, at most 2 attempts with the identical request.
// Returns { status: 'stage2' | 'fallback_stage1' | 'no_context', rows, attempts, ms }. Same Vertex configuration as server.js.
'use strict';
const fs = require('fs');
const path = require('path');
const S2 = require('./stage2.cjs');

const ROOT = path.resolve(__dirname, '../../../..');
const { VertexAI } = require(path.join(ROOT, 'server/node_modules/@google-cloud/vertexai'));
const rubric = { ...S2.RUBRIC, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'rubric_v3.FROZEN.json'), 'utf8')) };
delete rubric._comment;

let model = null;
let generationConfig = null;
async function init() {
  if (model) return;
  const { GENERAL_MODEL_ID, VERTEX_LOCATION, VERTEX_API_ENDPOINT, baseGenerationConfig } = await import(path.join(ROOT, 'server/model_config.js'));
  const vertex = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT || 'cloud-run-455609', location: VERTEX_LOCATION, apiEndpoint: VERTEX_API_ENDPOINT,
    googleAuthOptions: { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT, 'server/service-account-key.json') } });
  model = vertex.getGenerativeModel({ model: GENERAL_MODEL_ID });
  generationConfig = { ...baseGenerationConfig(), maxOutputTokens: 1200, responseMimeType: 'application/json', responseSchema: S2.buildSchema({ order: 'score_first' }) };
}

async function runStage2(ctx) {
  const t0 = Date.now();
  if (!ctx) return { status: 'no_context', rows: null, attempts: [], ms: 0 };
  await init();
  const request = { contents: [{ role: 'user', parts: [{ text: S2.buildPrompt(ctx, { rubric, order: 'score_first' }) }] }], generationConfig };
  const attempts = [];
  for (let a = 0; a < 2; a++) {
    const ta = Date.now(); const at = {};
    try {
      const res = await model.generateContent(request);
      const c = res.response.candidates && res.response.candidates[0];
      const v = S2.validate(c && c.content && c.content.parts && c.content.parts[0] && c.content.parts[0].text);
      Object.assign(at, { ok: v.ok, reason: v.ok ? null : v.reason, rows: v.rows || null });
    } catch (e) { Object.assign(at, { ok: false, reason: 'call_error', error: String(e.message).slice(0, 160) }); }
    at.ms = Date.now() - ta;
    attempts.push(at);
    if (at.ok) break;
  }
  const final = attempts.find((x) => x.ok);
  return { status: final ? 'stage2' : 'fallback_stage1', rows: final ? final.rows : null, attempts: attempts.map(({ rows, ...x }) => x), ms: Date.now() - t0 };
}

module.exports = { runStage2 };
