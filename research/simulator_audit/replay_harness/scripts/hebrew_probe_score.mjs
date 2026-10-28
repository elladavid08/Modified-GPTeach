// Scores Hebrew-probe runs (research only): numeral-noun gender agreement, garble (server/student_garble.js), and
// shape names outside the known quadrilateral vocabulary (for manual review). Prints counts and, with --show, the
// flagged replies (synthetic contexts only).
//   node research/simulator_audit/replay_harness/scripts/hebrew_probe_score.mjs <run dir> [<run dir> ...] [--show]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectGarble } from '../../../../server/student_garble.js';

const RES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'results');
const args = process.argv.slice(2); const show = args.includes('--show');
// Feminine numerals before masculine nouns, and masculine numerals before feminine nouns (construct and absolute forms).
const MASC_NOUNS = 'זוגות|אלכסונים|קודקודים|צדדים|מרובעים|משולשים|ישרים';
const FEM_NOUNS = 'צלעות|זוויות|צורות|תכונות|משפחות|נקודות|הגדרות';
const AGREEMENT = [
  new RegExp(`(?:^|[^א-ת])(שתי|שלוש|ארבע|חמש|שש)\\s+(?:של\\s+)?(${MASC_NOUNS})(?=[^א-ת]|$)`, 'u'),
  new RegExp(`(?:^|[^א-ת])(שני|שלושה|ארבעה|חמישה|שישה|שלושת|ארבעת)\\s+(?:של\\s+)?(${FEM_NOUNS})(?=[^א-ת]|$)`, 'u'),
];
const KNOWN_SHAPES = new Set(['מלבן', 'ריבוע', 'מעוין', 'מעויין', 'מקבילית', 'טרפז', 'דלתון', 'משולש', 'מחומש', 'משושה', 'עיגול', 'מרובע', 'טרפזים', 'מלבנים', 'ריבועים', 'מקביליות', 'דלתונים', 'מעוינים']);
for (const dir of args.filter((a) => !a.startsWith('--'))) {
  const recs = fs.readFileSync(path.join(RES, dir, 'probe.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const c = { calls: recs.length, failed: 0, replies: 0, agreement: 0, garble: 0, shapeOOV: 0 }; const flagged = []; const ms = [];
  const byCtx = {};
  for (const r of recs) {
    if (!r.ok) { c.failed++; continue; }
    ms.push(r.ms);
    for (const { student, message } of r.replies || []) {
      c.replies++; (byCtx[r.ctx] = byCtx[r.ctx] || { replies: 0, agreement: 0, garble: 0, oov: 0 }).replies++;
      const agr = AGREEMENT.map((re) => message.match(re)).filter(Boolean);
      if (agr.length) { c.agreement++; byCtx[r.ctx].agreement++; flagged.push(['agreement', r.ctx, student, message]); }
      const g = detectGarble(message);
      if (Object.keys(g).length) { c.garble++; byCtx[r.ctx].garble++; flagged.push(['garble:' + Object.keys(g).join('+'), r.ctx, student, message]); }
      if (r.ctx === 'H2-more-names') {
        // candidate shape names: words right after "אולי", "או", "גם" or a comma, ending a phrase
        const cands = [...message.matchAll(/(?:אולי|או|גם|,)\s+([א-ת]{3,})(?=[?,.!\s]|$)/gu)].map((m) => m[1].replace(/^ה/, ''));
        const oov = cands.filter((w) => !KNOWN_SHAPES.has(w) && !KNOWN_SHAPES.has(w.replace(/^ו/, '')));
        if (oov.length) { c.shapeOOV++; byCtx[r.ctx].oov++; flagged.push(['shape-oov:' + oov.join('/'), r.ctx, student, message]); }
      }
    }
  }
  ms.sort((a, b) => a - b);
  console.log(`\n### ${dir}`, c, 'p50', ms[Math.floor(ms.length / 2)], 'p90', ms[Math.floor(ms.length * 0.9)]);
  console.log(byCtx);
  if (show) flagged.forEach((f) => console.log('  ', f.join(' | ')));
}
