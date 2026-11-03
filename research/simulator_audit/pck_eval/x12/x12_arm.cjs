// Analysis-only preload (node -r) for X12, two-stage PCK (research only). It runs the UNMODIFIED 1.5.1 server: the
// Stage-1 PCK request is sent exactly as production builds it and its output is returned unchanged, except that the
// verbatim Stage-1 context (lesson context, conversation history, teacher message, taken from the Stage-1 prompt's own
// sections) is attached as an additive top-level field `_x12ctx` so Stage 2 can be run offline on the same inputs.
// Replay files that contain `_x12ctx` hold participant text: write them to git-ignored local folders only.
// Content-free call records (agent, latency, tokens, finish reason) go to ARM_FILE.
'use strict';
const fs = require('fs');
const path = require('path');
const sdk = require(path.resolve(__dirname, '../../../../server/node_modules/@google-cloud/vertexai'));
const S2 = require('./stage2.cjs');

const log = (rec) => { if (process.env.ARM_FILE) fs.appendFileSync(process.env.ARM_FILE, JSON.stringify(rec) + '\n'); };
const textOf = (result) => {
  const c = result && result.response && result.response.candidates && result.response.candidates[0];
  return c && c.content && c.content.parts && c.content.parts[0] && c.content.parts[0].text;
};
const agentOf = (request) => {
  const props = ((request.generationConfig || {}).responseSchema || {}).properties || {};
  if (props.pedagogical_quality) return 'pck';
  if (props.responses) return 'student';
  return null;
};

const orig = sdk.GenerativeModel.prototype.generateContent;
sdk.GenerativeModel.prototype.generateContent = async function (request) {
  const agent = agentOf(request);
  if (!agent) return orig.call(this, request);
  const t0 = Date.now();
  const rec = { arm: process.env.ARM || null, agent, model: this.model };
  let result;
  try {
    result = await orig.call(this, request);
  } catch (e) {
    log({ ...rec, ok: false, ms: Date.now() - t0, error: String(e.message).slice(0, 200) });
    throw e;
  }
  const r = result.response; const c = r.candidates && r.candidates[0]; const u = r.usageMetadata || {};
  log({ ...rec, ok: true, ms: Date.now() - t0, finishReason: c && c.finishReason, inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount, thoughts: u.thoughtsTokenCount || 0 });
  if (agent !== 'pck') return result;
  let parsed;
  try { parsed = JSON.parse(String(textOf(result)).trim()); } catch { return result; } // the server handles Stage-1 failures
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return result;
  const ctx = S2.extractContext(request.contents[0].parts[0].text);
  const augmented = { ...parsed, _x12ctx: ctx };
  const back = JSON.parse(JSON.stringify(augmented)); delete back._x12ctx;
  if (JSON.stringify(back) !== JSON.stringify(parsed)) throw new Error('x12: Stage-1 output changed');
  c.content = { ...c.content, parts: [{ text: JSON.stringify(augmented) }] };
  return result;
};
