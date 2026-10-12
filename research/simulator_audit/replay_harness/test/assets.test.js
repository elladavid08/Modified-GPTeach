// Corrected benchmark drawings: the geometry the teacher text claims, SVG == spec, PNGs present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DRAWINGS, checkDrawing, svgFor, measure } from '../lib/assets.js';

const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(HARNESS, '../../..');
const pngSize = (file) => { const b = readFileSync(file); assert.equal(b.toString('ascii', 1, 4), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

for (const id of Object.keys(DRAWINGS)) {
  test(`${id}: every geometric claim holds`, () => {
    for (const [claim, ok] of Object.entries(checkDrawing(id))) assert.equal(ok, true, `${id}: ${claim}`);
  });
}

test('vector drawings on disk are exactly what the spec generates, and their PNGs are 300x300', () => {
  for (const [id, d] of Object.entries(DRAWINGS)) {
    if (!d.svg) continue;
    assert.equal(readFileSync(path.join(HARNESS, d.svg), 'utf8'), svgFor(id), `${d.svg} out of date: run scripts/render_assets.js and render_png.sh`);
    assert.deepEqual(pngSize(path.join(HARNESS, d.file)), [300, 300]);
  }
});

test('rotated-rectangle is a byte copy of the production questionnaire image (which is a rectangle)', () => {
  const d = DRAWINGS['rotated-rectangle'];
  assert.ok(readFileSync(path.join(HARNESS, d.file)).equals(readFileSync(path.join(REPO, d.copyOf))));
});

test('the historical mismatches are real: a square cannot be the s2 kite or the s5 quadrilateral', () => {
  const square = [[128, 20], [213, 113], [118, 202], [32, 108]]; // public/images/rotated-square.png corners
  const m = measure(square);
  assert.ok(Math.abs(m.intersection[0] - 0.5) < 0.05 && Math.abs(m.intersection[1] - 0.5) < 0.05, 'square diagonals bisect each other');
  assert.ok(Math.abs(m.sides[0] - m.sides[1]) / m.sides[0] < 0.05, 'square sides are all equal (a rhombus, not a kite)');
});

test('smoke-3: the s5 drawing states the equality the eye cannot check (vertex labels and "AC = BD")', () => {
  const svg = svgFor('equal-perpendicular-not-bisecting');
  for (const label of ['>A<', '>B<', '>C<', '>D<', '>AC = BD<']) assert.ok(svg.includes(label), label);
});
