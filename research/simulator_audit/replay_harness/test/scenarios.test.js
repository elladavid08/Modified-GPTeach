// Replay plans: historical scripts and casts preserved; designed casts and drawing references valid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SCENARIOS, MOVES, HISTORICAL_CASTS, DESIGNED_CASTS, PERSONA_ORDER, historicalCast, castFor, fillSlots, conversationId } from '../config/scenarios.js';
import { DRAWINGS } from '../lib/assets.js';

test('six scenarios with 12 turns each, every turn tagged with a known move', () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), [1, 2, 3, 4, 5, 6]);
  for (const s of SCENARIOS) {
    assert.equal(s.turns.length, 12, s.slug);
    for (const t of s.turns) assert.ok(Object.values(MOVES).includes(t.move), t.text);
    assert.equal(s.turns.filter((t) => t.move === MOVES.EXPLAIN).length, 1);
    assert.equal(s.turns[11].move, MOVES.CLOSING);
  }
});

test('the teacher texts are the ones used for the 1.3.9-1.3.11 replays (fingerprint)', () => {
  // Verified turn-by-turn against all 432 teacher turns of the three historical runs when the harness
  // was moved into the repo. Changing a script breaks comparability: make it a new plan instead.
  const sha = createHash('sha256').update(JSON.stringify(SCENARIOS.map((s) => s.turns.map((t) => t.text)))).digest('hex');
  assert.equal(sha, 'cd097ee39835a8b82cc9a13d42132dadda312940fe8bc4335e6b0783b8cf8b59');
});

test('historical casts reproduce the original rotation', () => {
  for (const s of SCENARIOS) for (const c of [0, 1]) assert.deepEqual(HISTORICAL_CASTS[s.id][c], historicalCast(s.id, c));
  assert.deepEqual(HISTORICAL_CASTS[6][0], ['תמר', 'יונתן', 'עדי']);
});

test('designed casts: three distinct known personas; slot A differs between the two casts; one high-baseline persona', () => {
  for (const s of SCENARIOS) {
    const [c0, c1] = DESIGNED_CASTS[s.id];
    for (const cast of [c0, c1]) {
      assert.equal(new Set(cast).size, 3);
      for (const p of cast) assert.ok(PERSONA_ORDER.includes(p), p);
      assert.ok(cast.some((p) => ['תמר', 'דנה'].includes(p)), `${s.id}: ${cast}`);
    }
    assert.notEqual(c0[0], c1[0]);
  }
  assert.deepEqual(castFor(2, 0, 'designed'), DESIGNED_CASTS[2][0]);
  assert.deepEqual(castFor(2, 0, 'historical'), HISTORICAL_CASTS[2][0]);
});

test('drawing turns: corrected benchmark assets at s2 T5, s3 T8, s4 T8, s5 T8; historical images recorded', () => {
  const used = SCENARIOS.flatMap((s) => s.turns.map((t, i) => (t.drawing ? `${s.id}:${i + 1}:${t.drawing}:${t.historicalDrawing}` : null)).filter(Boolean));
  assert.deepEqual(used, [
    '2:5:kite:rotated-square.png',
    '3:8:rotated-rectangle:rotated-parallelogram.png',
    '4:8:parallelogram:rotated-parallelogram.png',
    '5:8:equal-perpendicular-not-bisecting:rotated-square.png',
  ]);
  for (const s of SCENARIOS) for (const [i, t] of s.turns.entries()) if (t.drawing) {
    assert.ok(DRAWINGS[t.drawing], t.drawing);
    assert.ok(DRAWINGS[t.drawing].usedIn.some((u) => u.scenario === s.id && u.turn === i + 1));
  }
});

test('slot filling and deterministic conversation ids', () => {
  assert.equal(fillSlots('{A}, {B} ו-{C}', ['א', 'ב', 'ג']), 'א, ב ו-ג');
  assert.equal(conversationId('B', 2, 'designed', 0, 1), 'B-s2-d0-r1');
  assert.equal(conversationId('A', 5, 'historical', 1, 2), 'A-s5-h1-r2');
});
