# PCK Feedback v2: plan

Status: planning only, 2026-10-13.
- Baseline: committed **1.4.2** (`92d7049`).
- No production change, no `SYSTEM_VERSION` bump.
- Inputs:
  - `research/b200_handoff/` (all eight files);
  - the production PCK prompt (`server/server.js`), contract (`server/pck_feedback_contract.js`), rubric (`server/universal_pck_skills.js`) and display (`src/components/PCKFeedbackSidebar.jsx`);
  - `feedback_agent_findings.md`, `pck_missed_misconception_experiment.md`, `invariants.md`, `regression_test_plan.md`;
  - `student_stability_replay.md` §12–§13.
- New measurements in §1.3–§1.4 use synthetic data only (1.4.x Mode B, the 51 frozen PCK contexts and a 102-call diagnostic). No participant data was read; the B200 numbers are quoted from the handoff.

## 0. Summary

- **Blocker found while preparing this plan:** on the feature branch, **about 93% of displayed per-skill rows have no text**, so the teacher sees only a coloured dot and a skill name (§1.4).
  - The structured-output contract introduced in 1.3.4 makes `skills_assessment[].evidence` optional. Both 2.5 and 3.1 then put their positive evidence only in `demonstrated_skills`, which the sidebar does not read.
  - Production `main` (free-text JSON) is **not affected**: 100% of rows have text.
  - This must be fixed before the feature branch is deployed, and it is the natural first v2 experiment because it is about what the teacher sees.
- **The current PCK has structural strengths:** valid structured output, a missed-misconception fix (1.4.1), the B27 guard, and at most 2 relevant skills in the 3.1 synthetic data.
- **Its semantics diverge from B200** in ways that matter for the rest of v2:
  - relevance is partly "the teacher attempted it" (p3) or "there was an opportunity" (p2, p5), not B200's "should be evaluated";
  - a prerequisite chain makes later skills irrelevant after a 0;
  - a continuity rule turns "already praised" into "irrelevant";
  - the decision is tied to `pedagogical_quality`, not to the skills;
  - scores are inflated (88% score 2 vs B200 gold, where score 1 dominates p4);
  - score-1 improvement text is hidden;
  - `feedback_message_hebrew` is generated but never shown.
- **The plan has seven workstreams.** About two thirds of the changes are prompt, schema or deterministic rules on the current 3.1 path. Trained models or a two-call architecture are kept for later, conditional steps.
- **First experiment (§8–§9):** a display-and-text contract experiment that makes every displayed row carry the right text for its score, without changing any decision or score.

## 1. Current production baseline (1.4.2)

### 1.1 Pipeline

`Chat.jsx` → `getPCKFeedback` → `POST /api/pck-feedback`:
- one call to `gemini-3.1-flash-lite`, JSON mode with `PCK_RESPONSE_SCHEMA`, MINIMAL thinking, no temperature;
- B23 validation, B24 retry policy (at most 2 attempts), B27 bare-acknowledgement guard;
- the sidebar renders the result.

The single call does three jobs (`feedback_agent_findings.md` §1.1):
- **A. Student steering:** `predicted_student_state`, `pedagogical_quality`, `addressed_misconception`, `misconception_risk`, `demonstrated_skills`, `missed_opportunities` go into the student prompt. For example, positive quality means "Students MUST show understanding progress".
- **B. The feedback decision and per-skill assessment.**
- **C. A composed message**, `feedback_message_hebrew`.

### 1.2 What the teacher sees (code)

- **Rows:** one per `skills_assessment` entry with `is_relevant: true`. Each has a dot (green 2, yellow 1, lilac 0; the B11 vocabulary) and text: `evidence` if the score is above 0, otherwise `what_could_be_better`.
- **Score-1 rows hide the improvement suggestion** (B12, decided not to protect).
- **`feedback_message_hebrew` is never displayed.** It is persisted, passed to later PCK calls, and passed to the summary.
- **No row cap in code** (B8 is still under review).

### 1.3 Measured behaviour on 3.1 (synthetic, 1.4.1 Mode B, 288 turns)

| measure | value | B200 reference |
|---|---|---|
| feedback shown | 186 / 288 (65%) | gold decision rate not comparable (different teacher) |
| relevant skills per shown feedback | 1: 99, 2: 87, >2: 0 | gold mean 1.63 dimensions per turn (5-dimension set) |
| skill mix (relevant rows) | APR 136, error-leveraging 78, EI 53, characterization 6, diagnostic 0 | p4 relevant on 61.7%, p1 on 30.7% of gold turns |
| scores (relevant rows) | 2: 239 (88%), 1: 17 (6%), 0: 17 (6%) | p4 gold: 1 = 63%, 2 = 26%, 0 = 11%; p1 bimodal 0 / 2 |
| quality problematic | 15 | — |
| `demonstrated_skills` / `missed_opportunities` disagreeing with `skills_assessment` | 53 of 186 shown feedbacks | — |
| score-2 rows carrying text in `what_could_be_better` (hidden) | 39 | — |

Known 1.4.1 false positives (`student_stability_replay.md` §13.4):
- a Mode B deferral is praised as APR;
- peer redirects ("X, מה דעתך?") are praised;
- occasional praise for closings.

The missed-misconception moment is now caught in 15 of 16 cases.

### 1.4 New finding: displayed rows have no text on the feature branch

**Synthetic 1.4.x Mode B data (3.1, structured output):**

| | 1.4.0 | 1.4.1 |
|---|---:|---:|
| displayed rows | 260 | 273 |
| rows with **no text** | **248 (95%)** | **254 (93%)** |
| shown feedbacks where **every** row is empty | 168 of 180 | 167 of 186 |
| of the empty score-1/2 rows: positive text only in `demonstrated_skills` | 200 | 201 |
| … positive text placed in `what_could_be_better` (hidden for score > 0) | 53 | 56 |
| … no text anywhere | 22 | 32 |

Score-0 rows always have text; score-1 and score-2 rows almost never do.

**Is it the model? No** (102-call diagnostic: the same 51 frozen contexts and the same 1.4.2 prompt and schema; PCK routed to each model):

| PCK model, structured output | score > 0 rows | with text |
|---|---:|---:|
| 2.5 Flash-Lite (1.3.13 settings) | 68 | **0** |
| 3.1 Flash-Lite (production) | 18 | **0** |
| `main` 1.3.0 free-text JSON, 2.5 (hotfix smoke) | 64 | 64 |
| `main` 1.3.0-gemini3 free-text JSON, 3.1 (hotfix smoke) | 36 | 36 |

**Cause:** in `PCK_RESPONSE_SCHEMA`, `skills_assessment` items require only `skill_id` and `is_relevant`. Under schema-constrained decoding, both models omit `evidence` and put it in `demonstrated_skills`. Free-text JSON followed the prompt's example, which includes `evidence`.

**Impact:**
- **No teacher has seen this:** production `main` runs 1.3.0 and is not affected. The pilot audit measured a median of 137 characters per row.
- **It is a deployment blocker for the feature branch.**
- No test caught it: the B23 fixtures include `evidence`, and no test checks displayed row text against model output.

## 2. What B200 contributes and where production differs

Labels follow the handoff: [EXPERT], [RESEARCHER], [EVAL-P1/P4] (577 turns, p1 / p4), [EVAL-5D-SMALL] (71 turns), [INFERENCE].

| topic | B200 | production 1.4.2 | gap |
|---|---|---|---|
| relevance meaning | "should be evaluated"; a relevant skill the teacher failed is **score 0**, not N [RESEARCHER v2.1] | mixed: EI by error presence; p3 "when the teacher *attempts*"; p2 and p5 when "there is an opportunity" (rubric `trigger_description`) | p3 failures become N, not 0; p2 and p5 can be over-selected |
| p5 relevance | strict: only an *actual* leveraging move [RESEARCHER; EVAL-5D-SMALL descriptive] | opportunity-based | error-leveraging is relevant in 78 of 273 rows, often praise for routine moves |
| p4 before an error | allowed for a targeted task on a *likely* misconception [RESEARCHER v2; B200 example E] | Gate 1 requires a quotable error for any feedback | targeted pre-error tasks never get feedback |
| prerequisite chain | p1 and p4 independent ("either or both"); p1 = 0 with p4 = 1 is common in gold [EXPERT gold, example C] | strict chain: a 0 makes all later skills irrelevant; at most 2 relevant | APR cannot be scored when identification was missed |
| continuity | none | Rule 1: an already-praised skill becomes *irrelevant*; Rule 2: following a suggestion means score 2 | Rule 1 contradicts relevance ≠ success (B19) |
| decision | `should_provide_feedback == any(relevant)` [RESEARCHER; holds in all gold] | tied to `pedagogical_quality` (neutral → no feedback), plus B27 | decision and skills can disagree; 21 suppressed turns keep relevant skills by design |
| score meaning | quality of the teacher's move, not error severity [RESEARCHER] | not stated; per-skill bands only | leniency: 88% score 2 |
| bands | v1 expert bands (= production) plus v2.1 rewrites for p5; patterns "illustrative" | v1 bands; patterns listed | close; production lacks v2 boundary rules |
| boundary rules | p1/p2, p2/p3, p3/p4, p4/p5, p1 vs p4 [RESEARCHER] | partial (skill chain only) | missing |
| text | score-conditioned: 2 → "מה קיים"; 1 → "מה קיים" + "המלצה"; 0 → "המלצה" [RESEARCHER codification of one expert's style; experts comply 91%] | `evidence` / `what_could_be_better` fields exist, but the display uses one by score, and score 1 hides the improvement | B12 decided to show both for score 1 |
| text length | experts about 106–113 characters per dimension; prompt-only models about 200 [EVAL] | pilot median 137 characters per row (2.5) | moderate |
| over-selection | prompt-only Gemini 2.8–3.5 dimensions per turn vs gold 1.63 [EVAL-5D-SMALL] | pilot 1.3.0 (2.5): 41% of feedbacks with 3–5 rows; 3.1 synthetic: ≤ 2 | 3.1 complies so far; no code cap |
| p1 precision | prompted Gemini 2.5 FL asserts p1 almost everywhere (P 0.39–0.45) [EVAL; no JSON mode, research prompt] | 3.1 with the production gates *under*-asserted EI on hedged claims until 1.4.1 | **the direction depends on the prompt's gates; do not transfer the number** |
| structured output | JSON mode plus validation; never silently repair [EVAL] | done (C10 / B23) | — except the evidence gap (§1.4) |
| model method | SFT: best p4 score and text brevity, 0 format failures, *worse* decision; DPO / MODPO: ≈ no gain; few-shot: format yes, decisions mixed; label-only Stage A: −21% p1 false positives (p = 0.06) [EVAL] | prompt-only Gemini | trained-model gains are component-specific |
| human ceiling | expert–expert κ: decision 0.41, p1 relevance 0.40, p4 relevance 0.32, p1 score 0.77 (weighted), p4 score 0.22 (weighted); p2 / p3 relevance 0.24 / 0.07 [EVAL, IRR] | — | p2 / p3 / p4 relevance is inherently contested |

## 3. Workstreams and proposed changes

Class codes:
- **P:** prompt-only;
- **D:** deterministic server (or UI) rule;
- **S:** output-contract / schema change;
- **M:** model / config change;
- **T:** future trained-model or architecture work.

"Independent" means the change can be A/B tested alone without its result depending on another pending change.

### W0. Display integrity (blocker, §1.4)

| id | change | class | notes |
|---|---|---|---|
| W0.1 | Make `evidence` and `what_could_be_better` **required strings** on every `skills_assessment` item in the schema. Add one prompt line on field use: score 2 → `evidence`, `what_could_be_better` ""; score 1 → both; score 0 → `what_could_be_better`, `evidence` "" | S + P | Gemini respects `required`; the prompt line prevents swapped fields |
| W0.2 | Validation **warnings** (content-free counters, not failures): a displayed row whose display field is empty; score 2 with improvement text; score 0 with evidence | D | must not create retries; counts only (A17-style) |
| W0.3 | UI fallback: if a score-1/2 row's `evidence` is empty, use `demonstrated_skills[skill].evidence` | D (UI) | safety net only; does not fix score-1 or no-text cases |
| W0.4 | Test: an endpoint and display test asserting that every displayed row has non-empty text, using a fixture shaped like real 3.1 output (no `evidence`) | test | closes the gap that let §1.4 through |

Independent of every other workstream. W0.1 is a prerequisite for W4.

### W1. Relevance and the feedback decision

| id | change | class | notes |
|---|---|---|---|
| W1.1 | State B200 relevance semantics once, for all five skills: relevant = "should be evaluated this turn"; a relevant skill the teacher failed = 0; the score = move quality, not error severity | P | the core B200 transfer |
| W1.2 | Replace the rubric `trigger_description`s with B200 v2 / v2.1 relevance: p1, p2 and p3 need an actual student error in the current or preceding student turn; **p3 missed-opportunity rule** (relevant with score 0 if the turn calls for interpretation and the teacher did not attempt it); **p2 relevant only if the teacher characterises** (otherwise it is p1); **p5 strict** (only an actual leveraging move) | P (rubric text) | p2 and p5 strictness reduces over-selection; the p3 rule adds missed-opportunity rows, so watch volume |
| W1.3 | Make the display decision **derived in code**: shown ⇔ at least one relevant skill survives the display policy (W2.1, B27). Drop "neutral → no feedback" from the prompt's feedback-message rules | D (+ P deletion) | removes the decision ↔ skills disagreement; B27 becomes part of the display policy |
| W1.4 | Continuity Rule 1: "already praised on the same error" becomes **"relevant, not displayed again"**, a display-policy rule in code, instead of "irrelevant" | P + D | resolves B19; keeps the skill data honest for the summary |
| W1.5 | Prerequisite chain: keep it for p2 / p3 (they depend on identification), but let **APR be assessed independently of EI** (B200 p1 ⟂ p4; example C has p1 = 0, p4 = 1) | P | risk: more APR rows; interacts with W2.1 |
| W1.6 | Product decision: allow APR feedback on a **targeted pre-error task** (B200 example E) | P | adds feedback where today there is none; needs expert sign-off; interacts with W1.3 and W2.1 |
| W1.7 | Keep the 1.4.1 hedged / tag-claim clarification and B27 as they are | — | validated (`pck_missed_misconception_experiment.md`) |

W1.1, W1.2 and W1.5 interact; test them together as one "relevance semantics" arm, measured per skill. W1.3 and W1.4 are deterministic and can be shipped independently, but they change displayed volume, so measure with W2.1.

### W2. Skill selection

| id | change | class | notes |
|---|---|---|---|
| W2.1 | **Display policy in code:** at most 2 rows (B8); if more are relevant, choose by priority: a missed EI (score 0) first, then the lowest-scored relevant skill, then the chain order. Optionally one "primary" row (expert note: "the most useful point") | D | 3.1 already gives ≤ 2 here, so this is a safety net; makes B8 enforceable |
| W2.2 | Add the B200 **boundary rules** (p1/p2, p2/p3, p3/p4, p4/p5, p1 vs p4: "noticing alone is not an adapted response; a turn may show either or both") | P | targets the known EI ↔ APR and p2 ↔ p3 confusions |
| W2.3 | Do **not** add exclusivity rules such as "never EI together with APR" | — | B200: 63.5% of model-EI-on-gold-APR cases are legitimate; the rule collapsed p1 F1 from 0.678 to 0.184 |
| W2.4 | Late-conversation EI drift: "re-addressing an error already identified earlier is not a new EI unless a new error appears" | P (experimental) | untested in B200; may cost recall; measure on late turns only |
| W2.5 | Peer redirects and deferrals ("X, מה דעתך?", "נבדוק את זה עוד רגע"): an explicit APR example for score 1 (generic redirect) vs 2 (targeted counterexample) rather than praise | P | addresses the 1.4.1 false-positive pattern; belongs with W3 |

### W3. Score calibration

| id | change | class | notes |
|---|---|---|---|
| W3.1 | Rewrite each skill's 0 / 1 / 2 band with an explicit **1-vs-2 contrast**: "1 = right direction but generic / implicit / missing X; 2 = explicit and targeted to this student's specific error". Keep the expert v1 bands as the anchor and add the B200 v2.1 p5 bands | P | main lever against the 88%-score-2 leniency |
| W3.2 | **Synthetic contrast demonstrations** (4–6 short, synthetic, B200-modelled: EI 2 / APR 2; EI 1 / APR 1; EI 0 / APR 1; EI 2 / APR 0; APR 2 pre-error; no feedback mid-lesson) | P (few-shot) | B200: demos teach format and can *hurt* decisions for Flash-Lite, so A/B separately from W3.1; synthetic avoids using participant data |
| W3.3 | Remove the leniency drivers: Rule 2 ("followed the suggestion → score 2" regardless of quality) becomes "score the current move on the rubric"; resolve the conflict between "Right Idea, Soft Execution → neutral" and the skill scores | P | interacts with W1.4 |
| W3.4 | Derive `demonstrated_skills` / `missed_opportunities` **in code** from `skills_assessment` (score ≥ 1 / score 0) | D | removes 53/186 inconsistencies; also changes what the students see, so measure student steering |
| W3.5 | Decide where `pedagogical_quality` comes from (it steers students): keep it model-derived, but add a **consistency warning** when quality is positive while a displayed row is 0, or problematic while all rows are 2 | D (warning) | do not derive it in code yet: student-behaviour coupling |

### W4. Feedback text

| id | change | class | notes |
|---|---|---|---|
| W4.1 | **Score-conditioned row text** (the B200 template, in the fields we already have): 2 → `evidence` (what was done well; no invented criticism); 1 → `evidence` **and** `what_could_be_better`; 0 → `what_could_be_better` (what was missing plus one concrete alternative) | P + S (W0.1) | the B200 template without the marker strings, so no marker parsing |
| W4.2 | **Display score 1 as two lines** in the sidebar (B12 decided): "✓ what was done" / "→ what to add" | D (UI) | needs W0.1; behaviour change, so version it |
| W4.3 | Length: one sentence per field, about ≤ 120 characters (B200 expert mean 106–113); name the student and the claim; second person | P | measure with content-free length telemetry |
| W4.4 | Score 2 must not include a recommendation (W4.1) **pending expert confirmation**: B200 experts added one in 21 of 75 p1 score-2 texts | product decision | ask the experts; the default is no recommendation |
| W4.5 | `feedback_message_hebrew`: either stop generating it (saves about 300 output tokens and latency), or keep it short as the summary's per-turn note | S | interacts with the summary (B14) and the PCK history (B19); decide in W5 |

### W5. Consistency

| id | change | class | notes |
|---|---|---|---|
| W5.1 | `skills_assessment` is the **single source of truth**; the decision (W1.3), `demonstrated` / `missed` (W3.4) and the displayed rows (W2.1) are all derived from it in code | D | eliminates whole classes of contradictions |
| W5.2 | Content-free consistency counters in PCK telemetry: rows displayed, empty display text, score / field mismatch, >2 relevant, quality-vs-score warning, message naming a non-relevant skill | D | the PCK equivalent of the student garble counters |
| W5.3 | Summary alignment (later; not a redesign now): the summary already receives the displayed rows (C1 fix). Once W0 / W4 give every row the right text, the summary inherits it. Re-check B14 after v2 | — | defer |

### W6. Model, config and architecture

| id | change | class | notes |
|---|---|---|---|
| W6.1 | Keep **3.1 Flash-Lite** for all W0–W5 experiments | — | separates semantic changes from model changes |
| W6.2 | Decision stability: test **thinking LOW vs MINIMAL** for PCK only (scores are reasoning-heavy), then possibly a lower temperature | M | B200 used temperature 0.1. 3.x guidance prefers default sampling; a lower temperature did not help student garbling, but PCK decisions are a different task. The A arm was flaky on one shown case (3/6) |
| W6.3 | **Decouple student steering from teacher feedback:** Part A (student impact) and Part B (feedback) in separate calls or prompts | T (architecture) | reduces coupling (W3.4 / W3.5 change student behaviour today); costs a second call (about +2.4 s, run in parallel with the student call?) |
| W6.4 | Two-stage feedback (labels / scores, then text only for displayed rows) | T | B200 Stage A: −21% p1 false positives, p = 0.06, suggestive; consider only if W1–W3 leave EI precision low |
| W6.5 | Stronger Gemini for PCK only (3.1 Flash / Pro) | M | B200 never tested it; run only after the gold set exists |
| W6.6 | Trained model (Gemma SFT-like) | T | B200: best p4 score agreement, shorter expert-like text, 0 format failures, but **worse decision** than zero-shot and no p1-precision gain; needs self-hosting |
| W6.7 | DPO / MODPO | — (do not pursue) | ≤ about 15 examples of gain; plain DPO matched the rubric margin |

## 4. Evaluation design

**Data:**

| set | content | use | status |
|---|---|---|---|
| E1 frozen contexts | the 51 contexts of `pck_missed_misconception_experiment.md` (18 missed-misconception + 33 controls), rebuilt exactly | regression for decisions and B27 | exists (synthetic) |
| E2 Mode B | 24-conversation runs on the current harness | display volume, row text, downstream student behaviour | exists (synthetic) |
| E3 synthetic gold | about 120–150 frozen Mode B turns stratified by move (opening, direct question, bare probe after a misconception or after correct, peer redirect, deferral, explanation, check / content question, drawing question, closing), labelled in the B200 format (decision; per skill N / 0 / 1 / 2; row text) by the experts. Provisionally researcher-labelled, then expert-reviewed | relevance P/R per skill, score agreement, text quality | **to build**; needed for W1–W3 |
| E4 B200 gold | 577 p1 / p4 turns (+71 five-dimension turns) from pilot conversations | strongest external check on p1 / p4 relevance and score | **participant data**: use only with your explicit approval, locally, reporting aggregates only, never committed |

**Metrics, per component** (B200 lesson: never collapse them, and never use text similarity as a relevance proxy):
- **Decision:** shown-rate per move type; false-positive rate on controls; recall on missed-misconception contexts.
- **Relevance:** per-skill precision / recall / F1 against gold; skills per displayed feedback.
- **Score:** exact agreement, MAE, quadratic κ per skill; score distribution (target: away from 88% score 2 toward gold-like shapes, with p4 mostly 1).
- **Text:** every displayed row non-empty; field-by-score compliance (W4.1); length per field; second person; names the student or claim; no invented criticism on score 2. Human rating (experts, small sample) for usefulness: B200 had none.
- **Consistency:** the W5.2 counters.
- **Side effects:** output validity, retries, latency, and student behaviour in Mode B (premature correctness, persistence, resolution), because Part A steers the students.

## 5. Interaction map

```
W0.1 (required text fields) ──► W4.1 (score-conditioned text) ──► W4.2 (score-1 two-line UI)
W1.1 + W1.2 + W1.5 (relevance semantics) ──► W2.1 (display policy / cap) ◄── W1.3 (decision from skills) ◄── B27
W3.1 (bands, 1 vs 2) ──► W4.2 matters only if score 1 occurs (today 6%)
W3.4 / W3.5 (derived demonstrated/missed, quality) ──► student steering (Part A) ──► W6.3 decoupling
W1.4 (continuity) ↔ W3.3 (Rule 2)      W2.2 / W2.5 (boundaries, peer redirect) ↔ W3.1
```

**Independent:** W0 (all), W5.2 (counters), W6.2 (thinking level, after the semantics settle).

**Interacting:**
- relevance (W1.1 / W1.2 / W1.5 / W1.6) with the display policy (W2.1, W1.3);
- score bands (W3.1) with text (W4.1 / W4.2);
- anything that changes `demonstrated_skills`, `missed_opportunities` or `pedagogical_quality` with student behaviour.

## 6. What is achievable where

| achievable on the current 3.1 path (prompt / schema / rules) | needs a stronger model, a trained model or a new architecture |
|---|---|
| W0 (text on every row), W4.1 / W4.3 (score-conditioned, shorter text): B200 shows the format is promptable, and JSON mode removes the parsing risk | expert-level **p1 score** agreement (experts κ_w 0.77; all models 0.20–0.57) |
| W1.3, W1.4, W2.1, W3.4, W5: deterministic and fully controllable | consistent **p2 / p3 / p4 relevance** that experts agree with: experts themselves have κ 0.06–0.32, so a clearer expert guideline and more double-annotated data matter more than the model |
| W1.1 / W1.2 / W2.2 relevance semantics, W3.1 calibration: plausible gains, to be measured on E3 | **EI precision** under over-assertion (B200: stuck at 0.62–0.68 even after SFT / DPO; Stage A suggestive) |
| W6.2 thinking-level check | text that matches expert style closely (SFT text was shorter and closer; prompts get partway) |
| | late-conversation EI drift (no prompt or position fix worked in B200) |

## 7. Answers

### 7.1 Main weaknesses of the current PCK system

1. **Empty displayed rows on the feature branch** (§1.4): 93–95% of rows have no text. This is a contract gap from 1.3.4, invisible to tests.
2. **Score-1 rows hide the improvement suggestion** (B12), and score-2 positive text is often misplaced.
3. **Relevance semantics diverge from B200:**
   - p3 is attempt-based, so a failed interpretation becomes N;
   - p2 / p5 are opportunity-based, so they are over-selected (error-leveraging in 78 of 273 rows);
   - the prerequisite chain blocks APR when EI is missed;
   - continuity Rule 1 turns success into N.
4. **The decision is not derived from the skills** (quality-based rule plus B27), so decision, skills and `demonstrated` / `missed` can contradict (53 of 186 feedbacks).
5. **Score inflation:** 88% score 2, versus gold where p4 is mostly 1. Peer redirects and deferrals are praised as APR.
6. **The composed message is never shown**, yet it is generated, stored and fed back.
7. **Coupling:** the same fields steer the students, so every feedback change is also a student-behaviour change.
8. **No gold-based evaluation of the production prompt exists**, synthetic or real. B200 tested a research prompt on 2.5 without JSON mode.

### 7.2 B200 findings that transfer directly

- Relevance = "should be evaluated"; a relevant failed skill = 0; the score is move quality, not error severity.
- The p3 missed-opportunity rule; p2 only when the teacher characterises; strict p5; p1 / p2 / p3 need an actual error; p4 may be relevant before an error (the last one only with expert sign-off).
- The boundary rules (p1/p2, p2/p3, p3/p4, p4/p5, p1 vs p4), and no exclusivity rule between EI and APR.
- Decision invariant `shown ⇔ any relevant (after the display policy)`.
- Over-selection is the default failure of prompt-only models, so cap in code.
- Structured output plus validation, separating coercion from validation and logging every coercion. Already done, except the evidence gap.
- Evaluate each component separately; BERTScore ≠ relevance.
- Do not truncate history to fix accuracy; turn position in the prompt did not help.
- Do not pursue DPO / MODPO.

### 7.3 B200 findings NOT to transfer blindly

- **"Gemini over-asserts p1" (P 0.39–0.45):** measured on 2.5 FL, without JSON mode, with the research prompt. Production 3.1 with its gates did the *opposite* (silence) until 1.4.1. The direction depends on the gates.
- **The exact template markers (`מה קיים:` / `המלצה:`):** a researcher codification of one expert's style (the second expert complied 48%). Use the *content* rule in separate fields, not marker strings, and confirm score-2 practice with the experts.
- **Few-shot demos:** they help format but cut Flash-Lite's p1 precision. Production already has format via JSON mode, so demos must earn their place on decision and score metrics. The handoff's demo turns are participant data.
- **"SFT is better":** only for the p4 score and text; worse on the decision. Component-specific, and needs self-hosting.
- **Gold label distributions as targets:** gold comes from a different teacher population (pilot teachers) and mostly one annotator. Synthetic Mode B turns have scripted, cleaner moves, so "88% score 2" is partly legitimate there (the scripted explanation is good). Calibrate on E3 labels, not on B200 rates.
- **Turn-position or late-drift fixes:** they did not work in B200, so do not expect a prompt fix.
- **The temperature 0.1 setting:** a different model family. For 3.x, test thinking level first (W6.2).

### 7.4 Prioritised experiments

| # | experiment | changes | class | depends on | data |
|---|---|---|---|---|---|
| X1 | **Row-text contract** (§8–§9) | W0.1 (+ W0.2 counters, W0.4 test) | S + P (+ D) | — | E1, E2 |
| X2 | Score-conditioned text + score-1 two-line display + length | W4.1, W4.2, W4.3 | P + D (UI) | X1 | E1, E2, small expert rating |
| X3 | Consistency layer: derived decision, derived `demonstrated` / `missed`, display cap, continuity as display rule, counters | W1.3, W1.4 (D part), W2.1, W3.4, W5.1, W5.2 | D | X1; measure student effects | E1, E2 |
| X4 | Build the synthetic gold set E3 (expert-reviewed) | — | data | can start now, in parallel | — |
| X5 | Relevance semantics (one arm) | W1.1, W1.2, W1.5, W2.2 (+ W1.4 prompt part) | P | X3, X4 | E3, E1, E2 |
| X6 | Score calibration | W3.1, W3.3, W2.5; then W3.2 demos as a separate arm | P | X5, X4 | E3, E2 |
| X7 | PCK thinking level (MINIMAL vs LOW) | W6.2 | M | X5 / X6 settled | E3, E1 |
| X8 | Decide, with evidence: pre-error APR (W1.6), `feedback_message_hebrew` (W4.5), decoupling (W6.3), two-stage (W6.4), stronger / trained model (W6.5 / W6.6) | — | product / T | X5–X7 results; E4 only with approval | — |

## 8. Recommended first experiment

**X1: row-text contract.** Fix what the teacher sees, without touching any decision or score. It is a deployment blocker, small and independent, and every later text experiment depends on it.

- **A:** current 1.4.2.
- **B:**
  - `PCK_RESPONSE_SCHEMA` `skills_assessment.items.required` gains `evidence` and `what_could_be_better` (strings);
  - one prompt sentence on field use: score 2 → `evidence`, improvement ""; score 1 → both; score 0 → improvement, evidence "";
  - the prompt's JSON example is updated to match;
  - no other prompt, rubric, gate, guard or display change.
- **Run:** the 51 frozen contexts (E1; 6 repeats for the 18 target cases, 3 for controls), plus one 24-conversation Mode B run per arm for display volume and student side effects.
- **Content-free measurement** of displayed text per row (the sidebar rule applied to the returned analysis), field placement by score, lengths, decisions and scores.

## 9. Success metrics for X1

| metric | target (B vs A) |
|---|---|
| displayed rows with non-empty display text | **100%** (A: about 5–7%) |
| score-2 rows: `evidence` non-empty; improvement empty or absent | ≥ 98% |
| score-1 rows: both fields non-empty | 100% (feeds X2) |
| score-0 rows: improvement non-empty with one concrete alternative ("יכולת…" or an equivalent) | ≥ 95% |
| **no change in decisions:** shown-rate per E1 group within ±1 call of A; missed-misconception cases 48/48 and 60/60 kept; B27 suppressions unchanged | required |
| **no change in scores:** score distribution and skills-per-feedback within noise of A (no shift of more than 5 points in score-2 share) | required |
| output validity (B23), retries, `MAX_TOKENS` | 100% valid; no increase in 2-attempt calls |
| latency and output tokens | p50 latency +≤ 15%; output tokens may rise (text now present) |
| text quality spot-check (one reviewer, about 40 rows): second person, names the move or student, no invented criticism on score 2, ≤ about 1–2 sentences | ≥ 90% acceptable |
| Mode B student side effects | premature correctness, persistence and resolution within noise of 1.4.1 (§13) |

**If B passes:** implement as a versioned change (contract + prompt line + W0.2 counters + W0.4 test) before any feature-branch deployment.

**If it fails** (for example, the model fills required fields with filler): fall back to W0.3 (UI uses `demonstrated_skills` evidence) as the minimum, and treat X2 as the real fix.

## 10. Limitations of this plan

- **One reviewer**, and synthetic data only. B200 numbers are second-hand from the handoff, and its gold is participant data that was not read.
- **Synthetic Mode B teachers are scripted:** move types are cleaner than pilot teachers', and the distributions in §1.3 are not production rates.
- **The §1.4 diagnostic** used 2 repeats of 51 contexts per model. The effect is unambiguous (0 of 86 rows with evidence under the schema; 100 of 100 without), but it was not tested on real pilot transcripts.
- **Expert input is needed** for:
  - W1.6 (pre-error APR);
  - W4.4 (score-2 recommendations);
  - E3 labels.

**Files** (scratchpad `c39/`): `pck_model.cjs` (diagnostic preload: PCK routed to 2.5 with 1.3.13 settings), `bench/pck_ab.bench.js`, `contexts.json`, `results-{25,31}.jsonl`.
