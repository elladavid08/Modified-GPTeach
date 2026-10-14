// Usage (repo root): node research/simulator_audit/replay_harness/scripts/resimulate_teacher.js <results/run id> [...]
// Checks a Mode B run against the current teacher logic (see lib/resimulate.js). Exit code 1 if any turn differs.
import fs from 'node:fs';
import path from 'node:path';
import { resimulateTeacher } from '../lib/resimulate.js';

let differing = 0;
for (const dir of process.argv.slice(2)) {
  let turns = 0;
  for (const f of fs.readdirSync(path.join(dir, 'conversations')).filter((x) => x.endsWith('.json')).sort()) {
    const conv = JSON.parse(fs.readFileSync(path.join(dir, 'conversations', f), 'utf8'));
    if (conv.mode !== 'B') continue;
    turns += conv.turns.length;
    for (const d of resimulateTeacher(conv)) {
      differing++;
      console.log(`DIFF ${conv.conversationId} T${d.turn}\n  recorded: ${d.recorded}\n  current:  ${d.current}`);
    }
  }
  console.log(`${dir}: ${turns} teacher turns checked`);
}
console.log(differing ? `${differing} teacher turn(s) differ: rerun those conversations` : 'all teacher turns match the current logic');
process.exit(differing ? 1 : 0);
