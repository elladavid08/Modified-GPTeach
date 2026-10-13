// The misconception-carrier prototype patch applies cleanly to the CURRENT production src/utils/ai.js (each anchor
// exactly once), produces a parseable module with no relative imports, and is inert without a carrier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { CARRIER_PATCH, buildCarrierModule, selectCarrier } from '../prototype/carrier.js';

const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(HARNESS, '../../..');
const AI = readFileSync(path.join(REPO, 'src/utils/ai.js'), 'utf8');
const require = createRequire(path.join(REPO, 'package.json'));

test('every patch anchor occurs exactly once in the production ai.js', () => {
  for (const p of CARRIER_PATCH) assert.equal(AI.split(p.from).length - 1, 1, p.id);
});

test('the patched module parses, has absolute imports, and keeps every production branch for no carrier', () => {
  for (const variant of ['v1', 'v2', 'v3']) {
  const out = buildCarrierModule(AI, path.join(REPO, 'src/utils'), { variant });
  assert.doesNotMatch(out, /from "\.\.?\//);
  require('@babel/parser').parse(out, { sourceType: 'module', plugins: ['jsx'] });
  // The original texts are still emitted when scenario.misconception_carrier is absent
  assert.match(out, /Possible misconception to watch for/);
  assert.match(out, /Do not force the misconception into every turn/);
  assert.match(out, /TARGETED MISCONCEPTION FOR THIS LESSON/);
  assert.match(out, /TAKES PRIORITY OVER SCENARIO MISCONCEPTION INSTRUCTIONS!/);
  // ...and the carrier texts only behind the carrier condition
  assert.match(out, /if \(scenario\.misconception_focus && scenario\.misconception_carrier\)/);
  assert.match(out, /MISCONCEPTION CARRIER FOR THIS LESSON/);
  if (variant === 'v2') assert.match(out, /must NOT name or describe a counterexample/);
  if (variant === 'v3') assert.match(out, /do not know the full answer yet either/);
  }
});

test('selectCarrier: first non-low-participation cast member, else the first', () => {
  const p = (name, baseline) => ({ name, participation: { baseline } });
  assert.equal(selectCarrier([p('A', 'low'), p('B', 'high'), p('C', 'medium')]), 'B');
  assert.equal(selectCarrier([p('A', 'medium'), p('B', 'high')]), 'A');
  assert.equal(selectCarrier([p('A', 'low'), p('B', 'low')]), 'A');
});
