import { execSync } from 'child_process';

// Misconception-carrier prototype (research only, 2026-10-13; student_misconception_carrier_experiment.md).
// A bench reads the 1.4.4 base ai.js (baseAiSource(), commit cf61c03), applies CARRIER_PATCH with buildCarrierModule()
// and loads the patched copy (written under results/<run>/, so every run records the exact prompt code it used).
// 1.5.0 (2026-10-14) promoted variant v1 into production src/utils/ai.js unchanged (frozen: the production student
// prompt is checked against prompts generated from this prototype, src/__tests__/fixtures/studentPromptCarrierV1.json).
//
// The patch is active only when the scenario object carries `misconception_carrier` (a student name chosen once
// per session by selectCarrier). Without it, the patched prompt is byte-identical to production.
//   1. Compact context: the "Possible misconception to watch for" line and the "do not force the misconception"
//      sentence are replaced by a pointer to the carrier block.
//   2. The "TARGETED MISCONCEPTION / LIFECYCLE" block (ONE or TWO students, chosen by the model) is replaced by a
//      MISCONCEPTION CARRIER block: one named student owns the misconception; peers neither share it, add other
//      misconceptions about the topic, nor resolve it first; teacher questions/acknowledgements/praise are not
//      teaching; the carrier revises it once the teacher actually addresses it.
//   3. PCK steering: the header no longer claims priority over the carrier rule, and one exception paragraph under
//      the MANDATORY ALIGNMENT RULES scopes "positive / improved / addressed_misconception" to tone, confidence and
//      conversational progress for the carrier. The PCK request, model and output are unchanged.
//
// Variants (buildCarrierModule(..., { variant })):
//   v1 (default)  as above.
//   v2            after the v1 A/B (peers often agreed with the carrier or gave the full resolution / counterexample,
//                 following PCK hints such as "understanding_progress"): peers do not share or argue for the idea
//                 and leave the counterexample / full resolution to the teacher; the carrier does not test the idea
//                 on their own initiative; the steering exception also covers the peers.
//   v3            v2, with only the peer line changed (after v2 peers still produced the decisive counterexample or
//                 the full argument): the peers do not know the full answer yet either - they can sense that something
//                 may be off, doubt, ask or add a partial observation, but cannot yet explain why the idea is wrong
//                 or come up with a counterexample until the teacher has addressed it.
//   pc1           v1 + ONE structural peer control (2026-10-14): an explicit session state
//                 scenario.misconception_state = 'open' | 'addressed', set by the bench from a separate teacher-move
//                 classifier (prototype/addressedJudge.js), never by the student model or by PCK. While 'open':
//                   - the peer line of the carrier block becomes a state-dependent role rule (peers may react, doubt,
//                     disagree, ask or offer partial reasoning, but not the complete correction or a counterexample
//                     that settles it); once 'addressed', peers reason it through normally;
//                   - the student prompt renders PCK's addressed_misconception as NOT addressed;
//                   - PCK reaction hints of "understanding_progress" for a PEER are rendered as "partial_understanding"
//                     (an existing reaction type), without the hint's reason text.
//                 The carrier text, carrier selection, PCK request/model/output and routing are unchanged. Without
//                 misconception_state the pc1 module behaves exactly like v1.

/** Session-level carrier: the first cast member whose participation baseline is not "low", else the first.
 *  The cast is already a uniform random draw, so this keeps the carrier random while avoiding a student who
 *  rarely speaks in class-addressed exchanges. */
export function selectCarrier(students) {
  const speaker = students.find((s) => !(s.participation && s.participation.baseline === 'low'));
  return (speaker || students[0]).name;
}

const CARRIER_HELPERS_V1 = `
// ---- misconception-carrier prototype (research harness; not production) ----
function carrierPeers(students, scenario) {
	return students.map((s) => s.name).filter((n) => n !== scenario.misconception_carrier).join(", ");
}
function carrierBlock(students, scenario) {
	const c = scenario.misconception_carrier;
	let s = "\\n\\n🎯 MISCONCEPTION CARRIER FOR THIS LESSON (fixed for the whole lesson):\\n";
	s += \`\${c} sincerely holds this misconception: \${scenario.misconception_focus}\\n\`;
	s += \`- \${c} is the ONLY student who holds it. The other students (\${carrierPeers(students, scenario)}) do not hold it and do not introduce any other misconception about this topic.\\n\`;
	s += \`- When the relevant concept comes up (the teacher asks about it or it becomes relevant), \${c} expresses this idea naturally, in their own words, as genuine thinking - confident or hesitant according to their persona. Never repeat the same sentence; vary the wording and the reasoning.\\n\`;
	s += \`- \${c} KEEPS the misconception while the teacher only asks or reacts: questions such as "why?", "explain how you thought", "are you sure?", "does everyone agree?", "is it always true?", acknowledgements, praise, or moving on. These are not teaching. In response \${c} explains or defends their reasoning and may sound a little less sure, but does not reach the correct conclusion by themself.\\n\`;
	s += \`- \${c} revises the misconception only after the teacher actually addresses the mathematical issue: explains it, shows or draws a counterexample, leads a check against the definition, or explicitly confirms a correct argument. Then \${c} engages with it and, if it was clear, shows the new understanding in their own words.\\n\`;
	s += \`- The other students may agree, hesitate, ask a question or add a partial idea, but must NOT give the full correct explanation or the decisive counterexample before the teacher has addressed the misconception.\\n\`;
	s += "- Once the misconception has been addressed and understood, continue the lesson normally.\\n";
	return s;
}
function carrierSteeringException(scenario) {
	const c = scenario.misconception_carrier;
	return \`**Exception - the misconception carrier (\${c}):** the rules below set tone, confidence and conversational progress. They cannot by themselves resolve \${c}'s misconception. Until the teacher has actually addressed it (an explanation, a counterexample, a definition check led by the teacher, or explicitly confirming a correct argument - judged from the teacher's messages, not from this analysis), "progress" or "improved" for \${c} means explaining their reasoning more clearly, considering a doubt, or sounding less certain - not reaching the correct conclusion - and "Misconception WAS Addressed" does not apply to \${c}.\\n\\n\`;
}
// ---- end prototype helpers ----
`;

const V2_CHANGES = [
  [
    "s += \`- The other students may agree, hesitate, ask a question or add a partial idea, but must NOT give the full correct explanation or the decisive counterexample before the teacher has addressed the misconception.\\n\`;",
    "s += \`- The other students do not share this idea: they never agree with it or argue for it. They may hesitate, say they are not sure it is always true, ask the teacher, or add a partial idea. Until the teacher has addressed the misconception they must NOT state the correct conclusion with its justification and must NOT name or describe a counterexample - leave that to the teacher.\\n\`;\n\ts += \`- \${c} does not test or check the idea on their own initiative (no calculations, measurements or drawings to verify it) unless the teacher asks them to; asked to explain, \${c} explains why it seems true to them.\\n\`;",
  ],
  [
    "and \"Misconception WAS Addressed\" does not apply to \${c}.\\n\\n\`;",
    "and \"Misconception WAS Addressed\" does not apply to \${c}. The same limit applies to the other students: until the teacher has addressed it, \"understanding_progress\" or \"improved\" for them means a doubt, a question or a partial idea - not the correct conclusion and not a counterexample.\\n\\n\`;",
  ],
];
const V3_CHANGES = [
  [
    "s += \`- The other students do not share this idea: they never agree with it or argue for it. They may hesitate, say they are not sure it is always true, ask the teacher, or add a partial idea. Until the teacher has addressed the misconception they must NOT state the correct conclusion with its justification and must NOT name or describe a counterexample - leave that to the teacher.\\n\`;",
    "s += \`- The other students do not share this idea and never argue for it. But they do not know the full answer yet either: they can sense that something might be off, say they are not sure it is always true, ask the teacher, or add a partial observation, yet they cannot explain why the idea is wrong and do not come up with a counterexample (any specific shape that breaks the claim). Only after the teacher has addressed the misconception can they explain it.\\n\`;",
  ],
];
function applyChanges(h, changes, label) {
  for (const [from, to] of changes) {
    if (h.split(from).length - 1 !== 1) throw new Error(`carrier ${label} change not found: ${from.slice(0, 60)}`);
    h = h.replace(from, () => to);
  }
  return h;
}
const PC1_CHANGES = [
  [
    "s += \`- The other students may agree, hesitate, ask a question or add a partial idea, but must NOT give the full correct explanation or the decisive counterexample before the teacher has addressed the misconception.\\n\`;",
    "if (scenario.misconception_state === 'open') {\n\t\ts += \`- LESSON STATE (set by the lesson - do not judge it yourself): the teacher has NOT yet addressed \${c}'s misconception. Until that changes, the other students may react to \${c}'s idea, doubt it, disagree, ask questions or offer partial reasoning, but they do not give the complete correction or a counterexample that settles it.\\n\`;\n\t} else if (scenario.misconception_state === 'addressed') {\n\t\ts += \`- LESSON STATE (set by the lesson): the teacher has now addressed \${c}'s misconception. All students may reason it through and give correct arguments normally.\\n\`;\n\t} else {\n\t\ts += \`- The other students may agree, hesitate, ask a question or add a partial idea, but must NOT give the full correct explanation or the decisive counterexample before the teacher has addressed the misconception.\\n\`;\n\t}",
  ],
];
const PC1_HELPERS_EXTRA = `
// ---- pc1: explicit misconception state (research harness; not production) ----
function carrierStateOpen(scenario) {
	return Boolean(scenario.misconception_carrier) && scenario.misconception_state === 'open';
}
function carrierAddressedFlag(scenario, impact_analysis) {
	return carrierStateOpen(scenario) ? false : impact_analysis.addressed_misconception;
}
function carrierHintView(scenario, hint) {
	if (carrierStateOpen(scenario) && hint.student !== scenario.misconception_carrier && hint.reaction_type === 'understanding_progress') {
		return { ...hint, reaction_type: 'partial_understanding', reason: undefined };
	}
	return hint;
}
`;
/** Extra ai.js replacements for pc1 only (runtime-gated on scenario.misconception_state). */
const PC1_PATCH = [
  {
    id: 'pc1-addressed-flag',
    from: "\t\t\tretStr += `**Misconception ${impact_analysis.addressed_misconception ? 'WAS' : 'WAS NOT'} Addressed**: ${impact_analysis.how_addressed || ''}\\n`;",
    to: "\t\t\tretStr += `**Misconception ${carrierAddressedFlag(scenario, impact_analysis) ? 'WAS' : 'WAS NOT'} Addressed**: ${carrierStateOpen(scenario) ? '(lesson state: not yet addressed)' : (impact_analysis.how_addressed || '')}\\n`;",
  },
  {
    id: 'pc1-peer-hints',
    from: "\t\t\t\tstate.student_reaction_hints.forEach((hint) => {\n",
    to: "\t\t\t\tstate.student_reaction_hints.map((h) => carrierHintView(scenario, h)).forEach((hint) => {\n",
  },
];
function helpersFor(variant) {
  if (variant === 'pc1') return applyChanges(CARRIER_HELPERS_V1, PC1_CHANGES, 'pc1') + PC1_HELPERS_EXTRA;
  if (variant === 'v1') return CARRIER_HELPERS_V1;
  if (variant === 'v2') return applyChanges(CARRIER_HELPERS_V1, V2_CHANGES, 'v2');
  if (variant === 'v3') return applyChanges(applyChanges(CARRIER_HELPERS_V1, V2_CHANGES, 'v2'), V3_CHANGES, 'v3');
  throw new Error(`unknown carrier variant ${variant}`);
}

/** Exact replacements on src/utils/ai.js; each `from` must occur exactly once. */
export const CARRIER_PATCH = [
  {
    id: 'context-watch-line',
    from: '\tif (scenario.misconception_focus) {\n\t\tretStr += `\\nPossible misconception to watch for: ${scenario.misconception_focus}`;\n\t}',
    to: '\tif (scenario.misconception_focus && !scenario.misconception_carrier) {\n\t\tretStr += `\\nPossible misconception to watch for: ${scenario.misconception_focus}`;\n\t}',
  },
  {
    id: 'context-background-line',
    from: "\tretStr += `\\nScenario context is BACKGROUND ONLY. Do not force the misconception into every turn, do not copy fixed wording, and do not treat the pedagogical focus as a script. Base student responses on the actual conversation, the student personas, and the teacher's latest move.`;",
    to: "\tretStr += scenario.misconception_carrier\n\t\t? `\\nScenario context is BACKGROUND ONLY: do not copy fixed wording and do not treat the pedagogical focus as a script. Base student responses on the actual conversation, the student personas, and the teacher's latest move. The lesson's misconception belongs to one designated student (see MISCONCEPTION CARRIER below).`\n\t\t: `\\nScenario context is BACKGROUND ONLY. Do not force the misconception into every turn, do not copy fixed wording, and do not treat the pedagogical focus as a script. Base student responses on the actual conversation, the student personas, and the teacher's latest move.`;",
  },
  {
    id: 'carrier-block',
    from: '\t// Add misconception focus if specified\n\tif (scenario.misconception_focus) {',
    to: '\t// Add misconception focus if specified\n\tif (scenario.misconception_focus && scenario.misconception_carrier) {\n\t\tretStr += carrierBlock(students, scenario);\n\t} else if (scenario.misconception_focus) {',
  },
  {
    id: 'pck-header',
    from: '\t\tretStr += "⚠️ THE FOLLOWING ANALYSIS TAKES PRIORITY OVER SCENARIO MISCONCEPTION INSTRUCTIONS!\\n";',
    to: '\t\tretStr += scenario.misconception_carrier\n\t\t\t? `⚠️ THE FOLLOWING ANALYSIS TAKES PRIORITY OVER THE OTHER SCENARIO INSTRUCTIONS, EXCEPT THE MISCONCEPTION CARRIER RULE: it cannot by itself resolve ${scenario.misconception_carrier}\'s misconception.\\n`\n\t\t\t: "⚠️ THE FOLLOWING ANALYSIS TAKES PRIORITY OVER SCENARIO MISCONCEPTION INSTRUCTIONS!\\n";',
  },
  {
    id: 'pck-alignment-exception',
    from: '\t\tretStr += "⚠️ **MANDATORY ALIGNMENT RULES** (NON-NEGOTIABLE):\\n\\n";',
    to: '\t\tretStr += "⚠️ **MANDATORY ALIGNMENT RULES** (NON-NEGOTIABLE):\\n\\n";\n\t\tif (scenario.misconception_carrier) {\n\t\t\tretStr += carrierSteeringException(scenario);\n\t\t}',
  },
];

/** Rewrite the relative imports of an ai.js source to absolute paths into `srcUtilsDir` (the production src/utils
 *  directory), so the copy can live anywhere. */
export function relocateAiModule(aiSource, srcUtilsDir) {
  const srcDir = srcUtilsDir.replace(/\/utils\/?$/, '');
  const out = aiSource
    .replace(/from "\.\.\/([^"]+)"/g, (_, rel) => `from "${srcDir}/${rel}"`)
    .replace(/from "\.\/([^"]+)"/g, (_, rel) => `from "${srcUtilsDir.replace(/\/$/, '')}/${rel}"`);
  if (/from "\.\.?\//.test(out)) throw new Error('carrier patch: unresolved relative import');
  return out;
}

/**
 * Patched copy of ai.js as a module source string (imports made absolute, see relocateAiModule).
 * Since 1.5.0 the v1 carrier is production code, so the patch applies only to the 1.4.4 base source (baseAiSource()).
 */
export function buildCarrierModule(aiSource, srcUtilsDir, { variant = 'v1' } = {}) {
  let out = aiSource;
  for (const p of variant === 'pc1' ? [...CARRIER_PATCH, ...PC1_PATCH] : CARRIER_PATCH) {
    const n = out.split(p.from).length - 1;
    if (n !== 1) throw new Error(`carrier patch "${p.id}": expected 1 match in ai.js, found ${n}`);
    out = out.replace(p.from, () => p.to);
  }
  return `${relocateAiModule(out, srcUtilsDir)}\n${helpersFor(variant)}`;
}

/** The prototype was built and validated against the committed 1.4.4 ai.js; 1.5.0 promoted v1 into production
 *  (src/utils/ai.js), so the research variants patch this frozen base, read from git. */
export const CARRIER_BASE_COMMIT = 'cf61c03';
export function baseAiSource(repo) {
  try {
    return execSync(`git show ${CARRIER_BASE_COMMIT}:src/utils/ai.js`, { cwd: repo, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  } catch (e) {
    throw new Error(`carrier prototype: cannot read src/utils/ai.js at ${CARRIER_BASE_COMMIT} (needs the git history): ${e.message}`);
  }
}
