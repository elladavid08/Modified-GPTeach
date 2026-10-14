// Compact transcripts of opportunity-bench runs for manual labelling (research only; prints, writes nothing).
//   node research/simulator_audit/replay_harness/scripts/opportunity_dump.mjs <run prefix> [scenarioId] [maxChars]
// Per turn: PCK quality / understanding, the pc1 misconception state (if any); per reply: the speaker, and "C" for the
// designated carrier.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'results');
const [prefix, onlyScenario, maxCharsArg] = process.argv.slice(2);
const maxChars = Number(maxCharsArg || 220);
const convs = fs.readdirSync(RES).filter((d) => d === prefix || d.startsWith(prefix + '-'))
  .flatMap((d) => fs.readdirSync(path.join(RES, d, 'conversations')).map((f) => JSON.parse(fs.readFileSync(path.join(RES, d, 'conversations', f), 'utf8'))))
  .sort((a, b) => a.conversationId.localeCompare(b.conversationId, 'en', { numeric: true }));
const cut = (s) => (s.length > maxChars ? `${s.slice(0, maxChars)}…` : s);
for (const c of convs) {
  if (onlyScenario && String(c.scenarioId) !== onlyScenario) continue;
  console.log(`\n=== ${c.conversationId} cast ${c.cast.join(',')} carrier ${c.carrier || '-'}${c.addressedAtTurn !== undefined ? ` addressedAt ${c.addressedAtTurn}` : ''}`);
  for (const t of c.turns) {
    const label = t.label || `T${t.turn} ${t.move}`;
    const p = t.pck && t.pck.ok ? `${t.pck.quality}/${t.pck.understanding}` : 'PCK-';
    const st = t.misconceptionState ? ` ${t.misconceptionState}` : '';
    console.log(` ${label.split(' ')[0]} [${p}${st}]${/T7|check/.test(label) ? ` ${cut(t.teacher)}` : ''}`);
    for (const r of t.replies) console.log(`   ${r.student === c.carrier ? 'C' : ' '} ${r.student}: ${cut(r.message.replace(/\s+/g, ' '))}`);
  }
}
