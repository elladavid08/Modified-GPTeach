// X12c: single-call Stage 2 with streaming (research only; not production code).
// ONE independent call (frozen X12 v3 rubric; no Stage-1 input) writes all five scores FIRST and the teacher-facing text
// after them: {"scores": [5 × 0|1|2|null], "rows": [{skill_id, what_exists, what_to_improve}, ...relevant skills]}.
// The call is streamed; as soon as the "scores" array is complete in the stream, onScores(rows) fires (students can start
// from the steering signal), and the same call goes on to write the text.
// Policy:
//   - stream error or invalid scores BEFORE onScores: one identical retry (nothing has been used yet);
//   - text invalid AFTER onScores: the scores are kept (they already steer the students) and the text is written by the
//     text-for-fixed-scores call (stage2_dep.cjs buildTextPrompt), so steering and sidebar stay the same assessment;
//   - final JSON must contain exactly the early scores (checked: `scoresMatch`).
'use strict';
const fs = require('fs');
const path = require('path');
const S2 = require('./stage2.cjs');
const D = require('./stage2_dep.cjs');

const RUBRIC = { ...S2.RUBRIC, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'rubric_v3.FROZEN.json'), 'utf8')) };
delete RUBRIC._comment;
const IDS = S2.SKILL_IDS;

const ORDER_LINE = '- For each relevant skill, first give the score, then write the text that the score requires.';
function buildStreamPrompt(ctx) {
  const p = S2.buildPrompt(ctx, { rubric: RUBRIC, order: 'score_first' });
  const i = p.indexOf(ORDER_LINE);
  if (i < 0) throw new Error('stream prompt: order line');
  return `${p.slice(0, i)}- First decide all five scores, then write the text for each relevant skill so that it matches its score.

Return only JSON: {"scores": [five values], "rows": [...]}.
- "scores": one value per skill in the order listed above: the score 0, 1 or 2 for a relevant skill, null for a skill that is not relevant.
- "rows": one entry per RELEVANT skill (score not null), in the same order: skill_id, what_exists, what_to_improve.`;
}

function streamSchema() {
  return {
    type: 'object',
    properties: {
      scores: { type: 'array', minItems: IDS.length, maxItems: IDS.length, items: { type: 'integer', nullable: true } },
      rows: { type: 'array', items: { type: 'object',
        properties: { skill_id: { type: 'string', enum: IDS }, what_exists: { type: 'string' }, what_to_improve: { type: 'string' } },
        required: ['skill_id', 'what_exists', 'what_to_improve'], propertyOrdering: ['skill_id', 'what_exists', 'what_to_improve'] } },
    },
    required: ['scores', 'rows'],
    propertyOrdering: ['scores', 'rows'],
  };
}

const EARLY = /^\s*\{\s*"scores"\s*:\s*\[([^\]]*)\]/;
/** Scores from a stream prefix, or null when the array is not complete yet. Throws on a malformed complete array. */
function earlyScores(prefix) {
  const m = EARLY.exec(prefix);
  if (!m) return null;
  const v = JSON.parse(`[${m[1]}]`);
  const r = D.validateScores(JSON.stringify({ scores: v }));
  if (!r.ok) throw new Error(`early scores ${r.reason}`);
  return r.rows;
}

/** Validate the full text against the early scores (rows = the relevant skills, in order, with the text contract). */
function validateFinal(text, scoreRows) {
  let v;
  try { v = JSON.parse(String(text).trim()); } catch { return { ok: false, reason: 'not_json' }; }
  const s = D.validateScores(JSON.stringify({ scores: v && v.scores }));
  const scoresMatch = s.ok && JSON.stringify(s.rows) === JSON.stringify(scoreRows);
  if (!scoresMatch) return { ok: false, reason: 'scores_changed', scoresMatch };
  const t = D.validateText(JSON.stringify({ rows: v.rows }), scoreRows);
  return t.ok ? { ok: true, rows: t.rows, scoresMatch } : { ok: false, reason: t.reason, scoresMatch };
}

module.exports = { buildStreamPrompt, streamSchema, earlyScores, validateFinal, IDS };
