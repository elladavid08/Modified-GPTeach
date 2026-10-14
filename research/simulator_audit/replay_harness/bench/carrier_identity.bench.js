// No-network check (research only): the carrier prototype is inert without a carrier and changes only the student
// system prompt with one. Runs the real callAI (production and patched copy) with fetch intercepted, so nothing
// leaves the machine. Writes only temporary copies and the frozen-prompt file under results/.
//   npx jest --config research/simulator_audit/replay_harness/jest.harness.json --testPathPattern carrier_identity
// 1.5.0: the prototypes patch the 1.4.4 base ai.js (baseAiSource). The last test freezes prototype v1: it writes the
// student system-prompt hashes of the 1.4.4 base (no carrier) and of v1 (with the carrier) to
// results/carrier_freeze_v1.json - the source of src/__tests__/fixtures/studentPromptCarrierV1.json - and, once that
// fixture exists, checks it matches.
import fs from 'fs';
import path from 'path';
import productionCallAI from '../../../../src/utils/ai.js';
import ChatMessage from '../../../../src/objects/ChatMessage.js';
import personas from '../../../../src/config/students/personas.js';
import scenarioConfig from '../../../../src/config/scenarios/geometry_scenarios.js';
import crypto from 'crypto';
import { buildCarrierModule, relocateAiModule, selectCarrier, baseAiSource, CARRIER_BASE_COMMIT } from '../prototype/carrier.js';

const REPO = path.resolve(__dirname, '../../../..');

async function capturePrompt(callAI, scenario, students, impact) {
  return capturePromptWith(callAI, scenario, students, impact, '');
}

async function capturePromptWith(callAI, scenario, students, impact, addendum) {
  let sent = null;
  const fetch0 = global.fetch;
  global.fetch = async (url, opts) => {
    sent = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ success: true, text: JSON.stringify({ responses: [{ student: students[0].name, message: 'x' }] }) }) };
  };
  try {
    const history = [new ChatMessage('Teacher', 'שאלה?', 'user')];
    const h = { toAIformat: () => history.map((m) => m.toAIformat()), toString: () => '', getMessages: () => history, getLength: () => history.length };
    await callAI(h, students, scenario, addendum, impact, () => {});
  } finally {
    global.fetch = fetch0;
  }
  return sent;
}

it('carrier prototype: inert without a carrier, student-prompt-only with one', async () => {
  for (const variant of ['v1', 'v2', 'v3']) {
  const src = buildCarrierModule(baseAiSource(REPO), path.join(REPO, 'src/utils'), { variant });
  // Jest transforms only files under rootDir: write the copy into the git-ignored results/ folder, remove it after.
  const local = path.join(__dirname, '..', 'results', `.ai.carrier.check.${process.pid}.js`);
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, src);
  try {
    const carrierCallAI = require(local).default; // eslint-disable-line global-require
    const students = ['רועי', 'תמר', 'הילה'].map((n) => personas.students[n]);
    const impact = { pedagogical_quality: 'positive', addressed_misconception: true, misconception_risk: 'low', predicted_student_state: { understanding_level: 'improved', response_tone: 'curious', student_reaction_hints: [{ student: 'תמר', reaction_type: 'understanding_progress' }] } };
    for (const scenario of scenarioConfig.scenarios) {
      for (const imp of [null, impact]) {
        const a = await capturePrompt(productionCallAI, scenario, students, imp);
        const b = await capturePrompt(carrierCallAI, scenario, students, imp);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a)); // no carrier: byte-identical request
        const carrier = selectCarrier(students);
        const c = await capturePrompt(carrierCallAI, { ...scenario, misconception_carrier: carrier }, students, imp);
        const sys = c.messages[0].content;
        expect(sys).toContain(`${carrier} sincerely holds this misconception: ${scenario.misconception_focus}`);
        expect(sys).not.toContain('Possible misconception to watch for');
        expect(sys).not.toContain('ONE or TWO students should naturally express this misconception');
        if (imp) expect(sys).toContain(`Exception - the misconception carrier (${carrier})`);
        expect(JSON.stringify(c.messages.slice(1))).toBe(JSON.stringify(a.messages.slice(1))); // history untouched
      }
    }
  } finally {
    fs.unlinkSync(local);
  }
  }
});

it('pc1: without a state it equals v1; while open it fixes the peer role and hides "addressed" / peer progress', async () => {
  const ai = baseAiSource(REPO);
  const load = (variant, tag) => {
    const local = path.join(__dirname, '..', 'results', `.ai.${tag}.check.${process.pid}.js`);
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, buildCarrierModule(ai, path.join(REPO, 'src/utils'), { variant }));
    return { fn: require(local).default, local }; // eslint-disable-line global-require
  };
  const v1 = load('v1', 'v1'); const pc = load('pc1', 'pc1');
  try {
    const students = ['רועי', 'תמר', 'הילה'].map((n) => personas.students[n]);
    const carrier = selectCarrier(students);
    const impact = { pedagogical_quality: 'positive', addressed_misconception: true, how_addressed: 'HOW-TEXT', misconception_risk: 'low', predicted_student_state: { understanding_level: 'improved', response_tone: 'curious', student_reaction_hints: [{ student: 'הילה', reaction_type: 'understanding_progress', reason: 'PEER-REASON' }, { student: carrier, reaction_type: 'understanding_progress', reason: 'CARRIER-REASON' }] } };
    for (const scenario of scenarioConfig.scenarios) {
      for (const imp of [null, impact]) {
        const sc = { ...scenario, misconception_carrier: carrier };
        expect(JSON.stringify(await capturePrompt(pc.fn, sc, students, imp))).toBe(JSON.stringify(await capturePrompt(v1.fn, sc, students, imp)));
        expect(JSON.stringify(await capturePrompt(pc.fn, scenario, students, imp))).toBe(JSON.stringify(await capturePrompt(productionCallAI, scenario, students, imp)));
        const open = (await capturePrompt(pc.fn, { ...sc, misconception_state: 'open' }, students, imp)).messages[0].content;
        const done = (await capturePrompt(pc.fn, { ...sc, misconception_state: 'addressed' }, students, imp)).messages[0].content;
        expect(open).toContain('the teacher has NOT yet addressed');
        expect(done).toContain('the teacher has now addressed');
        if (imp) {
          expect(open).toContain('**Misconception WAS NOT Addressed**: (lesson state: not yet addressed)');
          expect(open).toContain('הילה: partial_understanding');
          expect(open).not.toContain('PEER-REASON');
          expect(open).toContain(`${carrier}: understanding_progress`); // the carrier hint is left to the carrier rule
          expect(done).toContain('**Misconception WAS Addressed**: HOW-TEXT');
          expect(done).toContain('הילה: understanding_progress - PEER-REASON');
        }
      }
    }
  } finally {
    fs.unlinkSync(v1.local); fs.unlinkSync(pc.local);
  }
});

// Cases of the frozen student prompt (also read by src/__tests__/studentPromptCarrier.test.js from the fixture).
const FREEZE_CASTS = [['רועי', 'תמר', 'הילה'], ['תמר', 'יונתן', 'עדי'], ['נועה', 'עדי', 'רועי']]; // carrier תמר, תמר, נועה (all low)
const FREEZE_IMPACTS = {
  none: null,
  positive: { pedagogical_quality: 'positive', addressed_misconception: true, how_addressed: 'HOW-ADDRESSED', misconception_risk: 'low', impact_on_students: 'IMPACT-TEXT', predicted_student_state: { understanding_level: 'improved', response_tone: 'curious', student_reaction_hints: [{ student: 'תמר', reaction_type: 'understanding_progress', likelihood: 'high', reason: 'HINT-REASON' }, { student: 'הילה', reaction_type: 'partial_understanding', likelihood: 'medium' }] } },
  problematic: { pedagogical_quality: 'problematic', addressed_misconception: false, misconception_risk: 'high', predicted_student_state: { understanding_level: 'misconception_reinforced', response_tone: 'confident', student_reaction_hints: [] } },
};
const FREEZE_ADDENDA = { none: '', marker: '\n\nADDENDUM-MARKER' };
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

it('freeze carrier v1: student-prompt hashes of the 1.4.4 base (no carrier) and of v1 (carrier)', async () => {
  const base = baseAiSource(REPO);
  const tmp = (tag, src) => {
    const local = path.join(__dirname, '..', 'results', `.ai.${tag}.freeze.${process.pid}.js`);
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, src);
    return local;
  };
  const baseFile = tmp('base', relocateAiModule(base, path.join(REPO, 'src/utils')));
  const v1File = tmp('v1', buildCarrierModule(base, path.join(REPO, 'src/utils'), { variant: 'v1' }));
  try {
    const baseCallAI = require(baseFile).default; // eslint-disable-line global-require
    const v1CallAI = require(v1File).default; // eslint-disable-line global-require
    const cases = [];
    for (const [scenarioIndex, scenario] of scenarioConfig.scenarios.entries()) {
      for (const cast of FREEZE_CASTS) {
        const students = cast.map((n) => personas.students[n]);
        const carrier = selectCarrier(students);
        for (const impact of Object.keys(FREEZE_IMPACTS)) {
          for (const addendum of impact === 'positive' ? Object.keys(FREEZE_ADDENDA) : ['none']) {
            const capture = async (fn, scen) => (await capturePromptWith(fn, scen, students, FREEZE_IMPACTS[impact], FREEZE_ADDENDA[addendum])).messages[0].content;
            const noCarrier = await capture(baseCallAI, scenario);
            const withCarrier = await capture(v1CallAI, { ...scenario, misconception_carrier: carrier });
            cases.push({ scenarioIndex, cast, carrier, impact, addendum, noCarrierSha256: sha(noCarrier), noCarrierLength: noCarrier.length, carrierSha256: sha(withCarrier), carrierLength: withCarrier.length });
          }
        }
      }
    }
    const frozen = {
      note: 'Student system prompts frozen from the misconception-carrier prototype v1 (research/simulator_audit/replay_harness/prototype/carrier.js) applied to src/utils/ai.js at the base commit. Generated by bench/carrier_identity.bench.js; do not edit by hand.',
      baseCommit: CARRIER_BASE_COMMIT, variant: 'v1', impacts: FREEZE_IMPACTS, addenda: FREEZE_ADDENDA, cases,
    };
    fs.writeFileSync(path.join(__dirname, '..', 'results', 'carrier_freeze_v1.json'), `${JSON.stringify(frozen, null, 2)}\n`);
    const fixture = path.join(REPO, 'src/__tests__/fixtures/studentPromptCarrierV1.json');
    if (fs.existsSync(fixture)) expect(JSON.parse(fs.readFileSync(fixture, 'utf8'))).toEqual(frozen);
    // 1.5.0 production equals the frozen prototype (with the carrier) and the 1.4.4 base (without)
    for (const c of cases) {
      const students = c.cast.map((n) => personas.students[n]);
      const scenario = scenarioConfig.scenarios[c.scenarioIndex];
      const prod = async (scen) => (await capturePromptWith(productionCallAI, scen, students, FREEZE_IMPACTS[c.impact], FREEZE_ADDENDA[c.addendum])).messages[0].content;
      if (/MISCONCEPTION CARRIER FOR THIS LESSON/.test(fs.readFileSync(path.join(REPO, 'src/utils/ai.js'), 'utf8'))) {
        expect(sha(await prod({ ...scenario, misconception_carrier: c.carrier }))).toBe(c.carrierSha256);
      }
      expect(sha(await prod(scenario))).toBe(c.noCarrierSha256);
    }
  } finally {
    fs.unlinkSync(baseFile); fs.unlinkSync(v1File);
  }
});
