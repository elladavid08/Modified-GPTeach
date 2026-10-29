// Misconception-arc aggregates for progression-plan opportunity runs (research only; 2026-10-28, model x pacing 2x2).
// Reads results/<run>/arc_labels.json (scripts/arc_judge.mjs) and results/<run>/conversations/*.json. Prints aggregates
// only. Definitions (the same for every arm):
//   stance       = the judge label of a reply; "correct" = CORRECT or CORRECT_JUSTIFIED. A correct reply is TENTATIVE
//                  when it is phrased as a question ("?"), otherwise CONFIDENT. OTHER replies carry no stance.
//   voiced       = the carrier states the misconception at some turn T1-T5.
//   selfCorrected= the carrier's last stance in T1-T5 is correct (it left the misconception before any teaching).
//   holding      = the carrier's last stance in T1-T5 is MISCONCEPTION or DOUBT (teaching starts with it open).
//   firstTeach   = for holding carriers, the carrier's first stance in T6-T7 (hint, rethink): hold / doubt /
//                  tentative / confident / silent (no stance).
//   twoStep      = holding, firstTeach is doubt or tentative, and a CORRECT_JUSTIFIED carrier reply at T8-T10
//                  (the requested arc: misconception -> partial / specific doubt -> consolidated after checking).
//   peerJumpT6 / peerJumpT6T7 = a peer gives a CONFIDENT correct reply at T6 (right after the minimal hint) / at T6-T7.
//   peerStep     = a peer reply at T6-T7 with stance DOUBT or a TENTATIVE correct (a partial step, not the conclusion).
//   checkCorrect = a correct carrier reply at T8; justifiedByEnd = a CORRECT_JUSTIFIED carrier reply at T8-T10;
//   stuck        = the carrier's last stance in T8-T10 is MISCONCEPTION.
// Also per run: student-call latency and failures, and the server's garble counters (content-free telemetry).
// Usage: node research/simulator_audit/replay_harness/scripts/arc_aggregate.mjs <run id> [<run id> ...]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'results');
const isCorrect = (l) => l === 'CORRECT' || l === 'CORRECT_JUSTIFIED';
const stance = (x) => (x.label === 'OTHER' || x.label === 'UNPARSED' ? null : isCorrect(x.label) ? (/[?？]/.test(x.text) ? 'tentative' : 'confident') : x.label === 'DOUBT' ? 'doubt' : 'hold');
const T = (x) => Number(x.turn.replace('T', ''));
const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.round(f * (s.length - 1)))] : null; };

for (const run of process.argv.slice(2)) {
  const labels = JSON.parse(fs.readFileSync(path.join(RES, run, 'arc_labels.json'), 'utf8'));
  const dir = path.join(RES, run, 'conversations');
  const convs = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const by = {};
  for (const x of labels) (by[x.conv] = by[x.conv] || []).push(x);
  const a = { conversations: convs.length, voiced: 0, selfCorrected: 0, holding: 0, firstTeach: { hold: 0, doubt: 0, tentative: 0, confident: 0, silent: 0 }, twoStep: 0,
    peerJumpT6: 0, peerJumpT6T7: 0, peerStep: 0, checkCorrect: 0, justifiedByEnd: 0, stuck: 0, unparsed: labels.filter((x) => x.label === 'UNPARSED').length };
  const perScenario = {};
  for (const c of convs) {
    const xs = (by[c.conversationId] || []).sort((u, v) => T(u) - T(v));
    const car = xs.filter((x) => x.carrier); const peers = xs.filter((x) => !x.carrier);
    const pre = car.filter((x) => T(x) <= 5 && stance(x));
    if (car.some((x) => T(x) >= 1 && T(x) <= 5 && x.label === 'MISCONCEPTION')) a.voiced++;
    const lastPre = pre.length ? stance(pre[pre.length - 1]) : null;
    const holding = lastPre === 'hold' || lastPre === 'doubt';
    if (lastPre === 'tentative' || lastPre === 'confident') a.selfCorrected++;
    let first = null;
    if (holding) {
      a.holding++;
      const f = car.find((x) => (T(x) === 6 || T(x) === 7) && stance(x));
      first = f ? stance(f) : 'silent';
      a.firstTeach[first]++;
    }
    const justified = car.some((x) => T(x) >= 8 && x.label === 'CORRECT_JUSTIFIED');
    if (holding && (first === 'doubt' || first === 'tentative') && justified) a.twoStep++;
    if (peers.some((x) => T(x) === 6 && stance(x) === 'confident')) a.peerJumpT6++;
    const jump67 = peers.some((x) => (T(x) === 6 || T(x) === 7) && stance(x) === 'confident');
    if (jump67) a.peerJumpT6T7++;
    if (peers.some((x) => (T(x) === 6 || T(x) === 7) && (stance(x) === 'doubt' || stance(x) === 'tentative'))) a.peerStep++;
    if (car.some((x) => T(x) === 8 && isCorrect(x.label))) a.checkCorrect++;
    if (justified) a.justifiedByEnd++;
    const late = car.filter((x) => T(x) >= 8 && stance(x));
    if (late.length && stance(late[late.length - 1]) === 'hold') a.stuck++;
    const s = (perScenario[c.scenarioId] = perScenario[c.scenarioId] || { n: 0, holding: 0, twoStep: 0, confidentJump: 0, peerJumpT6T7: 0 });
    s.n++; if (holding) s.holding++; if (holding && (first === 'doubt' || first === 'tentative') && justified) s.twoStep++; if (first === 'confident') s.confidentJump++; if (jump67) s.peerJumpT6T7++;
  }
  // operations (content-free telemetry recorded by the bench)
  const st = convs.flatMap((c) => c.turns.map((t) => t.student));
  const ms = st.filter((s) => s.ok && s.meta && s.meta.latencyMs != null).map((s) => s.meta.latencyMs);
  const garble = st.reduce((n, s) => n + ((s.meta && s.meta.garbleReplies) || 0), 0);
  const replies = convs.reduce((n, c) => n + c.turns.reduce((m, t) => m + t.replies.length, 0), 0);
  const ops = { studentCalls: st.length, studentFailures: st.filter((s) => !s.ok).length, p50: q(ms, 0.5), p90: q(ms, 0.9), replies, garbleReplies: garble,
    meanReplyChars: Math.round(convs.reduce((n, c) => n + c.turns.reduce((m, t) => m + t.replies.reduce((k, r) => k + r.message.length, 0), 0), 0) / Math.max(1, replies)) };
  console.log(JSON.stringify({ run, ...a, perScenario, ops }));
}
