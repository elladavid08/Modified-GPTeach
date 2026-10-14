// Misconception-opportunity probe (research only; 2026-10-13). Does the CURRENT student setup give the
// teacher a usable PCK opportunity: does the scenario's misconception surface, in one student, and does
// it survive until the teacher teaches? Drives the same real client path as run.bench.js (PCK first,
// its analysis steers the students) against a LOCAL, unmodified server/server.js. Synthetic only.
//
// Teacher plan (fixed, 7 turns; whole class unless noted; nothing is explained before T6):
//   T1 neutral opening question (the Mode B OPEN turn)
//   T2 a second neutral concept question (OPPORTUNITY_NEUTRAL below)
//   T3 explicit probe of the scenario misconception, to the class, without the answer
//      (the Mode B DIRECT_Q question without the "{A}, " address)
//   T4 diagnostic, non-teaching: "explain how you thought about it"
//   T5 non-teaching: "does everyone agree?"
//   T6 the correct explanation (the Mode B EXPLAIN turn, with its drawing)
//   T7 the Mode B CHECK question, addressed to the first student whose reply in T1-T5 the harness
//      detector flags as the misconception (misconceptionClaims), else to the class
//
// Casts (OPP_CASTS):
//   random   = 3 of the 9 personas drawn uniformly, as the app does (AppContext shuffles, Chat takes 3);
//              seeded per scenario x repeat, so reruns use the same casts
//   designed = the Mode B designed casts (slot A = a persona whose tendencies fit the misconception);
//              the probes stay class-addressed (unlike Mode B, which addresses slot A by name)
//
// Student arm (OPP_STUDENT):
//   current  = production src/utils/ai.js (default)
//   carrier  = the misconception-carrier prototype v1 (prototype/carrier.js); carrier2 / carrier3 = its v2 / v3 variants: ai.js patched in a copy written to
//              results/<run>/ai.carrier.js; one carrier per session (selectCarrier) is passed to the STUDENT call
//              only (scenario.misconception_carrier). PCK receives the unmodified scenario.
//   carrierpc = prototype pc1: v1 + an explicit misconception state ('open' -> 'addressed', sticky) set each teacher
//              turn by prototype/addressedJudge.js through the local /api/completion endpoint (run in parallel with
//              PCK, only while 'open'); the state is passed to the student call as scenario.misconception_state.
//
// 1.1.0 (bench-only, applied to both arms): scenario 5's probe and check target the configured misconception
// ("equal AND perpendicular diagonals => square"); student / PCK call telemetry is recorded; the first student
// prompt of each run is saved for provenance.
//
// Environment: OPP_CASTS (random|designed), OPP_STUDENT (current|carrier), OPP_SCENARIOS ("1,2"), OPP_REPEATS
// (default 6 random / 2 per designed cast), OPP_RUN_ID, HARNESS_API_URL (local server, default http://127.0.0.1:3101).
// Output: results/<run id>/conversations/*.json (git-ignored). Run only this file:
//   npx jest --config research/simulator_audit/replay_harness/jest.harness.json --runInBand --testPathPattern opportunity
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import productionCallAI from '../../../../src/utils/ai.js';
import { getPCKFeedback } from '../../../../src/services/genai.js';
import ChatMessage from '../../../../src/objects/ChatMessage.js';
import personas from '../../../../src/config/students/personas.js';
import scenarioConfig from '../../../../src/config/scenarios/geometry_scenarios.js';
import { SYSTEM_VERSION } from '../../../../src/config/version.js';
import { SCENARIOS, MOVES, DESIGNED_CASTS, PERSONA_ORDER, HARNESS_VERSION } from '../config/scenarios.js';
import { DRAWINGS } from '../lib/assets.js';
import { misconceptionClaims } from '../lib/teacher.js';
import { firstTurnAddendum } from '../lib/turnFlow.js';
import { buildCarrierModule, selectCarrier, baseAiSource } from '../prototype/carrier.js';
import { nextMisconceptionState } from '../prototype/addressedJudge.js';

jest.setTimeout(6 * 60 * 60 * 1000);
const HARNESS = path.resolve(__dirname, '..');
const REPO = path.resolve(HARNESS, '../../..');
export const OPPORTUNITY_VERSION = '1.1.0';

/** T2: a neutral concept question per scenario (does not name or hint the misconception). */
const OPPORTUNITY_NEUTRAL = {
  1: 'ומה ההגדרה של ריבוע?',
  2: 'מה ההגדרה של מעוין?',
  3: 'תנו לי דוגמה לדבר בכיתה שיש לו צורה של מלבן.',
  4: 'מה אתם יודעים על האלכסונים במלבן?',
  5: 'מה ההגדרה של ריבוע?',
  6: 'ומה ההגדרה של מעוין?',
};
/** Bench-only overrides (1.1.0): scenario 5's Mode B direct question and check test "equal diagonals" alone,
 *  but the configured misconception is "equal AND perpendicular diagonals => square". */
const OPPORTUNITY_OVERRIDES = {
  5: { probe: 'אם במרובע האלכסונים שווים ומאונכים, האם הוא בהכרח ריבוע? מה אתם חושבים?', check: '{A}, אז אלכסונים שווים ומאונכים - זה מספיק כדי שהמרובע יהיה ריבוע?' },
};
const DIAGNOSTIC = 'מעניין. תסבירו לי איך חשבתם על זה.';
const AGREE = 'אוקיי. כולם מסכימים עם זה?';

const stripAddress = (text) => text.replace(/^\{A\},\s*/, '').replace(/\s*לדעתך(?=\?)/, ''); // class-addressed
const capitalize = (text) => text; // Hebrew: nothing to do

/** The 7-turn plan for a scenario; T7 is filled once the carrier is known. */
export function opportunityPlan(scenarioId) {
  const plan = SCENARIOS.find((s) => s.id === scenarioId);
  const of = (move) => plan.turns.find((t) => t.move === move);
  return {
    plan,
    turns: [
      { label: 'T1 open', text: of(MOVES.OPEN).text },
      { label: 'T2 neutral', text: OPPORTUNITY_NEUTRAL[scenarioId] },
      { label: 'T3 probe', text: (OPPORTUNITY_OVERRIDES[scenarioId] || {}).probe || `${capitalize(stripAddress(of(MOVES.DIRECT_Q).text))} מה אתם חושבים?` },
      { label: 'T4 diagnostic', text: DIAGNOSTIC },
      { label: 'T5 agree', text: AGREE },
      { label: 'T6 explain', text: of(MOVES.EXPLAIN).text, drawing: of(MOVES.EXPLAIN).drawing || null },
      { label: 'T7 check', check: (OPPORTUNITY_OVERRIDES[scenarioId] || {}).check || of(MOVES.CHECK).text },
    ],
  };
}

// Seeded uniform cast draw (mulberry32 + Fisher-Yates), mirroring the app's shuffle-then-take-3.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randomCast(scenarioId, repeat) {
  const rnd = mulberry32(1000 * scenarioId + repeat);
  const keys = PERSONA_ORDER.slice();
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys.slice(0, 3);
}

const env = process.env;
const list = (v, dflt) => (v ? v.split(',').map((x) => Number(x.trim())) : dflt);

/** pc1 state judge through the local server's existing /api/completion endpoint. */
async function completionJudge(prompt) {
  const r = await fetch(`${process.env.REACT_APP_API_URL}/api/completion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, options: { max_tokens: 16 } }) });
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(`completion ${r.status}: ${j && j.error}`);
  return j.text;
}

it('opportunity', async () => {
  const castKind = env.OPP_CASTS;
  const studentArm = env.OPP_STUDENT || 'current';
  if (!['current', 'carrier', 'carrier2', 'carrier3', 'carrierpc'].includes(studentArm)) throw new Error('OPP_STUDENT must be current or carrier / carrier2 / carrier3 / carrierpc (prototype v1 / v2 / v3 / pc1)');
  if (!['random', 'designed'].includes(castKind)) throw new Error('Set OPP_CASTS=random or OPP_CASTS=designed');
  const scenarioIds = list(env.OPP_SCENARIOS, [1, 2, 3, 4, 5, 6]);
  const runId = env.OPP_RUN_ID || `O-${castKind}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const outDir = path.join(HARNESS, 'results', runId);
  if (fs.existsSync(outDir)) throw new Error(`results/${runId} already exists`);
  fs.mkdirSync(path.join(outDir, 'conversations'), { recursive: true });
  const git = (cmd) => { try { return execSync(cmd, { cwd: REPO }).toString().trim(); } catch (e) { return null; } };
  const manifest = {
    runId, opportunityVersion: OPPORTUNITY_VERSION, harnessVersion: HARNESS_VERSION, castKind, studentArm, scenarioIds,
    systemVersion: SYSTEM_VERSION, gitCommit: git('git rev-parse --short HEAD'), gitDirtyProductionFiles: git('git status --porcelain -- src server public') || '',
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  let callAI = productionCallAI;
  if (studentArm !== 'current') {
    const patched = path.join(outDir, 'ai.carrier.js');
    fs.writeFileSync(patched, buildCarrierModule(baseAiSource(REPO), path.join(REPO, 'src/utils'), { variant: { carrier: 'v1', carrier2: 'v2', carrier3: 'v3', carrierpc: 'pc1' }[studentArm] }));
    callAI = require(patched).default; // eslint-disable-line global-require
  }
  // Provenance: keep the first student system prompt of the run
  const fetch0 = global.fetch;
  let promptSaved = false;
  global.fetch = (url, opts) => {
    if (!promptSaved && String(url).endsWith('/api/generate') && opts && opts.body) {
      promptSaved = true;
      const body = JSON.parse(opts.body);
      const sys = (body.messages || []).find((m) => m.role === 'system');
      fs.writeFileSync(path.join(outDir, 'student_prompt_first_call.txt'), sys ? String(sys.content) : opts.body);
    }
    return fetch0(url, opts);
  };

  for (const scenarioId of scenarioIds) {
    const { plan, turns } = opportunityPlan(scenarioId);
    const scenario = scenarioConfig.scenarios[plan.scenarioIndex];
    const runs = castKind === 'random'
      ? Array.from({ length: Number(env.OPP_REPEATS || 6) }, (_, i) => ({ cast: randomCast(scenarioId, i + 1), tag: `r${i + 1}` }))
      : [0, 1].flatMap((ci) => Array.from({ length: Number(env.OPP_REPEATS || 2) }, (_, i) => ({ cast: DESIGNED_CASTS[scenarioId][ci], tag: `d${ci}-r${i + 1}` })));
    for (const { cast, tag } of runs) {
      const students = cast.map((name) => personas.students[name]);
      const id = `O-s${scenarioId}-${tag}`;
      const carrier = studentArm !== 'current' ? selectCarrier(students) : null;
      let misconceptionState = studentArm === 'carrierpc' ? 'open' : null;
      const conv = { conversationId: id, runId, scenarioId, slug: plan.slug, castKind, studentArm, cast, carrier, carrierDetected: null, addressedAtTurn: null, turns: [] };
      const messages = [];
      const feedbackHistory = [];
      for (const step of turns) {
        let text = step.text;
        if (step.check) {
          text = conv.carrierDetected ? step.check.replace(/\{A\}/g, conv.carrierDetected) : stripAddress(step.check);
        }
        const drawing = step.drawing ? DRAWINGS[step.drawing] : null;
        const image = drawing ? fs.readFileSync(path.join(HARNESS, drawing.file)).toString('base64') : null;
        messages.push(new ChatMessage('Teacher', text, 'user', image));

        // pc1: classify the teacher's move (only while 'open'), in parallel with PCK
        const judgeStart = Date.now();
        const judgeP = misconceptionState ? nextMisconceptionState(misconceptionState, scenario.misconception_focus, text, completionJudge).then((r) => ({ ...r, ms: Date.now() - judgeStart })) : Promise.resolve(null);
        let impact = null;
        const pck = { ok: false };
        try {
          let pckMeta = null;
          impact = await getPCKFeedback(text, messages, scenario, feedbackHistory.slice(-3), { onMeta: (m) => { pckMeta = m; } });
          Object.assign(pck, {
            meta: pckMeta,
            ok: true, quality: impact.pedagogical_quality, shown: Boolean(impact.should_provide_feedback),
            understanding: impact.predicted_student_state && impact.predicted_student_state.understanding_level,
            hints: ((impact.predicted_student_state && impact.predicted_student_state.student_reaction_hints) || []).map((h) => `${h.student}:${h.reaction_type}`),
            risk: impact.misconception_risk, addressed: impact.addressed_misconception,
          });
          feedbackHistory.push({ pedagogical_quality: impact.pedagogical_quality, feedback_message_hebrew: impact.feedback_message_hebrew, predicted_student_state: impact.predicted_student_state, skills_assessment: impact.skills_assessment || [] });
          if (feedbackHistory.length > 5) feedbackHistory.shift();
        } catch (e) {
          Object.assign(pck, { error: String(e.serverError || e.message).slice(0, 160) });
          impact = null;
        }

        const judged = await judgeP;
        if (judged) {
          if (judged.state === 'addressed' && misconceptionState !== 'addressed') conv.addressedAtTurn = step.label;
          misconceptionState = judged.state;
        }
        const studentScenario = carrier ? { ...scenario, misconception_carrier: carrier, ...(misconceptionState ? { misconception_state: misconceptionState } : {}) } : scenario;
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
        const out = (replies || []).map((r) => ({ student: r.agent, message: r.text, claim: misconceptionClaims(scenarioId, r.text).length > 0 }));
        if (!conv.carrierDetected && !step.check && step.label !== 'T6 explain') {
          const first = out.find((r) => r.claim);
          if (first) conv.carrierDetected = first.student;
        }
        conv.turns.push({ label: step.label, teacher: text, drawing: step.drawing || null, pck, misconceptionState: misconceptionState || undefined, judge: judged || undefined, student, replies: out });
        fs.writeFileSync(path.join(outDir, 'conversations', `${id}.json`), JSON.stringify(conv, null, 2));
      }
      process.stdout.write(`${id} done\n`);
    }
  }
  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
});
