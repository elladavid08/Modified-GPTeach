# X3: deterministic PCK consistency layer, offline experiment

Status: experiment only, 2026-10-13, on committed **1.4.3** (`f5ed2b6`).
- No production, prompt, schema, model, student-steering or `SYSTEM_VERSION` change. Synthetic data only.
- **Benchmark:** `pck_eval/` fixture v1.1.0 (116 cases: 95 high, 21 expert review). Only high-confidence cases count toward pass / fail.
- Plan: `pck_feedback_v2_plan.md` X3 (W1.3, W1.4, W2.1, W3.4, W5.1, W5.2).

## Summary

- **On 1.4.3 output, X3 has almost nothing structural to fix in what the teacher sees.**
  - The sidebar already builds rows from `skills_assessment` only (B28).
  - Across 2,203 saved 1.4.x outputs, the model never showed feedback without a relevant skill.
  - It never hid feedback while keeping relevant skills, except where the 1.4.1 bare-acknowledgement guard did so.
  - More than two relevant skills occurred once (1 of 1,258).
- **The real contradictions live in `demonstrated_skills` / `missed_opportunities`** (23–29% of saved outputs have at least one contradiction pattern), mostly score-1 / score-2 skills missing from `demonstrated_skills`, and skills listed there that are not relevant.
  - These two lists are not displayed (only an evidence-text fallback reads them).
  - **They are consumed by the student prompt.** Deriving them deterministically is easy and removes every list contradiction. But it is a **student-steering change** (it alters the steering input in 18–25% of turns, about a quarter of the new items with empty text), so it is not a display normalisation.
- **Benchmark result:**
  - Candidate B (decision = model decision AND a relevant skill, then the guard; derived lists; 2-row cap) is **identical to A on every display metric**: decision 242/267 (90.6%), false positives 6/81, false negatives 19/186, missed-misconception 0/54 false negatives, bare-acknowledgement cases 102/108. Scores are unchanged by construction (0 of 369 outputs touched).
  - **`should_provide_feedback = any relevant skill` (B2) is also identical, only because the guard runs last.** It is not assumed safe: it can turn a model "no feedback" into "shown" for any non-bare message.
- **A 2-row cap is mechanically definable but not pedagogically defensible yet, and has no effect today.** It never triggers on the benchmark. The only contract-backed order (the skill chain) conflicts with the B200 rule that identification and APR are independent. W2.1's priority is an unvalidated proposal.
- **Continuity cannot be made deterministic.** A skill-id rule ("praised last turn → hide") stops redundant praise (12/12), but hides 49 outputs, including genuinely new moves (false negatives 19 → 45). "Same error" and "same move" are judgements.
  - Production's prompt Rule 1 fails both redundant-praise cases (0/12).
  - It also lets a missed identification after earlier praise disappear (0/6 shown).
- **Recommendation:** implement X3 now as **option A** (display / feedback normalisation only, student steering raw), limited to:
  1. the decision invariant B1 (never show feedback with no relevant skill; the guard stays final);
  2. content-free contradiction counters (A17-style telemetry).
- **Leave model-owned:** the lists, the cap, continuity, `pedagogical_quality` and `feedback_trigger`. List derivation needs the steering contract separated or a Mode B A/B. The cap priority and continuity need expert definitions.
- **Mode B was not run:** the display-only part has no observable effect to measure, and the lists are out of scope until steering is separated.

## 0. Benchmark gap closed: continuity cases (fixture v1.1.0)

**Seven high-confidence cases.**
- **Recorded prefix:** scenario 5, run 1, cast 0, turns 1–2 (Roee claims equal diagonals make a square).
- **One hand-written turn 3** in which the teacher identified the error (praised as EI 2) or set a rectangle counterexample (praised as APR 2).
- **A synthetic feedback history** with exactly that praise.
- **Current turn:**

| case | situation | label |
|---|---|---|
| `CONT-EI-repeat-same-error` | Roee repeats the claim; the teacher repeats "the claim is wrong" | EI must not be *displayed as praise* again (`no_repeat_praise:EI`) |
| `CONT-APR-repeat-same-move` | Roee calls the rectangle a special case; the teacher repeats the same rectangle question | `no_repeat_praise:APR` |
| `CONT-APR-new-move` | the teacher takes up the new objection with a different, student-performed counterexample (a kite with equal diagonals) | APR required, 1–2 (evaluable despite prior praise) |
| `CONT-EI-new-error-identified` | Dana voices a new claim (equal + perpendicular); the teacher identifies it | EI required, 2 |
| `CONT-EI-missed-same-error` | Roee restates the claim; the teacher says "אוקיי" | EI required, 0 (prior praise must not make it irrelevant) |
| `CONT-EI-new-error-missed` | Dana's new claim; the teacher says "יפה" | EI required, 0 |
| `CONT-APR-missed-after-praise` | Roee persists; the teacher just tells him he is wrong | APR required, 0 |

**Label scheme:**
- **New constraint `no_repeat_praise:<skill>`.** Shown feedback must not display that skill with a score above 0. Relevance is left open, because production Rule 1 ("not relevant") and plan W1.4 ("relevant, not displayed again") both satisfy it.
- **No existing label changed.** The 109 earlier cases are byte-identical: stripping the two additive fields reproduces the v1.0.0 sha256 `d470bf14…`.

**1.4.3 on these cases** (6 repeats each, unmodified server):
- **Redundant praise:** both repeat cases re-praise the skill in 6/6.
- **Missed identification after earlier praise:** `CONT-EI-new-error-missed` is hidden 6/6. The model praised APR / EI on "יפה", and the guard then suppressed the output, so the missed identification disappears.
- **Telling scored as adapting:** `CONT-APR-missed-after-praise` scores the telling turn APR 2 in 2/6 and drops APR in 4/6.

## 1. The current output contract (1.4.3)

| field | who sets it | what reads it | contract |
|---|---|---|---|
| `skills_assessment[]` (`is_relevant`, `score`, texts) | model; B23 validates structure | **sidebar rows** (B28 view-model); researcher views; summary prompt (C1); feedback history → next PCK prompt (continuity rules); stored only when shown | "If `should_provide_feedback` = false, return []"; ≤ 2 relevant; chain rules |
| `demonstrated_skills[]` | model ("copy every entry where `is_relevant` AND `score >= 1`; include only `skill_id` and `evidence`") | **student prompt** ("PCK Skills Demonstrated", every turn, shown or hidden); stored as `detected_skills` when shown; sidebar only as an evidence-text fallback (exact single id) or as legacy rows when no skill is relevant | derivation rule in the prompt; not enforced |
| `missed_opportunities[]` | model ("`is_relevant` AND `score = 0`", text renamed) | **student prompt** ("Missed Opportunities"); stored; legacy rows | same |
| `should_provide_feedback` | model, then the **bare-acknowledgement guard** (server) | client display decision; logging of `pckFeedback` (only when shown); `pckRowsWithoutText` | prompt: true only if a student error exists and quality is positive / problematic; neutral → false |
| `pedagogical_quality` | model | **student prompt** (main steering signal); feedback history; the guard (missed-identification shape); `feedback_type` | — |
| `feedback_trigger` | model | **nothing** (validated, not stored, not read) | null when no feedback |
| `feedback_message_hebrew` | model; emptied by the server when hidden | stored, feedback history, summary; **not rendered by the sidebar** | — |
| displayed rows | client, `buildPckDisplayRows(formattedFeedback)` | teacher | B28 |
| bare-acknowledgement guard | `server/pck_bare_ack_guard.js` | — | exact trimmed "אוקיי" / "יפה" / "נכון": shown only for EI relevant 0 + quality problematic; otherwise `should_provide_feedback` false (skills kept) |

**The student agent receives the whole raw analysis on every turn, shown or hidden** (`Chat.jsx` → `callAI(…, impact_analysis)`). It reads:
- `pedagogical_quality`, `addressed_misconception`, `how_addressed`, `misconception_risk`;
- `demonstrated_skills` (id + evidence), `missed_opportunities` (id + text);
- `predicted_student_state` (understanding level, tone, reaction hints).

It does **not** read `skills_assessment`, `should_provide_feedback`, `feedback_trigger` or the message.

**Contradiction patterns in saved 1.4.x outputs** (content-free codes, `x3/x3_consistency.js`):

| pattern | 1.4.0 Mode B (288) | 1.4.1 Mode B (288) | 1.4.3 frozen (1,258) | benchmark 1.4.3 (369) |
|---|---:|---:|---:|---:|
| outputs with any pattern | 66 | 80 | 365 | — |
| relevant score 1–2 missing from `demonstrated_skills` (score 1 / 2) | 48 (21 / 27) | 54 (18 / 36) | 204 (90 / 114) | 81 (34 / 47) |
| `demonstrated_skills` lists a skill that is not relevant with score ≥ 1 (mostly APR; about half on outputs with no relevant skill at all) | 10 | 9 | 69 | 24 |
| `missed_opportunities` lists a skill that is not relevant with score 0 | 2 | 1 | 45 | 19 |
| relevant score 0 missing from `missed_opportunities` | 1 | 0 | 7 | 16 |
| hidden but skills still relevant | 0 | 21 (all guard-suppressed) | 104 (all bare acknowledgements) | 15 (all bare acknowledgements) |
| shown without a relevant skill | 0 | 0 | 0 | 0 |
| more than 2 relevant skills | 0 | 0 | 1 | 0 |
| `feedback_trigger` set although hidden | 10 | 21 | 104 | 15 |
| quality "positive" with a displayed score-0 row / "neutral" yet shown | 2 / 0 | 2 / 0 | 5 / 1 | 7 / 1 |

**Reading the table:**
- **The decision is already consistent.** Hidden-with-relevant occurs only where the guard (deliberately) hid praise on a bare acknowledgement.
- **The lists are where the model breaks its own derivation rule.** 3.1 never lists score-1 skills and often omits score-2 ones; it lists APR on turns where APR is not relevant (often hidden turns, so the student prompt hears "PCK Skills Demonstrated: APR" on a turn with no feedback).

## 2. Candidate X3 rules

Module: `research/simulator_audit/pck_eval/x3/x3_consistency.js`.
- **Reads only** `skills_assessment[].is_relevant` / `score`.
- **Reuses unmodified production code:** the guard and the B28 view-model.
- **Never mutates the input.**

| rule | definition | deterministic from the model's own per-skill state? |
|---|---|---|
| **R1 demonstrated** | `[s for s in skills_assessment if s.is_relevant === true and s.score in {1,2}]` in order; evidence = the skill's own `evidence`, else the single exact-id `demonstrated_skills` evidence, else "" | **yes** (the prompt's own rule, "score >= 1"). No text is invented. |
| **R2 missed** | relevant with `score === 0`; text = own `what_could_be_better`, else the exact-id `missed_opportunities` text, else "" | **yes** (the prompt's rule, "score = 0"; partial = score 1 belongs to demonstrated under the current contract) |
| **R3-B1 decision** | `shown = model decision AND any relevant skill`, then the guard | **yes, conservative:** it can only hide (never invents relevance or turns "no feedback" into "shown") and the guard stays final |
| R3-B2 decision (evaluated, not proposed) | `shown = any relevant skill`, then the guard | deterministic, but it **overrides** a model "no feedback" whenever skills are relevant; safe today only because the guard re-suppresses every such case observed (all bare acknowledgements) |
| R4 cap (evaluated) | at most 2 displayed rows, keeping the earliest in the skill chain | see §4 |
| R5 continuity (evaluated, rejected) | hide a positive row whose skill scored ≥ 1 in the most recent feedback-history entry | no: see §5 |

**Left model-owned:**
- `pedagogical_quality`: a judgement and the main steering signal; no deterministic mapping from scores (the "positive with a 0 row" cases are content conflicts, not structure).
- `feedback_trigger`: unused.
- Relevance and scores.

## 3. Offline evaluation (committed 1.4.3 outputs → A vs B)

**Inputs:**
- Benchmark replay outputs: 327 (109 cases × 3) + 42 (continuity × 6) = 369.
- High-confidence: 306 outputs, 267 decision assertions.

**Display metrics** score the rows the teacher would see.

| high bucket | A current | B1 | B1 + lists | **B1 + lists + cap 2** | B2 (any relevant) | B2 + lists + cap 2 |
|---|---:|---:|---:|---:|---:|---:|
| decision agreement | 242/267 (90.6%) | same | same | **same** | same | same |
| false positives (negative controls) | 6/81 (7.4%) | same | same | **same** | same | same |
| false negatives | 19/186 (10.2%) | same | same | **same** | same | same |
| missed-misconception false negatives | 0/54 | same | same | **0/54** | same | same |
| bare-acknowledgement cases, decision | 102/108 | same | same | **same** | same | same |
| continuity cases: decision / no-repeat-praise held | 24/30 / 0/12 | same | same | **same** | same | same |
| case constraints held (displayed rows) | 10/45 | same | same | **same** | same | same |
| not-relevant respected on displayed rows | 411/454 (90.5%) | same | same | **same** | same | same |
| rows per shown feedback {1, 2} | {127, 135} | same | same | **same** | same | same |
| `skills_assessment` changed (so scores) | — | 0 | 0 | **0** | 0 | 0 |
| list contradictions after | 140 | 140 | **0** | **0** | 140 | 0 |
| outputs whose `demonstrated` / `missed` change | — | 0 / 0 | 91 / 25 | 91 / 25 | 0 / 0 | 91 / 25 |
| decisions / displayed rows changed | — | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

**Per skill** (model and displayed views; identical in every variant because relevance and scores are untouched):

| skill | required relevant | not-relevant respected (raw / displayed) | score in the allowed set |
|---|---:|---:|---:|
| EI | 105/120 | 108/117 / 109/117 | 103/121 |
| EC | 7/12 | 211/225 / 211/225 | 7/7 |
| DI | 6/15 | 147/147 | 3/6 |
| APR | 39/57 | 76/90 / 83/90 | **23/46** |
| EL | 9/9 | 278/297 / 283/297 | 9/9 |

**Expert-review bucket** (visible, not scored, not optimised): decision 14/15 in A and every B variant.

**How often B would alter fields on other saved outputs** (B1 + lists + cap 2; B2 identical):

| | 1.4.0 Mode B | 1.4.1 Mode B | 1.4.3 frozen |
|---|---:|---:|---:|
| `should_provide_feedback` | 0/288 | 0/288 | 0/1,258 |
| `demonstrated_skills` (ids) | **52 (18%)** | **58 (20%)** | **242 (19%)** |
| `missed_opportunities` (ids) | 3 | 1 | 48 (4%) |
| displayed rows | 0 | 0 | 1 (the one 3-row output, cap) |
| derived demonstrated items with empty evidence | 48 / 248 | 54 / 279 | 204 / 877 |

(1.4.0 replayed through the guard differs from the logged display in 10 turns, because 1.4.0 had no guard. This is expected.)

## 4. Row cap (B8, W2.1)

- **Need:**
  - the prompt already says "never assess more than 2 skills as relevant", and 3.1 complies (0 of 576 Mode B outputs; 1 of 1,258 frozen; 0 of 369 benchmark);
  - over-selection on the benchmark is *wrong skills* (e.g. EC on "זה לא נכון", APR on a correct-answer confirmation), not *too many*;
  - so a cap removes nothing that the benchmark penalises.
- **Ordering:**
  - the only ordering in the current contract is the skill chain (error-identification → … → leveraging) with "start at the stage's skill, at most one step forward";
  - the stage is a model judgement, so "which two" is not recoverable from the output;
  - keeping the two earliest chain skills is mechanical, but contradicts the B200 rule that identification and APR are independent (keeping identification + characterisation over APR is not obviously right);
  - W2.1's priority (missed identification first, then lowest score) and the expert note "favour the most useful point" are unvalidated proposals.
- **Verdict:** a 2-row cap is definable, but its priority would be invented. **Do not cap**; count rows above 2 (a content-free counter) until the experts define a priority.

## 5. Continuity (W1.4)

**Production:** prompt Rule 1 asks the model to mark a skill "already scored ≥ 1 for the same active error" as not relevant. On 1.4.3 it does not:
- redundant praise in both repeat cases, 6/6 each;
- the missed identification after earlier praise is lost (`CONT-EI-new-error-missed`, 0/6 shown).

**Deterministic probe R5** (hide a positive row whose skill scored ≥ 1 on the previous turn):

| | A | R5 probe |
|---|---:|---:|
| no-repeat-praise held | 0/12 | 12/12 |
| high decision agreement | 242/267 | **221/267** |
| false negatives | 19/186 | **45/186** |
| outputs hidden | — | 49 |

**Why R5 is rejected:** it hides new moves on the same skill, which skill-id matching cannot tell apart from repetitions:
- `CONT-APR-new-move`;
- counterexample tasks after a praised planned question;
- characterisations after earlier identification praise.

"Same active error" and "same move" are pedagogical judgements. Continuity stays model-owned (prompt Rule 1, or the W1.4 prompt part in X5), and it needs an expert definition of "redundant". The 7 continuity cases now measure it.

## 6. Student-steering safety

| X3 field | read by the student prompt? | effect of normalising it |
|---|---|---|
| `should_provide_feedback` (B1) | no | display only |
| displayed rows / cap | no | display only |
| `demonstrated_skills` (R1) | **yes** ("PCK Skills Demonstrated", every turn) | changes the steering input in 18–25% of turns. Adds score-1 skills (often with empty evidence); removes APR / EL / EI "demonstrated" on turns where they are not relevant (often hidden turns) |
| `missed_opportunities` (R2) | **yes** ("Missed Opportunities") | changes it in 0–7% of turns |
| `pedagogical_quality`, `predicted_student_state`, `addressed_misconception`, `misconception_risk` | **yes** | not touched by X3 |

**Answer: A (display / feedback normalisation only, student steering raw)**, and it is also the smallest change.
- **B (shared normalisation)** would change student behaviour through the lists. It needs a Mode B A/B, and its value depends on X5 / X6 relevance and scores. Deriving the lists before those settle would hard-wire today's relevance mistakes (e.g. APR on correct-answer confirmations) into steering.
- **C applies only to the lists:** normalising them safely requires first separating the feedback contract from the steering contract (plan W6.3), or accepting a measured steering change.

## 7. Verdict against the success criteria

| criterion | result |
|---|---|
| eliminate structural contradictions without new judgements | **only for the lists** (all 140 removed by R1 / R2), which belong to steering; the display-side invariant (shown ⇒ a relevant skill) holds already and B1 makes it guaranteed |
| do not reduce decision performance | met (identical) |
| do not worsen false positives on negative controls | met (6/81 → 6/81) |
| preserve the 1.4.1 missed-misconception behaviour | met (0/54 false negatives) |
| preserve the bare-acknowledgement guard | met (guard final in every variant; 102/108 identical) |
| reduce over-selection deterministically | **not possible**: over-selection is wrong skills, not too many; a cap removes nothing here |
| never alter per-skill scores | met (0 of 369 outputs) |

**Recommendation:**
1. Implement **X3-A** now (small, versioned display change):
   - the B1 decision invariant after the guard;
   - content-free counters for the patterns in §1 (list mismatches, hidden-with-relevant, rows > 2, trigger / quality mismatches) in PCK telemetry.
2. **Keep raw for steering:** the lists, quality and state.
3. **Defer the lists** until the steering contract is separated or a Mode B A/B is approved after X5 / X6.
4. **No cap, no deterministic continuity.**

Mode B: not run. The display-only part changes nothing observable on any saved output.

## 8. Waiting for expert adjudication

- **The display priority for more than 2 rows (W2.1)**, and whether a primary "most useful" row is wanted.
- **What counts as redundant praise:** same error vs same move vs same skill; and whether a missed opportunity after praise should always be shown (today it can vanish, as in `CONT-EI-new-error-missed`).
- **Whether a quality / row conflict should be prevented** ("positive" quality with a displayed score-0 row; 7 benchmark outputs). That is a judgement about the message, not structure.
- **Not X3, but they bound it:** the expert-review bucket items of `pck_eval_benchmark.md` §9 (relevance semantics) determine what the derived lists would contain if steering were later normalised.

## 9. Limitations

- **Saved outputs:** the frozen and benchmark outputs are post-guard; the Mode B captures are the replayed analyses. Pattern counts for hidden-with-relevant therefore include guard suppressions by construction (identified by the bare-acknowledgement message).
- **Continuity cases:** 7, on one scenario prefix, with a synthetic feedback history.
- **Repeats:** 3 per case on the benchmark (decisions unanimous in 105 of 109 cases), 6 per continuity case.
- **One researcher wrote the labels** (unreviewed); X3 conclusions above do not depend on the review bucket.

**Files:**
- `research/simulator_audit/pck_eval/x3/x3_consistency.js` (rules, contradiction codes) and `x3/x3_eval.js` (offline evaluation);
- `test/x3.test.js`;
- results in `pck_eval/results/` (git-ignored): `x3-eval.txt` / `.json`, `baseline-1.4.3-continuity-r6.jsonl`.
