// X10: standalone Stage-2 scoring runner (research only). Re-scores RECORDED Stage-1 contexts (analysis._stage2.ctx, written
// by x9_arm.cjs with S2_RECORD_CTX=1) with a chosen rubric variant: same prompt builder, schema, validation, model and
// MINIMAL thinking as the X9 Stage 2; no retries. Same Vertex configuration as server/server.js (configured key path only).
// Usage: node stage2_runner.mjs --variant v1|v2 --out out.jsonl [--keys allowed_keys.json] [--par 6] in1.jsonl [in2.jsonl ...]
// Input lines: B200 replay {conversation_id, turn, analysis} or benchmark results {id, rep, analysis}; key = conv#turn or id#rep, plus the file tag.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const { VertexAI } = require(path.join(ROOT, 'server/node_modules/@google-cloud/vertexai'));
const { GENERAL_MODEL_ID, VERTEX_LOCATION, VERTEX_API_ENDPOINT, baseGenerationConfig } = await import(path.join(ROOT, 'server/model_config.js'));
const S2 = require(path.join(HERE, '../x9/stage2.cjs'));

const args = process.argv.slice(2); const opt = {}; const inputs = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i]; else inputs.push(args[i]); }
const RUBRIC = opt.variant === 'v1' ? S2.RUBRIC : { ...S2.RUBRIC, ...Object.fromEntries(Object.entries(JSON.parse(readFileSync(path.join(HERE, `rubric_${opt.variant}.json`), 'utf8'))).filter(([k]) => !k.startsWith('_'))) };
const allowed = opt.keys ? new Set(JSON.parse(readFileSync(opt.keys, 'utf8'))) : null;
const done = existsSync(opt.out) ? new Set(readFileSync(opt.out, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).key)) : new Set();
const vertex = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT || 'cloud-run-455609', location: VERTEX_LOCATION, apiEndpoint: VERTEX_API_ENDPOINT,
  googleAuthOptions: { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT, 'server/service-account-key.json') } });
const model = vertex.getGenerativeModel({ model: GENERAL_MODEL_ID });

const todo = [];
for (const f of inputs) {
  const tag = path.basename(f).replace(/\.jsonl$/, '');
  for (const l of readFileSync(f, 'utf8').trim().split('\n')) {
    const x = JSON.parse(l); const s2 = x.analysis && x.analysis._stage2;
    if (!x.ok || !s2 || s2.status !== 'scored' || !s2.ctx) continue;
    const base = x.conversation_id ? `${x.conversation_id}#${x.turn}` : `${x.id}#${x.rep}`;
    if (allowed && !allowed.has(base)) continue;
    const key = `${tag}|${base}`;
    if (!done.has(key)) todo.push({ key, ctx: s2.ctx, skills: s2.skills });
  }
}
console.log(`variant ${opt.variant}: ${todo.length} contexts to score`);
let i = 0;
async function worker() {
  while (i < todo.length) {
    const t = todo[i++]; const rec = { key: t.key, variant: opt.variant, skills: t.skills }; const t0 = Date.now();
    try {
      const r = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: S2.buildPrompt(t.ctx, t.skills, RUBRIC) }] }],
        generationConfig: { ...baseGenerationConfig(), maxOutputTokens: 512, responseMimeType: 'application/json', responseSchema: S2.buildSchema(t.skills) } });
      const c = r.response.candidates && r.response.candidates[0]; const u = r.response.usageMetadata || {};
      const v = S2.validate(c && c.content && c.content.parts && c.content.parts[0] && c.content.parts[0].text, t.skills);
      Object.assign(rec, v.ok ? { ok: true, scores: v.scores } : { ok: false, reason: v.reason }, { finishReason: c && c.finishReason, inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount });
    } catch (e) { Object.assign(rec, { ok: false, reason: 'call_error', error: String(e.message).slice(0, 120) }); }
    rec.ms = Date.now() - t0;
    appendFileSync(opt.out, JSON.stringify(rec) + '\n');
  }
}
await Promise.all(Array.from({ length: Number(opt.par || 6) }, worker));
console.log('done');
