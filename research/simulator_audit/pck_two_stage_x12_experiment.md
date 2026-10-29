# X12: two-stage PCK, Stage 2 owns relevance, scores and text (experiment)

Status: experiment only, 2026-10-28, on committed **1.5.1** (`6452787`). Production code and `SYSTEM_VERSION` are unchanged.
- **Models:** `gemini-3.1-flash-lite` for both stages, MINIMAL thinking (production `baseGenerationConfig`).
- **Expert data:** the local, git-ignored B200 set. This document holds aggregates and synthetic paraphrases only.
- **Model calls:** Vertex AI with the pilot service account. No Firestore writes.
- **Plan:** `post_1.5_feedback_investigation.md` §G, G3.

## Summary

- **Design:**
  - **Stage 1** is the unchanged 1.5.1 PCK call. It alone decides show/hide (with the bare-acknowledgement guard) and steers the students.
  - **Stage 2** runs only on feedback that 1.5.1 shows:
    - **Input:** the lesson context, the history and the teacher's message, taken verbatim from the Stage-1 prompt. It receives nothing from the Stage-1 output.
    - **Output:** for each of the five skills, relevance, a 0/1/2 score and the teacher-facing text (`what_exists` / `what_to_improve`), with B200 boundary rules.
    - **Policy:** at most 2 attempts with the identical request; if both fail, the display falls back to the Stage-1 rows.
  - **So the show/hide decision is identical by construction.** It was verified on every evaluated turn.
- **Discipline:**
  - Developed only on the 272 A1-only turns (142 shown), in 5 variants over 3 rounds (2 samples each);
  - frozen (`pck_eval/x12/FROZEN.sha256`) before any held-out data was touched;
  - then evaluated **once** on consensus, agreed, the synthetic benchmark and the regression cases.
- **What it fixes (held-out, frozen design vs 1.5.1 on the same shown turns):**
  - **Text contract:**
    - every score-1 row now has the positive part **and** the improvement (**414 / 414**, 1.5.1: 0 / 87);
    - score 2 and 0 are complete (100%);
    - the regression cases pass the contract 96 / 96 (1.5.1: 80 / 96).
  - **APR calibration:**
    - signed bias +0.36 → **−0.09** (consensus) and +0.42 → **−0.03** (agreed);
    - exact 58% → 72% and 34% → 70%;
    - weighted κ 0.14 → 0.51 and 0.26 → 0.64.
  - **"Everything green":** all-green feedback 69% → **16%** (experts: 10% consensus, 13% A1).
  - **Leveraging inflation:**
    - signed +1.22 → +0.57 (consensus) and +1.05 → **−0.08** (agreed);
    - exact 10% → 55% and 36% → 93%;
    - the team's "partial leveraging scored 2" case passes 8 / 8 (1.5.1: 2 / 8).
  - **Identification:**
    - consensus F1 0.27 → 0.57, exact 40% → 67%;
    - agreed exact 69% → 86%, wrongly surfaced 10% → 4%.
  - **Synthetic benchmark:**
    - case constraints held 28% → 82%;
    - APR score in the allowed range 56% → 97%;
    - identification score in range 80% → 92%.
- **What it does not fix (targets missed):**
  - **Leveraging is still over-selected:** wrongly surfaced 12% (consensus) and 15% (agreed), against a target of ≤ 5% (1.5.1: 17% and 13%).
    - The team's bare-"כן" case gets a purple "missed: generalise" row in 8 / 8, where the team expects no Leveraging row. It is no longer credit, but it is a row.
  - **Interpretation recall:**
    - 0.24 on consensus (target ≥ 0.5; 1.5.1: 0.13);
    - 0.50 on agreed (1.5.1: 0) and 0.53 on dev.
    - Consensus marks "ask how they reached it" (score 0) more often than the dev annotator does.
  - **Interpretation precision:**
    - agreed 0.18;
    - synthetic: correctly absent in 80% (1.5.1: 100%);
    - synthetic: score in range 0 / 9. The benchmark scores "the teacher articulates the student's reasoning" as 2; the team's 1.5.0 feedback calls naming the reasoning without probing "partial". The rubric follows the team. **This label conflict needs the educational team's decision.**
  - **APR on a pure "why do you think" question is still added** (0 / 8 local, 1 / 8 synthetic; the team expects APR not relevant). Interpretation is now present (6 / 8 and 8 / 8).
- **Operations (frozen design, 926 Stage-2 runs: held-out 589, regression 93, synthetic 244):**
  - 1 invalid first output (text contract), fixed by the re-ask; 0 fallbacks;
  - p50 2.0 s, p90 2.5 s;
  - about 3.5k input and 440 output tokens per call;
  - it runs only on shown turns: 59–63% of PCK calls on the expert turns.
- **Latency and parallelism (live, 1,098 shown turns, §6):**
  - **Students:** student replies are not delayed.
  - **Sidebar:** it appears about 2.1 s later (p50 2.9 → 5.0 s; p90 7.6 s, missing the ≤ 6 s target).
  - **Turn completion:** +0.6 s at p50 with the current student model, and 0 with `gemini-3.5-flash` students.
- **Recommendation:** §8.

## 1. Design

| | Stage 1 (unchanged 1.5.1) | Stage 2 (new, research) |
|---|---|---|
| runs | every text turn | only when 1.5.1 shows feedback (decision + guard + at least one displayable row) |
| decides | show/hide; student steering (`predicted_student_state`, `addressed_misconception`, …) | relevance, 0/1/2 score and text per skill |
| sees | prompt, history, feedback history | lesson context, history, the teacher's message (verbatim from the Stage-1 prompt); **no Stage-1 output** |
| output | the production schema | `{skills: [5 × {skill_id, is_relevant, score, what_exists, what_to_improve}]}`, all fields required (3.1 skips optional keys) |
| contract | 1.5.1 row-text rule | validated: score 2 → `what_exists`; 1 → both; 0 → `what_to_improve`; ≥ 1 relevant skill; otherwise one identical re-ask, then fallback to the Stage-1 rows |

**Rubric** (`pck_eval/x12/stage2.cjs` + `rubric_v3.FROZEN.json`):
- **Relevance:**
  - relevance means "should be evaluated", so a missed skill is shown as 0;
  - usually 1–2 skills, rarely 3.
- **Identification:**
  - 2 = directly targets exactly that claim: says it is inaccurate, corrects it, or challenges it with a targeted question or counterexample. A short "that is not correct" counts.
  - 1 = a general prompt that does not target the claim.
  - This avoids X10's "זה לא נכון scores 0".
- **Characterisation:** only when the teacher's move itself deals with what is wrong in the error.
- **Interpretation:**
  - only for a specific student's incorrect claim whose reasoning is unclear;
  - 0 = corrected or explained without probing; 1 = named or guessed without asking; 2 = asks how or why, or articulates the reasoning and checks it with the student;
  - a question about the student's reasoning is interpretation, not APR.
- **APR:** X10 v2 wording (validated there), unchanged.
- **Leveraging:**
  - only when the episode is resolved in the latest student turn(s), and the move relates to that resolved error;
  - restating this case's conclusion is 0, even in general words; opening a new direction without developing it is 1; 2 = the principle stated **and** transferred to a new case;
  - a bare acknowledgement is not evaluated.

## 2. Development (A1-only tier, 142 shown turns, 2 samples per variant)

| variant | APR signed | Interp. recall / P | Lev. wrongly surfaced / signed | Ident. signed | score-1 contract | all green |
|---|---|---|---|---|---|---|
| 1.5.1 | +0.83 | 0.12 / 0.33 | 13% / +1.48 | +0.33 | 0 / 24 | 72% |
| v1, score first | +0.19 | 0.44 / 0.22 | 25% / +1.06 | −0.49 | 324 / 324 | 8% |
| v1, text first | +0.43 | 0.38 / 0.18 | 25% / +1.07 | −0.11 | 232 / 233 | 16% |
| v2, score first | +0.17 | 0.56 / 0.19 | 14% / +0.37 | −0.20 | 270 / 270 | 11% |
| v2, text first | +0.41 | 0.53 / 0.21 | 15% / +0.67 | +0.05 | 198 / 199 | 14% |
| **v3, score first (frozen)** | **+0.17** | **0.53 / 0.23** | **12% / +0.17** | −0.21 | 244 / 244 | 14% |

- **v1 → v2** (from the v1 dev errors):
  - Identification 2 no longer needs an explicit "wrong" label;
  - characterisation only when the move deals with the error;
  - interpretation 0 only when the teacher responds to that student's idea;
  - Leveraging only after a resolved episode, and a restated conclusion is 0.
- **v2 → v3:**
  - Leveraging only when the move relates to the resolved error (a new task is APR);
  - interpretation only for an incorrect claim, not a question.
- **Field order:** score-first beats text-first on APR and Leveraging in both rounds.
- **Stopped after three rounds:** the remaining Leveraging and Interpretation disagreements with A1 are partly A1-specific. A1 rarely marks interpretation or characterisation; consensus marks interpretation-0 often.

**Stability (two Stage-2 samples of the same Stage-1 output, dev):**
- relevance differs between the two samples on 1% (APR) to 10% (interpretation) of turns;
- between two 1.5.1 passes on the held-out turns, it differs on 4% to **19%** (Leveraging).

## 3. Held-out validation, frozen (3 Stage-1 passes pooled; Stage 2 once per pass)

**Consensus (73 turns × 3):**

| skill | relevance F1, 1.5.1 → 2-stage | wrongly surfaced | missed | exact | signed | κ_w |
|---|---|---|---|---|---|---|
| identification | 0.27 → **0.57** | 10% → 7% | 79% → 50% | 40% → 67% | +0.60 → +0.17 | 0.62 → 0.80 |
| characterisation | 0.26 → **0.47** | 2% → 10% | 83% → 57% | 43% → 39% | +0.71 → +0.17 | — |
| interpretation | 0.21 → 0.38 | 3% → 1% | 87% → 76% | 0% → 100% | +2.0 → 0 | — |
| APR | 0.80 → 0.80 | 12% → 19% | 29% → 27% | 58% → **72%** | +0.36 → **−0.09** | 0.14 → 0.51 |
| leveraging | 0.63 → **0.73** | 17% → 12% | 35% → 25% | 10% → **55%** | +1.22 → +0.57 | 0.09 → 0.38 |

**Agreed double-annotated items (194 turns × 3):**

| skill | relevance F1 | wrongly surfaced | missed | exact | signed | κ_w |
|---|---|---|---|---|---|---|
| identification | 0.48 → 0.46 | 10% → 4% | 55% → 65% | 69% → **86%** | −0.04 → −0.20 | 0.58 → 0.82 |
| characterisation | 0 → 0.26 | 1% → 3% | 100% → 67% | — → 6 / 6 | — | — |
| interpretation | 0 → 0.27 | 3% → 7% | 100% → **50%** | — → 9 / 9 | — | — |
| APR | 0.71 → **0.84** | 14% → 19% | 37% → 14% | 34% → **70%** | +0.42 → **−0.03** | 0.26 → 0.64 |
| leveraging | 0.35 → 0.51 | 13% → 15% | 48% → **5%** | 36% → **93%** | +1.05 → **−0.08** | 0.09 → 0.93 |

**Feedback shape (both tiers, shown feedbacks):**
- rows per feedback (1 / 2 / 3+): 217 / 372 / 0 → 134 / 309 / 146;
- all green 69% → 16%;
- text contract 100% for every score (1.5.1: score 1 0%).

**Paired slices (consensus):**
- interpretation missed with APR shown instead: 25 → 24;
- Leveraging wrongly surfaced: 26 → 19 (with APR: 23 → 14).

## 4. Regression cases (team's 1.5.0 cases: 6 exact local + 6 synthetic paraphrases, 8 samples each)

| case (expectation) | exact: 1.5.1 → 2-stage | synthetic: 1.5.1 → 2-stage |
|---|---|---|
| partial new direction: Leveraging ≤ 1 | 2 → **8** | 6 → **8** |
| early in the discussion: Leveraging not relevant | 8 → 8 | 8 → 8 |
| names the visual reasoning without probing: Interpretation ≤ 1 | 7 → 8 (mostly 0, not 1) | 1 → **8** |
| definition question, probing missed: Interpretation relevant | 0 → **8** | 0 → 2 |
| "why do you think…": Interpretation ≥ 1 | 1 → **6** | 6 → **8** |
| … and APR not relevant | 0 → 0 | 0 → 1 |
| bare "כן": Leveraging not relevant | 4 → **0** | 5 → **0** (purple "missed: generalise") |
| contract | 37 → **48** | 43 → **48** |

## 5. Synthetic benchmark (95 high-confidence cases × 3; decisions identical, 222 / 252)

| | 1.5.1 | 2-stage |
|---|---|---|
| case constraints held | 28% | **82%** |
| identification: present when required / score in range | 86% / 80% | 89% / **92%** |
| APR: present when required / score in range | 67% / 56% | **82% / 97%** |
| interpretation: present when required / correctly absent / score in range | 53% / 100% / 6 of 8 | 60% / **80%** / **0 of 9** |
| Leveraging: correctly absent | 92% | 91% |
| not-relevant skills correctly absent, overall | 91% | **79%** |

New systematic failures, all on 3 of 3 samples:
- interpretation added to correct answers, planned questions and good APR moves (7 cases);
- "the teacher articulates the reasoning" is scored below 2 (2 cases; the label conflict above);
- Leveraging after a check question (3 cases).

## 6. Latency and parallelism

**Setup:** the frozen Stage 2 ran live in 144 synthetic progression conversations (`student_model_pacing_2x2_experiment.md` §3).
- It started at the same moment as the student call, on every shown turn.
- Students received the unchanged Stage-1 analysis.

**Results:**
- 1,098 shown turns, 0 Stage-2 failures, 0 re-asks;
- Stage 2: p50 2.0–2.1 s, p90 2.4–2.5 s.

**Parallelism is feasible:**
- Stage 2 needs only the Stage-1 context.
- Students need only the Stage-1 analysis, so neither waits for the other.
- **Student replies:** they appear as early as in 1.5.1.

**What changes:**
- **Sidebar:** it now waits for Stage 2: p50 2.9 → 5.0 s, p90 5.4 → 7.6 s (target ≤ 6 s: missed).
- **Turn lock and turn log:** they wait for both calls:

  | student model | added to the turn, p50 / p90 | Stage 2 finished first |
  |---|---|---|
  | `gemini-3.5-flash-lite` (current) | +0.56 / +1.0 s | 10% of turns |
  | `gemini-3.5-flash` | 0 / +0.6 s | 55–60% of turns |

- **Cost:** a Stage-2 call (3.5k input + 440 output tokens) costs about half a Stage-1 call (9.6k + 0.5k) at 3.1 Flash-Lite list prices. It runs on about 60% of PCK calls, so total PCK spend rises by about 30%.

## 7. Text quality (manual read of a random sample; automatic checks on all 1,625 held-out texts)

- **Length:** median 118 characters, p90 165 (experts: 77–250).
- **Language:** no Latin-script words. Second person, concrete, and tied to the teacher's actual move.
- **To fix before any production use:**
  - occasional masculine forms ("לפני שאתה ממשיך");
  - an occasionally harsh tone ("התגובה שלך סתמית");
  - 8 texts in the third person ("המורה");
  - a few weak suggestions (applying a quadrilateral-inclusion idea to triangles).

## 8. Recommendation

1. **Keep the two-stage architecture as the direction.**
   - It fixes the structural problems the single call cannot: the score-1 text, APR calibration, "everything green" and Leveraging inflation.
   - It leaves show/hide and student steering untouched by construction.
2. **Do not implement the frozen v3 in production yet.** Two open problems are not tuning problems; they need the educational team's decisions first:
   - **(a) Interpretation scoring:** is "the teacher names or articulates the student's reasoning without asking" a 1 (the team's 1.5.0 feedback) or a 2 (the B200 grounding and the synthetic benchmark)?
   - **(b) Leveraging after a resolved episode:** should a local confirmation (including a bare "כן") get a purple "missed: generalise" row? The B200 experts mostly mark it as 0; the team's case expects no row.
3. **Then one more Stage-2 round (v4), in three steps:**
   - encode the two decisions and address Leveraging over-selection and Interpretation precision;
   - develop on A1 only;
   - re-freeze.
   - **Caveat:** consensus and agreed have now been used once for validation. A v4 validated on the same tiers is no longer blind. Report it as such, or keep a fresh check set (for example newly labelled turns, or the team's next round of cases).
4. **Before a production prototype:**
   - fix the text-quality items (§7);
   - keep the fallback to the Stage-1 rows;
   - add content-free telemetry (Stage-2 status, attempts, latency);
   - decide the sidebar presentation (a placeholder, or the rows arriving after the students);
   - pair it with `gemini-3.5-flash` students, so the turn is not slower.
5. **Optional:** 3.5 Flash as the Stage-2 model was not tested. It might improve calibration further, at about twice the latency, which would lengthen the sidebar delay.

## 9. Limitations

- **One dev annotator:** A1's sparse use of interpretation and characterisation conflicts with consensus. The rubric was not fitted to A1 there.
- **Pass pooling:** held-out numbers pool 3 Stage-1 passes, with Stage 2 run once per pass; the decision noise is shared by both arms.
- **Model:** Stage 2 was tested on 3.1 Flash-Lite only. 3.5 Flash was not tried as the Stage-2 model.
- **Feedback history:** Stage 2 does not see the feedback history (repeat praise across turns is not controlled).
- **Live check:** the synthetic conversations of §6 are the only live, in-conversation Stage-2 runs.

## 10. Consistency between Stage-1 steering and the Stage-2 assessment (2026-10-28)

**Question:** in the parallel design, students are steered by Stage 1 while the teacher reads the Stage-2 scores. How often do the two disagree materially?

**Definitions:**
- **Positive steer:** `pedagogical_quality` positive with `understanding_level` "improved". On shown turns these always occur together. The student prompt then says "MUST show improvement".
- **Stage-2 class:**
  - strong (all rows 2);
  - mixed;
  - incomplete (max 1);
  - weak (all 0).
- **Scripts:** `local_b200/x12/consistency.py` (B200) and `pck_eval/x12/live_consistency.py` (live).

**B200 (731 shown turn-passes, 354 turns; held-out plus dev, frozen rubric):**

| Stage-1 steer positive / improved (618, 85%) and Stage 2 says… | rate |
|---|---|
| every row 0 (weak move) | 48 (8%) |
| error not noticed (identification 0); also `addressed_misconception` true | 20 (3%) |
| APR 0 (answer given, students bypassed) | 27 (4%) |
| **no skill done well (max ≤ 1)** | **337 (55%)** |
| reverse: steer problematic / confused and Stage 2 all 2 | 1 of 113 (1%) |

- **Stage 1 is internally consistent:** its own rows never contradict its steer (0 / 618), because its scores are inflated.
- **Expert referee** (consensus, else A1):
  - on the 337 "positive steer, Stage 2 max ≤ 1" turns, the expert also gives no skill a 2 in 226 of 309 marked (73%);
  - on all positive-steer turns, the experts give no skill a 2 in 54%.
  - So the disagreement exists already in 1.5.1, between the steering and the experts. Stage 2 makes it visible; it does not create it.

**Live 2×2 (1,098 shown turns; replies on the same turn labelled by the arc judge):**
- **How often the steer is positive:** on 96% of shown turns (1,060). Stage 2 rates 57% of those turns max ≤ 1.
- **Students follow the steer, not the move:** on teaching turns T6–T10 with a positive steer, a peer states the confident conclusion in 61% when Stage 2 found a strong row, and in 57% when it found none.
- **At the minimal hint (T6):**
  - every shown turn is max ≤ 1 in Stage 2;
  - 87 of 92 have a positive steer, and on those a peer states the confident conclusion in **67%**;
  - on the 5 with a non-positive steer, the rate is 0% (n too small to conclude).

**Reading:**
1. **Hard contradictions are rare:** 3–8% of shown turns. Example: "improved" and "misconception addressed" while Stage 2 says the error was not noticed.
2. **Soft mismatches are common:** about 55% of turns where Stage 1 predicts improved understanding are moves Stage 2 rates as partial on every skill, and the experts mostly agree with Stage 2.
3. **The mismatch is behavioural:**
   - students' progress does not depend on how strong the move was;
   - at minimal hints, a positive steer goes with a peer jump in two thirds of cases.
   - This is the same mechanism as the team's "resolved too fast" complaint.
4. **Teacher view:** two-stage makes the mismatch visible to the teacher. The sidebar says "partial / missing" while the class reacts as if the move was decisive.
5. **Root cause:** not the parallel design. Stage 1's steering is "positive / improved" for almost every shown move.

**Open next step:** derive the steering intensity from a calibrated assessment (for example "partial_understanding" rather than "improved" after an incomplete move). This would need its own experiment; it is a structural pacing lever, not prompt wording.
