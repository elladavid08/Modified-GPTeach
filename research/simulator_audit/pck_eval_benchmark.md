# Frozen PCK evaluation benchmark (E3 v1, synthetic)

> **v1.1.0 (2026-10-13, for X3):** 7 high-confidence feedback-history continuity cases (`CONT-*`) added, with a new constraint `no_repeat_praise:<skill>` (shown feedback must not display that skill as praise again; relevance not asserted). Now **116 cases: 95 high, 21 review**. The 109 v1.0.0 cases are byte-identical (stripping the two additive fields `feedback_history_kind` / `source.recorded_prefix_turns` reproduces the v1.0.0 sha256 `d470bf14…`). The continuity cases use a recorded prefix plus one hand-written turn and a synthetic feedback history. This closes gap 1 of §8. Details and 1.4.3 results: `pck_consistency_layer_experiment.md` §0. Figures below describe v1.0.0 unless noted.

Status: built 2026-10-13 on committed 1.4.3 (`f5ed2b6`).
- Research only: not wired into production tests; no production, prompt, schema, model or `SYSTEM_VERSION` change.
- **Synthetic data only:**
  - replay-harness Mode B runs (B-baseline-1.4.0 / 1.4.1) plus hand-written teacher turns;
  - no participant data, nothing from `research/pck_feedback/`, no B200-labelled turns (the handoff's example turns A–F are excluded and checked absent by a test).
- **Labels are written from the rubric, never from model output.** Plan: `pck_feedback_v2_plan.md` §4 (this is E3 / X4, researcher-labelled, to be expert-reviewed).

## Summary

- **Size:** 109 frozen teacher-turn cases across all six scenarios.
  - Confidence: **88 high**, **21 needs expert review** (kept in a separate bucket).
  - Sources: 67 real Mode B turns and 42 hand-written turns on real Mode B prefixes.
- **Coverage:** every decision category and skill cell in the brief, plus the cases behind earlier failures (false praise on "?" and on "שאלה טובה, נבדוק…", 1→2 score inflation, contradictory skill lists, over-selection).
- **Label scheme:** labels assert only what the rubric settles. Each case states:
  - the decision;
  - per skill whether it is *required*, *not relevant* or *not asserted*;
  - for required skills, an exact score or an allowed range;
  - optional case constraints (e.g. no score 2).
- **Files** (`research/simulator_audit/pck_eval/`):
  - the self-contained fixture `pck_eval_benchmark.json`;
  - a provenance builder;
  - structural and scorer tests;
  - a replay runner;
  - a scorer.
- **A first 1.4.3 replay (3 repeats, evaluation only, not labels) separates the known behaviours cleanly:**
  - missed misconceptions shown 54/54, correct-answer controls hidden 42/42;
  - but error-identification asserted on questions with no student error;
  - rubric band-1 moves scored 2 (case constraints held in 30% of outputs);
  - diagnostic interpretation rarely relevant (6/15);
  - false praise on "?".
- **It is sufficient to evaluate X3** (the deterministic consistency layer), except for the continuity rule (W1.4), which has no cases yet, and for student-steering effects, which need Mode B.
- **X5 / X6 need the expert-review bucket adjudicated first** (§7). Several of its questions decide the relevance semantics X5 would adopt.

## 1. Label basis

**Target semantics:**
- the **expert v1 rubric** (production `server/universal_pck_skills.js`: definitions and 0/1/2 bands);
- the **B200 relevance and boundary rules** (`research/b200_handoff/pck_and_feedback_rules.md` §2–§4);
- **decision = any relevant skill**.

These are the semantics X5 / X6 are meant to move production toward, so the benchmark measures that distance. Where they differ from production 1.4.3, the case records it (`production_divergence`, `rules`), so results can be sliced by rule.

| rule (tag) | statement | production 1.4.3 |
|---|---|---|
| p1–p3 need an error | p1 / p2 / p3 are relevant only with an actual student error in the current or immediately preceding student turn | v1 trigger for EI agrees; p2 / p3 / p5 triggers are opportunity- or attempt-based |
| `B200-v2-p2-strict` | p2 is relevant only if the teacher characterises the error type; signalling "wrong" is p1 | chain makes p2 "due" after identification (relevant 0) |
| `B200-v2-p5-strict` | p5 only for an actual leveraging move, not an opportunity | opportunity-based |
| `B200-p1-perp-p4` | p1 and p4 are assessed independently; p1 = 0 with p4 relevant is valid | strict chain: "if skill 1 = 0, give feedback on skill 1 only" |
| `B200-p3-vs-p4`, `B200-p4-vs-p5`, `B200-p1-vs-p4` | the boundary rules | not in the prompt |
| `B200-v2.1-p3-missed-opportunity` | p3 relevant with 0 when the turn calls for interpretation and none is attempted | p3 only when attempted (**kept for expert review**) |
| `B200-greeting-all-N` | greetings / openings: nothing relevant | agrees |
| `1.4.1-hedged-tag-claims` | a hedged or tag-question claim is a student error | agrees since 1.4.1 |

**Score labels:**
- Score = quality of the teacher's move, not error severity.
- Where a teacher turn uses a rubric band pattern literally (e.g. "האם זה תמיד נכון לדעתך?" EI 1, "מה ההגדרה של מלבן?" APR 1, "נראה שאתם מתבססים על תכונה אחת" DI 1), that band is the label.
- Otherwise a range is given (e.g. a telling explanation: APR 0–1, never 2).

**Not used as labels:**
- current Gemini output;
- B200 gold distributions (the set is not shaped to match them);
- the handoff's labelled example turns.

## 2. Construction

- **Contexts:**
  - every case is a real synthetic conversation prefix from a recorded Mode B run (scenario, cast, full teacher / student history, drawings by harness asset id);
  - the feedback history production would send is rebuilt from the recorded analyses of earlier turns. It is input context only, and replay can drop it.
- **The teacher message** is either:
  - the recorded Mode B turn (67 cases, including the 51 validated frozen contexts of the missed-misconception / X1 / X2 experiments and 6 turns behind 1.4.1 failures), or
  - a **hand-written turn** on the same prefix (42 cases), written to hit one rubric cell. It replaces the recorded teacher message; earlier turns are untouched.
- **Each case stores:**
  - scenario and the turns needed to interpret it (`recent_student_turns`, `history`);
  - the current teacher message;
  - the expected decision, skills and scores;
  - a rubric rationale;
  - confidence;
  - for review cases the expert question, and for high cases any deliberately open point (`open_question`);
  - the prior production behaviour where known.
- **Freezing:**
  - the fixture is the frozen artifact (version 1.0.0, sha256 `d470bf14…cfdd9e`);
  - `build_benchmark.py` documents how it was made. It needs the git-ignored PCK captures of the four baseline runs and is not needed to use the benchmark.

## 3. Coverage

**Overall:**

| | cases | high | review |
|---|---:|---:|---:|
| all | **109** | **88** | **21** |
| decision asserted: feedback / no feedback / not asserted | 57 / 27 / 25 | 52 / 27 / 9 | 5 / 0 / 16 |
| hand-written turns / recorded turns | 42 / 67 | | |
| by scenario 1–6 | 24 / 16 / 14 / 13 / 21 / 21 | | |

**By skill (high bucket):**

| skill | required (allowed scores) | must not be relevant | not asserted |
|---|---|---:|---:|
| error-identification | **34**: 0 ×21, 1 ×3, 2 ×6, 1–2 ×4 | 39 | 15 |
| error-characterization | **4**: 2 ×4 | 63 | 21 |
| diagnostic-interpretation | **5**: 2 ×4, 1 ×1 | 47 | 36 |
| adapted-pedagogical-response | **15**: 0 ×2, 1 ×3, 2 ×3, 0–1 ×4, 1–2 ×3 | 30 | 43 |
| error-leveraging | **3**: 2 ×3 | 85 | 0 |

The review bucket adds required EI ×2, EC ×1 and DI ×1, and 21 open APR assertions.

**By category in the brief** (cases; high / review):

| category | n | high / review | category | n | high / review |
|---|---:|---|---|---:|---|
| greeting / closing / procedural | 9 | 9 / 0 | EC: characterises | 5 | 4 / 1 |
| correct answer + bare acknowledgement | 14 | 14 / 0 | EC: merely identifies | 2 | 1 / 1 |
| genuine question + acknowledgement | 5 | 2 / 3 | EC: no attempt | 1 | 1 / 0 |
| missed misconception | 18 | 18 / 0 | DI: interprets | 4 | 4 / 0 |
| explanation after misconception | 6 | 2 / 4 | DI: fails when warranted | 1 | 0 / 1 |
| partial explanation | 1 | 1 / 0 | DI: simple correction (not interpretation) | 1 | 1 / 0 |
| good explanation / response | 2 | 2 / 0 | DI: general observation (score 1) | 2 | 1 / 1 |
| peer-directed question | 7 | 1 / 6 | APR: well adapted | 3 | 3 / 0 |
| postponing a question | 5 | 3 / 2 | APR: partial | 3 | 3 / 0 |
| EI: clear error identified | 6 | 6 / 0 | APR: generic correct, not adapted | 3 | 3 / 0 |
| EI: error missed | 20 | 20 / 0 | APR: after missed EI (chain must not block) | 2 | 2 / 0 |
| EI: hedged misconception | 9 | 9 / 0 | APR: direct correction | 2 | 2 / 0 |
| EI: tag-question misconception | 9 | 9 / 0 | APR: pre-error targeted task | 5 | 2 / 3 |
| EI: no actual student error | 19 | 18 / 1 | EL: genuine leveraging | 3 | 3 / 0 |
| EI: hint (score 1) | 4 | 3 / 1 | EL: ordinary correction / check question | 5 | 5 / 0 |
| | | | EL: ambiguous activity | 4 | 0 / 4 |

**Earlier failure modes:**

| failure | cases | high / review |
|---|---:|---|
| false praise on "?" | 3 | 3 / 0 |
| false praise on "שאלה טובה, נבדוק…" | 6 | 3 / 3 |
| score inflation 1 → 2 | 15 | 10 / 5 |
| contradictory skill lists (1.4.x) | 3 | 2 / 1 |
| over-selection | 7 | 7 / 0 |

## 4. Straightforward boundaries (high confidence)

- **No student error → p1–p3 not relevant.** This covers:
  - correct answers or restatements followed by a bare acknowledgement, "?" or praise;
  - openings, closings, logistics, summary requests;
  - planned questions asked before anyone erred. 1.4.x asserts EI 2 on those.
- **Missed misconception.** A voiced (also hedged or tag-question) misconception followed only by an acknowledgement, a validation or moving on is EI relevant with score 0. Nothing can be characterisation or leveraging.
- **Literal band patterns.** "האם זה תמיד נכון לדעתך?", "בואו נבדוק את זה", "מה ההגדרה של מלבן?", "תחשבו שוב", "נראה שאתם מתבססים על תכונה אחת" are band 1. Explicit "הטענה שלך אינה נכונה" / "זה לא נכון" is EI 2.
- **Telling ≠ adapting.** "זה לא נכון. ריבוע הוא כן מלבן…" is EI 2 with APR 0. A correct but generic recital, or a telling explanation, is APR 0–1, never 2. A deferral or generic redirect can never be 2.
- **Characterisation** naming the type ("תנאי הכרחי ולא מספיק", "מקרה פרטי של", "הכללת יתר") is p2 = 2. A bare "wrong" is p1 only.
- **Interpretation** articulating the assumption ("נראה שאת מניחה ש…", "את מזהה לפי איך שהוא נראה") is p3 = 2. Without an action it is not p4.
- **Leveraging** that explicitly turns the earlier error into a transferable principle or strategy is p5 = 2. A check question, a local counterexample or a confirmation is not p5.
- **p1 ⟂ p4.** A validation or bare acknowledgement followed by a targeted task is EI 0 *and* APR relevant (1–2).

## 5. Genuinely ambiguous (expert-review bucket)

| question | cases |
|---|---|
| **Error window for explanations:** is a misconception voiced two turns earlier "present" for p1–p3? Is a telling / definition explanation APR 0 or 1, and a teacher-drawn counterexample APR 2? Is a closing general statement p2 or p5? | `rev-explain-*` ×4 |
| **Leaning questions as errors:** is "אולי גם ההפך נכון?" or an unnecessary-condition hypothesis a student error (EI 0 after "אוקיי") or a genuine question? | `rev-converse-question-*` ×2, `rev-hypothesis-question-s2-r1d0-T9`, `rev-EI-question-form-s4-T2` |
| **Pre-error APR (W1.6):** do targeted planned questions before an error get APR feedback, and which score? | `rev-deferral-targeted-*` ×2, `rev-EI-question-form-s4-T2`; open points of `EI-no-error-planned-q-s2/s5` |
| **p3 missed-opportunity rule:** does a turn where the student stated their reasoning "call for" interpretation (p3 = 0)? | `rev-DI-missed-warranted-s2` (and the unasserted p3 on all 18 missed-misconception cases) |
| **Peer redirect / "why":** is "תמר, מה דעתך?" after a misconception EI 0, EI 1 or APR 1? Is "למה אתה חושב כך?" p3, p4 1 or EI 1? | `rev-peer-redirect-s1-T4`, `rev-DI-generic-why-s1` |
| **p2 precision:** is "you are mixing necessary and sufficient" p2 1 (as the rubric lists it) or 2 when that is exactly the error? Is "confusion about what a rectangle is" p2 1 or p1 only? | `rev-EC-imprecise-s2`, `rev-EC-vague-confusion-s3` |
| **p5 after correction:** is an analogy, the converse question, "give an example of a rectangle that is not a square", or a new shape on the board leveraging (p5 1–2), another local example, or nothing? | `rev-EL-analogy-s6`, `rev-EL-activity-*` ×3 |
| **Teacher-introduced error:** does a wrong "correction" of a correct answer get feedback, and under which skill, when no student erred? | `rev-EI-teacher-wrong-s4` |
| **Re-addressing a corrected error (W2.4)** | `rev-EI-late-readdress-s1` |

**High cases also leave open points as "not asserted"** rather than guessing:
- p3 and p4 on bare-acknowledgement turns;
- APR on check questions and deferrals;
- p1 on implicit-identification turns.

These are excluded from scoring, not counted as agreement.

## 6. Using it

```sh
# structural + scorer tests (no model calls; not part of npm test)
node --test research/simulator_audit/pck_eval/test/

# replay through the real client against a LOCAL server (cd server && PORT=3101 node server.js)
PCK_EVAL_RUN_ID=<id> PCK_EVAL_REPS=3 npx jest --config research/simulator_audit/pck_eval/jest.replay.json
#   optional: PCK_EVAL_BUCKET=high | needs_expert_review, PCK_EVAL_ONLY=<ids>, PCK_EVAL_NO_FEEDBACK_HISTORY=1

# score (components reported separately, per bucket; violations listed per case)
node research/simulator_audit/pck_eval/score.js research/simulator_audit/pck_eval/results/<id>.jsonl
```

**Replay details:**
- Results and manifests go to `pck_eval/results/` (git-ignored).
- Each manifest records the fixture hash, `SYSTEM_VERSION`, the commit and any modified production files.
- A prompt or config variant is tested the way X1 / X2 were: an analysis-only server preload, or a branch.

**What the scorer reports:**
- decision agreement, false positives and false negatives;
- decision = any(relevant);
- per skill: required-relevant recall, not-relevant respected (raw and displayed-only), score in the allowed set, exact score;
- case constraints, and agreement by tag and rule.

## 7. First replay: committed 1.4.3 (evaluation, not labels)

Unmodified 1.4.3 server, 3 repeats, 327 calls, 0 failures. 105 of 109 cases give the same decision on all three repeats.

| high bucket | 1.4.3 |
|---|---:|
| decision agreement | 218 / 237 (92.0%) |
| false positives / false negatives | 6 / 81 (7.4%) / 13 / 156 (8.3%) |
| case constraints held (no score 2 / no positive score) | **10 / 33 (30.3%)** |
| EI: required relevant / not-relevant respected / score in range | 89.2% / 92.3% / 83.2% |
| EC: required / not-relevant | 7 / 12 / 97.4% |
| DI: required / score in range | **6 / 15** / 3 / 6 |
| APR: required / not-relevant / score in range | 68.9% / 84.4% / **44.7%** |
| EL: required / not-relevant | 9 / 9 / 94.1% |

**What it shows:**
- **Agrees on:**
  - missed misconceptions (54/54, the 1.4.1 behaviour);
  - correct answer + acknowledgement (42/42), openings / closings / logistics;
  - explicit identification, p1 ⟂ p4 cases, genuine leveraging.
- **Score inflation:** band-1 moves are scored 2 (EI hint 6/6, "מה ההגדרה של מלבן?" 3/3, DI general observation 3/3, partial explanation APR 2 3/3).
- **EI over-assertion** on planned questions with no student error (6/6).
- **False praise:** confirming a correct answer and a "?" are shown with APR (6 outputs).
- **Under-detection:**
  - DI is rarely relevant even when the teacher articulates the assumption;
  - an explicit inclusion characterisation and a generic correct recital are hidden altogether.

**Check for X3 (deterministic):** applying "decision = any relevant skill" to these outputs offline, with no display policy, moves 9 outputs to "shown". All 9 are bare "נכון" / "יפה" praise that B27 hides today, so agreement would drop from 218 to 209 of 237. The benchmark therefore exposes X3's main risk: B27 must stay part of the display policy.

## 8. Is it sufficient for X3?

**Yes, for the parts of X3 that act on PCK output.** X3 is deterministic, so it can be evaluated offline on stored outputs (this baseline or any later replay), with no new model calls.
- derived decision: 79 high cases assert the decision, 27 of them negative controls;
- `demonstrated` / `missed` derivation: 3 recorded contradiction cases plus the consistency metric;
- display cap / over-selection: not-relevant checks in every case;
- consistency counters.

**Not covered:**
1. ~~**Continuity as a display rule (W1.4):** no case has a skill already praised in the feedback history.~~ Closed in v1.1.0 (7 `CONT-*` cases).
2. **Student-steering effects of derived `demonstrated` / `missed`:** need the Mode B A/B (E2).

**For X5 / X6 the set is necessary but not yet sufficient:**
- adjudicate the review bucket (§9);
- then grow the thin cells: required EC (4), DI (5) and EL (3) cases, and exact score-1 cells (EI 3, DI 1, APR 3). Target about 8 per skill × score cell for EI / APR / DI before calibrating X6.

## 9. Recommended for expert adjudication (Inbal / Othman / Kobi), before X5 / X6

In priority order. Every item names the case ids, and each case carries its context, the teacher turn and the precise question.

1. **Relevance semantics that X5 would encode:**
   - the error window for explanation turns and the APR score of telling / definition explanations (`rev-explain-*` ×4; this also fixes the ranges in `explain-direct-*`);
   - the p3 missed-opportunity rule (`rev-DI-missed-warranted-s2`);
   - whether hesitant leaning or converse questions are errors (`rev-converse-question-*` ×2, `rev-hypothesis-question-s2-r1d0-T9`, `rev-EI-question-form-s4-T2`).
2. **Pre-error APR (product decision W1.6):** `rev-deferral-targeted-*` ×2 and the open points of `EI-no-error-planned-q-s2/s5`.
3. **Score calibration for X6:**
   - `rev-EC-imprecise-s2` (1 vs 2), `rev-EC-vague-confusion-s3`;
   - `rev-peer-redirect-s1-T4`, `rev-DI-generic-why-s1`;
   - p5 after correction (`rev-EL-analogy-s6`, `rev-EL-activity-*` ×3).
4. **Product questions:** `rev-EI-teacher-wrong-s4` (teacher-introduced error), `rev-EI-late-readdress-s1` (W2.4).
5. **Confirm the rules themselves, not only cases:**
   - the B200 v2 rules adopted as target semantics (p2 strict, p5 strict, p1 ⟂ p4, p1–p3 need an error in the current or immediately preceding student turn) are researcher rules;
   - a short expert sign-off, plus a spot-check of about 15 high-confidence labels (e.g. the literal band-1 cases and the APR ranges), would turn the high bucket into an expert-backed set.

## 10. Limitations

- **One researcher wrote the labels**, applying the rubric; no expert has reviewed them yet.
- **Synthetic Mode B students** speak more cleanly than real pupils.
- **Hand-written turns are short and pattern-like on purpose:** they test rubric cells, not naturalistic teacher talk.
- **Scenario 4 and the drawing turns are thinly covered**; there are no image-only turns (PCK skips them, B22).
- **Feedback history comes from 1.4.0 / 1.4.1 outputs.** It conditions production continuity rules. Run with `PCK_EVAL_NO_FEEDBACK_HISTORY=1` to check sensitivity.
- **The baseline numbers are model behaviour on this set, not a quality claim:** the set over-represents boundary cases on purpose.
