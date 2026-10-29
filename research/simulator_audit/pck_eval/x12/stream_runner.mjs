// X12c: offline runner for the streamed single call on RECORDED Stage-1 outputs (as dep_runner.mjs; independent: no
// Stage-1 input). Usage: node stream_runner.mjs [--mode v3] [--keys keys.json] [--par 6] --out out.jsonl in.jsonl [...]
// --mode v3: the frozen X12 call streamed with an early steering decision (stream_v3_call.cjs).
// Output lines hold model-written Hebrew text: git-ignored local folders only.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const { buildPckRows, isEmptyPckRow } = await import(path.join(ROOT, 'server/pck_row_text.js'));
const { runStream } = require('./stream_call.cjs');
const { runStreamV3 } = require('./stream_v3_call.cjs');

const args = process.argv.slice(2); const opt = {}; const inputs = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i]; else inputs.push(args[i]); }
const allowed = opt.keys ? new Set(JSON.parse(readFileSync(opt.keys, 'utf8'))) : null;
const done = existsSync(opt.out) ? new Set(readFileSync(opt.out, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).key)) : new Set();
const shown151 = (a) => a && a.should_provide_feedback === true && buildPckRows(a.skills_assessment, a.demonstrated_skills, a.missed_opportunities).some((r) => !isEmptyPckRow(r));
const todo = [];
for (const f of inputs) {
  const tag = path.basename(f).replace(/\.jsonl$/, '');
  for (const l of readFileSync(f, 'utf8').trim().split('\n')) {
    const x = JSON.parse(l);
    if (!x.ok || !shown151(x.analysis) || !x.analysis._x12ctx) continue;
    const base = x.conversation_id ? `${x.conversation_id}#${x.turn}` : `${x.id}#${x.rep}`;
    if (allowed && !allowed.has(base)) continue;
    const key = `${tag}|${base}|0`;
    if (!done.has(key)) todo.push({ key, base, tag, ctx: x.analysis._x12ctx });
  }
}
console.log(`stream: ${todo.length} runs`);
let i = 0;
async function worker() {
  while (i < todo.length) {
    const t = todo[i++];
    const r = opt.mode === 'v3' ? await runStreamV3(t.ctx, null) : await runStream(t.ctx, null);
    const rec = { key: t.key, base: t.base, src: t.tag, rep: 0, mode: opt.mode === 'v3' ? 'stream_v3' : 'stream', signal: r.signal, tSignal: r.tSignal, decidedAt: r.decidedAt, tScoresAll: r.tScores, status: r.status === 'failed' ? 'fallback_stage1' : 'stage2', streamStatus: r.status,
      rows: r.rows, scoreRows: r.scoreRows, tFirstChunk: r.tFirstChunk, tScores: r.tScores, ms: r.tDone, attempts: r.attempts, chunks: r.chunks, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
    appendFileSync(opt.out, JSON.stringify(rec) + '\n');
  }
}
await Promise.all(Array.from({ length: Number(opt.par || 6) }, worker));
console.log('done');
