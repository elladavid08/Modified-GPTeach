# X10: two-stage PCK scoring, Stage-2 v2 (expert-boundary rubric), experiment

Status: experiment only, 2026-10-13, on committed **1.4.3** (production code unchanged). `gemini-3.1-flash-lite`, MINIMAL thinking.
- No production or `SYSTEM_VERSION` change.
- **Expert data:** the local, git-ignored B200 set. Aggregates and paraphrases only here.
- **Model calls:** Vertex AI with the pilot service account. No Firestore writes.

## Summary

- **Discipline:**
  - v2 was developed only on the 272 A1-only turns (143 scored Stage-2 contexts), with case review on A1-only turns only;
  - frozen (sha256 `693a3610…`, `pck_eval/x10/rubric_v2.json`), then evaluated **once** on consensus, agreed items and the synthetic benchmark;
  - one dev refinement (v2b) changed nothing measurable and was dropped;
  - v2 was **not** revised after validation.
- **APR stays calibrated, and v2 repairs v1's worst consensus under-scoring:**
  - **consensus:**
    - exact Stage 1 62 → v1 56 → **v2 68** / 108;
    - signed +0.42 → −0.10 → **−0.05**;
    - expert 1 → model 0: 1 → 14 → **6**;
    - expert 1 → model 2: 44 → 21 → **18**;
  - **agreed items:** v2 62 / 112 vs v1 69 (within Stage-2 run-to-run noise), signed +0.02, κ_w 0.50;
  - **all expert tiers pooled:** exact 38% → 54% (v1) → 53% (v2); expert-1 → 2 falls from 171 to 77.
- **Error identification recovers on expert data:**
  - pooled exact Stage 1 58 / 93, v1 57, **v2 60**;
  - signed +0.25 → −0.35 → **−0.02**;
  - expert-2 → 0 / 1: 7 → 21 → **11**.
- **But the synthetic guardrail exposes a new systematic identification failure:**
  - **a bare explicit "זה לא נכון" now scores identification 0** (6 / 6 calls; v1 2);
  - "מה ההגדרה של מלבן?" is over-credited (identification 2);
  - "תחשבו שוב" loses its hint credit.
  - v2's new 0-clause ("a generic response that could have been said without noticing the specific misconception") swallows explicit-but-unspecific negation, which the experts score 2.
  - It is invisible in the pilot data (teachers almost never say a bare "זה לא נכון").
  - Synthetic identification in range: v1 110 / 112 → v2 96 / 112; APR unchanged (41 → 40 / 49); constraints 26 → 27 / 39.
- **Operations clean:**
  - 2,008 Stage-2 calls (dev, validation, synthetic): 0 invalid, 0 mismatches, 0 fallbacks, 0 retries;
  - p50 0.87 s / p90 1.43 s, about 2,340 input + 59 output tokens;
  - Stage 2 runs on 65% of PCK calls: **+13–14% cost**; no added student-turn latency if run in parallel with the student call.
- **Mode B: not run.** "No new systematic score failure" is not met.
- **Verdict:**
  - The two-stage architecture keeps proving itself: zero decision drift, clean contract, calibrated APR.
  - **v2 is not ready for a production prototype** because of the identification failure.
  - **Next (needs your go-ahead as v3):** keep v2's APR wording; fix the identification 0-clause so an explicit statement that *this student's claim* is wrong scores 2, and a generic definition question or "think again" is at most 1. Develop on A1-only plus the synthetic identification cases; validate once on the frozen tiers.
  - Alternatively, a flag prototype in which **Stage 2 owns only APR**, keeping Stage-1 identification. Stage-1 identification is close to the experts (58 / 93); this would be a policy chosen after validation and needs its own validation run.

## 1. v2 rubric wording (frozen)

Only error identification and APR differ from v1 (`pck_eval/x9/stage2.cjs` keeps v1). Characterisation, interpretation and leveraging are unchanged.

**Error identification:**
> Error Identification: does the teacher recognise and address the student's specific error or confusion?
> 0 = the teacher does not notice or address the student's error (ignores it, accepts or praises it, or moves on), or responds only in a generic way that could have been said without noticing the specific misconception.
> 1 = the teacher partly notices or responds: an indirect hint that something should be checked, or a response that touches the topic without clearly addressing the student's specific confusion.
> 2 = the teacher clearly notices and directly addresses the student's specific error or confusion, explicitly or by correcting or clarifying exactly that point, even without labelling it as an error.

**Adapted pedagogical response:**
> Adapted Pedagogical Response: is the teacher's move adapted to this student's thinking?
> 0 = the move bypasses the student's thinking by simply giving the answer or the correction, or it contains mathematically incorrect guidance.
> 1 = relevant and pedagogically useful, but primarily teacher-led or generic. A direct clarification that genuinely responds to the student's confusion is 1, not 0. A correct explanation is not automatically 2.
> 2 = clearly adapted to the student's thinking and actively advances their reasoning: it builds on their idea, asks them to justify, check, compare or reason, or explains with a targeted counterexample or otherwise hands meaningful reasoning work back to the students.

**Unchanged from v1:**
- inputs: lesson context, the full conversation, the current teacher message and the Stage-1 relevant skill ids, extracted verbatim from the Stage-1 prompt;
- the score-only, score-first schema;
- MINIMAL thinking, 512 output tokens;
- strict validation with Stage-1 fallback;
- no retries; no text.

**Tooling:**
- Stage 1 was run once with the preload recording the Stage-2 context into the local replay files (`S2_RECORD_CTX=1`, no inline scoring).
- A standalone runner (`pck_eval/x10/stage2_runner.mjs`, same model client configuration as the server) then scored those identical contexts with v1 and v2.
- So v1 and v2 are compared on exactly the same Stage-1 outputs.

## 2. Development (A1-only, 108 APR / 38 identification scored rows)

| | Stage 1 (A) | v1 (B) | v2 draft (C) | v2b (APR clarification) |
|---|---|---|---|---|
| **identification** exact / MAE / signed / κ_w | 23 / 0.55 / +0.34 / 0.23 | 18 / 0.74 / −0.53 / 0.26 | **23 / 0.53 / 0.00 / 0.41** | (identification wording identical to v2) |
| identification use 0 / 1 / 2 | 3 / 3 / 32 | 14 / 14 / 10 | 8 / 6 / 24 | |
| identification expert 2 → 0 / 1 | 1 / 2 | 8 / 7 | 3 / 4 | |
| **APR** exact / MAE / signed / κ_w | 22 / 0.94 / +0.86 / 0.01 | **53 / 0.53 / +0.19 / 0.41** | 45 / 0.59 / +0.28 / 0.31 | 46 / 0.58 / +0.27 / 0.33 |
| APR use 0 / 1 / 2 | 4 / 0 / 104 | 21 / 38 / 49 | 13 / 45 / 50 | 14 / 44 / 50 |
| APR expert 1 → 2 / 1 → 0 | 69 / 2 | 36 / 7 | 37 / 7 | 37 / 7 |
| APR expert 0 → 1 / 0 → 2 | 0 / 14 | 3 / 0 | **10** / 0 | 9 / 0 |

**Development review (A1-only, paraphrased):**
- **APR 0 → 1:** A1 scores *every* hand-over of information 0 ("instead of giving the information, lead them with questions"), including responsive clarifications. v2's prescribed "direct clarification = 1" rule therefore costs agreement *with this annotator*. It was kept, because it is the specified expert boundary (it reflects the other annotator and consensus practice).
- **APR 1 → 2** (37, unchanged from v1): teacher-led yes/no or leading questions ("does the square satisfy all the rectangle's conditions?"), and teacher-supplied counterexamples phrased as a question. A1 gives these 1 ("you are leading; have them justify").
  - v2b added "a leading or yes / no question whose answer the teacher has essentially given, or a recap, is 1; 2 needs the students to do a substantive reasoning step". It had **no effect** (37 → 37), like the X6 finding that wording near the 1 / 2 boundary barely moves the model.
  - v2b was dropped as an unnecessary complication.
- **Identification:** the v1 failure (clarifying the exact confusion scored 0) is largely fixed. A few over-credits of indirect responses (expert 1 → 2: 5) remain.
- **Frozen:** v2 as drafted. Characterisation, interpretation and leveraging showed no contract bug on A1-only data (too sparse to judge).

## 3. Frozen validation: consensus (3 Stage-1 passes pooled)

| | Stage 1 | v1 | **v2** |
|---|---|---|---|
| APR rows / exact | 108 / 62 | 108 / 56 | 108 / **68** |
| APR MAE / signed / κ_w | 0.44 / +0.42 / 0.04 | 0.49 / −0.10 / 0.38 | **0.38 / −0.05 / 0.40** |
| APR use 0 / 1 / 2 | 1 / 0 / 107 | 16 / 26 / 66 | 8 / 36 / 64 |
| APR expert 1 → 2 / 1 → 1 / 1 → 0 | 44 / 0 / 1 | 21 / 10 / 14 | 18 / **21** / **6** |
| APR expert 2 → 1 / 0 → 1 or 2 | 0 / 1 | 16 / 0 | 15 / 0 |
| identification rows / exact / signed | 16 / 8 / +0.63 | 16 / 13 / −0.19 | 16 / 9 / +0.25 (expert 1 → 2: 4) |
| leveraging exact / signed (44 rows) | 4 / +1.30 | 7 / +1.27 | 7 / +1.25 |
| interpretation (6 rows) / characterisation (6) | 0 / 3 | 0 / 3 | 0 / 3 |

## 4. Frozen validation: agreed double-annotated items

| | Stage 1 | v1 | **v2** |
|---|---|---|---|
| APR rows / exact | 112 / 40 | 112 / 69 | 112 / 62 |
| APR MAE / signed / κ_w | 0.68 / +0.50 / 0.26 | 0.41 / −0.04 / 0.52 | 0.46 / +0.02 / 0.50 |
| APR expert 1 → 2 / 1 → 1 / 1 → 0 | 58 / 0 / 10 | 15 / 32 / 21 | 22 / 25 / 21 |
| APR expert 2 → 1 | 0 | 4 | 4 |
| identification rows / exact / signed / κ_w | 39 / 27 / 0.00 / 0.56 | 39 / 26 / −0.26 / 0.68 | 39 / **28** / −0.15 / **0.71** |
| leveraging exact / signed (20 rows) | 6 / +1.00 | 12 / +0.55 | 14 / +0.40 |

- **v1 vs v2 on agreed APR:** a 7-row difference. Stage-2 runs disagree on about 8% of rows (X9), so this is within noise.
- **Leveraging:** wording is unchanged, so its difference is noise too.

## 5. Synthetic benchmark (scores only; decisions identical 226/252)

| high bucket | Stage 1 | v1 | v2 |
|---|---:|---:|---:|
| case constraints held | 9/39 | 26/39 | 27/39 |
| APR in allowed range (exact) | 25/49 (12/21) | 41/49 (18/21) | 40/49 (17/21) |
| identification in allowed range (exact) | 97/112 (80/92) | **110/112 (91/92)** | **96/112 (81/92)** |
| interpretation / characterisation / leveraging | 4/5, 7/7, 9/9 | 5/5, 6/7, 9/9 | 5/5, 6/7, 9/9 |

**New identification violations in v2** (3 calls each unless noted):

| case | expected | v1 | v2 |
|---|---|---|---|
| "רועי, זה לא נכון." | 2 | 2, 2, 2 | **0, 0, 0** |
| "נועה, זה לא נכון. מישהו אחר רוצה לענות?" | 2 | 2, 2, 2 | **0, 0, 0** |
| "מה ההגדרה של מלבן?" | 0–1 | 1, 1, 1 | **2, 2, 2** |
| "תחשבו שוב." | 1 | 1, 1, 1 | **0, 0, 0** |
| the inclusion characterisation | 1–2 | 1, 2, 2 | 0, 0, 1 |
| one of the two-student case's 3 calls | 2 | 2 | 1 |

**Review bucket:** APR 12/12 in range for both v1 and v2; identification 3/6 for both.

## 6. Did identification recover? Is APR still calibrated?

- **Identification, on expert data: yes.**
  - Pooled exact 57 → 60 / 93 (Stage 1: 58); signed −0.35 → −0.02; expert-2 → 0 / 1 halved (21 → 11).
  - Agreed items: the best κ_w of the three arms (0.71).
  - Consensus (16 rows) is about Stage-1 level, with some over-credit.
- **Identification, by contract: no.** A bare explicit negation of the student's claim now scores 0, a systematic failure on a move every annotator calls 2. It is a wording bug, not noise (6 / 6 identical outputs).
- **APR: yes.**
  - The 1 → 2 reduction is kept (pooled 171 → 77).
  - Consensus under-scoring (1 → 0) falls 14 → 6, and consensus agreement is the best of the three arms.
  - The cost is more 0 → 1 on A1-style "telling" turns (A1-only 3 → 10), a boundary where the annotators differ.
- **Remaining APR issue:** expert 2 → model 1 on teacher explanations (consensus 15). This is the next APR boundary, but not systematic enough to block.

## 7. Operations

| | Stage 1 | Stage 2 v1 | Stage 2 v2 |
|---|---:|---:|---:|
| calls (dev + validation) | 1,553 | 750 | 750 |
| synthetic calls | 348 | 254 | 254 |
| invalid / mismatch / fallback / retries | — | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| latency p50 / p90 | about 2.5 / 3.7 s | 0.85 / 1.40 s | 0.87 / 1.43 s |
| mean input / output tokens | 9,817 / 514 | 2,299 / 59 | 2,344 / 59 |
| share of PCK calls needing Stage 2 | | 64.6% | 64.6% |

**Incremental cost per PCK call:** 0.646 × (2,344 + r × 59) / (9,817 + r × 514) → **+14.0% (r = 4) / +13.1% (r = 8)**.

**Latency placement:** as in X9, Stage 2 can run in parallel with the student call, which also waits only for Stage 1.

## 8. Mode B

**Not run.** v2 passes both expert tiers on APR and on expert-data identification. But the synthetic guardrail found a new systematic identification failure, so "no new systematic score failure" is not met.

## 9. Is Stage-2 v2 strong enough for a flag prototype?

**Not as v2.** A production prototype that scores a teacher's explicit "that's not correct" as a missed identification would show teachers a wrong 0.

**The path is short:**
1. **v3 (one change, needs your go-ahead):**
   - keep v2's APR text unchanged;
   - revise the identification wording: 2 = the teacher explicitly says the student's claim is wrong, **or** clearly notices and directly addresses that specific confusion; 1 = an indirect hint, a generic prompt to rethink, or a generic return to the definition; 0 = not noticed, accepted, praised or moved on;
   - **dev:** A1-only plus the synthetic identification boundary cases (these are rubric-literal and not expert gold, so use them only as contract checks);
   - **freeze**, then validate once on consensus, agreed and synthetic.
2. **Alternative prototype policy:** Stage 2 owns **APR only**; identification stays Stage 1 (pooled 58 / 93, near v2's 60). This avoids the identification wording problem entirely and targets the one systematic inflation the experts and X6–X8 identified. It is a post-validation choice, so it needs its own validation run before a flag prototype.

**In both cases:**
- **the architecture is ready:** zero decision drift, clean fallback, about 13–14% cost, no added student latency;
- **text later moves into Stage 2** (X9 §8).

## 10. Limitations

- **Dev set:** one annotator (A1), whose APR 0 practice is stricter than the specified boundary.
- **Consensus:** has only 5 conversations (identification n = 16).
- **Noise:** Stage-2 run-to-run disagreement is about 8% of rows, so v1 / v2 differences of a few rows are noise.
- **Synthetic labels** are rubric-literal; they caught the identification contract bug, but are not expert gold.
- **Replay context:** empty feedback history and no drawings.

**Files:**
- tracked, no participant data: `pck_eval/x10/rubric_v2.json` (frozen), `rubric_v2b.json` (dropped), `stage2_runner.mjs`, `synth_eval.mjs`; small changes to `pck_eval/x9/stage2.cjs` (rubric parameter) and `x9_arm.cjs` (optional local context recording);
- local and git-ignored: `pck_eval/local_b200/x10/` (keys, `dev-*.jsonl`, `val-*.jsonl`, evaluation scripts and outputs, frozen copy) and `pck_eval/results/x10-*`.
