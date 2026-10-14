// No-network check (research only): the carrier prototype is inert without a carrier and changes only the student
// system prompt with one. Runs the real callAI (production and patched copy) with fetch intercepted, so nothing
// leaves the machine. Writes only a temporary copy under results/ (removed afterwards).
//   npx jest --config research/simulator_audit/replay_harness/jest.harness.json --testPathPattern carrier_identity
import fs from 'fs';
import path from 'path';
import productionCallAI from '../../../../src/utils/ai.js';
import ChatMessage from '../../../../src/objects/ChatMessage.js';
import personas from '../../../../src/config/students/personas.js';
import scenarioConfig from '../../../../src/config/scenarios/geometry_scenarios.js';
import { buildCarrierModule, selectCarrier } from '../prototype/carrier.js';

const REPO = path.resolve(__dirname, '../../../..');

async function capturePrompt(callAI, scenario, students, impact) {
  let sent = null;
  const fetch0 = global.fetch;
  global.fetch = async (url, opts) => {
    sent = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ success: true, text: JSON.stringify({ responses: [{ student: students[0].name, message: 'x' }] }) }) };
  };
  try {
    const history = [new ChatMessage('Teacher', 'שאלה?', 'user')];
    const h = { toAIformat: () => history.map((m) => m.toAIformat()), toString: () => '', getMessages: () => history, getLength: () => history.length };
    await callAI(h, students, scenario, '', impact, () => {});
  } finally {
    global.fetch = fetch0;
  }
  return sent;
}

it('carrier prototype: inert without a carrier, student-prompt-only with one', async () => {
  for (const variant of ['v1', 'v2', 'v3']) {
  const src = buildCarrierModule(fs.readFileSync(path.join(REPO, 'src/utils/ai.js'), 'utf8'), path.join(REPO, 'src/utils'), { variant });
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
  const ai = fs.readFileSync(path.join(REPO, 'src/utils/ai.js'), 'utf8');
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
