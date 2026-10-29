// X12b: live latency and steering consistency of the architecture arms (opportunity-bench runs with OPP_ARCH or
// OPP_STAGE2=1). Research only; prints aggregates. Shown turns only (Stage 2 never runs on hidden turns).
//   node arch_live.mjs <run id> [...]
// Client wall times per shown turn: pck = Stage 1; pre = work BEFORE the student call (sequential / fast);
// student = the student call; par = the call running in parallel with the students (Stage 2, or the text call).
//   students visible   1.5.1: pck + student          architecture: pck + pre + student
//   sidebar visible    1.5.1: pck                    A0/A2: pck + par   A1: pck + pre   A3: pck + pre + par   stream: pck + call end
//   turn complete      1.5.1: pck + student          architecture: pck + pre + max(student, par)
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RES = path.resolve(HERE, '../../replay_harness/results');
const DEP = require('./stage2_dep.cjs');
const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.round(f * (s.length - 1)))] : null; };
const pq = (xs) => `${(q(xs, 0.5) / 1000).toFixed(1)} / ${(q(xs, 0.9) / 1000).toFixed(1)}`;

for (const run of process.argv.slice(2)) {
  const dir = path.join(RES, run, 'conversations');
  const turns = fs.readdirSync(dir).flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).turns);
  const shown = turns.filter((t) => (t.x12b || t.stage2) && t.pck.ok && t.student.ok && t.pck.wallMs != null);
  const lat = { s151: [], sNow: [], side151: [], sideNow: [], done151: [], doneNow: [], pre: [] };
  const sig = { consistent: 0, n: 0, strongVsWeak: 0, fallback: 0, dist: {} };
  for (const t of shown) {
    const x = t.x12b; const pck = t.pck.wallMs; const st = t.student.wallMs;
    const pre = x ? x.preStudentMs : 0;
    const parRec = x ? x.parallel : t.stage2;
    const par = parRec ? (parRec.parallelWallMs != null ? parRec.parallelWallMs : parRec.ms) : 0;
    const parMs = parRec ? parRec.ms : 0;
    const arch = x ? x.arch : 'indep_parallel';
    lat.s151.push(pck + st); lat.sNow.push(pck + pre + st); lat.pre.push(pre);
    lat.side151.push(pck);
    lat.sideNow.push(arch.startsWith('stream') ? pck + ((parRec && parRec.tDone) || pre) : arch.startsWith('sequential') ? pck + pre : arch.startsWith('fast') ? pck + pre + parMs : pck + parMs);
    lat.done151.push(pck + st); lat.doneNow.push(pck + pre + Math.max(st, par || 0));
    // steering signal vs the teacher-facing assessment (Stage-2 rows; fallback: none available)
    const steer = x ? (x.signal || x.stage1Signal) : (t.pck.quality === 'positive' && t.pck.understanding === 'improved' ? 'strong' : t.pck.quality === 'neutral' ? 'partial' : 'none');
    const teacherRows = x ? ((x.stage2 && x.stage2.rows) || (x.parallel && x.parallel.rows) || null) : (t.stage2 && t.stage2.rows);
    sig.dist[steer] = (sig.dist[steer] || 0) + 1;
    if (!teacherRows) { sig.fallback++; continue; }
    const ts = DEP.signalFromRows(teacherRows);
    sig.n++; sig.consistent += steer === ts; sig.strongVsWeak += steer === 'strong' && ts !== 'strong';
  }
  console.log(JSON.stringify({
    run, shownTurns: shown.length, pre_s: pq(lat.pre),
    students_visible_151_s: pq(lat.s151), students_visible_s: pq(lat.sNow),
    sidebar_151_s: pq(lat.side151), sidebar_s: pq(lat.sideNow),
    turn_complete_151_s: pq(lat.done151), turn_complete_s: pq(lat.doneNow),
    steer_dist: sig.dist, steer_eq_teacher: `${sig.consistent}/${sig.n}`, steer_strong_teacher_not: `${sig.strongVsWeak}/${sig.n}`, no_teacher_rows: sig.fallback,
  }));
}
