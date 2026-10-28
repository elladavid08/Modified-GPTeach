// Replays PCK regression cases (research only; 2026-10-26, post-1.5.0 feedback investigation) through the real client
// path (getPCKFeedback -> LOCAL server.js -> Gemini), REPS samples per case, empty feedback history (as the B200 replays).
// Env: CASES (case file; default x11/regression_cases_synthetic.json, the tracked synthetic paraphrases; the exact
//      cases are local and git-ignored), OUT (output JSONL, must not exist), REPS (default 5), HARNESS_API_URL.
// Score with x11/score_regression.mjs.
import fs from 'fs';
import path from 'path';
import { getPCKFeedback } from '../../../../src/services/genai.js';
import ChatMessage from '../../../../src/objects/ChatMessage.js';
import scenarioConfig from '../../../../src/config/scenarios/geometry_scenarios.js';

jest.setTimeout(2 * 60 * 60 * 1000);
const DIR = path.resolve(__dirname, '..');

it('replay PCK regression cases', async () => {
  const casesPath = path.resolve(process.env.CASES || path.join(DIR, 'x11', 'regression_cases_synthetic.json'));
  const out = process.env.OUT;
  if (!out) throw new Error('OUT is required');
  if (fs.existsSync(out)) throw new Error(`${out} exists`);
  const reps = Number(process.env.REPS || 5);
  const { cases } = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  for (const c of cases) {
    const scenario = scenarioConfig.scenarios[c.scenario_index];
    const messages = [];
    for (const h of c.history) {
      messages.push(new ChatMessage('Teacher', h.teacher, 'user', null));
      for (const s of h.students) messages.push(new ChatMessage(s.name, s.message, 'assistant'));
    }
    messages.push(new ChatMessage('Teacher', c.teacher, 'user', null));
    await Promise.all(Array.from({ length: reps }, async (_, rep) => {
      const rec = { id: c.id, rep };
      const t0 = Date.now(); let meta = null;
      try { rec.analysis = await getPCKFeedback(c.teacher, messages, scenario, [], { onMeta: (m) => { meta = m; } }); rec.ok = true; }
      catch (e) { rec.ok = false; rec.error = String(e.serverError || e.message).slice(0, 200); meta = e.meta || meta; }
      rec.meta = meta; rec.clientMs = Date.now() - t0;
      fs.appendFileSync(out, JSON.stringify(rec) + '\n');
    }));
  }
});
