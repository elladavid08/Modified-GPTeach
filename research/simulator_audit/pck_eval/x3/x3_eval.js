// Offline X3 evaluation (research only). Usage:
//   node research/simulator_audit/pck_eval/x3/x3_eval.js <benchmark results.jsonl ...> [--saved name=path ...] [--json out.json]
// Benchmark results: lines { id, rep, ok, analysis } from bench/replay.bench.js (committed 1.4.3, post-guard analyses).
// --saved: other saved 1.4.x outputs for contradiction / alteration rates only (not scored). Formats:
//   aligned:<path>  replay-harness aligned capture (raw model analysis per Mode B turn, `teacher`, `pck.shown`)
//   frozen:<path>:<contexts.json>  X1/X2 frozen-context results (post-guard analyses) + their contexts file
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { score } from '../score.js';
import { normalize, contradictions } from './x3_consistency.js';
import { isBareAcknowledgement } from '../../../../server/pck_bare_ack_guard.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const bench = JSON.parse(readFileSync(path.join(HERE, '..', 'pck_eval_benchmark.json'), 'utf8'));
const CASES = Object.fromEntries(bench.cases.map((c) => [c.id, c]));
const args = process.argv.slice(2);
const resultFiles = []; const saved = []; let jsonOut = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--saved') saved.push(args[++i]);
  else if (args[i] === '--json') jsonOut = args[++i];
  else resultFiles.push(args[i]);
}
const lines = resultFiles.flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)).filter((l) => l.ok && CASES[l.id]);

export const VARIANTS = {
  'A current': { decision: 'model' },
  'B1 decision AND relevant': { decision: 'and' },
  'B1 + derived lists': { decision: 'and', lists: true },
  'B1 + lists + cap 2': { decision: 'and', lists: true, cap: 2 },
  'B2 decision = any relevant': { decision: 'derived' },
  'B2 + lists + cap 2': { decision: 'derived', lists: true, cap: 2 },
  'B1 + continuity rule (rejected probe)': { decision: 'and', continuity: true },
};

const pct = (a, b) => (b ? `${a}/${b} (${((100 * a) / b).toFixed(1)}%)` : '—');
const rowsView = (n) => ({ should_provide_feedback: n.display.shown, skills_assessment: n.display.rows.filter((r) => r.skillId).map((r) => ({ skill_id: r.skillId, is_relevant: true, score: r.score })) });

const report = {};
for (const [name, opt] of Object.entries(VARIANTS)) {
  const modelView = []; const displayView = []; const changed = { decision: 0, toShown: 0, toHidden: 0, demonstrated: 0, demonstratedText: 0, missed: 0, rows: 0 };
  const rowsPerShown = {}; let capCut = 0; let scoresTouched = 0; const contra = {};
  const A = (l) => normalize(l.analysis, CASES[l.id].teacher_message, { decision: 'model' });
  for (const l of lines) {
    const c = CASES[l.id];
    const before = JSON.stringify(l.analysis);
    const n = normalize(l.analysis, c.teacher_message, { ...opt, feedbackHistory: c.feedback_history });
    if (JSON.stringify(l.analysis) !== before) throw new Error('input mutated');
    if (JSON.stringify(n.analysis.skills_assessment) !== JSON.stringify(l.analysis.skills_assessment)) scoresTouched++;
    const a = A(l);
    if (n.display.shown !== a.display.shown) { changed.decision++; n.display.shown ? changed.toShown++ : changed.toHidden++; }
    if (n.changed.demonstrated) changed.demonstrated++;
    if (n.changed.demonstratedText) changed.demonstratedText++;
    if (n.changed.missed) changed.missed++;
    if (JSON.stringify(n.display.rows.map((r) => [r.skillId, r.score])) !== JSON.stringify(a.display.rows.map((r) => [r.skillId, r.score]))) changed.rows++;
    if (n.display.shown) rowsPerShown[n.display.rows.length] = (rowsPerShown[n.display.rows.length] || 0) + 1;
    if (opt.cap && a.display.rows.length > opt.cap && n.display.shown) capCut++;
    for (const k of contradictions(n.analysis, { shown: n.display.shown })) contra[k] = (contra[k] || 0) + 1;
    modelView.push({ ...l, analysis: n.analysis });
    displayView.push({ ...l, analysis: rowsView(n) });
  }
  const sm = score(modelView); const sd = score(displayView);
  const subset = (pred) => {
    const ls = displayView.filter((l) => pred(CASES[l.id]));
    const r = score(ls).high; return { decision: r.decision, fp: r.fp, fn: r.fn, constraints: r.constraints };
  };
  report[name] = {
    high: { decision: sm.high.decision, fp: sm.high.fp, fn: sm.high.fn, consistency: sm.high.consistency, constraintsModel: sm.high.constraints,
      constraintsDisplayed: sd.high.constraints, displayedNotRelevant: sd.high.displayedNotRelevant,
      skillsModel: sm.high.skills, skillsDisplayed: sd.high.skills },
    review: { decision: sm.needs_expert_review.decision, displayedNotRelevant: sd.needs_expert_review.displayedNotRelevant, constraintsDisplayed: sd.needs_expert_review.constraints },
    continuity: subset((c) => c.tags.includes('continuity') && c.confidence === 'high'),
    bareAck: subset((c) => isBareAcknowledgement(c.teacher_message) && c.confidence === 'high'),
    negativeControls: subset((c) => c.expected.should_provide_feedback === false && c.confidence === 'high'),
    missedMisconception: subset((c) => c.tags.includes('missed_misconception')),
    changed, rowsPerShown, capCut, scoresTouched, contradictions: contra, outputs: lines.length,
    violations: sd.high.violations,
  };
}

// Saved 1.4.x outputs: contradiction prevalence (raw) and how often X3 would alter fields.
const savedReport = {};
for (const spec of saved) {
  const [name, kind, p, ctxPath] = spec.split(/[=:]/);
  let items = [];
  if (kind === 'aligned') {
    const al = JSON.parse(readFileSync(p, 'utf8'));
    for (const cv of Object.values(al)) for (const t of cv.turns) if (t.analysis) items.push({ analysis: t.analysis, teacher: t.teacher, loggedShown: !!(t.pck && t.pck.shown) });
  } else {
    const ctx = Object.fromEntries(JSON.parse(readFileSync(ctxPath, 'utf8')).map((c) => [c.id, c]));
    for (const f of p.split(',')) for (const l of readFileSync(f, 'utf8').trim().split('\n').map(JSON.parse)) if (l.ok) items.push({ analysis: l.analysis, teacher: ctx[l.id].teacher });
  }
  const r = { outputs: items.length, rawContradictions: {}, outputsWithAny: 0, alter: {} };
  for (const it of items) {
    const a0 = normalize(it.analysis, it.teacher, { decision: 'model' });
    const ks = contradictions(it.analysis, { shown: a0.display.shown });
    if (ks.length) r.outputsWithAny++;
    for (const k of ks) r.rawContradictions[k] = (r.rawContradictions[k] || 0) + 1;
    for (const [vn, opt] of Object.entries({ B1: { decision: 'and', lists: true, cap: 2 }, B2: { decision: 'derived', lists: true, cap: 2 } })) {
      const n = normalize(it.analysis, it.teacher, opt);
      const al = (r.alter[vn] = r.alter[vn] || { decision: 0, toShown: 0, toHidden: 0, demonstrated: 0, missed: 0, rows: 0, shownBefore: 0 });
      if (a0.display.shown) al.shownBefore++;
      if (n.display.shown !== a0.display.shown) { al.decision++; n.display.shown ? al.toShown++ : al.toHidden++; }
      if (n.changed.demonstrated) al.demonstrated++;
      if (n.changed.missed) al.missed++;
      if (JSON.stringify(n.display.rows.map((x) => x.skillId)) !== JSON.stringify(a0.display.rows.map((x) => x.skillId))) al.rows++;
    }
    if (kind === 'aligned' && a0.display.shown !== it.loggedShown) r.replayMismatch = (r.replayMismatch || 0) + 1;
  }
  savedReport[name] = r;
}

for (const [name, r] of Object.entries(report)) {
  console.log(`\n=== ${name} (${r.outputs} outputs; skills_assessment changed in ${r.scoresTouched})`);
  console.log(`high: decision ${pct(...r.high.decision)} | FP ${pct(...r.high.fp)} | FN ${pct(...r.high.fn)} | decision==any(relevant) ${pct(...r.high.consistency)}`);
  console.log(`      constraints held: model rows ${pct(...r.high.constraintsModel)} / displayed rows ${pct(...r.high.constraintsDisplayed)} | not-relevant respected on displayed rows ${pct(...r.high.displayedNotRelevant)}`);
  console.log(`      continuity ${pct(...r.continuity.decision)} decision, constraints ${pct(...r.continuity.constraints)} | bare-ack decision ${pct(...r.bareAck.decision)} | negative controls FP ${pct(...r.negativeControls.fp)} | missed-misconception FN ${pct(...r.missedMisconception.fn)}`);
  console.log(`      review bucket (not scored): decision ${pct(...r.review.decision)}, displayed not-relevant respected ${pct(...r.review.displayedNotRelevant)}`);
  console.log(`      altered vs A: decision ${r.changed.decision} (→shown ${r.changed.toShown}, →hidden ${r.changed.toHidden}), demonstrated ids ${r.changed.demonstrated} (text ${r.changed.demonstratedText}), missed ids ${r.changed.missed}, displayed rows ${r.changed.rows}; cap cut ${r.capCut}`);
  console.log(`      rows per shown feedback ${JSON.stringify(r.rowsPerShown)} | contradictions after: ${JSON.stringify(r.contradictions)}`);
}
for (const [name, r] of Object.entries(savedReport)) {
  console.log(`\n### saved ${name}: ${r.outputs} outputs, ${r.outputsWithAny} with >= 1 contradiction${r.replayMismatch != null ? `, replayed display != logged in ${r.replayMismatch}` : ''}`);
  console.log(`    ${JSON.stringify(r.rawContradictions)}`);
  for (const [vn, al] of Object.entries(r.alter)) console.log(`    ${vn}: decision ${al.decision}/${r.outputs} (→shown ${al.toShown}, →hidden ${al.toHidden}; shown before ${al.shownBefore}), demonstrated ${al.demonstrated}, missed ${al.missed}, displayed rows ${al.rows}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ report, savedReport }, null, 1));
