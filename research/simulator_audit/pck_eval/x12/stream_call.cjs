// X12c: the streamed single Stage-2 call (research only). Same Vertex configuration, model and baseGenerationConfig
// (MINIMAL thinking) as server.js; maxOutputTokens 1200. See stage2_stream.cjs for the output format and policy.
// runStream(ctx, onScores) -> { status: 'ok' | 'text_fallback' | 'text_failed' | 'failed', scoreRows, rows,
//   tFirstChunk, tScores, tDone (ms from the call start), attempts, chunks, inputTokens, outputTokens }
'use strict';
const path = require('path');
const ST = require('./stage2_stream.cjs');
const DEP = require('./dep_call.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
// Per-attempt budget as the production policy (server/llm_call_policy.js: 20 s per attempt).
const ATTEMPT_MS = 20000;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms} ms`)), ms))]);
const { VertexAI } = require(path.join(ROOT, 'server/node_modules/@google-cloud/vertexai'));

let model = null; let base = null;
async function init() {
  if (model) return;
  const { GENERAL_MODEL_ID, VERTEX_LOCATION, VERTEX_API_ENDPOINT, baseGenerationConfig } = await import(path.join(ROOT, 'server/model_config.js'));
  const vertex = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT || 'cloud-run-455609', location: VERTEX_LOCATION, apiEndpoint: VERTEX_API_ENDPOINT,
    googleAuthOptions: { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT, 'server/service-account-key.json') } });
  model = vertex.getGenerativeModel({ model: GENERAL_MODEL_ID }); base = baseGenerationConfig();
}

async function runStream(ctx, onScores) {
  await init();
  const request = { contents: [{ role: 'user', parts: [{ text: ST.buildStreamPrompt(ctx) }] }], generationConfig: { ...base, maxOutputTokens: 1200, responseMimeType: 'application/json', responseSchema: ST.streamSchema() } };
  const t0 = Date.now(); const out = { status: 'failed', scoreRows: null, rows: null, tFirstChunk: null, tScores: null, tDone: null, attempts: [], chunks: 0, inputTokens: 0, outputTokens: 0 };
  for (let a = 0; a < 2 && !out.scoreRows; a++) {
    const at = { stream: true }; let text = '';
    try {
      const res = await withTimeout(model.generateContentStream(request), ATTEMPT_MS);
      res.response.catch(() => {}); // a broken stream also rejects the aggregate: never leave it unhandled
      const deadline = Date.now() + ATTEMPT_MS;
      for await (const chunk of res.stream) {
        if (Date.now() > deadline) { at.reason = 'attempt_timeout'; break; }
        const c = chunk.candidates && chunk.candidates[0];
        const piece = c && c.content && c.content.parts ? c.content.parts.map((p) => p.text || '').join('') : '';
        if (piece) { if (out.tFirstChunk == null) out.tFirstChunk = Date.now() - t0; text += piece; out.chunks++; }
        if (!out.scoreRows) {
          let e = null;
          try { e = ST.earlyScores(text); } catch (err) { at.reason = 'early_invalid'; at.error = String(err.message).slice(0, 120); break; }
          if (e) { out.scoreRows = e; out.tScores = Date.now() - t0; if (onScores) onScores(e, out.tScores); }
        }
      }
      if (at.reason) { out.attempts.push(at); continue; } // invalid scores, nothing used yet: retry
      const agg = await res.response; const u = agg.usageMetadata || {};
      out.inputTokens += u.promptTokenCount || 0; out.outputTokens += u.candidatesTokenCount || 0;
      at.finishReason = agg.candidates && agg.candidates[0] && agg.candidates[0].finishReason;
      if (!out.scoreRows) { at.reason = 'no_early_scores'; out.attempts.push(at); continue; }
      const v = ST.validateFinal(text, out.scoreRows);
      at.ok = v.ok; at.reason = v.ok ? null : v.reason; at.scoresMatch = v.scoresMatch;
      out.attempts.push(at);
      if (v.ok) { out.rows = v.rows; out.status = 'ok'; out.tDone = Date.now() - t0; return out; }
    } catch (e) {
      at.reason = 'call_error'; at.error = String(e.message).slice(0, 160); out.attempts.push(at);
      if (!out.scoreRows) continue; // nothing used yet: retry
    }
  }
  if (!out.scoreRows) { out.tDone = Date.now() - t0; return out; } // both attempts failed before the scores: Stage-1 fallback
  // text failed after the scores were used: write the text for exactly these scores
  const x = await DEP.runText(ctx, out.scoreRows);
  out.inputTokens += x.inputTokens || 0; out.outputTokens += x.outputTokens || 0;
  out.attempts.push({ textFallback: true, ok: x.status === 'ok', ms: x.ms });
  out.rows = x.status === 'ok' ? x.rows : out.scoreRows.map((r) => ({ ...r, positive: null, improvement: null }));
  out.status = x.status === 'ok' ? 'text_fallback' : 'text_failed';
  out.tDone = Date.now() - t0;
  return out;
}

module.exports = { runStream };
