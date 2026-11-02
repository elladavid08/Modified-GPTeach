// A1i student data contract (X12E research arms) and the production A1i check (R7, server PCK_STAGE2=on): content-free
// prompt-consistency, operations and latency aggregates per opportunity-bench run (research only; prints aggregates).
// Research arms: the per-turn flags in turn.x12b.audit. Production runs: turn.pck.audit and the server telemetry in
// turn.pck.meta (stage2Status / stage2Suppressed / stage2Signal ...). Latency (client wall times, production runs and
// 1.5.1 runs): sidebar visible = the PCK request (Stage 1 + Stage 2 on the server); students visible = PCK + student call;
// "shown" = turns Stage 1 shows (production: Stage 2 ran or fell back; 1.5.1: should_provide_feedback).
//   node contract_audit.mjs <run id> [<run id> ...]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../replay_harness/results');
const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.round(f * (s.length - 1)))] : null; };
const pq = (xs) => (xs.length ? `${(q(xs, 0.5) / 1000).toFixed(1)} / ${(q(xs, 0.9) / 1000).toFixed(1)}` : null);

for (const run of process.argv.slice(2)) {
  const dir = path.join(RES, run, 'conversations');
  const convs = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const a = { conversations: convs.length, turns: 0, studentFailed: 0, pckFailed: 0, stage1Shown: 0, stage2Turns: 0, stage2Fallback: 0, stage2Skipped: 0, stage2Retried: 0,
    suppressed: 0, guardDropped: 0, signal: {}, flags: {} };
  const lat = { sidebarShown: [], studentsShown: [], studentsAll: [], stage2: [] };
  for (const c of convs) for (const t of c.turns) {
    a.turns++;
    if (!t.student.ok) a.studentFailed++;
    if (!t.pck.ok) a.pckFailed++;
    const x = t.x12b;
    const m = (t.pck && t.pck.meta) || {};
    const production = !x && 'stage2Status' in m;
    const s1shown = x ? true : production ? ['ok', 'fallback', 'skipped'].includes(m.stage2Status) : Boolean(t.pck.shown);
    if (t.pck.ok && t.student.ok && t.pck.wallMs != null) {
      lat.studentsAll.push(t.pck.wallMs + t.student.wallMs);
      if (s1shown && !x) { lat.sidebarShown.push(t.pck.wallMs); lat.studentsShown.push(t.pck.wallMs + t.student.wallMs); }
    }
    if (x) {
      a.stage1Shown++;
      if (x.stage2 && x.stage2.status !== 'stage2') a.stage2Fallback++;
      if (x.stage2 && (x.stage2.attempts || []).length > 1) a.stage2Retried++;
      if (x.final && x.final.suppressed && x.stage2.status === 'stage2') a.suppressed++;
      if (x.final && x.final.guardDropped) a.guardDropped++;
    } else if (production && s1shown) {
      a.stage1Shown++;
      if (m.stage2Status === 'fallback') a.stage2Fallback++;
      if (m.stage2Status === 'skipped') a.stage2Skipped++;
      if (m.stage2Attempts > 1) a.stage2Retried++;
      if (m.stage2Suppressed) a.suppressed++;
      if (m.stage2GuardDropped) a.guardDropped++;
      if (Number.isInteger(m.stage2LatencyMs)) lat.stage2.push(m.stage2LatencyMs);
    }
    const audit = x ? x.audit : t.pck.audit;
    const signal = x ? x.signal : m.stage2Signal;
    if (!audit) continue;
    a.stage2Turns++;
    a.signal[signal] = (a.signal[signal] || 0) + 1;
    for (const [k, v] of Object.entries(audit)) a.flags[k] = (a.flags[k] || 0) + (v ? 1 : 0);
  }
  const latency = { sidebar_visible_shown_s: pq(lat.sidebarShown), students_visible_shown_s: pq(lat.studentsShown), students_visible_all_s: pq(lat.studentsAll), stage2_call_s: pq(lat.stage2) };
  console.log(JSON.stringify({ run, ...a, latency }));
}
