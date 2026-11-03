# Student model × pacing (2×2) and two-stage latency, experiment

Status: experiment only, 2026-10-28, on committed **1.5.1** (`6452787`). Production code and `SYSTEM_VERSION` are unchanged. Synthetic conversations only. No Firestore writes.

## Summary

- **Model (current pacing):** `gemini-3.5-flash` beats the current `gemini-3.5-flash-lite` on the carrier arc and on Hebrew, as the investigation found:
  - carrier confident jumps after the minimal hint: 3 → **0**;
  - two-step arcs: 21 → **24**;
  - correct at the check turn: 19 → **31**;
  - garbled replies: 4 → **0**;
  - **cost:** student call +0.5 s at p50;
  - **quota:** no 429s in 720 calls today.
- **Pacing prototype P1** (two-step carrier arc + one-step peer rule): **no measurable benefit with either model.**
  - **Peer jumps** at T6–T7 are unchanged: Lite 21 → 23, Flash 20 → 22.
  - **Carrier:** two-step arcs fall (21 → 19, 24 → 20).
  - **With Flash**, more carriers drop the misconception before any teaching: 8 → 13 of 36.
  - Lite + P1 shows more garbled replies (4 → 14).
  - **Not recommended.** It confirms the earlier finding that peer pacing is not controllable by prompt wording (`student_misconception_carrier_experiment.md`).
- **Two-stage PCK in parallel with students** (frozen X12 Stage 2, live, 1,098 shown turns, 0 Stage-2 failures):
  - **Students:** student replies are not delayed.
  - **Sidebar:** it appears about 2.1 s later than in 1.5.1 (p50 2.9 → 5.0 s, p90 5.4 → 7.6 s).
  - **Turn completion** (turn lock and log wait for both):
    - with Lite students, +0.56 s at p50 and +1.0 s at p90;
    - with Flash students, 0 at p50 and +0.6 s at p90 (Stage 2 finishes first in 55–60% of turns).

## 1. Setup

- **Bench:** `replay_harness/bench/opportunity.bench.js` 1.3.0, progression plan:
  - T1–T5: opening, probes and diagnostics;
  - T6 hint (a minimal teaching move);
  - T7 rethink;
  - T8 check, addressed to the carrier;
  - T9 explain;
  - T10 apply.
- **Casts and size:** seeded random production-like casts, 6 scenarios × 6; 36 conversations per arm, all arms on the same casts.
- **Fixed in every arm:** the 1.5.1 PCK (Stage 1), its steering and the production carrier selection.
- **Arms:**

  | | current pacing (1.5.1 carrier block) | pacing P1 |
  |---|---|---|
  | `gemini-3.5-flash-lite` (production) | L-cur | L-pac |
  | `gemini-3.5-flash` (model swap only, `x11_arm.cjs`) | F-cur | F-pac |

- **Pacing P1** (`replay_harness/prototype/pacing.js`) replaces exactly two lines of the production carrier block:
  - **Carrier:** after the teacher's first real move, a partial understanding or a specific doubt; the consolidated understanding only after checking, justifying or applying.
  - **Peers:** after a minimal hint, one useful step, but not the full conceptual conclusion.
- **Labels and definitions:**
  - an LLM judge (`scripts/arc_judge.mjs`, `gemini-3.5-flash`, validated 35 / 36 in the investigation; not re-validated here);
  - definitions in `scripts/arc_aggregate.mjs`; a correct reply phrased as a question is "tentative".

## 2. Results (36 conversations per arm)

| measure | L-cur | L-pac | F-cur | F-pac |
|---|---:|---:|---:|---:|
| carrier voices the misconception (T1–T5) | 35 | 33 | 36 | 36 |
| carrier drops it before teaching | 6 | 6 | 8 | **13** |
| carrier still holds it when teaching starts | 30 | 30 | 28 | 23 |
| **first response after the minimal hint (holding carriers): hold** | 6 | 6 | 4 | 3 |
| — doubt / partial | 15 | 14 | 19 | 15 |
| — tentative correct | 6 | 5 | 5 | 5 |
| — **confident full conclusion** | 3 | 5 | **0** | **0** |
| **two-step arc** (holding → doubt / tentative → justified at T8–T10) | 21 | 19 | **24** | 20 |
| peer confident conclusion right after the hint (T6) | 21 | 19 | 19 | 15 |
| peer confident conclusion at T6–T7 | 21 | 23 | 20 | 22 |
| a peer contributes a partial step at T6–T7 | 25 | 26 | 28 | 27 |
| carrier correct at the check (T8) | 19 | 21 | **31** | **33** |
| carrier justified by the end | 36 | 36 | 36 | 36 |
| carrier still holds it at the end | 3 | 0 | 4 | 1 |
| student calls / failures | 360 / 0 | 360 / 0 | 360 / 0 | 360 / 0 |
| student call p50 / p90 | 1.4 / 1.7 s | 1.5 / 1.8 s | 2.0 / 2.5 s | 2.0 / 2.6 s |
| replies / mean length | 802 / 100 | 813 / 103 | 755 / 126 | 762 / 131 |
| garbled replies (server counter) | 4 | 14 | **0** | **0** |

**Reading:**
- **Model:**
  - Flash removes the carrier's confident jumps (3 → 0) and the garbled Hebrew (4 → 0).
  - It gives more two-step arcs (21 → 24) and a carrier who is correct at the check far more often (19 → 31).
  - Peer jumps are about the same (21 → 20 at T6–T7).
  - Its replies are longer (126 vs 100 characters).
- **Pacing P1:**
  - It does not reduce peer jumps (T6–T7: +2 with both models).
  - The small fall at T6 alone (21 → 19, 19 → 15) is within the noise for 36 conversations and is offset at T7.
  - With Flash it makes the carrier leave the misconception earlier (13 vs 8 before teaching), so fewer carriers are holding when teaching starts. That is the opposite of the goal.
  - With Lite it increases garbled replies (4 → 14). The mechanism is not established.
- **Scenario-level:** peer jumps concentrate in scenarios 2 (perpendicular diagonals) and 6 (kite–rhombus) in every arm (4–6 of 6), where the minimal hint is close to the answer.

## 3. Two-stage PCK latency (live; Stage 2 starts with the student call, `OPP_STAGE2=1`)

| | L-cur | L-pac | F-cur | F-pac |
|---|---|---|---|---|
| shown turns / Stage-2 failures | 280 / 0 | 274 / 0 | 272 / 0 | 272 / 0 |
| Stage 1 p50 / p90 | 2.9 / 5.4 s | 3.1 / 5.8 s | 3.0 / 5.4 s | 3.1 / 5.8 s |
| student call p50 / p90 | 1.5 / 1.8 s | 1.5 / 1.8 s | 2.0 / 2.6 s | 2.1 / 2.7 s |
| Stage 2 p50 / p90 | 2.0 / 2.4 s | 2.1 / 2.5 s | 2.0 / 2.4 s | 2.1 / 2.5 s |
| **sidebar visible**, 1.5.1 → two-stage, p50 | 2.9 → 5.0 s | 3.1 → 5.2 s | 3.0 → 5.0 s | 3.1 → 5.2 s |
| sidebar visible, two-stage p90 | 7.6 s | 7.9 s | 7.7 s | 7.9 s |
| **turn complete**, 1.5.1 → two-stage, p50 | 4.4 → 5.0 s | 4.6 → 5.2 s | 5.0 → 5.2 s | 5.3 → 5.4 s |
| added to the turn, p50 / p90 | +0.56 / +1.0 s | +0.60 / +1.1 s | 0 / +0.61 s | 0 / +0.60 s |
| Stage 2 finished before the students | 27 / 280 | 21 / 274 | 150 / 272 | 164 / 272 |

- **Student replies:** they appear exactly as early as in 1.5.1, because the students depend only on Stage 1.
- **Sidebar:** it appears about 2.1 s later. In 1.5.1 it appears with the Stage-1 result, before the students; with two stages it appears after the students in most Lite turns.
  - The G3 target "sidebar p90 ≤ 6 s" is **missed** (7.6–7.9 s).
- **Turn lock and turn log:** they wait for both calls.
  - With the current student model this adds about 0.6 s at p50.
  - With `gemini-3.5-flash` students the median turn is not slower.

## 4. Recommendation

1. **Student model:** move students to `gemini-3.5-flash` as its own versioned change.
   - It is the better carrier and Hebrew model, at +0.5 s per student call.
   - Quota was clean today (720 calls, 0 errors); keep the 429 handling and watch the quota in a live smoke.
2. **Pacing:**
   - **Do not adopt P1.**
   - Peer jumps after a minimal hint are not moved by prompt wording, in four attempts so far (v2, v3, pc1, P1).
   - If the team still wants slower peers, the remaining levers are structural:
     - fewer peers replying right after a minimal hint (routing who speaks, not what they say);
     - or accepting that a peer may give the conclusion and having the carrier still check it.
   - Either needs its own design and a teacher-perspective review.
3. **Two-stage PCK latency:**
   - It is acceptable for the turn if students move to `gemini-3.5-flash`.
   - The sidebar delay (+2.1 s) is inherent to running Stage 2 after Stage 1. Ways to reduce it:
     - shorter Stage-2 output (the texts are most of the 440 output tokens);
     - a "feedback is being prepared" placeholder;
     - or showing the Stage-1 decision immediately and the rows when Stage 2 returns.
