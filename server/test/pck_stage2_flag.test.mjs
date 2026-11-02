// 1.6.0 PCK_STAGE2 semantics (server/pck_stage2_flag.js): ON by default; off / 0 / false is the explicit override;
// unrecognised values stay ON with a warning; the startup line names the state and its source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePckStage2Flag, describePckStage2Flag } from '../pck_stage2_flag.js';

const CASES = [
  [undefined, true, 'default', false, 'PCK Stage 2: ON (default)'],
  [null, true, 'default', false, 'PCK Stage 2: ON (default)'],
  ['', true, 'default', false, 'PCK Stage 2: ON (default)'],
  ['   ', true, 'default', false, 'PCK Stage 2: ON (default)'],
  ['on', true, 'environment', false, 'PCK Stage 2: ON (environment, PCK_STAGE2=on)'],
  ['1', true, 'environment', false, 'PCK Stage 2: ON (environment, PCK_STAGE2=1)'],
  ['true', true, 'environment', false, 'PCK Stage 2: ON (environment, PCK_STAGE2=true)'],
  [' TRUE ', true, 'environment', false, 'PCK Stage 2: ON (environment, PCK_STAGE2=TRUE)'],
  ['off', false, 'environment', false, 'PCK Stage 2: OFF (explicit override, PCK_STAGE2=off)'],
  ['0', false, 'environment', false, 'PCK Stage 2: OFF (explicit override, PCK_STAGE2=0)'],
  ['false', false, 'environment', false, 'PCK Stage 2: OFF (explicit override, PCK_STAGE2=false)'],
  ['Off', false, 'environment', false, 'PCK Stage 2: OFF (explicit override, PCK_STAGE2=Off)'],
  ['yes', true, 'default', true, 'PCK Stage 2: ON (default; unrecognised PCK_STAGE2="yes" ignored)'],
  ['disabled', true, 'default', true, 'PCK Stage 2: ON (default; unrecognised PCK_STAGE2="disabled" ignored)'],
  ['2', true, 'default', true, 'PCK Stage 2: ON (default; unrecognised PCK_STAGE2="2" ignored)'],
];

for (const [value, enabled, source, warns, line] of CASES) {
  test(`PCK_STAGE2=${value === undefined ? '(unset)' : JSON.stringify(value)} -> ${enabled ? 'ON' : 'OFF'} (${source})${warns ? ', warning' : ''}`, () => {
    const flag = resolvePckStage2Flag(value);
    assert.equal(flag.enabled, enabled);
    assert.equal(flag.source, source);
    assert.equal(Boolean(flag.warning), warns);
    if (warns) assert.match(flag.warning, /not recognised.*stays ON \(default\)/);
    assert.equal(describePckStage2Flag(flag), line);
  });
}
