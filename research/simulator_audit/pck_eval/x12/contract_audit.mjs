// A1i student data contract rerun (X12E): content-free prompt-consistency and operations aggregates per opportunity-bench
// run (research only; prints aggregates). Uses the per-turn flags the bench records (student_view.cjs auditStudentInput)
// on every turn with Stage-2 rows, and the turn status fields.
//   node contract_audit.mjs <run id> [<run id> ...]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../replay_harness/results');
for (const run of process.argv.slice(2)) {
  const dir = path.join(RES, run, 'conversations');
  const convs = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const a = { conversations: convs.length, turns: 0, studentFailed: 0, pckFailed: 0, stage1Shown: 0, stage2Turns: 0, stage2Fallback: 0, stage2Retried: 0,
    suppressed: 0, guardDropped: 0, signal: {}, flags: {} };
  for (const c of convs) for (const t of c.turns) {
    a.turns++;
    if (!t.student.ok) a.studentFailed++;
    if (!t.pck.ok) a.pckFailed++;
    const x = t.x12b;
    if (!x) continue;
    a.stage1Shown++;
    if (x.stage2 && x.stage2.status !== 'stage2') a.stage2Fallback++;
    if (x.stage2 && (x.stage2.attempts || []).length > 1) a.stage2Retried++;
    if (x.final && x.final.suppressed && x.stage2.status === 'stage2') a.suppressed++;
    if (x.final && x.final.guardDropped) a.guardDropped++;
    if (!x.audit) continue;
    a.stage2Turns++;
    a.signal[x.signal] = (a.signal[x.signal] || 0) + 1;
    for (const [k, v] of Object.entries(x.audit)) a.flags[k] = (a.flags[k] || 0) + (v ? 1 : 0);
  }
  console.log(JSON.stringify({ run, ...a }));
}
