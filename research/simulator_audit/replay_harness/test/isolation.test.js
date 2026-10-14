// The harness is read-only towards production: no Firestore/logger imports, production files unchanged,
// mirrored production text (Chat.jsx addendum, prompt examples) still in sync, outputs git-ignored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { firstTurnAddendum } from '../lib/turnFlow.js';
import { PROMPT_EXAMPLES, PROMPT_EXAMPLES_1_3_11, promptExamplesFor } from '../lib/labels.js';

const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(HARNESS, '../../..');
const sources = (dir) => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  if (f === 'results' || f === 'node_modules' || f === 'test') return []; // runtime files only
  return statSync(p).isDirectory() ? sources(p) : p.endsWith('.js') ? [p] : [];
});

test('no harness file imports Firestore, the conversation logger or the Firebase app', () => {
  for (const f of sources(HARNESS)) {
    const src = readFileSync(f, 'utf8');
    for (const forbidden of ['conversationLogger', 'firebase', 'firestore', 'pck_feedback/data']) {
      assert.ok(!new RegExp(`(import|require)[^\\n]*${forbidden}`, 'i').test(src), `${path.relative(HARNESS, f)} imports ${forbidden}`);
    }
  }
});

test('production imports are read-only modules of the real student/PCK path', () => {
  const allowed = new Set(['src/utils/ai.js', 'src/services/genai.js', 'src/objects/ChatMessage.js', 'src/config/students/personas.js', 'src/config/scenarios/geometry_scenarios.js', 'src/config/version.js', 'src/services/misconceptionCarrier.js', 'server/student_duplicate_guard.js']);
  for (const f of sources(HARNESS)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/from '((\.\.\/)+[^']+)'/g)) {
      const target = path.relative(REPO, path.resolve(path.dirname(f), m[1]));
      if (!target.startsWith('research/')) assert.ok(allowed.has(target), `${path.relative(HARNESS, f)} imports ${target}`);
    }
  }
});

test('only the runner and the analyzer write files, and only under results/ (and assets via render script)', () => {
  for (const f of sources(HARNESS)) {
    const rel = path.relative(HARNESS, f);
    const writes = /writeFileSync|copyFileSync|mkdirSync/.test(readFileSync(f, 'utf8'));
    if (writes) assert.ok(['bench/run.bench.js', 'bench/opportunity.bench.js', 'bench/carrier_identity.bench.js', 'analyze.js', 'scripts/render_assets.js', 'scripts/import_historical.js'].includes(rel), rel);
  }
  assert.match(readFileSync(path.join(HARNESS, '.gitignore'), 'utf8'), /^results\/$/m);
});

// The pilot-era questionnaire images stay byte-identical: assets/rotated-rectangle.png is a copy of one of them
// (assets.test.js). Since 2026-10-14 the questionnaires use transparent versions (testConfig.js points to
// rotated-*-transparent.png), so testConfig.js itself is no longer pinned here.
test('pilot-era questionnaire images are unchanged (vs HEAD)', () => {
  const out = execSync('git status --porcelain -- public/images/rotated-square.png public/images/rotated-parallelogram.png', { cwd: REPO }).toString();
  assert.equal(out, '');
});

test('the Chat.jsx first-turn addendum is mirrored exactly', () => {
  const chat = readFileSync(path.join(REPO, 'src/pages/Chat.jsx'), 'utf8');
  // With no initial_prompt the interpolation is empty, leaving the two literal halves around it
  const [before, after] = firstTurnAddendum({ initial_prompt: null }).trim().split('  ');
  assert.ok(chat.includes(before), 'Chat.jsx addendum (text before the context) changed');
  assert.ok(chat.includes(after), 'Chat.jsx addendum (text after the context) changed');
  assert.ok(firstTurnAddendum({ initial_prompt: 'CTX' }).includes(' Context: CTX Be responsive'));
});

test('the prompt examples used by the copy metric are still the production ones, and match SYSTEM_VERSION', () => {
  const ai = readFileSync(path.join(REPO, 'src/utils/ai.js'), 'utf8');
  for (const e of PROMPT_EXAMPLES) assert.ok(ai.includes(`"message": "${e.text}"`), e.id);
  // The 1.3.11 examples (EX1-EX3) are gone from production; only the shared WRONG example remains
  for (const e of PROMPT_EXAMPLES_1_3_11.filter((x) => x.id !== 'WRONG')) assert.ok(!ai.includes(e.text), e.id);
  const version = readFileSync(path.join(REPO, 'src/config/version.js'), 'utf8').match(/SYSTEM_VERSION = "([\d.]+)"/)[1];
  assert.equal(promptExamplesFor(version), PROMPT_EXAMPLES, version);
});
