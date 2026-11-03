// X12 FINAL candidate runner (copy of stage2_runner.mjs using stage2_final.cjs: rubric file + general bullets; score_first).
// X12: offline Stage-2 runner (research only). Runs Stage 2 on RECORDED Stage-1 outputs (replay files written through
// x12_arm.cjs, which attaches the verbatim Stage-1 context as `_x12ctx`). Stage 2 runs only where 1.5.1 SHOWS feedback:
// should_provide_feedback true after the server's bare-acknowledgement guard, and at least one displayable row under the
// 1.5.1 row-text rule (server/pck_row_text.js). Policy as a production Stage 2 would use it: at most 2 attempts with the
// identical request (the second only after an invalid output or a call error); if both fail, the display falls back to
// the Stage-1 rows, so show/hide never changes. Same Vertex configuration as server/server.js (configured key path only).
// Usage: node stage2_runner.mjs --variant NAME --order score_first|text_first [--rubric rubric.json] [--model ID]
//          [--reps 1] [--keys keys.json] [--par 6] --out out.jsonl in1.jsonl [in2.jsonl ...]
// Input lines: B200 replay {conversation_id, turn, analysis} or benchmark results {id, rep, analysis}.
// Output lines hold model-written Hebrew text: write them to git-ignored local folders only.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const { VertexAI } = require(path.join(ROOT, 'server/node_modules/@google-cloud/vertexai'));
const { GENERAL_MODEL_ID, VERTEX_LOCATION, VERTEX_API_ENDPOINT, baseGenerationConfig } = await import(path.join(ROOT, 'server/model_config.js'));
const { buildPckRows, isEmptyPckRow } = await import(path.join(ROOT, 'server/pck_row_text.js'));
const S2 = require(path.join(HERE, 'stage2.cjs'));
const F = require(path.join(HERE, 'stage2_final.cjs'));

const args = process.argv.slice(2); const opt = {}; const inputs = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i]; else inputs.push(args[i]); }
if (!opt.out || !opt.variant) throw new Error('--variant and --out are required');
const order = opt.order || 'score_first';
const FR = F.loadRubric(opt.rubric);

const modelId = opt.model || GENERAL_MODEL_ID;
const reps = Number(opt.reps || 1);
const allowed = opt.keys ? new Set(JSON.parse(readFileSync(opt.keys, 'utf8'))) : null;
const done = existsSync(opt.out) ? new Set(readFileSync(opt.out, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).key)) : new Set();
const vertex = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT || 'cloud-run-455609', location: VERTEX_LOCATION, apiEndpoint: VERTEX_API_ENDPOINT,
  googleAuthOptions: { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT, 'server/service-account-key.json') } });
const model = vertex.getGenerativeModel({ model: modelId });
const generationConfig = { ...baseGenerationConfig(), maxOutputTokens: Number(opt.maxout || 1200), responseMimeType: 'application/json', responseSchema: S2.buildSchema({ order }) };

/** 1.5.1 client rule: shown = should_provide_feedback and at least one row with text. */
const shown151 = (a) => a && a.should_provide_feedback === true
  && buildPckRows(a.skills_assessment, a.demonstrated_skills, a.missed_opportunities).some((r) => !isEmptyPckRow(r));

const todo = [];
for (const f of inputs) {
  const tag = path.basename(f).replace(/\.jsonl$/, '');
  for (const l of readFileSync(f, 'utf8').trim().split('\n')) {
    const x = JSON.parse(l);
    if (!x.ok || !shown151(x.analysis)) continue;
    const base = x.conversation_id ? `${x.conversation_id}#${x.turn}` : `${x.id}#${x.rep}`;
    if (allowed && !allowed.has(base)) continue;
    const ctx = x.analysis._x12ctx;
    for (let r = 0; r < reps; r++) {
      const key = `${tag}|${base}|${r}`;
      if (!ctx) { if (!done.has(key)) todo.push({ key, base, tag, r, ctx: null }); continue; }
      if (!done.has(key)) todo.push({ key, base, tag, r, ctx });
    }
  }
}
console.log(`variant ${opt.variant} (${order}, ${modelId}): ${todo.length} Stage-2 runs`);

const textOf = (res) => { const c = res.response.candidates && res.response.candidates[0]; return c && c.content && c.content.parts && c.content.parts[0] && c.content.parts[0].text; };
let i = 0;
async function worker() {
  while (i < todo.length) {
    const t = todo[i++];
    const rec = { key: t.key, base: t.base, src: t.tag, rep: t.r, variant: opt.variant, order, model: modelId, attempts: [] };
    if (!t.ctx) { rec.status = 'no_context'; appendFileSync(opt.out, JSON.stringify(rec) + '\n'); continue; }
    const request = { contents: [{ role: 'user', parts: [{ text: F.buildPrompt(t.ctx, FR) }] }], generationConfig };
    const t0 = Date.now();
    for (let a = 0; a < 2; a++) {
      const at = { ms: null }; const ta = Date.now();
      try {
        const res = await model.generateContent(request);
        const c = res.response.candidates && res.response.candidates[0]; const u = res.response.usageMetadata || {};
        const v = S2.validate(textOf(res));
        Object.assign(at, { ok: v.ok, reason: v.ok ? null : v.reason, finishReason: c && c.finishReason, inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount, thoughts: u.thoughtsTokenCount || 0 });
        if (v.rows) at.rows = v.rows;
        if (v.contract) at.contract = v.contract;
      } catch (e) { Object.assign(at, { ok: false, reason: 'call_error', error: String(e.message).slice(0, 160) }); }
      at.ms = Date.now() - ta;
      rec.attempts.push(at);
      if (at.ok) break;
    }
    rec.ms = Date.now() - t0; // Stage-2 wall time including the re-ask
    const final = rec.attempts.find((a) => a.ok);
    rec.status = final ? 'stage2' : 'fallback_stage1';
    rec.rows = final ? final.rows : null;
    appendFileSync(opt.out, JSON.stringify(rec) + '\n');
  }
}
await Promise.all(Array.from({ length: Number(opt.par || 6) }, worker));
console.log('done');
