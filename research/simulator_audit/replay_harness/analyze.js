// Labels a replay run and writes labels.json, summary.json and review.md next to it.
// Usage (repo root): node research/simulator_audit/replay_harness/analyze.js research/simulator_audit/replay_harness/results/<run id>
import fs from 'node:fs';
import path from 'node:path';
import { labelConversation } from './lib/labels.js';

const runDir = process.argv[2];
if (!runDir || !fs.existsSync(path.join(runDir, 'manifest.json'))) {
  console.error('usage: node analyze.js <results/run id>');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
const convs = fs.readdirSync(path.join(runDir, 'conversations')).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(runDir, 'conversations', f), 'utf8')));
const labels = convs.map((c) => labelConversation(c, { systemVersion: manifest.systemVersion }));

const count = (xs, f) => xs.filter(f).length;
const allReplies = labels.flatMap((l) => l.replies);
const allTurns = convs.flatMap((c) => c.turns.map((t) => ({ ...t, conversationId: c.conversationId })));
const tally = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
const pct = (v, p) => { const s = v.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };
const decisions = allTurns.map((t) => t.decision).filter((d) => d && d.mode === 'B');
const studentMeta = allTurns.map((t) => (t.student && t.student.meta) || {});

const summary = {
  runId: manifest.runId, mode: manifest.mode, castKind: manifest.castKind, systemVersion: manifest.systemVersion, gitCommit: manifest.gitCommit,
  conversations: convs.length, teacherTurns: allTurns.length, studentReplies: allReplies.length,
  turnsWithoutReply: count(allTurns, (t) => t.replies.length === 0),
  final: {
    exactSelfDuplicates: count(allReplies, (r) => r.exact_self_duplicate),
    guardMatches: count(allReplies, (r) => r.guard_match),
    replayTurns: count(labels.flatMap((l) => Object.values(groupBy(l.replies, (r) => r.turn))), (rs) => rs.length > 0 && rs.every((r) => r.guard_match)),
    promptExampleCopies: count(allReplies, (r) => r.prompt_example_copy),
    promptExampleVerbatim: count(allReplies, (r) => r.prompt_example_copy && r.prompt_example_copy.verbatim),
    placeholderLeaks: count(allReplies, (r) => r.placeholder_leak),
    invalidStudents: count(allReplies, (r) => r.invalid_student),
  },
  questions: {
    repeatUnanswered: count(allReplies.flatMap((r) => r.questions), (q) => q.status === 'repeat_unanswered'),
    repeatAfterAnswered: count(allReplies.flatMap((r) => r.questions), (q) => q.status === 'repeat_after_answered'),
  },
  manualReviewItems: tally(labels.flatMap((l) => l.manualReview.map((i) => i.type))),
  teacherModeB: manifest.mode === 'B' ? {
    turnsWithPendingQuestion: count(decisions, (d) => d.questions.length > 0),
    answered: tally(decisions.filter((d) => d.answered).map((d) => `${d.answered.category}/${d.answered.stage}`)),
    probeReplaced: count(decisions, (d) => d.probeReplaced),
    neutralized: count(decisions, (d) => d.neutralized),
    antecedentFallback: count(decisions, (d) => d.antecedentFallback),
    questionActions: tally(decisions.flatMap((d) => d.questions.map((q) => q.action))),
  } : null,
  calls: {
    pckFailures: count(allTurns, (t) => !t.pck.ok), studentFailures: count(allTurns, (t) => !t.student.ok),
    maxStudentAttempts: Math.max(0, ...studentMeta.map((m) => m.attempts || 0)),
    maxPckAttempts: Math.max(0, ...allTurns.map((t) => (t.pck.meta && t.pck.meta.attempts) || 0)),
    studentLatencyP50: pct(studentMeta.map((m) => m.latencyMs), 50), studentLatencyP90: pct(studentMeta.map((m) => m.latencyMs), 90),
    duplicateOutcome: tally(studentMeta.map((m) => m.duplicateOutcome || 'n/a')),
    duplicateRetries: count(studentMeta, (m) => m.duplicateRetries === 1),
    pckLevels: tally(allTurns.map((t) => t.pck.understanding || 'n/a')),
  },
  validity: manifest.mode === 'A'
    ? 'Mode A: valid for exact duplication, duplicate guard, short messages and closings. NOT valid for semantic loops or misconception regressions (the scripted teacher never answers questions).'
    : 'Mode B: loop / regression / premature-correctness / contamination labels need the manual review in review.md.',
};
fs.writeFileSync(path.join(runDir, 'labels.json'), JSON.stringify(labels, null, 2));
fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(runDir, 'review.md'), reviewMarkdown(manifest, convs, labels, summary));
console.log(JSON.stringify(summary, null, 2));

function groupBy(xs, f) { return xs.reduce((m, x) => ((m[f(x)] = m[f(x)] || []).push(x), m), {}); }

function reviewMarkdown(manifest, convs, labels, summary) {
  const out = [`# Replay review: ${manifest.runId}`, '', `Mode ${manifest.mode} · casts ${manifest.castKind} · ${manifest.systemVersion} (${manifest.gitCommit}) · ${summary.validity}`, '',
    'Fill the **verdict** column for every manual-review item (definitions: student_stability_harness_review.md §4).', ''];
  convs.forEach((c, i) => {
    const l = labels[i];
    out.push(`## ${c.conversationId} (scenario ${c.scenarioId} ${c.slug}; A=${c.cast[0]} B=${c.cast[1]} C=${c.cast[2]})`, '');
    for (const t of c.turns) {
      const d = t.decision || {};
      const adapt = d.mode === 'B' && (d.answered || d.neutralized || d.antecedentFallback) ? ` _(adapted: ${d.reason}; scripted: "${t.scriptedText}")_` : '';
      out.push(`**T${t.turn} [${t.move}] teacher:** ${t.teacher}${t.drawing ? ` 🖼 ${t.drawing}` : ''}${adapt}  `);
      out.push(`_PCK ${t.pck.quality || 'fail'}/${t.pck.understanding || '-'}; student attempts ${(t.student.meta && t.student.meta.attempts) || '-'}, duplicate ${(t.student.meta && t.student.meta.duplicateOutcome) || '-'}_`, '');
      for (const r of l.replies.filter((x) => x.turn === t.turn)) {
        const flags = [r.guard_match && 'GUARD-MATCH', r.exact_self_duplicate && 'EXACT', r.semantic_repetition_candidate && `sem?(T${r.semantic_repetition_candidate.ofTurn})`,
          ...r.questions.filter((q) => q.status !== 'first').map((q) => `${q.status}:${q.category}`), r.misconception_claims.length && 'MISCONCEPTION?', r.target_idea && 'TARGET?',
          r.prompt_example_copy && `EXAMPLE:${r.prompt_example_copy.example}`, r.contamination_candidate && `contam?(${r.contamination_candidate.from})`].filter(Boolean);
        out.push(`- ${r.student}: ${r.message}${flags.length ? `  \`${flags.join(' ')}\`` : ''}`);
      }
      out.push('');
    }
    out.push('**Student ledger (auto-suggested candidates; confirm manually):**', '', '| student | slot | misconception turns | target-idea turns | resolution? | regression? | persistent? | premature? | verdict |', '|---|---|---|---|---|---|---|---|---|');
    for (const [s, v] of Object.entries(l.students.perStudent)) {
      out.push(`| ${s} | ${v.slot} | ${v.misconceptionTurns.join(', ') || '-'} | ${v.targetIdeaTurns.join(', ') || '-'} | ${v.resolutionCandidateTurn || '-'} | ${v.regressionCandidateTurn || '-'} | ${v.persistentCandidate ? 'yes' : '-'} | ${v.prematureCorrectnessCandidateTurn || '-'} | |`);
    }
    out.push('', `Misconception voiced by the class before the explanation (T${l.students.explainTurn}): ${l.students.classMisconceptionVoicedBeforeExplain ? 'yes' : 'NO (class-level premature-correctness candidate)'}`, '');
    if (l.manualReview.length) {
      out.push('**Manual-review items:**', '', '| type | turn | student | evidence | verdict |', '|---|---|---|---|---|');
      for (const it of l.manualReview) out.push(`| ${it.type} | ${it.turn} | ${it.student} | ${it.evidence ? JSON.stringify(it.evidence).replace(/\|/g, '/') : ''} | |`);
      out.push('');
    }
  });
  return out.join('\n');
}
