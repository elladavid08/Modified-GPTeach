// Targeted Hebrew-quality probe for the student agent (research only; 2026-10-26, post-1.5.0 feedback investigation).
// Synthetic one-turn contexts built to elicit the error types the educational team reported on 1.5.0 (numeral-noun
// gender agreement in definitions, invented shape names, colour words for drawn shapes, counting properties, free
// description). Each context is sampled REPS times through the production student path (src/utils/ai.js with the
// 1.5.0 session carrier, as Chat.jsx) against a LOCAL server; the student model is chosen by the server (x11 arm).
// No PCK steering (impact null) so only the student model and prompt vary. Output: results/<HP_RUN_ID>/probe.jsonl.
// Score with scripts/hebrew_probe_score.mjs.
import fs from 'fs';
import path from 'path';
import productionCallAI from '../../../../src/utils/ai.js';
import ChatMessage from '../../../../src/objects/ChatMessage.js';
import personas from '../../../../src/config/students/personas.js';
import scenarioConfig from '../../../../src/config/scenarios/geometry_scenarios.js';
import { selectMisconceptionCarrier, withMisconceptionCarrier } from '../../../../src/services/misconceptionCarrier.js';

jest.setTimeout(3 * 60 * 60 * 1000);
const HARNESS = path.resolve(__dirname, '..');

export const PROBE_CONTEXTS = [
  { id: 'H1-definitions', scenario: 5, cast: ['הילה', 'מעיין', 'יובל'], history: [['היום נדבר על דלתון ומעוין.', []]],
    teacher: 'תנו לי בבקשה הגדרה של דלתון והגדרה של מעוין.' },
  { id: 'H2-more-names', scenario: 0, cast: ['הילה', 'מעיין', 'תמר'], history: [['אילו מרובעים אתם מכירים?', [['תמר', 'מלבן וריבוע.']]]],
    teacher: 'אמרתם מלבן, ריבוע. אני רוצה שמות נוספים של מרובעים.' },
  { id: 'H3-colours', scenario: 0, cast: ['תמר', 'דנה', 'עדי'], history: [['שלום כיתה. היום נדבר על ריבוע ומלבן.', []]],
    teacher: 'ציירתי על הלוח שתי צורות: בצד שמאל ריבוע ירוק, ובצד ימין מלבן כחול. מה אתם רואים? תארו את שתי הצורות.' },
  { id: 'H4-counting', scenario: 2, cast: ['יונתן', 'נועה', 'דנה'], history: [['בוקר טוב! מי יכול לתאר לי מה זה מלבן?', [['יונתן', 'מרובע עם זוויות ישרות.']]]],
    teacher: 'כמה זוגות של צלעות מקבילות יש למלבן, וכמה זוויות ישרות יש לו? ומה לגבי האלכסונים שלו?' },
  { id: 'H5-kite-diagonals', scenario: 5, cast: ['רועי', 'תמר', 'מעיין'], history: [['היום נדבר על דלתון ומעוין. מה ההגדרה של דלתון?', [['תמר', 'מרובע עם שני זוגות של צלעות סמוכות שוות.']]]],
    teacher: 'מה אתם יודעים על האלכסונים בדלתון? כמה אלכסונים יש, ומה הקשר ביניהם?' },
  { id: 'H6-describe', scenario: 3, cast: ['יובל', 'דנה', 'נועה'], history: [['היום נבדוק תכונות של אלכסונים במרובעים שונים.', []]],
    teacher: 'תארו במילים שלכם מקבילית: איך היא נראית ומה התכונות שלה?' },
];

it('hebrew probe', async () => {
  const runId = process.env.HP_RUN_ID;
  if (!runId) throw new Error('HP_RUN_ID is required');
  const outDir = path.join(HARNESS, 'results', runId);
  if (fs.existsSync(outDir)) throw new Error(`results/${runId} already exists`);
  fs.mkdirSync(outDir, { recursive: true });
  const reps = Number(process.env.HP_REPS || 12);
  const out = path.join(outDir, 'probe.jsonl');
  for (const c of PROBE_CONTEXTS) {
    const scenario = scenarioConfig.scenarios[c.scenario];
    const students = c.cast.map((n) => personas.students[n]);
    const carrier = selectMisconceptionCarrier(students, scenario);
    const messages = [];
    for (const [t, replies] of c.history) {
      messages.push(new ChatMessage('Teacher', t, 'user', null));
      for (const [name, text] of replies) messages.push(new ChatMessage(name, text, 'assistant'));
    }
    messages.push(new ChatMessage('Teacher', c.teacher, 'user', null));
    const history = { toAIformat: () => messages.map((m) => m.toAIformat()), toString: () => messages.join('\n'), getMessages: () => messages, getLength: () => messages.length };
    await Promise.all(Array.from({ length: reps }, async (_, rep) => {
      const rec = { ctx: c.id, rep };
      const t0 = Date.now();
      try {
        await productionCallAI(history, students, withMisconceptionCarrier(scenario, carrier), '', null, (msgs, _c, _s, meta) => {
          rec.replies = (msgs || []).map((m) => ({ student: m.agent, message: m.text })); rec.meta = meta || null;
        });
        rec.ok = true;
      } catch (e) { rec.ok = false; rec.error = String(e.serverError || e.message).slice(0, 160); }
      rec.ms = Date.now() - t0;
      fs.appendFileSync(out, JSON.stringify(rec) + '\n');
    }));
  }
});
