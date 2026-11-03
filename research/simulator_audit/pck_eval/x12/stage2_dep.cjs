// X12b: DEPENDENT Stage-2 variants and the calibrated steering signal (research only; not production code).
// Every variant receives the Stage-1 assessment and refines it, instead of re-assessing the turn independently.
// The rubric is the frozen X12 v3 rubric (stage2.cjs + rubric_v3.FROZEN.json), unchanged.
//   full    relevance + score + text per skill (as X12 Stage 2), given the Stage-1 assessment
//   scores  relevance + score only (the fast assessment; no text), given the Stage-1 assessment
//   text    text only, for FIXED relevance and scores (the output of `scores`)
// Steering: signalFromRows() maps a teacher-facing assessment to none / partial / strong; adaptImpact() writes that
// signal into the Stage-1 analysis fields the student prompt reads, using only values the prompt already defines.
'use strict';
const fs = require('fs');
const path = require('path');
const S2 = require('./stage2.cjs');

const RUBRIC = { ...S2.RUBRIC, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'rubric_v3.FROZEN.json'), 'utf8')) };
delete RUBRIC._comment;
const IDS = S2.SKILL_IDS;

/** Compact, content-free view of the Stage-1 assessment (no Stage-1 text). */
function stage1Block(a) {
  const rel = new Map((a.skills_assessment || []).filter((s) => s && s.is_relevant === true).map((s) => [s.skill_id, s.score]));
  const ps = a.predicted_student_state || {};
  const missed = (a.missed_opportunities || []).map((m) => m && m.skill_id).filter((id) => IDS.includes(id));
  return `## First-step assessment of this message (to refine)
- overall pedagogical quality: ${a.pedagogical_quality}
- predicted student understanding: ${ps.understanding_level}
- misconception addressed: ${a.addressed_misconception === true ? 'yes' : 'no'}
- per skill: ${IDS.map((id) => `${id} = ${rel.has(id) ? `relevant, score ${rel.get(id)}` : 'not relevant'}`).join('; ')}
- missed opportunities noted: ${missed.length ? missed.join(', ') : 'none'}

Use this first-step assessment as your starting point and refine it: keep what is consistent with the rubric below and correct relevance and scores where the rubric requires a different judgement. The students are steered by YOUR result, so it must describe how strong the teacher's move really is.`;
}

const TEXT_HEAD = '## Text (Hebrew, addressed to the teacher in the second person';
/** `a` = the Stage-1 analysis (dependent variants) or null (independent variants: the frozen X12 prompt). */
function buildDependentPrompt(ctx, a, mode) {
  let p = S2.buildPrompt(ctx, { rubric: RUBRIC, order: 'score_first' });
  const anchor = '## The five skills';
  if (p.split(anchor).length !== 2) throw new Error('dep prompt: anchor');
  if (a) p = p.replace(anchor, `${stage1Block(a)}\n\n${anchor}`);
  if (mode === 'full') return p;
  if (mode !== 'scores') throw new Error(`mode ${mode}`);
  const i = p.indexOf(TEXT_HEAD); const j = p.indexOf('Return only JSON');
  if (i < 0 || j < i) throw new Error('dep prompt: text section');
  p = p.slice(0, i) + 'Return only JSON: {"scores": [five values]}, one value per skill in the order listed above: the score 0, 1 or 2 for a relevant skill, null for a skill that is not relevant. No text.';
  p = p.replace('and write the short feedback text the teacher will read.', 'Do not write feedback text.');
  return p;
}

/** Compact fast output: five values in the canonical skill order (score, or null = not relevant). */
function scoresSchema() {
  return { type: 'object', properties: { scores: { type: 'array', minItems: IDS.length, maxItems: IDS.length, items: { type: 'integer', nullable: true } } }, required: ['scores'], propertyOrdering: ['scores'] };
}

function validateScores(text) {
  let v;
  try { v = JSON.parse(String(text).trim()); } catch { return { ok: false, reason: 'not_json' }; }
  if (!v || !Array.isArray(v.scores) || v.scores.length !== IDS.length) return { ok: false, reason: 'score_count' };
  const rows = [];
  for (let i = 0; i < IDS.length; i++) {
    const s = v.scores[i];
    if (s === null) continue;
    if (![0, 1, 2].includes(s)) return { ok: false, reason: 'invalid_score' };
    rows.push({ skillId: IDS[i], score: s });
  }
  return rows.length ? { ok: true, rows } : { ok: false, reason: 'no_relevant_skill' };
}

/** Text for fixed relevance + scores (the scores are not to be changed). */
function buildTextPrompt(ctx, rows) {
  const full = S2.buildPrompt(ctx, { rubric: RUBRIC, order: 'score_first' });
  const i = full.indexOf(TEXT_HEAD); const j = full.indexOf('- For each relevant skill, first give the score');
  const textRules = full.slice(i, j).trim();
  const list = rows.map((r) => `- ${r.skillId} (${RUBRIC[r.skillId].name}): score ${r.score}\n  ${RUBRIC[r.skillId].scores[r.score]}`).join('\n');
  return `You write the short feedback text a Hebrew geometry teacher will read about their latest message in a teacher-training simulator. The assessment is FIXED: these skills, with these scores. Do not change, question or add skills or scores; write the text that each score requires.

## Lesson Context
${ctx.lesson}

## Conversation History (Hebrew)
${ctx.history}

## Teacher's Latest Message (the move the feedback is about)
"${ctx.teacher}"

## The fixed assessment
${list}

${textRules}

Return only JSON: {"rows": [...]} with exactly one entry per listed skill, in the listed order: skill_id, what_exists, what_to_improve.`;
}

function textSchema(rows) {
  const ids = rows.map((r) => r.skillId);
  return { type: 'object', properties: { rows: { type: 'array', minItems: ids.length, maxItems: ids.length, items: { type: 'object',
    properties: { skill_id: { type: 'string', enum: ids }, what_exists: { type: 'string' }, what_to_improve: { type: 'string' } },
    required: ['skill_id', 'what_exists', 'what_to_improve'], propertyOrdering: ['skill_id', 'what_exists', 'what_to_improve'] } } }, required: ['rows'], propertyOrdering: ['rows'] };
}

const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';
function validateText(text, rows) {
  let v;
  try { v = JSON.parse(String(text).trim()); } catch { return { ok: false, reason: 'not_json' }; }
  if (!v || !Array.isArray(v.rows) || v.rows.length !== rows.length) return { ok: false, reason: 'row_count' };
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const t = v.rows[i]; const r = rows[i];
    if (!t || t.skill_id !== r.skillId) return { ok: false, reason: 'row_order' };
    const pos = nonEmpty(t.what_exists) ? t.what_exists.trim() : null; const imp = nonEmpty(t.what_to_improve) ? t.what_to_improve.trim() : null;
    if ((r.score >= 1 && !pos) || (r.score <= 1 && !imp)) return { ok: false, reason: 'text_contract' };
    out.push({ skillId: r.skillId, score: r.score, positive: r.score === 0 ? null : pos, improvement: r.score === 2 ? null : imp });
  }
  return { ok: true, rows: out };
}

// ---- steering ------------------------------------------------------------------------------------------------
/** none: the error went unnoticed (identification 0) or every row is 0; strong: at least one skill fully done (2); else partial. */
function signalFromRows(rows) {
  if (!rows || !rows.length) return null;
  const by = Object.fromEntries(rows.map((r) => [r.skillId, r.score]));
  if (by['error-identification'] === 0 || rows.every((r) => r.score === 0)) return 'none';
  return rows.some((r) => r.score === 2) ? 'strong' : 'partial';
}
/** The 1.5.1 steering read as a signal (positive + improved = strong; neutral = partial; otherwise none). */
function signalFromStage1(a) {
  const u = (a.predicted_student_state || {}).understanding_level;
  if (a.pedagogical_quality === 'positive' && u === 'improved') return 'strong';
  if (a.pedagogical_quality === 'neutral') return 'partial';
  return 'none';
}
/** Best deterministic recalibration from Stage-1 fields alone (option 2b): a Stage-1 score < 2 or a noted missed
 *  opportunity turns a positive steer into partial. Dev data showed no Stage-1 field predicts the expert signal. */
function signalFromStage1Calibrated(a) {
  const base = signalFromStage1(a);
  if (base !== 'strong') return base;
  const rel = (a.skills_assessment || []).filter((s) => s && s.is_relevant === true);
  const weak = rel.some((s) => s.score !== 2) || (a.missed_opportunities || []).length > 0;
  return weak ? 'partial' : 'strong';
}

/** Write a signal into the Stage-1 analysis for the student prompt (values the prompt already defines). */
function adaptImpact(a, signal) {
  if (!a || !signal) return a;
  const ps = a.predicted_student_state || {};
  const hints = (ps.student_reaction_hints || []).map((h) => {
    if (signal === 'strong' || h.reaction_type !== 'understanding_progress') return h;
    return { ...h, reaction_type: signal === 'partial' ? 'partial_understanding' : 'persistent_confusion' };
  });
  if (signal === 'strong') {
    return { ...a, pedagogical_quality: 'positive', predicted_student_state: { ...ps, understanding_level: 'improved', student_reaction_hints: hints } };
  }
  if (signal === 'partial') {
    return { ...a, pedagogical_quality: 'neutral', addressed_misconception: false, predicted_student_state: { ...ps, understanding_level: 'same', student_reaction_hints: hints } };
  }
  const keepNeg = ['confused', 'more_confused', 'misconception_reinforced'].includes(ps.understanding_level);
  return { ...a, pedagogical_quality: a.pedagogical_quality === 'problematic' ? 'problematic' : 'neutral', addressed_misconception: false,
    predicted_student_state: { ...ps, understanding_level: keepNeg ? ps.understanding_level : 'same', student_reaction_hints: hints } };
}

module.exports = { RUBRIC, buildDependentPrompt, scoresSchema, validateScores, buildTextPrompt, textSchema, validateText,
  signalFromRows, signalFromStage1, signalFromStage1Calibrated, adaptImpact, validateFull: S2.validate, fullSchema: () => S2.buildSchema({ order: 'score_first' }) };
