// Converts a historical replay output (the session-harness format used for 1.3.9-1.3.11:
// a JSON array of turns) into a harness run folder under results/ (git-ignored), so analyze.js can
// label it. Usage (repo root):
//   node research/simulator_audit/replay_harness/scripts/import_historical.js <replay_results.json> <run id> <version> <commit>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, conversationId } from '../config/scenarios.js';

const [src, runId, version, commit] = process.argv.slice(2);
if (!src || !runId) { console.error('usage: import_historical.js <replay_results.json> <run id> <version> <commit>'); process.exit(1); }
const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(HARNESS, 'results', runId);
if (fs.existsSync(out)) { console.error(`results/${runId} exists`); process.exit(1); }
fs.mkdirSync(path.join(out, 'conversations'), { recursive: true });
const turns = JSON.parse(fs.readFileSync(src, 'utf8'));
const byConv = {};
for (const t of turns) (byConv[t.conversation] = byConv[t.conversation] || []).push(t);
for (const [name, ts] of Object.entries(byConv)) {
  ts.sort((a, b) => a.turn - b.turn);
  const plan = SCENARIOS.find((s) => s.id === ts[0].scenario);
  const castIndex = name.endsWith('b') ? 1 : 0;
  const id = conversationId('A', plan.id, 'historical', castIndex, 1);
  const conv = { conversationId: id, runId, mode: 'A', scenarioId: plan.id, slug: plan.slug, castKind: 'historical', castIndex, repeat: 1, cast: ts[0].cast, historicalName: name, turns: [] };
  for (const t of ts) {
    const step = plan.turns[t.turn - 1];
    conv.turns.push({
      turn: t.turn, move: step.move, scriptedText: t.teacher, teacher: t.teacher, drawing: t.hasDrawing ? `historical:${step.historicalDrawing}` : null,
      decision: { mode: 'A', adaptive: false },
      pck: { ok: t.pck.ok, quality: t.pck.quality, understanding: t.pck.understanding, shown: t.pck.shown, meta: { latencyMs: t.pck.latencyMs, attempts: t.pck.attempts, finishReason: t.pck.finishReason } },
      student: { ok: t.student.ok, meta: { latencyMs: t.student.latencyMs, attempts: t.student.attempts, finishReason: t.student.finishReason, duplicateRetries: t.student.duplicateRetries, duplicateRepliesDropped: t.student.duplicateRepliesDropped, duplicateRepliesKept: t.student.duplicateRepliesKept, duplicateOutcome: t.student.duplicateOutcome } },
      replies: t.replies.map((r) => ({ student: r.student, message: r.message })),
    });
  }
  fs.writeFileSync(path.join(out, 'conversations', `${id}.json`), JSON.stringify(conv, null, 2));
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ runId, mode: 'A', castKind: 'historical', systemVersion: version, gitCommit: commit, importedFrom: path.basename(src), note: 'historical run (production drawings, pre-harness); imported for labelling' }, null, 2));
console.log(`imported ${Object.keys(byConv).length} conversations -> results/${runId}`);
