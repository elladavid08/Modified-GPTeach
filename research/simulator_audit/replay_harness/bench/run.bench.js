// Live sequential replay runner (research only). Drives the REAL client path exactly as Chat.jsx orders
// a turn (PCK first; its analysis steers the students; B2: students unsteered if PCK fails) against a
// LOCAL, unmodified server/server.js. Synthetic personas and scripts only; no Firestore, no participant data.
//
// Configuration (environment):
//   HARNESS_MODE          A | B                      (required)
//   HARNESS_RUN_ID        output folder name          (default: <mode>-<UTC timestamp>)
//   HARNESS_SCENARIOS     e.g. "2,4,5"                (default: 1-6)
//   HARNESS_CASTS         historical | designed       (default: A -> historical, B -> designed)
//   HARNESS_CAST_INDEXES  e.g. "0" or "0,1"           (default: 0,1)
//   HARNESS_REPEATS       runs per scenario x cast    (default: 1)
//   HARNESS_API_URL       local server                (default: http://127.0.0.1:3101)
//   HARNESS_STUDENT_PROTOTYPE  carrier|carrier2|carrier3 (optional; v1 / v2 / v3 of the research prototype, prototype/carrier.js: patched
//                         copy of ai.js written to results/<run>/ai.carrier.js, one carrier per conversation passed to
//                         the student call only; PCK receives the unmodified scenario). Since 1.5.0 the prototypes patch the
//                         1.4.4 base ai.js (commit cf61c03, prototype/carrier.js baseAiSource)
//   HARNESS_STUDENT_CARRIER    production (optional; 1.5.0: the production student path with the session carrier from
//                         src/services/misconceptionCarrier.js, passed to the student call only, as Chat.jsx does)
// Output: research/simulator_audit/replay_harness/results/<run id>/ (git-ignored).
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import productionCallAI from '../../../../src/utils/ai.js';
import { getPCKFeedback } from '../../../../src/services/genai.js';
import ChatMessage from '../../../../src/objects/ChatMessage.js';
import personas from '../../../../src/config/students/personas.js';
import scenarioConfig from '../../../../src/config/scenarios/geometry_scenarios.js';
import { SYSTEM_VERSION } from '../../../../src/config/version.js';
import { SCENARIOS, castFor, conversationId, HARNESS_VERSION } from '../config/scenarios.js';
import { DRAWINGS } from '../lib/assets.js';
import { teacherTurnA, teacherTurnB, createTeacherState } from '../lib/teacher.js';
import { firstTurnAddendum } from '../lib/turnFlow.js';
import { buildCarrierModule, selectCarrier, baseAiSource } from '../prototype/carrier.js';
import { selectMisconceptionCarrier, withMisconceptionCarrier } from '../../../../src/services/misconceptionCarrier.js';

jest.setTimeout(6 * 60 * 60 * 1000);
const HARNESS = path.resolve(__dirname, '..');
const REPO = path.resolve(HARNESS, '../../..');

const env = process.env;
const MODE = env.HARNESS_MODE;
const list = (v, dflt) => (v ? v.split(',').map((x) => Number(x.trim())) : dflt);

it('replay', async () => {
  if (!['A', 'B'].includes(MODE)) throw new Error('Set HARNESS_MODE=A or HARNESS_MODE=B');
  const castKind = env.HARNESS_CASTS || (MODE === 'A' ? 'historical' : 'designed');
  if (!['historical', 'designed'].includes(castKind)) throw new Error('HARNESS_CASTS must be historical or designed');
  const prototype = env.HARNESS_STUDENT_PROTOTYPE || null;
  if (prototype && !['carrier', 'carrier2', 'carrier3'].includes(prototype)) throw new Error('HARNESS_STUDENT_PROTOTYPE must be carrier, carrier2, carrier3 (or unset)');
  const productionCarrier = env.HARNESS_STUDENT_CARRIER || null;
  if (productionCarrier && productionCarrier !== 'production') throw new Error('HARNESS_STUDENT_CARRIER must be production (or unset)');
  if (productionCarrier && prototype) throw new Error('HARNESS_STUDENT_CARRIER and HARNESS_STUDENT_PROTOTYPE are exclusive');
  const scenarioIds = list(env.HARNESS_SCENARIOS, [1, 2, 3, 4, 5, 6]);
  const castIndexes = list(env.HARNESS_CAST_INDEXES, [0, 1]);
  const repeats = Number(env.HARNESS_REPEATS || 1);
  const runId = env.HARNESS_RUN_ID || `${MODE}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const outDir = path.join(HARNESS, 'results', runId);
  if (fs.existsSync(outDir)) throw new Error(`results/${runId} already exists; choose another HARNESS_RUN_ID`);
  fs.mkdirSync(path.join(outDir, 'conversations'), { recursive: true });

  const git = (cmd) => { try { return execSync(cmd, { cwd: REPO }).toString().trim(); } catch (e) { return null; } };
  const manifest = {
    runId, harnessVersion: HARNESS_VERSION, mode: MODE, castKind, scenarioIds, castIndexes, repeats, studentPrototype: prototype, studentCarrier: productionCarrier,
    systemVersion: SYSTEM_VERSION, gitCommit: git('git rev-parse --short HEAD'), gitDirtyProductionFiles: git('git status --porcelain -- src server public') || '', gitDirtyHarnessFiles: git('git status --porcelain -- research/simulator_audit/replay_harness') || '',
    apiUrl: env.REACT_APP_API_URL, node: process.version, startedAt: new Date().toISOString(),
    note: 'Gemini generation is not deterministic; the harness (teacher, casts, drawings) is.',
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  let callAI = productionCallAI;
  if (prototype) {
    const patched = path.join(outDir, 'ai.carrier.js');
    fs.writeFileSync(patched, buildCarrierModule(baseAiSource(REPO), path.join(REPO, 'src/utils'), { variant: { carrier: 'v1', carrier2: 'v2', carrier3: 'v3' }[prototype] }));
    callAI = require(patched).default; // eslint-disable-line global-require
  }

  for (const scenarioId of scenarioIds) {
    const plan = SCENARIOS.find((s) => s.id === scenarioId);
    const scenario = scenarioConfig.scenarios[plan.scenarioIndex];
    for (const castIndex of castIndexes) {
      for (let repeat = 1; repeat <= repeats; repeat++) {
        const cast = castFor(scenarioId, castIndex, castKind);
        const students = cast.map((name) => personas.students[name]);
        const id = conversationId(MODE, scenarioId, castKind, castIndex, repeat);
        const sessionCarrier = productionCarrier ? selectMisconceptionCarrier(students, scenario) : null;
        const carrier = prototype ? selectCarrier(students) : sessionCarrier && sessionCarrier.name;
        const studentScenario = sessionCarrier ? withMisconceptionCarrier(scenario, sessionCarrier) : carrier ? { ...scenario, misconception_carrier: carrier } : scenario;
        const conv = { conversationId: id, runId, mode: MODE, scenarioId, slug: plan.slug, castKind, castIndex, repeat, cast, carrier, misconceptionCarrier: sessionCarrier, turns: [] };
        const messages = [];
        const feedbackHistory = [];
        const state = createTeacherState();
        let prevReplies = [];
        for (let ti = 0; ti < plan.turns.length; ti++) {
          const step = plan.turns[ti];
          const t = MODE === 'A' ? teacherTurnA(plan, ti, cast) : teacherTurnB(plan, ti, cast, prevReplies, state);
          const drawing = step.drawing ? DRAWINGS[step.drawing] : null;
          const image = drawing ? fs.readFileSync(path.join(HARNESS, drawing.file)).toString('base64') : null;
          messages.push(new ChatMessage('Teacher', t.text, 'user', image));

          // PCK first (Chat.jsx); image-only turns would skip PCK, which the scripts never produce
          let impact = null;
          const pck = { ok: false };
          try {
            let meta = null;
            impact = await getPCKFeedback(t.text, messages, scenario, feedbackHistory.slice(-3), { onMeta: (m) => { meta = m; } });
            Object.assign(pck, { ok: true, meta, quality: impact.pedagogical_quality, understanding: impact.predicted_student_state && impact.predicted_student_state.understanding_level, shown: Boolean(impact.should_provide_feedback) });
            feedbackHistory.push({ pedagogical_quality: impact.pedagogical_quality, feedback_message_hebrew: impact.feedback_message_hebrew, predicted_student_state: impact.predicted_student_state, skills_assessment: impact.skills_assessment || [] });
            if (feedbackHistory.length > 5) feedbackHistory.shift();
          } catch (e) {
            Object.assign(pck, { error: String(e.serverError || e.message).slice(0, 160), meta: e.meta || null });
            impact = null; // B2: students continue without PCK guidance
          }

          // Students (Chat.jsx): first-turn addendum only when the history holds just the opening message
          const addendum = messages.length === 1 ? firstTurnAddendum(scenario) : '';
          let replies = null;
          const student = { ok: true };
          const history = { toAIformat: () => messages.map((m) => m.toAIformat()), toString: () => messages.join('\n'), getMessages: () => messages, getLength: () => messages.length };
          try {
            await callAI(history, students, studentScenario, addendum, impact, (msgs, _c, _s, meta) => { replies = msgs; student.meta = meta; });
          } catch (e) {
            Object.assign(student, { ok: false, error: String(e.serverError || e.message).slice(0, 160), meta: e.meta || null });
          }
          (replies || []).forEach((r) => messages.push(r));
          prevReplies = (replies || []).map((r) => ({ student: r.agent, message: r.text }));
          conv.turns.push({ turn: ti + 1, move: step.move, scriptedText: t.scriptedText, teacher: t.text, drawing: step.drawing || null, decision: t.decision, pck, student, replies: prevReplies });
          fs.writeFileSync(path.join(outDir, 'conversations', `${id}.json`), JSON.stringify(conv, null, 2));
        }
        process.stdout.write(`${id} done\n`);
      }
    }
  }
  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
});
