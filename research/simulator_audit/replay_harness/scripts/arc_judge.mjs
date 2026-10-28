// Misconception-arc labels for opportunity-bench runs (research only; 2026-10-26). For every carrier reply (and every
// peer reply at the teaching turns T6-T10) a one-word judge call on the LOCAL project's Vertex model labels the stance
// towards the scenario misconception. Writes results/<run>/arc_labels.json; prints arc aggregates.
//   node research/simulator_audit/replay_harness/scripts/arc_judge.mjs <run id> [<run id> ...]   (JUDGE_MODEL, default gemini-3.5-flash)
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RES = path.resolve(HERE, '..', 'results');
const REPO = path.resolve(HERE, '../../../..');
const require = createRequire(path.join(REPO, 'server/package.json'));
const { VertexAI } = require('@google-cloud/vertexai');
const vertex = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT || 'cloud-run-455609', location: 'global', apiEndpoint: 'aiplatform.googleapis.com',
  googleAuthOptions: { keyFilename: path.join(REPO, 'server/service-account-key.json') } });
const judge = vertex.getGenerativeModel({ model: process.env.JUDGE_MODEL || 'gemini-3.5-flash' });

const SCEN = {
  1: { mis: 'ריבוע ומלבן הם שני סוגי מרובעים שונים, ולכן ריבוע אינו מלבן', ok: 'כל ריבוע הוא מלבן, כי יש לו ארבע זוויות ישרות (ההגדרה של מלבן)' },
  2: { mis: 'אם במרובע האלכסונים מאונכים, אז הוא מעוין', ok: 'אלכסונים מאונכים אינם מספיקים כדי לקבוע שמרובע הוא מעוין (למשל בדלתון האלכסונים מאונכים)' },
  3: { mis: 'מלבן חייב להיות ארוך או להיראות טיפוסי; מלבן מסובב או כמעט ריבועי אינו מלבן', ok: 'כל מרובע שכל זוויותיו ישרות הוא מלבן, בלי קשר לכיוון או ליחס בין הצלעות' },
  4: { mis: 'אלכסון תמיד חוצה זווית, בכל מרובע', ok: 'האלכסונים חוצים את הזוויות רק במעוין ובריבוע, לא בכל מרובע (למשל לא במלבן או במקבילית)' },
  5: { mis: 'אם במרובע האלכסונים שווים ומאונכים, אז הוא בהכרח ריבוע', ok: 'אלכסונים שווים ומאונכים אינם מספיקים; לריבוע הם צריכים גם לחצות זה את זה' },
  6: { mis: 'דלתון ומעוין הם שני סוגי מרובעים שונים, ולכן מעוין אינו דלתון', ok: 'כל מעוין הוא דלתון, כי יש לו שני זוגות של צלעות סמוכות שוות' },
};
const LABELS = ['MISCONCEPTION', 'DOUBT', 'CORRECT_JUSTIFIED', 'CORRECT', 'OTHER'];
const prompt = (s, text) => `You label ONE student reply from a Hebrew middle-school geometry lesson.
Misconception being taught about: "${s.mis}"
Correct idea: "${s.ok}"
Student reply: "${text}"

Choose exactly one label for the student's stance on THIS idea in THIS reply:
MISCONCEPTION - asserts, defends or repeats the misconception (even if hedged or phrased as a question that assumes it).
DOUBT - is unsure or torn: questions the misconception, considers the correct idea tentatively, accepts it only partly, or voices a remaining doubt.
CORRECT_JUSTIFIED - states the correct idea with a reason (e.g. via the definition or a property) or applies it correctly to a case.
CORRECT - states or agrees with the correct idea without giving any reason.
OTHER - does not address this idea (greetings, other topics, pure procedure).
Answer with the label only.`;

async function label(s, text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await judge.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt(s, text) }] }], generationConfig: { thinkingConfig: { thinkingLevel: 'LOW' }, maxOutputTokens: 1024 } });
      const t = (r.response.candidates[0].content.parts.map((p) => p.text || '').join('') || '').trim().toUpperCase();
      const hit = LABELS.find((l) => t.startsWith(l));
      if (hit) return hit;
    } catch (e) { await new Promise((res) => setTimeout(res, 1500)); }
  }
  return 'UNPARSED';
}

const TEACH = ['T6', 'T7', 'T8', 'T9', 'T10'];
for (const run of process.argv.slice(2)) {
  const dir = path.join(RES, run, 'conversations');
  const convs = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const out = [];
  const jobs = [];
  for (const c of convs) {
    const s = SCEN[c.scenarioId];
    for (const t of c.turns) {
      const tk = t.label.split(' ')[0];
      for (const r of t.replies) {
        const isCarrier = r.student === c.carrier;
        if (!isCarrier && !TEACH.includes(tk)) continue;
        jobs.push({ conv: c.conversationId, scenario: c.scenarioId, turn: tk, student: r.student, carrier: isCarrier, text: r.message, s });
      }
    }
  }
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (i < jobs.length) { const j = jobs[i++]; out.push({ ...j, s: undefined, label: await label(j.s, j.text) }); } }));
  fs.writeFileSync(path.join(RES, run, 'arc_labels.json'), JSON.stringify(out, null, 1));
  // aggregates per conversation
  const byConv = {};
  for (const x of out) (byConv[x.conv] = byConv[x.conv] || []).push(x);
  const agg = { conversations: convs.length, appears: 0, heldThroughDiagnostics: 0, preTeachingCorrect: 0, firstTeachingJump: 0, firstTeachingPartial: 0, firstTeachingHold: 0, firstTeachingSilent: 0,
    peerFullBeforeCarrier: 0, correctByCheck: 0, resolvedByEnd: 0, stuckAtEnd: 0, unparsed: out.filter((x) => x.label === 'UNPARSED').length };
  const ok = (l) => l === 'CORRECT' || l === 'CORRECT_JUSTIFIED';
  for (const c of convs) {
    const xs = (byConv[c.conversationId] || []).filter((x) => x.carrier);
    const pre = xs.filter((x) => ['T1', 'T2', 'T3', 'T4', 'T5'].includes(x.turn));
    if (pre.some((x) => x.label === 'MISCONCEPTION')) agg.appears++;
    if (pre.some((x) => ok(x.label))) agg.preTeachingCorrect++;
    else if (pre.some((x) => x.label === 'MISCONCEPTION')) agg.heldThroughDiagnostics++;
    const first = xs.filter((x) => x.turn === 'T6' || x.turn === 'T7').map((x) => x.label);
    if (!first.length) agg.firstTeachingSilent++;
    else if (first.some(ok)) agg.firstTeachingJump++;
    else if (first.includes('DOUBT')) agg.firstTeachingPartial++;
    else if (first.includes('MISCONCEPTION')) agg.firstTeachingHold++;
    else agg.firstTeachingSilent++;
    const peers = (byConv[c.conversationId] || []).filter((x) => !x.carrier && (x.turn === 'T6' || x.turn === 'T7'));
    if (peers.some((x) => ok(x.label)) && !first.some(ok)) agg.peerFullBeforeCarrier++;
    if (xs.some((x) => x.turn === 'T8' && ok(x.label))) agg.correctByCheck++;
    const last = xs.filter((x) => ['T8', 'T9', 'T10'].includes(x.turn));
    if (last.some(ok)) agg.resolvedByEnd++;
    const lastLabel = last.length ? last[last.length - 1].label : null;
    if (lastLabel === 'MISCONCEPTION') agg.stuckAtEnd++;
  }
  console.log(run, agg);
}
