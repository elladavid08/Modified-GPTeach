// Writes the vector benchmark drawings (SVG) from lib/assets.js and copies the rotated-rectangle raster.
// Usage (from the repo root): node research/simulator_audit/replay_harness/scripts/render_assets.js
import { writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DRAWINGS, svgFor } from '../lib/assets.js';

const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(HARNESS, '../../..');
for (const [id, d] of Object.entries(DRAWINGS)) {
  if (d.svg) {
    writeFileSync(path.join(HARNESS, d.svg), svgFor(id));
    console.log('wrote', d.svg);
  } else if (d.copyOf) {
    copyFileSync(path.join(REPO, d.copyOf), path.join(HARNESS, d.file));
    console.log('copied', d.copyOf, '->', d.file);
  }
}
console.log('Now render PNGs: sh research/simulator_audit/replay_harness/scripts/render_png.sh');
