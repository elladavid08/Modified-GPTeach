// Content-free automatic metrics for opportunity-bench runs (research only; prints aggregates, writes nothing).
//   node research/simulator_audit/replay_harness/scripts/opportunity_metrics.mjs <run prefix> [<run prefix> ...]
// Per arm: student / PCK failures and retries, latency p50 / p90 / max, duplicate-guard activity, final-output
// same-student near-duplicates (production criterion), carrier-reply near-repeats (edit similarity >= 0.7 to an
// earlier reply of the same student), garble counters, "אמרת…"-style teacher-attribution candidates (to be judged
// manually), replies per turn and reply length.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isSelfDuplicate, editSimilarity } from '../lib/text.js';

const RES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'results');
const ATTRIBUTION = /(^|[\s,."'])(אמרת|כמו שאמרת|שאמרת|הסברת|שאלת|ציינת|הראית|ציירת|שרטטת)(?=[\s,.?!])/;
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : null; };

for (const prefix of process.argv.slice(2)) {
  const convs = fs.readdirSync(RES).filter((d) => d === prefix || d.startsWith(prefix + '-'))
    .flatMap((d) => fs.readdirSync(path.join(RES, d, 'conversations')).map((f) => JSON.parse(fs.readFileSync(path.join(RES, d, 'conversations', f), 'utf8'))));
  const m = { conversations: convs.length, turns: 0, replies: 0, chars: 0, studentFail: 0, pckFail: 0, studentRetry: 0, pckRetry: 0, dupRetries: 0, dupDropped: 0, dupKept: 0,
    finalDuplicates: 0, nearRepeats: 0, garbleReplies: 0, unknownSpeaker: 0, attributionCandidates: 0, emptyTurns: 0 };
  const lat = { student: [], pck: [] };
  for (const c of convs) {
    const said = {};
    for (const t of c.turns) {
      m.turns++;
      if (!t.student.ok) m.studentFail++;
      if (!t.pck.ok) m.pckFail++;
      const sm = t.student.meta || {}; const pm = t.pck.meta || {};
      if (sm.attempts > 1) m.studentRetry++;
      if (pm.attempts > 1) m.pckRetry++;
      if (sm.latencyMs) lat.student.push(sm.latencyMs);
      if (pm.latencyMs) lat.pck.push(pm.latencyMs);
      m.dupRetries += sm.duplicateRetries || 0; m.dupDropped += sm.duplicateRepliesDropped || 0; m.dupKept += sm.duplicateRepliesKept || 0;
      m.garbleReplies += sm.garbleReplies || 0;
      if (!t.replies.length) m.emptyTurns++;
      for (const r of t.replies) {
        m.replies++; m.chars += r.message.length;
        if (!c.cast.includes(r.student)) m.unknownSpeaker++;
        const earlier = said[r.student] || [];
        if (earlier.some((e) => isSelfDuplicate(r.message, e))) m.finalDuplicates++;
        else if (earlier.some((e) => editSimilarity(r.message, e) >= 0.7)) m.nearRepeats++;
        if (ATTRIBUTION.test(r.message)) m.attributionCandidates++;
        earlier.push(r.message); said[r.student] = earlier;
      }
    }
  }
  console.log(`\n${prefix}`);
  console.log(JSON.stringify(m));
  console.log(`replies/turn ${(m.replies / m.turns).toFixed(2)}  mean chars ${(m.chars / m.replies).toFixed(0)}`);
  console.log(`latency student p50 ${pct(lat.student, 0.5)} p90 ${pct(lat.student, 0.9)} max ${Math.max(...lat.student)} ms | PCK p50 ${pct(lat.pck, 0.5)} p90 ${pct(lat.pck, 0.9)} max ${Math.max(...lat.pck)} ms`);
}
