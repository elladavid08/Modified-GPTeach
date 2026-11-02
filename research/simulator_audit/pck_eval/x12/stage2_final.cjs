// X12 final Stage-2 candidate (research only; A1i design): the frozen X12 prompt builder (stage2.cjs, unchanged) with a
// rubric file (per-skill wording) and optional general relevance bullets from the rubric's "_general" key, inserted after
// the prompt's "Keep the boundaries" bullet. Schema, validation and field order (score_first) are stage2.cjs's.
'use strict';
const fs = require('fs');
const S2 = require('./stage2.cjs');

const ANCHOR = '- Keep the boundaries:';
function loadRubric(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const general = Array.isArray(raw._general) ? raw._general : [];
  const rubric = { ...S2.RUBRIC };
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith('_')) rubric[k] = v;
  return { rubric, general };
}
function buildPrompt(ctx, { rubric, general }) {
  const p = S2.buildPrompt(ctx, { rubric, order: 'score_first' });
  if (!general.length) return p;
  const i = p.indexOf(ANCHOR); const j = p.indexOf('\n', i);
  if (i < 0 || j < 0) throw new Error('final prompt: anchor');
  return `${p.slice(0, j + 1)}${general.map((g) => `- ${g}`).join('\n')}\n${p.slice(j + 1)}`;
}
module.exports = { loadRubric, buildPrompt, buildSchema: () => S2.buildSchema({ order: 'score_first' }), validate: S2.validate, SKILL_IDS: S2.SKILL_IDS };
