# X1: PCK per-skill row-text contract, experiment

Status: experiment only, 2026-10-13, on committed **1.4.2** (`f8c4ba7`). PCK model `gemini-3.1-flash-lite`.
- No production, UI or `SYSTEM_VERSION` change.
- Synthetic data only (the 51 frozen contexts of `pck_missed_misconception_experiment.md`); nothing written to Firestore.
- Plan: `pck_feedback_v2_plan.md` §1.4, §8–§9.

## Summary

- **The defect is confirmed in the field the UI reads.** The sidebar shows `skills_assessment[skill].evidence` for score 1 / 2 and `skills_assessment[skill].what_could_be_better` for score 0. Under the current contract, 3.1 never fills `evidence` (0 of 99 score > 0 rows in arm A).
- **B (as specified): invalid.** Requiring `evidence` and `what_could_be_better` makes the model **drop the still-optional `score`** of relevant skills.
  - The B23 validator then rejects the output: 72 of 288 requests failed, and 35 more needed a second attempt.
- **B′ (B plus `score` required, same prompt block): every text criterion passed.**
  - 100% of displayed rows have text; score 2 41/41; score 1 2/2; score 0 110/115 concrete (95.7%).
  - Valid output 100%, no retries, latency p50 +5%.
- **B′ changes the feedback decisions on the controls.** A replication (12 calls per context) confirmed it is systematic:
  - correct-answer and question controls shown 2/228 → **38/228**;
  - a hedged *correct* answer is criticised as a missed error (1/12 → 8/12);
  - bare "?" probes are praised (0–1/12 → 10–11/12) with **misattributed evidence**;
  - two explanation contexts lose their feedback (9/9 → 1/9, 5/9 → 0/9).
- **Forced text produces fabricated evidence where the decision itself is a false positive.** Examples: crediting a bare "?" with the previous turn's drawing, or a closing with the whole lesson.
- **The Mode B stage was not run**, because the frozen-context gate failed.
- **X1 as tested is not safe to implement.** A **deterministic display rule** (no model change), measured offline on the same outputs, puts text on 98% of frozen-context rows and 88% of Mode B rows. It is the recommended next step (§7).

## 1. What the sidebar actually displays (verified before testing)

`src/pages/Chat.jsx` passes `impact_analysis.skills_assessment` (unchanged) to `PCKFeedbackSidebar`. The sidebar code:

```js
var assessedSkills = (feedback.skills_assessment || []).filter(s => s.is_relevant);
// one row per relevant skill:
text: s.score > 0 ? (s.evidence || '') : (s.what_could_be_better || '')
// demonstrated_skills / missed_opportunities are used ONLY if no skill is relevant
```

| score | displayed field | needed content |
|---|---|---|
| 2 | `skills_assessment[i].evidence` | what was done well |
| 1 | `skills_assessment[i].evidence` (the improvement text is hidden: B12, decided not to protect) | what was done well (+ what to improve, once B12 is implemented) |
| 0 | `skills_assessment[i].what_could_be_better` | what was missing plus a better move |

So the fix must populate the fields **inside** `skills_assessment`. `demonstrated_skills` (where 3.1 does write its evidence) is invisible whenever any skill is relevant.

## 2. Arms

| arm | schema `skills_assessment.items.required` | prompt |
|---|---|---|
| **A** | `skill_id`, `is_relevant` (current) | current 1.4.2 |
| **B** | + `evidence`, `what_could_be_better` | + the block below |
| **B′** | + `score`, `evidence`, `what_could_be_better` (`score` stays nullable) | + the same block |

Everything else is identical: rubric, gates, B27, show / hide logic, schema elsewhere, model, config.

**The block**, inserted once, after "STEP 4: Ground every evidence claim…" and immediately before "## Deriving demonstrated_skills and missed_opportunities":

```
## Per-skill text fields (these are what the teacher sees)
For every skill in skills_assessment with is_relevant: true, write the text inside that skill's own entry (not only in demonstrated_skills / missed_opportunities), addressed to the teacher in second person:
- score 2 → "evidence": what you did successfully in your last message. "what_could_be_better": "" (no recommendation).
- score 1 → "evidence": what you did well, AND "what_could_be_better": what is still missing and how to improve.
- score 0 → "what_could_be_better": what was missing and one concrete better move. "evidence": "".
For a skill with is_relevant: false, set "evidence" and "what_could_be_better" to "".
```

**Why B′ exists:** B failed for a contract reason, not a prompt reason. Requiring two text fields made the model omit `score`, the other field the UI and B23 need. B′ applies the same principle to all three fields. No prompt rule was added.

**Method:**
- The 51 frozen contexts were rebuilt exactly (history, drawings, PCK history, scenario) and sent through the real client `getPCKFeedback` to a local **unmodified** 1.4.2 server.
- An analysis-only preload applies the arm's schema and block; arm A changes nothing.
- Prompt sizes: A 32,187 characters; B / B′ 32,872 (the block).
- Repeats: 6 per missed-misconception or control context, 3 per explanation (288 calls per arm). Then a **replication** of all 33 control and explanation contexts at 6 repeats for A and B′ (198 calls each). Totals: 12 calls per control, 9 per explanation.

## 3. Validity, retries, latency

| | A | B | B′ |
|---|---:|---:|---:|
| requests / final failures | 288 / 1 (timeout) | 288 / **72** | 288 / **0** |
| requests needing 2 attempts | 0 | **35** | 0 |
| cause of B failures | — | "skills_assessment[i].score is required for a relevant skill" (141 rejected attempts) | — |
| model calls, all `STOP` | 289 | 395 | 288 |
| PCK latency p50 / p90 | 2.32 / 3.07 s | 2.52 / 3.02 s | **2.44 / 3.04 s (+5%)** |
| output tokens p50 / max | 551 / 880 | 628 / 982 | 619 / 1,022 |
| replication: failures / 2-attempt calls | 0 / 1 | — | 0 / 0 |

B is not usable. Its decision and text figures are omitted below because they come only from the requests that survived (for example, 3 of 18 explanation calls).

## 4. Row text (first run, displayed rows of shown feedback)

| | A | B′ | target |
|---|---:|---:|---|
| displayed rows | 145 | 158 | — |
| rows with visible text | 108 (**74.5%**, all of them score 0) | **158 (100%)** | 100% |
| score 2: `evidence` present, no improvement | **0 / 32** | **41 / 41** | ≥ 98% |
| score 1: both parts | 0 / 5 (improvement only, hidden) | 2 / 2 | 100% |
| score 0: improvement present / concrete alternative | 108 / 105 | 115 / **110 (95.7%)** | ≥ 95% |
| median length: score-2 evidence / score-0 improvement | — / 124 | 104 / **171** | — |

B′ meets every text target. Score 1 is too rare (2 rows) to be sure of the "both parts" behaviour. Score-0 texts became about 40% longer.

**Sampled quality** (one reviewer; 20 score-2, both score-1 and 20 score-0 rows):
- **Score 0:** names the student and the claim and the bare acknowledgement, usually with a quoted alternative ("יכולת לשאול: 'האם כל מרובע עם אלכסונים שווים הוא בהכרח ריבוע? נסו למצוא דוגמה נגדית'"). 4 of 20 give only a general instruction ("היית צריך לציין שהמסקנה אינה נכונה"). 2 of 20 contradict their own score ("זיהית את הטעות של תמר אך…" on an identification scored 0).
- **Score 2 on genuine moves** (the scripted explanations, the counterexample drawing): grounded in the teacher's message, no recommendation.
- **Score 2 on rows that should not be shown, i.e. fabricated or misattributed evidence:**
  - on a bare "?": "בחרת להציג שרטוט מרובע כדוגמה נגדית…" and "השתמשת בשרטוט כדוגמה נגדית" (the drawing was the *previous* turn);
  - on "יפה מאוד." (closing): "ניצלת את הבלבול החזותי… כדי להוביל את התלמידים להבנה ש…";
  - on the Mode B deferral: "השתמשת בסקרנות של הילה כדי להפוך את השאלה… לחקירה אקטיבית".

  When the decision is a false positive, a required text field makes the model **invent support from earlier turns**. Under A, the same rows were shown as a bare skill name.

## 5. Decisions, relevance, scores

**Missed-misconception targets (first run):**

| | A | B′ |
|---|---:|---:|
| formerly silent (48 calls) | 47 / 47 | 46 / 48 (r1 s4 cast 1 T3: 4/6) |
| formerly shown (60) | 60 / 60 | 60 / 60 |
| relevant skill / score | error-identification 0 in all | error-identification 0 (plus 1 APR) |

The 1.4.1 recovery is preserved.

**Controls and explanations** (first run + replication; shown / calls):

| group | A | B′ |
|---|---:|---:|
| correct answer + bare probe | 1 / 168 | **19 / 168** |
| genuine question + bare probe | 1 / 60 | **19 / 60** |
| explanation | 50 / 54 | **37 / 54** |
| greeting / closing / procedural | 19 / 96 | 15 / 96 |

| context | A | B′ | what B′ shows |
|---|---:|---:|---|
| hedged **correct** answer + "אוקיי" | 1/12 | **8/12** | missed error-identification (a false error) |
| correct statements + "?" | 0/12 | **11/12** | praise (APR / error-leveraging 2) with misattributed evidence |
| correct tag question + "?" | 1/12 | **10/12** | praise |
| "אולי גם ההפך נכון?" + "אוקיי" | 0/12 | **9/12** | missed error-identification |
| closing "יפה מאוד." | 6/12 | 10/12 | error-leveraging praise |
| explanation r2 s4 cast 1 / r2 s5 cast 0 | 9/9, 5/9 | **1/9, 0/9** | feedback lost on good explanations |
| deferral + peer question | 12/12 | 5/12 | fewer false praises (an improvement) |

**Relevance and scores on displayed rows (all calls):**
- A: EI0 108, EI2 8, APR2 61, APR1 1, EL2 19, EL1 9, EL0 3, EC2 1; rows per feedback {1: 146, 2: 32}.
- B′: EI0 123, EI2 15, APR2 54, APR0 5, EL2 32, EL1 6, EC2 5; rows per feedback {1: 152, 2: 44}.
- B′ has more error-leveraging praise, more EI 0 (including false errors), new APR 0 rows and more two-row feedbacks.

**Conclusion:** B′ changes the show / hide decision and the relevance mix. The bare-acknowledgement guard (B27) passes the new false EI-0 rows, because they have the validated missed-identification shape. The bare "?" is outside B27 by decision. The mechanism was not isolated (prompt block vs required score field). No compensating rule was added, as instructed.

## 6. Downstream Mode B

**Not run.** The frozen-context gate (no meaningful change in decisions) failed.

## 7. Recommendation

- **X1 as tested (schema + prompt) is not safe to implement.**
  - B is invalid.
  - B′ fixes the text, but changes decisions (more false errors and praise on correct answers and questions, less feedback on good explanations), and it fabricates evidence on false-positive rows.
- **Smallest safe next step: a deterministic display rule (UI only, no model or prompt change).** Measured offline on the arm-A outputs of this experiment and on the 1.4.1 Mode B outputs:

| rule (sidebar) | frozen contexts (210 rows) | Mode B 1.4.1 (273 rows) |
|---|---:|---:|
| current (`evidence` for score > 0) | 52.9% with text | 7.0% |
| score > 0: `evidence`, else `demonstrated_skills[skill].evidence` | 93.3% | 80.6% |
| … else `what_could_be_better` (score 2's misplaced positive text; score 1's improvement) | **98.1%** | **88.3%** |

  - **What it is:** a pure, testable display function. It does not change decisions or scores and does not touch student steering.
  - **Score 1:** the model already writes the improvement for 100% of score-1 rows (10/10 and 17/17 in A), so showing it also implements B12's "both parts" intent.
  - **The remaining 2–12%:** score > 0 rows with no text anywhere. They should be counted (content-free empty-row counter, plan W0.2) and measured in production rather than forced.
- **Before any model-side contract change (not run):** the next isolating test would be a **schema-only** arm (required `score` / `evidence` / `what_could_be_better`, no prompt block). It would show whether the decision shift comes from the block or from required fields.
  - **Tests for any change:** a display test with real-shaped 3.1 output (no `evidence`) asserting a non-empty row for every displayed skill (plan W0.4).
- **Versioning:** the display rule changes what the teacher sees, so it is a versioned change (next version after 1.4.2).

## 8. Limitations

- **Frozen contexts:** 51 contexts from scripted Mode B conversations; score 1 is rare (≤ 10 rows per arm), so the score-1 results are thin.
- **One reviewer** for text quality and fabrication judgements.
- **The B′ decision shift is measured, not explained.** The schema-only ablation was not run.
- **The display-rule coverage is computed offline.** It shows what the sidebar would display from these outputs; the UI was not rendered.

**Files** (scratchpad `c40/`): `row_text_block.txt`, `row_text_arm.cjs` (arm preload: A / B / Bp), `bench/pck_ab.bench.js`, `contexts.main.json`, `contexts.rep.json`, `results-{A,B,Bp}.jsonl`, `results-{A,Bp}-rep.jsonl`, `calls-{A,B,Bp,A2}.jsonl`, `rows-{A,B,Bp}.json`, `analyze.py`.

## 9. Implemented as a display-only change in 1.4.3 (2026-10-13)

The display rule of §7 was implemented as a view-model (`src/services/pckDisplayRows.js`, invariant B28), with one tightening: score-2 text found only in `what_could_be_better` is **not** shown. Its contract meaning is a recommendation, and treating it as evidence would require reading the text.

**Coverage with the implemented rule:**

| outputs | rows with text |
|---|---:|
| Mode B 1.4.0 | 89.6% (was 4.6%) |
| Mode B 1.4.1 | 86.8% (was 7.0%) |
| frozen contexts, 1.4.1 | 98.0% |
| frozen contexts, 1.4.2 | 97.6% |

**Live render smoke:** 49 of 49 rows render as specified; the empty-row counter is exact.

Details: `regression_test_plan.md` §0.28.

