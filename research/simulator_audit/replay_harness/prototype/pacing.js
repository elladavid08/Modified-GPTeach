import fs from 'fs';
import path from 'path';
import { relocateAiModule } from './carrier.js';

// Student pacing prototype P1 (research only, 2026-10-28; post_1.5_feedback_investigation.md §D/§G, educational-team
// feedback on 1.5.0: "the misconception is resolved too fast"). It patches the PRODUCTION 1.5.1 src/utils/ai.js
// (carrier block, carrierBlock()) in a copy written under results/<run>/, replacing exactly two lines:
//   1. the carrier's revision rule becomes a two-step arc: misconception -> partial understanding / a specific doubt
//      after the teacher's first real move on the issue -> consolidated understanding only after checking, justifying
//      or applying the idea;
//   2. the peer rule: before the teacher addresses the misconception, unchanged (no full explanation, no decisive
//      counterexample); after a minimal hint, a peer may contribute ONE useful step but not the full conceptual
//      conclusion.
// Carrier selection, the rest of the student prompt, PCK steering, the PCK request, models and routing are unchanged.
// Without a carrier (no misconception focus) the patched prompt is byte-identical to production.

export const PACING_PATCH = [
  {
    id: 'carrier-two-step-arc',
    from: 's += `- ${c} revises the misconception only after the teacher actually addresses the mathematical issue: explains it, shows or draws a counterexample, leads a check against the definition, or explicitly confirms a correct argument. Then ${c} engages with it and, if it was clear, shows the new understanding in their own words.\\n`;',
    to: 's += `- ${c} revises the misconception only after the teacher actually addresses the mathematical issue (explains it, shows or draws a counterexample, leads a check against the definition, or explicitly confirms a correct argument), and gradually, in two steps. Step 1, after the teacher\'s first real move on the issue: ${c} reaches a partial understanding or a specific doubt (for example notices that the property holds but is not yet sure what follows from it), not the full conclusion. Step 2, only after checking, justifying or applying the idea (checking it against the definition, explaining why it holds, or using it on another case, prompted by the teacher): ${c} states the consolidated understanding in their own words.\\n`;',
  },
  {
    id: 'peers-one-step',
    from: 's += `- The other students may agree, hesitate, ask a question or add a partial idea, but must NOT give the full correct explanation or the decisive counterexample before the teacher has addressed the misconception.\\n`;',
    to: 's += `- The other students may agree, hesitate, ask a question or add a partial idea, but must NOT give the full correct explanation or the decisive counterexample before the teacher has addressed the misconception. After a minimal hint from the teacher (a reminder of the definition, a short question), a peer may contribute ONE useful step (for example recalls the definition or checks one property on the shape) but does not state the full conceptual conclusion; the conclusion comes from ${c}\'s own checking or from the teacher.\\n`;',
  },
];

/** Production ai.js (working tree) patched with PACING_PATCH, as a module source string with absolute imports. */
export function buildPacingModule(repo) {
  const srcUtilsDir = path.join(repo, 'src/utils');
  let out = fs.readFileSync(path.join(srcUtilsDir, 'ai.js'), 'utf8');
  for (const p of PACING_PATCH) {
    const n = out.split(p.from).length - 1;
    if (n !== 1) throw new Error(`pacing patch "${p.id}": expected 1 match in ai.js, found ${n}`);
    out = out.replace(p.from, () => p.to);
  }
  return relocateAiModule(out, srcUtilsDir);
}
