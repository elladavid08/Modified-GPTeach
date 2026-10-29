// X12: teacher-visible latency of two-stage PCK, from live opportunity-bench runs made with OPP_STAGE2=1 (Stage 2 runs
// concurrently with the student call on every turn whose feedback is shown). Research only; prints aggregates.
//   node latency.mjs <harness run id> [...]
// Per shown turn (client wall times): pck = Stage 1; student = the student call; s2 = Stage 2 (incl. any re-ask);
// both = from the start of the student call until students AND Stage 2 are done.
//   students visible   pck + student (unchanged by Stage 2)
//   sidebar visible    1.5.1: pck   two-stage: pck + s2
//   turn complete      1.5.1: pck + student   two-stage: pck + both (the turn lock and the turn log wait for both)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../replay_harness/results');
const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.round(f * (s.length - 1)))] : null; };
const pq = (xs) => `p50 ${q(xs, 0.5)} / p90 ${q(xs, 0.9)}`;

for (const run of process.argv.slice(2)) {
  const dir = path.join(RES, run, 'conversations');
  const turns = fs.readdirSync(dir).flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).turns);
  const shown = turns.filter((t) => t.stage2 && t.pck.ok && t.student.ok && t.pck.wallMs != null);
  const pck = shown.map((t) => t.pck.wallMs); const st = shown.map((t) => t.student.wallMs); const s2 = shown.map((t) => t.stage2.ms);
  const both = shown.map((t) => t.stage2.parallelWallMs);
  const added = shown.map((t) => t.stage2.parallelWallMs - t.student.wallMs);
  const status = shown.reduce((m, t) => ({ ...m, [t.stage2.status]: (m[t.stage2.status] || 0) + 1 }), {});
  console.log(JSON.stringify({
    run, turns: turns.length, shownTurns: shown.length, stage2Status: status, reasks: shown.filter((t) => (t.stage2.attempts || []).length === 2).length,
    stage1_ms: pq(pck), student_ms: pq(st), stage2_ms: pq(s2),
    sidebar_151_ms: pq(pck), sidebar_twoStage_ms: pq(shown.map((t, i) => pck[i] + s2[i])),
    turnComplete_151_ms: pq(shown.map((t, i) => pck[i] + st[i])), turnComplete_twoStage_ms: pq(shown.map((t, i) => pck[i] + both[i])),
    addedToTurn_ms: pq(added), stage2FinishedFirst: `${added.filter((a) => a <= 50).length}/${shown.length}`,
    sidebarAfterStudents: `${shown.filter((t, i) => s2[i] > st[i]).length}/${shown.length}`,
  }));
}
