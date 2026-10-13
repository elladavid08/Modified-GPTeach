// Structural checks for the frozen PCK evaluation benchmark (research only; not wired into production tests).
// Run: node --test research/simulator_audit/pck_eval/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DRAWINGS } from '../../replay_harness/lib/assets.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const bench = JSON.parse(readFileSync(path.join(HERE, '..', 'pck_eval_benchmark.json'), 'utf8'));
const SKILLS = ['error-identification', 'error-characterization', 'diagnostic-interpretation', 'adapted-pedagogical-response', 'error-leveraging'];
const RELEVANCE = new Set(['required', 'not_relevant', 'either']);
const CONSTRAINTS = new Set(['no_score_2', 'no_positive_score']);

test('header: synthetic, labels not from model output, five production skill ids', () => {
  assert.equal(bench.benchmark, 'rambam-pck-eval');
  assert.equal(bench.labels_not_from_model_output, true);
  assert.deepEqual(bench.skills, SKILLS);
  const contract = JSON.parse(readFileSync(path.join(ROOT, 'src/testUtils/contracts/pckSkillsContract.json'), 'utf8'));
  assert.deepEqual(contract.skills.map((s) => s.skill_id), SKILLS);
});

test('case ids are unique and every case has the full record', () => {
  const ids = bench.cases.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of bench.cases) {
    for (const k of ['scenario', 'history', 'recent_student_turns', 'teacher_message', 'feedback_history', 'expected', 'rationale', 'confidence', 'source']) assert.ok(k in c, `${c.id}: ${k}`);
    assert.ok(typeof c.teacher_message === 'string' && c.teacher_message.trim(), `${c.id}: teacher message`);
    assert.ok(c.rationale.length > 40, `${c.id}: rationale`);
  }
});

test('labels follow the scheme and are internally consistent (decision = any relevant skill)', () => {
  for (const c of bench.cases) {
    const e = c.expected;
    assert.deepEqual(Object.keys(e.skills), SKILLS, c.id);
    assert.ok([true, false, null].includes(e.should_provide_feedback), c.id);
    for (const k of e.constraints) assert.ok(CONSTRAINTS.has(k), `${c.id}: constraint ${k}`);
    const rels = Object.values(e.skills).map((s) => s.relevance);
    for (const [sid, s] of Object.entries(e.skills)) {
      assert.ok(RELEVANCE.has(s.relevance), `${c.id} ${sid}`);
      if (s.scores !== null) {
        assert.ok(s.relevance !== 'not_relevant', `${c.id} ${sid}: scores on a not-relevant skill`);
        assert.ok(s.scores.length >= 1 && s.scores.every((x) => [0, 1, 2].includes(x)), `${c.id} ${sid}: scores`);
        if (e.constraints.includes('no_score_2')) assert.ok(!s.scores.includes(2), `${c.id} ${sid}: contradicts no_score_2`);
        if (e.constraints.includes('no_positive_score')) assert.deepEqual(s.scores, [0], `${c.id} ${sid}`);
      }
    }
    if (e.should_provide_feedback === false) assert.ok(rels.every((r) => r === 'not_relevant'), `${c.id}: no feedback but a skill may be relevant`);
    if (rels.includes('required')) assert.notEqual(e.should_provide_feedback, false, `${c.id}: required skill with no feedback`);
    if (e.should_provide_feedback === true) assert.ok(rels.some((r) => r !== 'not_relevant'), `${c.id}: feedback but nothing can be relevant`);
  }
});

test('confidence buckets: review cases carry the expert question, high cases do not', () => {
  for (const c of bench.cases) {
    assert.ok(['high', 'needs_expert_review'].includes(c.confidence), c.id);
    assert.equal(c.bucket, c.confidence === 'high' ? 'high' : 'needs_expert_review');
    if (c.confidence === 'needs_expert_review') assert.ok(c.review_question && c.review_question.endsWith('?'), `${c.id}: review question`);
    else assert.equal(c.review_question, null, c.id);
  }
});

test('contexts are replayable: ordered history, drawings are harness assets, scenario matches production', () => {
  const scenariosSrc = readFileSync(path.join(ROOT, 'src/config/scenarios/geometry_scenarios.js'), 'utf8');
  for (const c of bench.cases) {
    c.history.forEach((t, i) => assert.equal(t.turn, i + 1, `${c.id}: history order`));
    assert.equal(c.source.turn, c.history.length + 1, `${c.id}: current turn`);
    assert.deepEqual(c.recent_student_turns, c.history.length ? c.history[c.history.length - 1].students : [], c.id);
    for (const d of [c.teacher_drawing, ...c.history.map((t) => t.teacher_drawing)]) if (d) assert.ok(DRAWINGS[d], `${c.id}: unknown drawing ${d}`);
    assert.ok(c.feedback_history.length <= 3, c.id);
    assert.ok(scenariosSrc.includes(`text: "${c.scenario.text}"`), `${c.id}: scenario text`);
    assert.ok(scenariosSrc.includes(`misconception_focus: "${c.scenario.misconception_focus}"`), `${c.id}: misconception focus`);
    assert.equal(c.scenario.index, c.scenario.id - 1);
  }
});

test('synthetic only: no session ids and none of the B200 example teacher turns', () => {
  const body = readFileSync(path.join(HERE, '..', 'pck_eval_benchmark.json'), 'utf8');
  assert.ok(!/session_\d{10,}/.test(body), 'session id found');
  const handoff = readFileSync(path.join(ROOT, 'research/b200_handoff/prompt_and_examples.md'), 'utf8');
  const teacherLines = [...handoff.matchAll(/^- Teacher(?: \(trimmed\))?: "([^"]+)"/gm)].map((m) => m[1].slice(0, 40));
  assert.ok(teacherLines.length >= 5, 'could not read the B200 example turns');
  for (const t of teacherLines) assert.ok(!body.includes(t), `B200 example text found: ${t}`);
});
