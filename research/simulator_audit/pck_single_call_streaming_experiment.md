# X12c: one streamed Stage-2 call as the single source of truth (experiment)

Status: experiment only, 2026-10-28, on committed **1.5.1** (`6452787`). Production code and `SYSTEM_VERSION` are unchanged.
- **Models:** 3.1 Flash-Lite for PCK; 3.5 Flash-Lite students.
- **Expert data:** the local, git-ignored B200 set. Aggregates only.
- **Follows:** `pck_steering_dependency_experiment.md`; this compares against A1i (sequential independent) and A3i (fast independent).

## Summary

- **Streaming structured output works with the current setup:**
  - `@google-cloud/vertexai` 1.10.0 `generateContentStream`, 3.1 Flash-Lite, the JSON response schema and MINIMAL thinking;
  - offline: 1,462 streamed calls, 0 invalid, 0 retries; the early-parsed scores always equalled the final JSON;
  - the scores arrive in the first or second chunk.
- **Two variants:**
  - **A4, scores first:** a new output format with all five scores, then the text rows.
  - **A5, the frozen A1i call streamed:** the A1i request unchanged (per skill: score, then text, in the fixed skill order). The steering signal is taken as soon as it is determined:
    - none = identification is 0 (the first entry);
    - strong = the first 2;
    - partial = only after the fifth score.
  - In both, the same call then finishes the teacher-facing text, so steering and sidebar are one assessment.
- **A4 is as fast as A3i but loses calibration, like the fast prompt:**
  - Leveraging bias +1.30 / +0.79 (consensus / agreed; A1i: +0.57 / −0.08);
  - steering κ with the experts 0.24 (A1i: 0.39);
  - "strong" while the expert sees partial / none on 26% of turns (A1i: 13%).
  - **Rejected.**
- **A5 keeps A1i quality and saves about a third of A1i's added latency:**
  - **Quality:**
    - steering κ 0.37 and 14% (offline, the same as A1i within sampling noise);
    - teacher-facing rows as good as or slightly better than A1i;
    - live peer jumps after the hint: 13 / 36 (A1i 15, today's steering 18).
  - **Latency:**
    - the signal is ready at p50 1.4 s / p90 2.0 s, against 2.0 / 2.4 s for the whole call;
    - students are visible at 5.8 / 8.4 s, against A1i 6.5 / 8.9 s, A3i 5.4 / 8.0 s and 1.5.1 4.4 / 6.7 s.
  - **Why the saving stops there:** "partial", the minimal-hint case, still needs all five scores (p50 1.8 s offline), because the scores are interleaved with the texts.
- **Streaming adds failure modes that must be handled:**
  - **Mid-stream errors:** a mid-stream network timeout (`UND_ERR_BODY_TIMEOUT`) rejected the SDK's aggregated-response promise unhandled and **crashed the process**. It happened during a Vertex disturbance in which about 70% of all calls failed.
  - **Fix (tested):**
    - attach a handler to the aggregated promise at once;
    - a 20 s per-attempt budget (as the production policy);
    - a 4 s signal budget: without a signal, students start from the Stage-1 steering.
  - **After the fix, live:** 283 shown turns, 0 signal timeouts, 0 retries; 1 text written by the text-for-fixed-scores fallback, and 1 text failure (the sidebar would fall back to the Stage-1 rows on that turn).
- **Answer:** A5 gives **A1i-level quality with lower, but not materially lower, latency.**
  - It cuts the extra wait before the students from about 2.0 s to about 1.4 s (p50), and the p90 by about 0.5 s.
  - It remains about 0.4 s slower than the fast independent assessment, which has weaker steering.

## 1. Offline: expert agreement and timing (B200 held-out, 589 shown turn-passes; the same turns as every earlier architecture)

| | signal ready p50 / p90 | text complete p50 / p90 | steer vs expert: agree / κ | steer "strong" while the expert says partial / none | steering = teacher view |
|---|---|---|---|---|---|
| A1i sequential, independent (full call) | 2.0 / 2.5 s | 2.0 / 2.5 s | 61% / 0.39 | 13% | 100% |
| A3i fast independent + text | 0.9 / 1.1 s | 2.3 / 2.8 s | 52% / 0.25 | 19% | 100% |
| A4 one call, scores first (streamed) | **0.9 / 1.1 s** | 1.7 / 2.2 s | 52% / 0.24 | 26% | 100% |
| **A5 frozen call streamed, early signal** | **1.5 / 2.0 s** | 2.0 / 2.5 s | **60% / 0.37** | **14%** | 100% |

**A5 signal timing by signal:**
- strong: 286 turns, p50 1.1 s;
- none: 159 turns, 1.3 s;
- partial: 286 turns, 1.8 s.
- It was decided at the first skill in 155 of 731 cases and only at the fifth in 426.

**Teacher-facing rows (held-out):**

| | Ident. F1 cons. / agreed | APR signed cons. / agreed | Lev. wrongly surfaced cons. / agreed | Lev. signed cons. / agreed | all green |
|---|---|---|---|---|---|
| A1i (frozen X12) | 0.57 / 0.46 | −0.09 / −0.03 | 12% / 15% | +0.57 / −0.08 | 16% |
| A5 (the same call, streamed) | 0.60 / 0.46 | −0.03 / −0.08 | 15% / 14% | +0.41 / −0.10 | 17% |
| A4 (scores first) | 0.47 / 0.53 | −0.06 / +0.12 | 10% / 9% | **+1.30 / +0.79** | 28% |
| A3i (fast + text) | 0.56 / 0.56 | −0.01 / +0.12 | 6% / 7% | +0.74 / +0.16 | 28% |

## 2. Live (progression bench, 36 conversations per arm, all five arms concurrent, the same casts; 0 PCK and 0 student failures)

| | A0 today's steering | A1i | A3i | A4 | **A5** |
|---|---|---|---|---|---|
| shown turns | 271 | 285 | 274 | 265 | 283 |
| work before the students, p50 / p90 | 0 | 2.0 / 2.4 s | 0.9 / 1.1 s | 0.8 / 1.0 s | **1.4 / 2.0 s** |
| **students visible, p50 / p90** (1.5.1 4.4 / 6.7 s) | 4.4 / 6.7 | 6.5 / 8.9 | 5.4 / 8.0 | 5.3 / 7.8 | **5.8 / 8.4** |
| sidebar text complete, p50 / p90 | 5.0 / 7.5 | 5.0 / 7.5 | 5.4 / 8.0 | 4.6 / 7.2 | 4.9 / 7.4 |
| turn complete, p50 / p90 | 5.0 / 7.5 | 6.5 / 8.9 | 5.5 / 8.1 | 5.3 / 7.9 | 5.8 / 8.5 |
| steering = teacher view | 42% | 100% | 100% | 100% | 100% (282 / 282) |
| peer confident conclusion right after the hint (T6) | 18 | 15 | 20 | 15 | **13** |
| … at T6–T7 | 23 | 18 | 20 | 20 | **14** |
| carrier: two-step arc | 22 | 28 | 24 | 27 | 24 |
| carrier: confident conclusion after the hint | 3 | 0 | 2 | 2 | 0 |
| carrier still holds it at the end | 3 | 1 | 3 | 2 | 1 |

**Notes:**
- **Replication:** the earlier A0 / A1i / A3i arms (`pck_steering_dependency_experiment.md` §2) gave peer jumps at T6 of 22 / 15 / 19. Pooled over two runs: A0 40 / 72, A1i 30 / 72, A3i 39 / 72.
- **Noise:** with 36 conversations per arm, differences of about ±4 are noise. A5 and A1i (the same assessment) are indistinguishable.
- **A discarded first batch:** a concurrent first batch of these arms was hit by the Vertex disturbance (about 70% of turns failed, in PCK and students alike). It was set aside, not analysed (`results/*-outage`, `X12C-A5-crashed`).

## 3. Failure and parsing risk with streaming

| risk | seen | handling (prototype) | production need |
|---|---|---|---|
| a malformed early scores array | 0 / 2,193 streamed calls | parse error → identical retry (nothing used yet) | as the prototype |
| early scores ≠ final JSON | 0 | checked; the text is discarded if it differs | as the prototype |
| text invalid after the signal was used | 1 / 283 live, 1 / 731 offline | the text-for-fixed-scores call writes the text for the streamed scores | as the prototype |
| text still missing | 1 / 283 live | none in the prototype | show the Stage-1 rows (one inconsistent turn) or "no feedback rows" |
| mid-stream network timeout | the service process crashed once | handler on the aggregated promise; 20 s per-attempt budget; 4 s signal budget, after which students use the Stage-1 steering | required |
| a stalled stream blocking the students | 0 after the fix | signal budget | required |

## 4. Cost (3.1 Flash-Lite list prices; extra PCK cost per shown turn, relative to the 1.5.1 call)

| | A1i | A5 | A4 | A3i |
|---|---|---|---|---|
| calls | +1 | +1 (streamed) | +1 (streamed) | +2 |
| extra cost | +49% | +49% (same tokens as A1i) | +42% | +57% |

## 5. Implementation complexity

- **A1i:** await one call, then the students. The existing request / response pattern.
- **A5:** the server must stream.
  - The client receives the signal early and the text later, from one call.
  - With the current client-orchestrated flow (`/api/pck-feedback`, then `/api/generate`), that means:
    - either an HTTP streaming response (SSE / chunked) that the client reads in two phases;
    - or two requests holding per-turn state on the server, which needs session affinity on Cloud Run.
  - **Additionally:** the incremental parser, the signal budget, the text fallback and the error handling above.
  - **Regression risk:** higher than A1i, mostly in the transport and timeout paths. The assessment itself is A1i's.
- **A4 / A3i:** as before (§4 of the dependency report). A4 is rejected on quality.

## 6. Recommendation

1. **Reject A4** (scores first). Fast, but it loses the calibration that justifies the two-stage design.
2. **Quality:** A5 and A1i are the same assessment. Choose between them on latency against complexity:
   - **A5** saves about 0.6–0.7 s at p50 (students at 5.8 s instead of 6.5 s) and keeps A1i's quality and consistency. It costs a streaming transport and the safeguards in §3.
   - **A1i** is the simpler, lower-risk first production step.
     - It is a plain request, and A5 can be added later without changing the assessment.
     - Its cost is +2.1 s before the students (6.5 vs 4.4 s).
   - **Suggested path:** A1i first, behind a flag with the Stage-1 fallback, then A5 as a transport optimisation, if the extra second matters in teacher testing.
3. **Not tested (possible further gains):**
   - put the skills most often decisive for "partial" earlier in the order, or shorten the per-skill texts;
   - either changes the frozen prompt and would need its own validation.

## 7. Files

- **Streamed calls:**
  - `pck_eval/x12/stage2_stream.cjs` and `stream_call.cjs` (A4: scores-first format and call);
  - `stream_v3_call.cjs` (A5: the frozen call, incremental entry parser, early decision);
  - `stream_runner.mjs` (offline, `--mode v3`).
- **Service and bench:**
  - `stage2_service.mjs`: `/stream_start`, `/stream_result`, `/stream_v3_start`, `/stream_v3_result`, the signal budget;
  - `replay_harness/bench/opportunity.bench.js`: `OPP_ARCH=stream | stream_v3`;
  - `pck_eval/x12/arch_live.mjs`.
- **Local only:** `local_b200/x12/arch_eval.py`; all outputs are in git-ignored folders.
