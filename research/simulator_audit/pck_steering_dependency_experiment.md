# X12b: steering / feedback dependency in two-stage PCK (experiment)

Status: experiment only, 2026-10-28, on committed **1.5.1** (`6452787`). Production code and `SYSTEM_VERSION` are unchanged.
- **Models:** 3.1 Flash-Lite for every PCK stage; 3.5 Flash-Lite students (production).
- **Expert data:** the local, git-ignored B200 set. Aggregates only.
- **Follows:** `pck_two_stage_x12_experiment.md` §10 (Stage-1 steering is "positive / improved" on 85–96% of shown turns).

## Summary

- **Architectures compared:**
  - all keep Stage 1 (the unchanged 1.5.1 call, which alone decides show/hide);
  - all run Stage 2 only on shown turns;
  - all use the frozen X12 v3 rubric.
- **Shared steering signal:**
  - a signal none / partial / strong is computed from a teacher-facing assessment: none = the error went unnoticed or every row is 0; strong = at least one skill at 2;
  - it is written into the analysis the students see by a deterministic adapter (`pck_eval/x12/stage2_dep.cjs`);
  - the adapter uses only values the student prompt already defines: `pedagogical_quality` neutral, `understanding_level` same, and a hint `partial_understanding` / `persistent_confusion` instead of `understanding_progress`.

| | architecture | students steered by | teacher sees |
|---|---|---|---|
| A0 | independent parallel (the X12 prototype) | Stage 1 | independent Stage 2 |
| A1 | **sequential, dependent** (option 1) | signal of the dependent Stage 2 | dependent Stage 2 |
| A1i | sequential, **independent** | signal of the independent Stage 2 | independent Stage 2 |
| A2a | **dependent parallel** (option 2) | Stage 1 | dependent Stage 2 |
| A2b | dependent parallel, Stage-1 steering recalibrated | Stage 1, recalibrated from its own fields | dependent Stage 2 |
| A3 | **fast dependent assessment** (option 3) | signal of the fast scores | fast scores + text in parallel |
| A3i | fast **independent** assessment | signal of the fast scores | fast scores + text in parallel |

- **"Dependent"** = Stage 2 receives the Stage-1 assessment (relevance, scores, quality, predicted understanding) and is told to refine it.
- **Independent variants:** I added them after the first offline result showed that dependency transfers the Stage-1 inflation.

**Key findings:**
1. **Making Stage 2 depend on Stage 1 makes the teacher-facing assessment worse.**
   - It anchors on Stage 1's inflated view:
     - identification F1 (consensus) 0.57 → 0.32;
     - all-green 16% → 29% (full) and 39% (fast);
     - Leveraging bias +0.57 → +0.67 (full) and +1.00 (fast).
   - One assessment should govern both, but the dependency should run the other way: the students are steered by the calibrated assessment, and Stage 1 keeps only show/hide.
2. **Calibrating the Stage-1 steering is not enough (A2b):**
   - **No signal to calibrate:** no Stage-1 field predicts the experts' view of the move (dev tier).
   - **Recalibrated steering:** κ with the expert signal is only 0.14, and steering stays inconsistent with the teacher view on 34% (offline) and 41% (live) of shown turns.
3. **Consistency:** the architectures that steer from the teacher-facing assessment (A1, A1i, A3, A3i) are consistent by construction (100%). Steering from Stage 1 (A0, A2a, A2b) leaves 33–58% of shown turns inconsistent.
4. **The student-side benefit is real but modest:**
   - Pooled over all arms, a peer states the confident conclusion at T6–T7 after 49% of "strong" steers and after 37% of "partial" or "none" steers.
   - Per arm, the peer jump right after the minimal hint (T6) falls from 22 / 36 (production steering) to 14–15 / 36 (A1, A1i, A3), but only to 19 (A2b, A3i).
   - The hint content still drives many jumps.
5. **Latency:** student replies are 0 s (A0 / A2), +0.9–1.0 s (A3 / A3i) or +2.0–2.2 s (A1 / A1i) later at p50.
6. **Best quality and consistency:** A1i (sequential, independent): steering κ 0.39 with the experts; "strong" steer while the expert sees partial / none on 13% of turns (Stage 1: 46%); the best teacher-facing rows. Cost: +2.1 s before the students.
7. **Best trade-off measured:**
   - A3i is consistent at +1.0 s, but its steering is less accurate (κ 0.25, 19%), and the live peer-jump reduction did not show up (19 / 36).
   - A3 (dependent fast) reduced peer jumps live (15 / 36), but its teacher-facing rows are the most inflated.

## 1. Expert agreement and consistency (B200, held-out consensus + agreed, 589 shown turn-passes; same turns for every architecture)

| | steer = teacher-facing signal | steer vs expert signal: agree / κ | steer "strong" while the expert says partial / none | teacher-facing signal vs expert: κ |
|---|---|---|---|---|
| A0 independent parallel | 52% | 45% / 0.10 | 46% | 0.39 |
| A1 sequential, dependent | 100% | 58% / 0.33 | 22% | 0.33 |
| **A1i sequential, independent** | 100% | **61% / 0.39** | **13%** | **0.39** |
| A2a dependent parallel | 67% | 45% / 0.10 | 46% | 0.33 |
| A2b … Stage-1 recalibrated | 66% | 47% / 0.14 | 36% | 0.33 |
| A3 fast, dependent | 100% | 52% / 0.25 | 27% | 0.25 |
| A3i fast, independent | 100% | 52% / 0.25 | 19% | 0.25 |

(All B200 tiers, 731 turn-passes: the same ordering; A1i κ 0.33 and 14%, Stage 1 κ 0.09 and 47%.)

**Teacher-facing rows (held-out):**

| | Ident. F1 cons. / agreed | APR signed cons. / agreed | Lev. wrongly surfaced cons. / agreed | Lev. signed cons. / agreed | all green |
|---|---|---|---|---|---|
| independent full (A0, A1i) | 0.57 / 0.46 | −0.09 / −0.03 | 12% / 15% | +0.57 / −0.08 | 16% |
| dependent full (A1, A2) | 0.32 / 0.46 | +0.02 / −0.02 | 15% / 15% | +0.67 / +0.03 | 29% |
| dependent fast + text (A3) | 0.36 / 0.41 | −0.01 / +0.11 | 10% / 7% | +1.00 / +0.18 | 39% |
| independent fast + text (A3i) | 0.56 / 0.56 | −0.01 / +0.12 | **6% / 7%** | +0.74 / +0.16 | 28% |

- The text contract is 100% everywhere.
- **Calls:** 0 failures in 2,924 offline calls.

## 2. Live student simulations (progression bench, 36 conversations per arm, all six arms run concurrently on the same casts)

| | A0 | A1 | A1i | A2b | A3 | A3i |
|---|---:|---:|---:|---:|---:|---:|
| **students visible, p50 / p90** (1.5.1: 4.4–4.6 / 7.0–7.1 s) | 4.4 / 7.0 | 6.5 / 8.9 | 6.7 / 9.1 | 4.6 / 7.1 | 5.5 / 7.9 | 5.4 / 8.0 |
| work before the students, p50 / p90 | 0 | 1.9 / 2.4 | 2.1 / 2.5 | 0 | 0.9 / 1.2 | 0.9 / 1.2 |
| sidebar visible, p50 / p90 (1.5.1: 2.9–3.0 / 5.5 s) | 5.0 / 7.6 | 5.0 / 7.5 | 5.2 / 7.5 | 5.0 / 7.6 | 5.3 / 7.7 | 5.5 / 8.0 |
| turn complete, p50 / p90 | 5.0 / 7.6 | 6.5 / 8.9 | 6.7 / 9.1 | 5.1 / 7.7 | 5.5 / 8.0 | 5.5 / 8.1 |
| steering consistent with the teacher view (live) | 42% | 100% | 100% | 59% | 100% | 100% |
| steer on shown turns: strong / partial / none | 257 / 5 / 12 | 161 / 94 / 26 | 115 / 100 / 65 | 216 / 54 / 5 | 191 / 60 / 30 | 144 / 42 / 80 |
| **peer confident conclusion right after the hint (T6)** | **22** | **14** | **15** | 19 | **15** | 19 |
| peer confident conclusion at T6–T7 | 24 | 18 | 18 | 19 | 17 | 24 |
| carrier: confident conclusion after the hint | 0 | 1 | 1 | 5 | 3 | 2 |
| carrier: two-step arc | 23 | 23 | 22 | 22 | 22 | **29** |
| carrier drops it before teaching | 9 | 6 | 3 | 2 | 2 | 2 |
| carrier correct at the check (T8) / justified by the end | 21 / 35 | 18 / 36 | 15 / 35 | 17 / 36 | 17 / 36 | 20 / 36 |
| carrier still holds it at the end | 4 | 2 | 1 | 2 | 0 | 0 |
| student / PCK / Stage-2 failures | 0 | 0 | 0 | 0 | 0 | 0 |

**Notes on the table:**
- **Noise:** with 36 conversations per arm, differences of about ±4 are noise. A0 reproduces the earlier production arm (peer T6 22 vs 21).
- **Mechanism, pooled at T6–T7:** a peer states the confident conclusion after 75 / 152 "strong" steers (49%), 48 / 129 "partial" (37%) and 19 / 51 "none" (37%).
  - In A3i, "none" was sent on many hint turns (the independent fast assessment scores an indirect hint as identification 0). Peers still jumped there (11 / 18).
  - So "none" does not slow the peers more than "partial".
- **Carrier drops before teaching:** this is lower in every adapted arm (2–6 vs 9), because positive steering of the early diagnostic questions no longer pushes the carrier forward.

## 3. Cost (3.1 Flash-Lite list prices; relative to the 1.5.1 PCK call, about 9.6k input + 0.5k output tokens)

| | extra calls per shown turn | extra tokens (input / output) | extra PCK cost per shown turn | overall PCK cost (shown on 60–77% of turns) |
|---|---|---|---|---|
| independent full (A0, A1i) | 1 | 3.5k / 0.44k | +49% | +30–38% |
| dependent full (A1, A2a, A2b) | 1 | 3.9k / 0.43k | +51% | +31–39% |
| fast + text (A3, A3i) | 2 | 3.4–3.5k / 20 + 2.3k / 0.2k | +57% | +34–44% |

## 4. Implementation complexity and regression risk

| | complexity | regression risk |
|---|---|---|
| A0 / A2a | parallel call; the sidebar updates after the students; the turn log waits for Stage 2 | student behaviour unchanged; inconsistency stays; A2a is also worse for the teacher |
| A2b | as A0, plus a deterministic steering rule | small student change, little benefit |
| **A1 / A1i** | the simplest control flow: await Stage 2, then the students; one extra call; fallback = Stage-1 steering and rows | students change through the adapter (needs carrier and Mode B regression); +2 s per shown turn |
| A3 / A3i | three steps (fast → students ∥ text); two extra calls; more failure states (fast fails → Stage-1 steering; text fails → scores without text) | as A1, plus the text–score split |

## 5. Recommendation

1. **Do not make Stage 2 depend on Stage 1** (options 1 and 2 as specified).
   - Anchoring on the Stage-1 assessment brings back the inflation the two-stage design removes.
   - Keep Stage 2 independent, and let the students depend on Stage 2.
2. **Do not rely on calibrating the Stage-1 steering** (A2b):
   - the information is not in Stage 1's output;
   - the steering stays inconsistent with the teacher view on a third or more of shown turns.
3. **Target architecture:** one independent calibrated assessment before the students, used for both the steering and the teacher-facing rows.
   - **Now feasible at the best quality:** A1i. It is consistent by construction, has the best expert agreement, and cuts premature peer jumps after the hint from 22 to 15 of 36. Students arrive 2.1 s later at p50 (4.4 → 6.7 s).
   - **Faster alternative:** A3i, at +1.0 s, with somewhat weaker steering accuracy. It did not reduce peer jumps live in this run.
4. **Next experiment before choosing** (small, research-only): one independent call that outputs all five scores first and the texts after, read in streaming mode.
   - The steering signal would be available after the scores (expected about 0.9–1.0 s, like A3i).
   - The texts would follow in the same call, with the same assessment.
   - This targets A1i's quality and consistency at A3i's latency, with one call.
   - Not yet tested: whether "scores first" keeps the full call's calibration. The fast prompt, which lacks the text section, lost some.
5. **Whatever is chosen:**
   - keep Stage 1's show/hide decision and its fallbacks;
   - run the carrier and Mode B regressions, since students change through the adapter;
   - expect only a partial pacing gain. About a third of peers still jump after a minimal hint even with a calibrated "partial" steer; the rest needs the structural peer measures discussed in `student_model_pacing_2x2_experiment.md`.

## 6. Files

- **Prompts and steering:** `pck_eval/x12/stage2_dep.cjs` (dependent and independent fast prompts, the text-for-fixed-scores prompt, the signal and the adapter).
- **Calls and runners:**
  - `dep_call.cjs`;
  - `dep_runner.mjs` (offline);
  - `stage2_service.mjs` (local research service; routes `/dep_full`, `/fast`, `/fast_indep`, `/text`);
  - `arch_live.mjs` (live latency and consistency).
- **Bench:** `replay_harness/bench/opportunity.bench.js`, `OPP_ARCH`.
- **Local only:** `local_b200/x12/arch_eval.py` (offline expert comparison); every output is in git-ignored folders.

## 7. Limitations

- **Signal and adapter:** a single rule and mapping, not tuned. Another mapping (for example "partial" for every move with a 1) could shift the student results.
- **Held-out reuse:** consensus and agreed were already used once for X12. These are comparisons between architectures on the same turns, not a fresh blind validation.
- **Live arms:** 36 conversations each, one scripted teacher plan, Flash-Lite students only.
- **Judge:** the arc judge was not re-validated for these runs.
- **Scope:** steering on hidden turns (about 25–40% of turns) is Stage 1's in every architecture.
