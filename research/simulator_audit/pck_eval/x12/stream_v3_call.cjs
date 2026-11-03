// X12c-v3: the FROZEN independent X12 Stage-2 call (A1i: stage2.cjs prompt + schema + rubric_v3.FROZEN, score_first,
// identical request), read in streaming mode with an EARLY steering decision (research only).
// The output lists the five skills in the fixed order, each as {skill_id, is_relevant, score, what_exists,
// what_to_improve}. The signal (stage2_dep.cjs signalFromRows) is decided as soon as it is determined:
//   none    when error-identification (the first entry) is relevant with score 0;
//   strong  at the first score 2 once error-identification is known not to be 0;
//   else    after the fifth entry's score (partial, or none when every relevant score is 0).
// The rest of the same call continues to write the text. Policy: stream error before the signal -> one identical retry;
// text invalid after the signal was used -> the text-for-fixed-scores call writes the text for exactly the streamed scores.
// runStreamV3(ctx, onSignal) -> { status, signal, scoreRows, rows, tFirstChunk, tSignal, tScores, tDone, decidedAt, attempts, ... }
'use strict';
const fs = require('fs');
const path = require('path');
const S2 = require('./stage2.cjs');
const DEP = require('./dep_call.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
// Per-attempt budget as the production policy (server/llm_call_policy.js: 20 s per attempt).
const ATTEMPT_MS = 20000;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms} ms`)), ms))]);
const { VertexAI } = require(path.join(ROOT, 'server/node_modules/@google-cloud/vertexai'));
const rubric = { ...S2.RUBRIC, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'rubric_v3.FROZEN.json'), 'utf8')) };
delete rubric._comment;
const IDS = S2.SKILL_IDS;

let model = null; let generationConfig = null;
async function init() {
  if (model) return;
  const { GENERAL_MODEL_ID, VERTEX_LOCATION, VERTEX_API_ENDPOINT, baseGenerationConfig } = await import(path.join(ROOT, 'server/model_config.js'));
  const vertex = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT || 'cloud-run-455609', location: VERTEX_LOCATION, apiEndpoint: VERTEX_API_ENDPOINT,
    googleAuthOptions: { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT, 'server/service-account-key.json') } });
  model = vertex.getGenerativeModel({ model: GENERAL_MODEL_ID });
  generationConfig = { ...baseGenerationConfig(), maxOutputTokens: 1200, responseMimeType: 'application/json', responseSchema: S2.buildSchema({ order: 'score_first' }) }; // = stage2_call.cjs
}

// relevance + score of each entry as soon as both appear in the stream prefix (skill ids are in the fixed order)
const ENTRY = /"skill_id"\s*:\s*"([a-z-]+)"\s*,\s*"is_relevant"\s*:\s*(true|false)\s*,\s*"score"\s*:\s*(null|-?\d+)/g;
function streamedEntries(prefix) {
  const out = []; let m; ENTRY.lastIndex = 0;
  while ((m = ENTRY.exec(prefix))) out.push({ skillId: m[1], relevant: m[2] === 'true', score: m[3] === 'null' ? null : Number(m[3]) });
  return out;
}
/** The signal once it is determined by the entries streamed so far, else null. */
function decide(entries) {
  if (!entries.length) return null;
  if (entries.some((e, i) => e.skillId !== IDS[i])) throw new Error('entry order');
  if (entries.some((e) => e.relevant && ![0, 1, 2].includes(e.score))) throw new Error('invalid score');
  const ei = entries[0];
  if (ei.relevant && ei.score === 0) return 'none';
  if (entries.some((e) => e.relevant && e.score === 2)) return 'strong';
  if (entries.length < IDS.length) return null;
  const rel = entries.filter((e) => e.relevant);
  if (!rel.length) throw new Error('no relevant skill');
  return rel.every((e) => e.score === 0) ? 'none' : 'partial';
}

async function runStreamV3(ctx, onSignal) {
  await init();
  const request = { contents: [{ role: 'user', parts: [{ text: S2.buildPrompt(ctx, { rubric, order: 'score_first' }) }] }], generationConfig };
  const t0 = Date.now();
  const out = { status: 'failed', signal: null, scoreRows: null, rows: null, tFirstChunk: null, tSignal: null, tScores: null, tDone: null, decidedAt: null, attempts: [], chunks: 0, inputTokens: 0, outputTokens: 0 };
  for (let a = 0; a < 2 && !out.signal; a++) {
    const at = { stream: true }; let text = '';
    try {
      const res = await withTimeout(model.generateContentStream(request), ATTEMPT_MS);
      res.response.catch(() => {}); // a broken stream also rejects the aggregate: never leave it unhandled
      const deadline = Date.now() + ATTEMPT_MS;
      for await (const chunk of res.stream) {
        if (Date.now() > deadline) { at.reason = 'attempt_timeout'; break; }
        const c = chunk.candidates && chunk.candidates[0];
        const piece = c && c.content && c.content.parts ? c.content.parts.map((p) => p.text || '').join('') : '';
        if (!piece) continue;
        if (out.tFirstChunk == null) out.tFirstChunk = Date.now() - t0;
        text += piece; out.chunks++;
        const entries = streamedEntries(text);
        if (!out.signal) {
          let s = null;
          try { s = decide(entries); } catch (err) { at.reason = 'early_invalid'; at.error = String(err.message).slice(0, 120); break; }
          if (s) { out.signal = s; out.tSignal = Date.now() - t0; out.decidedAt = entries.length; if (onSignal) onSignal(s, out.tSignal); }
        }
        if (out.tScores == null && entries.length === IDS.length) out.tScores = Date.now() - t0;
      }
      if (at.reason) { out.attempts.push(at); continue; }
      const agg = await res.response; const u = agg.usageMetadata || {};
      out.inputTokens += u.promptTokenCount || 0; out.outputTokens += u.candidatesTokenCount || 0;
      const v = S2.validate(text);
      const entries = streamedEntries(text);
      out.scoreRows = entries.filter((e) => e.relevant).map((e) => ({ skillId: e.skillId, score: e.score }));
      at.ok = v.ok; at.reason = v.ok ? null : v.reason; out.attempts.push(at);
      if (!out.signal) continue; // no signal (e.g. truncated before the scores): retry
      if (v.ok) {
        const same = JSON.stringify(v.rows.map((r) => [r.skillId, r.score])) === JSON.stringify(out.scoreRows.map((r) => [r.skillId, r.score]));
        at.scoresMatch = same;
        if (same && DEP_signal(v.rows) === out.signal) { out.rows = v.rows; out.status = 'ok'; out.tDone = Date.now() - t0; return out; }
        at.reason = 'signal_mismatch';
      }
    } catch (e) {
      at.reason = 'call_error'; at.error = String(e.message).slice(0, 160); out.attempts.push(at);
    }
  }
  if (!out.signal) { out.tDone = Date.now() - t0; return out; } // Stage-1 fallback
  // the signal was used but the text is not valid: text for exactly the streamed scores (complete them if needed)
  if (!out.scoreRows || !out.scoreRows.length) { out.status = 'text_failed'; out.tDone = Date.now() - t0; return out; }
  const x = await DEP.runText(ctx, out.scoreRows);
  out.inputTokens += x.inputTokens || 0; out.outputTokens += x.outputTokens || 0;
  out.attempts.push({ textFallback: true, ok: x.status === 'ok', ms: x.ms });
  out.rows = x.status === 'ok' ? x.rows : out.scoreRows.map((r) => ({ ...r, positive: null, improvement: null }));
  out.status = x.status === 'ok' ? 'text_fallback' : 'text_failed';
  out.tDone = Date.now() - t0;
  return out;
}
const { signalFromRows: DEP_signal } = require('./stage2_dep.cjs');

module.exports = { runStreamV3, decide, streamedEntries };
