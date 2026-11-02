// X12 FINAL candidate (A1i): the deterministic policy applied after the Stage-2 call, as production should implement it.
// Research only; the reference for the production port and for every offline score of the final candidate.
//   finalizeTurn({ teacherMessage, stage1, stage2 }) -> { shown, rows, source, suppressed, guardDropped, signal, studentImpact }
//     stage1  the 1.5.1 /api/pck-feedback analysis (after the B27 bare-acknowledgement guard), unchanged
//     stage2  null when Stage 2 did not run (Stage 1 hides the turn), else { status: 'stage2' | 'fallback_stage1', rows }
// Rules (2026-10-29 decisions):
//   1. Stage 1 is the first show/hide gate. Stage 2 runs only on turns Stage 1 shows (1.5.1 display rule).
//   2. Stage 2 is the single source of the displayed rows (relevance, scores, text) and of the student steering.
//   3. Leveraging guard: a teacher message that is only an acknowledgement gets no leveraging row.
//   4. No displayable row left after Stage 2 and the guard: the teacher sees NO feedback that turn (no empty container,
//      no placeholder). The students are steered as on any turn without feedback: the Stage-1 analysis, unchanged.
//   5. Stage 2 failed twice: the 1.5.1 rows (with the guard) and the 1.5.1 steering, unchanged.
'use strict';
const { applyLeveragingGuard } = require('./leveraging_guard.cjs');
const { signalFromRows, adaptImpact } = require('./stage2_dep.cjs');

const hasText = (r) => Boolean((r.positive && r.positive.trim()) || (r.improvement && r.improvement.trim()));

function finalizeTurn({ teacherMessage, stage1, stage2, stage1Rows = null }) {
  if (!stage2) return { shown: false, rows: [], source: 'stage1_hidden', suppressed: false, guardDropped: false, signal: null, studentImpact: stage1 };
  const fromStage2 = stage2.status === 'stage2';
  const base = fromStage2 ? stage2.rows : (stage1Rows || []);
  const g = applyLeveragingGuard(teacherMessage, base);
  const rows = g.rows.filter(hasText);
  if (rows.length === 0) {
    return { shown: false, rows: [], source: fromStage2 ? 'stage2' : 'fallback_stage1', suppressed: true, guardDropped: g.dropped, signal: null, studentImpact: stage1 };
  }
  const signal = fromStage2 ? signalFromRows(rows) : null;
  return { shown: true, rows, source: fromStage2 ? 'stage2' : 'fallback_stage1', suppressed: false, guardDropped: g.dropped, signal,
    studentImpact: signal ? adaptImpact(stage1, signal) : stage1 };
}

module.exports = { finalizeTurn };
