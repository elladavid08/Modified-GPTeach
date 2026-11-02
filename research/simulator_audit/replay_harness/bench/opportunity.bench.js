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
// 1.2.0 (2026-10-26, post-1.5.0 feedback investigation; bench-only):
//   OPP_STUDENT=production  the released 1.5.0 student path: production callAI with the session carrier from
//                           src/services/misconceptionCarrier.js (as Chat.jsx); PCK receives the unmodified scenario.
//   OPP_PLAN=progression    T1-T5 as above, then a graded teaching sequence instead of one explanation:
//     T6 hint     a minimal teaching move: a definition / fact reminder that does NOT state the conclusion
//     T7 rethink  "now let's think about <the object of the misconception>" (the educational team's 1.5.0 example)
//     T8 check    the Mode B CHECK question, addressed to the designated carrier
//     T9 explain  the full Mode B EXPLAIN turn (with its drawing)
//     T10 apply   the Mode B T8 application question (content / drawing question)
//   It separates "progressed appropriately" from "jumped to the full conclusion after one minimal teaching move".
//
// 1.3.0 (2026-10-28, X12/pacing, bench-only):
//   OPP_STUDENT=pacing  the production 1.5.1 student path (same session carrier as production) with the pacing
//                       prototype P1 (prototype/pacing.js): a two-step carrier arc and the one-step peer rule.
//                       Combine with x11_arm.cjs STUDENT_MODEL for the model x pacing comparison.
//   OPP_STAGE2=1        X12 parallelism check: on every turn whose PCK feedback is shown, the frozen Stage 2
//                       (pck_eval/x12/stage2_service.mjs, OPP_STAGE2_URL) runs CONCURRENTLY with the student call, as a production
//                       two-stage design would. Needs a server started with pck_eval/x12/x12_arm.cjs (Stage-1 context).
//                       Students still receive the unchanged Stage-1 analysis; wall times are recorded per turn.
//   OPP_ARCH            X12b steering/feedback dependency (needs the stage2 service and the x12 arm), on shown turns:
//     sequential        Stage 2 (dependent, full) BEFORE the students; students steered by its signal
//     sequential_indep  the frozen independent X12 Stage 2 BEFORE the students; students steered by its signal
//     dep_parallel      students from Stage-1 steering; dependent full Stage 2 in parallel
//     dep_parallel_cal  as dep_parallel, Stage-1 steering recalibrated from Stage-1 fields (signalFromStage1Calibrated)
//     fast              fast dependent assessment (scores only) BEFORE the students; students steered by its signal;
//                       the text for those fixed scores in parallel with the students
//     fast_indep        as fast, the fast assessment without the Stage-1 assessment as input
//     stream            ONE independent streamed Stage-2 call (pck_eval/x12/stage2_stream.cjs): scores first; the
//                       students start when the scores are complete; the same call then writes the text
//     stream_v3         the frozen X12 call (as sequential_indep) streamed: the students start as soon as the steering
//                       signal is determined (pck_eval/x12/stream_v3_call.cjs); the same call then finishes the text
//   The signal (none / partial / strong) is written into the analysis the students see by
//   pck_eval/x12/stage2_dep.cjs adaptImpact (values the student prompt already defines). Stage 1 is unchanged.
//
// 1.4.0 (2026-11-02, A1i student data contract, bench-only): two arms on the FROZEN final Stage-2 candidate
// (pck_eval/x12/FINAL_FREEZE.md; service route /stage2_final), BEFORE the students, with the final policy
// (final_pipeline.cjs: leveraging guard; no row left -> no feedback, students steered by the unchanged Stage-1 analysis;
// Stage 2 failed -> Stage-1 steering). They differ ONLY in what the students receive on a turn with Stage-2 rows:
//     sequential_final_adapter   the previously evaluated A1i adapter (stage2_dep.cjs adaptImpact: four fields)
//     sequential_final_contract  the §1a contract (pck_eval/x12/student_view.cjs studentPckView: every current-turn
//                                quality statement from the Stage-2 rows / signal, no Stage-1 assessment text)
//   Both record content-free prompt-consistency flags (student_view.cjs auditStudentInput) per Stage-2 turn.
//
// Environment: OPP_CASTS (random|designed), OPP_STUDENT (current|carrier|production|pacing), OPP_PLAN (standard|progression), OPP_SCENARIOS ("1,2"), OPP_REPEATS
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
import { buildPacingModule } from '../prototype/pacing.js';
import { selectMisconceptionCarrier, withMisconceptionCarrier } from '../../../../src/services/misconceptionCarrier.js';
import { nextMisconceptionState } from '../prototype/addressedJudge.js';
// X12 Stage 2 through the local research service (pck_eval/x12/stage2_service.mjs; Jest here cannot load the Vertex SDK)
const stage2Post = async (route, body) => {
  const base = process.env.OPP_STAGE2_URL || 'http://127.0.0.1:3120';
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('OPP_STAGE2_URL must be a local stage2 service (http://127.0.0.1:<port>)');
  const r = await global.fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
};
const runStage2 = (ctx) => stage2Post('/stage2', { ctx });
const DEP = require('../../pck_eval/x12/stage2_dep.cjs'); // eslint-disable-line global-require
const FINAL = require('../../pck_eval/x12/final_pipeline.cjs'); // eslint-disable-line global-require
const STUDENT = require('../../pck_eval/x12/student_view.cjs'); // eslint-disable-line global-require

jest.setTimeout(6 * 60 * 60 * 1000);
const HARNESS = path.resolve(__dirname, '..');
const REPO = path.resolve(HARNESS, '../../..');
export const OPPORTUNITY_VERSION = '1.4.0';

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

/** 1.2.0 progression plan: minimal teaching move (no conclusion) and the "now think about ..." prompt. */
const PROGRESSION = {
  1: { hint: 'בואו נזכיר את ההגדרה: מלבן הוא מרובע שכל זוויותיו ישרות.', rethink: 'עכשיו בואו נחשוב על ריבוע.' },
  2: { hint: 'בואו נזכיר: מעוין הוא מרובע שכל ארבע צלעותיו שוות.', rethink: 'עכשיו בואו נחשוב שוב על מרובע שהאלכסונים שלו מאונכים.' },
  3: { hint: 'בואו נזכיר את ההגדרה: מלבן הוא מרובע שכל זוויותיו ישרות.', rethink: 'עכשיו בואו נחשוב שוב על מלבן שעומד על הצד או שהוא כמעט ריבועי.' },
  4: { hint: 'בואו נזכיר: במלבן כל הזוויות ישרות, והאלכסונים שלו חוצים זה את זה.', rethink: 'עכשיו בואו נחשוב על האלכסון של מלבן.' },
  5: { hint: 'בואו נזכיר: ריבוע הוא מרובע שכל צלעותיו שוות וכל זוויותיו ישרות.', rethink: 'עכשיו בואו נחשוב שוב על מרובע שהאלכסונים שלו שווים ומאונכים.' },
  6: { hint: 'בואו נזכיר את ההגדרה: דלתון הוא מרובע שיש לו שני זוגות של צלעות סמוכות שוות.', rethink: 'עכשיו בואו נחשוב על מעוין.' },
};

/** 1.2.0 progression plan (10 turns); T8 is addressed to the carrier once known. */
export function progressionPlan(scenarioId) {
  const base = opportunityPlan(scenarioId);
  const of = (move) => base.plan.turns.find((t) => t.move === move);
  const apply = base.plan.turns[7]; // the Mode B T8 application question (content / drawing)
  return {
    plan: base.plan,
    turns: [
      ...base.turns.slice(0, 5),
      { label: 'T6 hint', text: PROGRESSION[scenarioId].hint, teaching: true },
      { label: 'T7 rethink', text: PROGRESSION[scenarioId].rethink, teaching: true },
      { label: 'T8 check', check: (OPPORTUNITY_OVERRIDES[scenarioId] || {}).check || of(MOVES.CHECK).text, teaching: true },
      { label: 'T9 explain', text: of(MOVES.EXPLAIN).text, drawing: of(MOVES.EXPLAIN).drawing || null, teaching: true },
      { label: 'T10 apply', text: apply.text, drawing: apply.drawing || null, teaching: true },
    ],
  };
}

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
  if (!['current', 'production', 'pacing', 'carrier', 'carrier2', 'carrier3', 'carrierpc'].includes(studentArm)) throw new Error('OPP_STUDENT must be current, production (1.5.0 carrier) or carrier / carrier2 / carrier3 / carrierpc (prototype v1 / v2 / v3 / pc1)');
  const planKind = env.OPP_PLAN || 'standard';
  if (!['standard', 'progression'].includes(planKind)) throw new Error('OPP_PLAN must be standard or progression');
  if (!['random', 'designed'].includes(castKind)) throw new Error('Set OPP_CASTS=random or OPP_CASTS=designed');
  const scenarioIds = list(env.OPP_SCENARIOS, [1, 2, 3, 4, 5, 6]);
  const runId = env.OPP_RUN_ID || `O-${castKind}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const outDir = path.join(HARNESS, 'results', runId);
  if (fs.existsSync(outDir)) throw new Error(`results/${runId} already exists`);
  fs.mkdirSync(path.join(outDir, 'conversations'), { recursive: true });
  const git = (cmd) => { try { return execSync(cmd, { cwd: REPO }).toString().trim(); } catch (e) { return null; } };
  const manifest = {
    runId, opportunityVersion: OPPORTUNITY_VERSION, harnessVersion: HARNESS_VERSION, castKind, studentArm, planKind, scenarioIds,
    systemVersion: SYSTEM_VERSION, gitCommit: git('git rev-parse --short HEAD'), gitDirtyProductionFiles: git('git status --porcelain -- src server public') || '',
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  let callAI = productionCallAI;
  const productionCarrier = studentArm === 'production' || studentArm === 'pacing';
  if (studentArm === 'pacing') {
    const patched = path.join(outDir, 'ai.pacing.js');
    fs.writeFileSync(patched, buildPacingModule(REPO));
    callAI = require(patched).default; // eslint-disable-line global-require
  } else if (studentArm !== 'current' && studentArm !== 'production') {
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
    const { plan, turns } = planKind === 'progression' ? progressionPlan(scenarioId) : opportunityPlan(scenarioId);
    const scenario = scenarioConfig.scenarios[plan.scenarioIndex];
    const runs = castKind === 'random'
      ? Array.from({ length: Number(env.OPP_REPEATS || 6) }, (_, i) => ({ cast: randomCast(scenarioId, i + 1), tag: `r${i + 1}` }))
      : [0, 1].flatMap((ci) => Array.from({ length: Number(env.OPP_REPEATS || 2) }, (_, i) => ({ cast: DESIGNED_CASTS[scenarioId][ci], tag: `d${ci}-r${i + 1}` })));
    for (const { cast, tag } of runs) {
      const students = cast.map((name) => personas.students[name]);
      const id = `O-s${scenarioId}-${tag}`;
      const sessionCarrier = productionCarrier ? selectMisconceptionCarrier(students, scenario) : null;
      const carrier = productionCarrier ? sessionCarrier && sessionCarrier.name : studentArm !== 'current' ? selectCarrier(students) : null;
      let misconceptionState = studentArm === 'carrierpc' ? 'open' : null;
      const conv = { conversationId: id, runId, scenarioId, slug: plan.slug, castKind, studentArm, cast, carrier, carrierDetected: null, addressedAtTurn: null, turns: [] };
      const messages = [];
      const feedbackHistory = [];
      for (const step of turns) {
        let text = step.text;
        if (step.check) {
          const addressee = productionCarrier ? carrier : conv.carrierDetected;
          text = addressee ? step.check.replace(/\{A\}/g, addressee) : stripAddress(step.check);
        }
        const drawing = step.drawing ? DRAWINGS[step.drawing] : null;
        const image = drawing ? fs.readFileSync(path.join(HARNESS, drawing.file)).toString('base64') : null;
        messages.push(new ChatMessage('Teacher', text, 'user', image));

        // pc1: classify the teacher's move (only while 'open'), in parallel with PCK
        const judgeStart = Date.now();
        const judgeP = misconceptionState ? nextMisconceptionState(misconceptionState, scenario.misconception_focus, text, completionJudge).then((r) => ({ ...r, ms: Date.now() - judgeStart })) : Promise.resolve(null);
        let impact = null;
        const pck = { ok: false };
        const pckStart = Date.now();
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
          pck.wallMs = Date.now() - pckStart;
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
        const studentScenario = sessionCarrier ? withMisconceptionCarrier(scenario, sessionCarrier)
          : carrier ? { ...scenario, misconception_carrier: carrier, ...(misconceptionState ? { misconception_state: misconceptionState } : {}) } : scenario;
        const addendum = messages.length === 1 ? firstTurnAddendum(scenario) : '';
        let replies = null;
        const student = { ok: true };
        const history = { toAIformat: () => messages.map((m) => m.toAIformat()), toString: () => messages.join('\n'), getMessages: () => messages, getLength: () => messages.length };
        // X12: Stage 2 starts together with the student call (both need only the Stage-1 result)
        const arch = env.OPP_ARCH || null;
        const shownS1 = Boolean(impact && impact.should_provide_feedback === true && impact._x12ctx);
        const s1Only = impact ? (({ _x12ctx, ...rest }) => rest)(impact) : null;
        let studentImpact = impact;
        let stage2P = env.OPP_STAGE2 === '1' && impact && impact.should_provide_feedback === true ? runStage2(impact._x12ctx || null) : null;
        let x12b = null;
        if (arch && shownS1) {
          x12b = { arch, preStudentMs: 0 };
          const t0 = Date.now();
          if (arch === 'sequential') {
            const s2 = await stage2Post('/dep_full', { ctx: impact._x12ctx, s1: s1Only });
            x12b.stage2 = s2; x12b.signal = s2.status === 'ok' ? DEP.signalFromRows(s2.rows) : null;
          } else if (arch === 'sequential_indep') {
            const s2 = await stage2Post('/stage2', { ctx: impact._x12ctx });
            x12b.stage2 = s2; x12b.signal = s2.status === 'stage2' ? DEP.signalFromRows(s2.rows) : null;
          } else if (arch === 'fast' || arch === 'fast_indep') {
            const fa = arch === 'fast' ? await stage2Post('/fast', { ctx: impact._x12ctx, s1: s1Only }) : await stage2Post('/fast_indep', { ctx: impact._x12ctx });
            x12b.fast = fa; x12b.signal = fa.status === 'ok' ? DEP.signalFromRows(fa.rows) : null;
            if (fa.status === 'ok') stage2P = stage2Post('/text', { ctx: impact._x12ctx, rows: fa.rows });
          } else if (arch === 'stream') {
            const st = await stage2Post('/stream_start', { ctx: impact._x12ctx });
            x12b.fast = st; x12b.signal = st.scoreRows ? DEP.signalFromRows(st.scoreRows) : null;
            if (st.id) stage2P = stage2Post('/stream_result', { id: st.id });
          } else if (arch === 'stream_v3') {
            const st = await stage2Post('/stream_v3_start', { ctx: impact._x12ctx });
            x12b.fast = st; x12b.signal = st.signal || null;
            if (st.id) stage2P = stage2Post('/stream_v3_result', { id: st.id });
          } else if (arch === 'dep_parallel' || arch === 'dep_parallel_cal') {
            x12b.signal = arch === 'dep_parallel_cal' ? DEP.signalFromStage1Calibrated(s1Only) : null;
            stage2P = stage2Post('/dep_full', { ctx: impact._x12ctx, s1: s1Only });
          } else if (arch === 'sequential_final_adapter' || arch === 'sequential_final_contract') {
            const s2 = await stage2Post('/stage2_final', { ctx: impact._x12ctx });
            const f = FINAL.finalizeTurn({ teacherMessage: text, stage1: impact, stage2: s2.status === 'stage2' ? { status: 'stage2', rows: s2.rows } : { status: 'fallback_stage1' }, stage1Rows: [] });
            x12b.stage2 = s2;
            x12b.final = { shown: f.shown, suppressed: f.suppressed, guardDropped: f.guardDropped, source: s2.status === 'stage2' ? 'stage2' : 'fallback_stage1', rows: f.rows };
            x12b.signal = f.signal; // null when suppressed or Stage 2 failed: the students keep the Stage-1 analysis
            if (f.signal && arch === 'sequential_final_contract') x12b.contractView = STUDENT.studentPckView(impact, f.rows, f.signal);
          } else throw new Error(`unknown OPP_ARCH ${arch}`);
          x12b.preStudentMs = Date.now() - t0;
          x12b.stage1Signal = DEP.signalFromStage1(s1Only);
          if (x12b.contractView) studentImpact = x12b.contractView;
          else if (x12b.signal) studentImpact = DEP.adaptImpact(impact, x12b.signal);
          delete x12b.contractView;
          if (x12b.final && x12b.signal) x12b.audit = STUDENT.auditStudentInput(studentImpact, x12b.final.rows, x12b.signal);
          x12b.studentSteer = { quality: studentImpact.pedagogical_quality, understanding: studentImpact.predicted_student_state && studentImpact.predicted_student_state.understanding_level,
            addressed: studentImpact.addressed_misconception, hints: ((studentImpact.predicted_student_state && studentImpact.predicted_student_state.student_reaction_hints) || []).map((h) => `${h.student}:${h.reaction_type}`) };
        }
        const parallelStart = Date.now();
        try {
          await callAI(history, students, studentScenario, addendum, studentImpact, (msgs, _c, _s, meta) => { replies = msgs; student.meta = meta; });
        } catch (e) {
          Object.assign(student, { ok: false, error: String(e.serverError || e.message).slice(0, 160), meta: e.meta || null });
        }
        student.wallMs = Date.now() - parallelStart;
        let stage2 = null;
        if (stage2P) {
          stage2 = await stage2P;
          stage2.parallelWallMs = Date.now() - parallelStart; // students and Stage 2 both done
        }
        (replies || []).forEach((r) => messages.push(r));
        const out = (replies || []).map((r) => ({ student: r.agent, message: r.text, claim: misconceptionClaims(scenarioId, r.text).length > 0 }));
        if (!conv.carrierDetected && !step.check && !step.teaching && step.label !== 'T6 explain') {
          const first = out.find((r) => r.claim);
          if (first) conv.carrierDetected = first.student;
        }
        if (x12b) { x12b.parallel = stage2; stage2 = undefined; }
        conv.turns.push({ label: step.label, teacher: text, drawing: step.drawing || null, pck, misconceptionState: misconceptionState || undefined, judge: judged || undefined, student, stage2: stage2 || undefined, x12b: x12b || undefined, replies: out });
        fs.writeFileSync(path.join(outDir, 'conversations', `${id}.json`), JSON.stringify(conv, null, 2));
      }
      process.stdout.write(`${id} done\n`);
    }
  }
  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
});
