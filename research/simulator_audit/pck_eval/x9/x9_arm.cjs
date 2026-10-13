// Analysis-only preload (node -r) for X9: two-stage PCK scoring prototype. Research only.
// The Stage-1 PCK call (committed 1.4.3, unchanged) runs first. If Stage 1 would display feedback (should_provide_feedback
// true, at least one relevant skill, and not suppressed by the production bare-acknowledgement guard), Stage 2 scores
// exactly those skill ids S2_REPS times with a separate, small, score-first call (same model client, MINIMAL thinking).
// The results are attached as an extra top-level field `_stage2` (the PCK validator accepts additive fields); every
// Stage-1 field is left byte-for-byte equal in value (asserted). Content-free call records go to ARM_FILE.
'use strict';
const fs = require('fs');
const path = require('path');
const sdk = require('/Users/ella/Projects/RAMBAM-sim/server/node_modules/@google-cloud/vertexai');
const S2 = require('./stage2.cjs');

const S2_REPS = Number(process.env.S2_REPS || 2);
const S2_MAX_TOKENS = Number(process.env.S2_MAX_TOKENS || 512);
let guardMod = null;
const guard = async () => guardMod || (guardMod = await import(path.resolve(__dirname, '../../../../server/pck_bare_ack_guard.js')));
const log = (rec) => { if (process.env.ARM_FILE) fs.appendFileSync(process.env.ARM_FILE, JSON.stringify(rec) + '\n'); };
const textOf = (result) => {
  const c = result && result.response && result.response.candidates && result.response.candidates[0];
  return c && c.content && c.content.parts && c.content.parts[0] && c.content.parts[0].text;
};

const orig = sdk.GenerativeModel.prototype.generateContent;
sdk.GenerativeModel.prototype.generateContent = async function (request) {
  const gc = request.generationConfig || {};
  const schema = gc.responseSchema || {};
  if (!(schema.properties && schema.properties.pedagogical_quality)) return orig.call(this, request);
  const t0 = Date.now();
  const result = await orig.call(this, request);
  const u1 = result.response.usageMetadata || {};
  const s1rec = { stage: 1, ms: Date.now() - t0, inputTokens: u1.promptTokenCount, outputTokens: u1.candidatesTokenCount };
  let parsed;
  try { parsed = JSON.parse(String(textOf(result)).trim()); } catch { log({ ...s1rec, stage1Parse: 'failed' }); return result; } // Stage-1 failure: server handles it
  const prompt = request.contents[0].parts[0].text;
  const ctx = S2.extractContext(prompt);
  const relevant = (Array.isArray(parsed.skills_assessment) ? parsed.skills_assessment : []).filter((s) => s && s.is_relevant === true).map((s) => s.skill_id);
  const ids = S2.SKILL_IDS.filter((id) => relevant.includes(id)); // canonical order, unique
  const st2 = { skills: ids, runs: [] };
  if (!parsed.should_provide_feedback || ids.length === 0) st2.status = 'not_shown';
  else if (!ctx) st2.status = 'no_context';
  else if ((await guard()).applyBareAcknowledgementGuard(ctx.teacher, parsed).suppressed) st2.status = 'guard_suppressed';
  else if (relevant.length !== ids.length) st2.status = 'duplicate_stage1_skills';
  else {
    st2.status = 'scored';
    const req2 = {
      contents: [{ role: 'user', parts: [{ text: S2.buildPrompt(ctx, ids) }] }],
      generationConfig: { thinkingConfig: { thinkingLevel: 'MINIMAL' }, maxOutputTokens: S2_MAX_TOKENS, responseMimeType: 'application/json', responseSchema: S2.buildSchema(ids) },
    };
    for (let i = 0; i < S2_REPS; i++) {
      const t2 = Date.now(); const run = {};
      try {
        const r2 = await orig.call(this, req2);
        const u2 = r2.response.usageMetadata || {}; const c2 = r2.response.candidates && r2.response.candidates[0];
        Object.assign(run, { ms: Date.now() - t2, inputTokens: u2.promptTokenCount, outputTokens: u2.candidatesTokenCount, thoughts: u2.thoughtsTokenCount || 0, finishReason: c2 && c2.finishReason });
        const v = S2.validate(textOf(r2), ids);
        Object.assign(run, v.ok ? { ok: true, scores: v.scores } : { ok: false, reason: v.reason });
      } catch (e) {
        Object.assign(run, { ms: Date.now() - t2, ok: false, reason: 'call_error', error: String(e.message).slice(0, 120) });
      }
      st2.runs.push(run);
      log({ stage: 2, rep: i, nSkills: ids.length, ...run, scores: undefined });
    }
  }
  if (process.env.S2_RECORD_CTX === '1' && st2.status === 'scored') st2.ctx = ctx; // LOCAL replay files only (participant text)
  log({ ...s1rec, stage2Status: st2.status, nSkills: ids.length });
  const augmented = { ...parsed, _stage2: st2 };
  const newText = JSON.stringify(augmented);
  const back = JSON.parse(newText); delete back._stage2;
  if (JSON.stringify(back) !== JSON.stringify(parsed)) throw new Error('Stage-1 output changed');
  const c = result.response.candidates[0];
  c.content = { ...c.content, parts: [{ text: newText }] };
  return result;
};
