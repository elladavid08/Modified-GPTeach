// X12b: offline runner for the dependent variants on RECORDED Stage-1 outputs (replay files written through x12_arm.cjs).
// Only where 1.5.1 shows feedback (as stage2_runner.mjs). Modes: full | fast (scores, then text for the fixed scores) | fastindep (fast without the Stage-1 assessment).
// Usage: node dep_runner.mjs --mode full|fast [--keys keys.json] [--par 6] --out out.jsonl in.jsonl [...]
// Output lines hold model-written Hebrew text: git-ignored local folders only.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const { buildPckRows, isEmptyPckRow } = await import(path.join(ROOT, 'server/pck_row_text.js'));
const C = require('./dep_call.cjs');

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
    if (!done.has(key)) { const { _x12ctx, ...a } = x.analysis; todo.push({ key, base, tag, ctx: _x12ctx, a }); }
  }
}
console.log(`mode ${opt.mode}: ${todo.length} runs`);
let i = 0;
async function worker() {
  while (i < todo.length) {
    const t = todo[i++]; const rec = { key: t.key, base: t.base, src: t.tag, rep: 0, mode: opt.mode, attempts: [] };
    if (opt.mode === 'full') {
      const r = await C.runFull(t.ctx, t.a);
      Object.assign(rec, { status: r.status === 'ok' ? 'stage2' : 'fallback_stage1', rows: r.rows, ms: r.ms, attempts: r.attempts, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
    } else {
      const s = opt.mode === 'fastindep' ? await C.runScoresIndep(t.ctx) : await C.runScores(t.ctx, t.a);
      rec.fast = { status: s.status, ms: s.ms, rows: s.rows, attempts: s.attempts, inputTokens: s.inputTokens, outputTokens: s.outputTokens };
      if (s.status === 'ok') {
        const x = await C.runText(t.ctx, s.rows);
        rec.text = { status: x.status, ms: x.ms, attempts: x.attempts, inputTokens: x.inputTokens, outputTokens: x.outputTokens };
        // teacher-facing rows: the fast scores with the written text (text failure: scores kept, text missing)
        rec.rows = x.status === 'ok' ? x.rows : s.rows.map((r) => ({ ...r, positive: null, improvement: null }));
        rec.status = 'stage2';
      } else { rec.status = 'fallback_stage1'; rec.rows = null; }
      rec.ms = (rec.fast.ms || 0) + ((rec.text && rec.text.ms) || 0);
      rec.attempts = [...s.attempts, ...((rec.text && rec.text.attempts) || [])];
    }
    appendFileSync(opt.out, JSON.stringify(rec) + '\n');
  }
}
await Promise.all(Array.from({ length: Number(opt.par || 6) }, worker));
console.log('done');
