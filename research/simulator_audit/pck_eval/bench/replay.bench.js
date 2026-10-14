// Replays the frozen PCK benchmark through the real client path (getPCKFeedback → local server.js → Gemini).
// Research only: local server only (bench/setup.js refuses anything else), no Firestore, outputs git-ignored.
// Env: PCK_EVAL_RUN_ID (required; results/<id>.jsonl must not exist), PCK_EVAL_REPS (default 3),
//      PCK_EVAL_ONLY (comma-separated case ids), PCK_EVAL_BUCKET (high | needs_expert_review),
//      PCK_EVAL_NO_FEEDBACK_HISTORY=1 (send [] instead of the frozen feedback history), HARNESS_API_URL.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { getPCKFeedback } from '../../../../src/services/genai.js';
import ChatMessage from '../../../../src/objects/ChatMessage.js';
import scenarioConfig from '../../../../src/config/scenarios/geometry_scenarios.js';
import { SYSTEM_VERSION } from '../../../../src/config/version.js';
import { DRAWINGS } from '../../replay_harness/lib/assets.js';

jest.setTimeout(6 * 60 * 60 * 1000);
const DIR = path.resolve(__dirname, '..');
const HARNESS = path.resolve(DIR, '../replay_harness');
const FIXTURE = path.join(DIR, 'pck_eval_benchmark.json');

const png = (id) => (id ? fs.readFileSync(path.join(HARNESS, DRAWINGS[id].file)).toString('base64') : null);

export function buildRequest(c, { noFeedbackHistory = false } = {}) {
  const messages = [];
  for (const t of c.history) {
    messages.push(new ChatMessage('Teacher', t.teacher, 'user', png(t.teacher_drawing)));
    for (const s of t.students) messages.push(new ChatMessage(s.name, s.message, 'assistant'));
  }
  messages.push(new ChatMessage('Teacher', c.teacher_message, 'user', png(c.teacher_drawing)));
  const scenario = scenarioConfig.scenarios[c.scenario.index];
  if (scenario.text !== c.scenario.text) throw new Error(`scenario mismatch ${c.id}`);
  return { teacher: c.teacher_message, messages, scenario, feedbackHistory: noFeedbackHistory ? [] : c.feedback_history };
}

it('replay the PCK evaluation benchmark', async () => {
  const runId = process.env.PCK_EVAL_RUN_ID;
  if (!runId) throw new Error('PCK_EVAL_RUN_ID is required');
  const outDir = path.join(DIR, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${runId}.jsonl`);
  if (fs.existsSync(out)) throw new Error(`${out} exists`);
  const body = fs.readFileSync(FIXTURE);
  const bench = JSON.parse(body);
  const reps = Number(process.env.PCK_EVAL_REPS || 3);
  const only = process.env.PCK_EVAL_ONLY ? new Set(process.env.PCK_EVAL_ONLY.split(',')) : null;
  const bucket = process.env.PCK_EVAL_BUCKET || null;
  const noFeedbackHistory = process.env.PCK_EVAL_NO_FEEDBACK_HISTORY === '1';
  const git = (cmd) => { try { return execSync(cmd, { cwd: DIR }).toString().trim(); } catch { return null; } };
  fs.writeFileSync(path.join(outDir, `${runId}.manifest.json`), JSON.stringify({
    runId, fixtureVersion: bench.version, fixtureSha256: crypto.createHash('sha256').update(body).digest('hex'), systemVersion: SYSTEM_VERSION,
    gitCommit: git('git rev-parse HEAD'), gitDirtyProductionFiles: (git('git status --porcelain -- server src') || '').split('\n').filter(Boolean),
    reps, only: only ? [...only] : null, bucket, noFeedbackHistory, apiUrl: process.env.REACT_APP_API_URL, startedAt: new Date().toISOString(),
  }, null, 1));
  for (const c of bench.cases) {
    if (only && !only.has(c.id)) continue;
    if (bucket && c.confidence !== bucket) continue;
    const r = buildRequest(c, { noFeedbackHistory });
    await Promise.all(Array.from({ length: reps }, async (_, rep) => {
      const t0 = Date.now(); let meta = null; const rec = { id: c.id, rep };
      try {
        rec.analysis = await getPCKFeedback(r.teacher, r.messages, r.scenario, r.feedbackHistory, { onMeta: (m) => { meta = m; } });
        rec.ok = true;
      } catch (e) {
        Object.assign(rec, { ok: false, error: String(e.serverError || e.message).slice(0, 200), meta: e.meta || null });
      }
      rec.meta = rec.meta || meta; rec.clientMs = Date.now() - t0;
      fs.appendFileSync(out, JSON.stringify(rec) + '\n');
    }));
  }
});
