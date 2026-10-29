// X12b: calls for the dependent Stage-2 variants (research only). Same Vertex configuration, model and
// baseGenerationConfig (MINIMAL thinking) as server.js / stage2_call.cjs; at most 2 attempts with the identical request.
//   runFull(ctx, stage1)   -> rows with text (relevance, scores, text), given the Stage-1 assessment
//   runScores(ctx, stage1) -> rows without text (the fast assessment)
//   runScoresIndep(ctx)    -> rows without text, WITHOUT the Stage-1 assessment (independent fast assessment)
//   runText(ctx, rows)     -> the same rows with text, for fixed scores
// Each returns { status: 'ok' | 'failed', rows, attempts, ms, inputTokens, outputTokens }.
'use strict';
const path = require('path');
const D = require('./stage2_dep.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const { VertexAI } = require(path.join(ROOT, 'server/node_modules/@google-cloud/vertexai'));

let model = null; let base = null;
async function init() {
  if (model) return;
  const { GENERAL_MODEL_ID, VERTEX_LOCATION, VERTEX_API_ENDPOINT, baseGenerationConfig } = await import(path.join(ROOT, 'server/model_config.js'));
  const vertex = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT || 'cloud-run-455609', location: VERTEX_LOCATION, apiEndpoint: VERTEX_API_ENDPOINT,
    googleAuthOptions: { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT, 'server/service-account-key.json') } });
  model = vertex.getGenerativeModel({ model: GENERAL_MODEL_ID }); base = baseGenerationConfig();
}

async function call(prompt, schema, maxOutputTokens, validate) {
  await init();
  const request = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { ...base, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema } };
  const t0 = Date.now(); const attempts = []; let inTok = 0; let outTok = 0;
  for (let a = 0; a < 2; a++) {
    const ta = Date.now(); const at = {};
    try {
      const res = await model.generateContent(request);
      const c = res.response.candidates && res.response.candidates[0]; const u = res.response.usageMetadata || {};
      inTok += u.promptTokenCount || 0; outTok += u.candidatesTokenCount || 0;
      const v = validate(c && c.content && c.content.parts && c.content.parts[0] && c.content.parts[0].text);
      Object.assign(at, { ok: v.ok, reason: v.ok ? null : v.reason, rows: v.ok ? v.rows : null });
    } catch (e) { Object.assign(at, { ok: false, reason: 'call_error', error: String(e.message).slice(0, 160) }); }
    at.ms = Date.now() - ta; attempts.push(at);
    if (at.ok) break;
  }
  const fin = attempts.find((x) => x.ok);
  return { status: fin ? 'ok' : 'failed', rows: fin ? fin.rows : null, attempts: attempts.map(({ rows, ...x }) => x), ms: Date.now() - t0, inputTokens: inTok, outputTokens: outTok };
}

const runFull = (ctx, s1) => call(D.buildDependentPrompt(ctx, s1, 'full'), D.fullSchema(), 1200, D.validateFull);
const runScores = (ctx, s1) => call(D.buildDependentPrompt(ctx, s1, 'scores'), D.scoresSchema(), 200, D.validateScores);
const runScoresIndep = (ctx) => call(D.buildDependentPrompt(ctx, null, 'scores'), D.scoresSchema(), 200, D.validateScores); // independent fast assessment
const runText = (ctx, rows) => call(D.buildTextPrompt(ctx, rows), D.textSchema(rows), 900, (t) => D.validateText(t, rows));

module.exports = { runFull, runScores, runScoresIndep, runText };
