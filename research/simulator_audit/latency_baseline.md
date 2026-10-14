# LLM latency baseline (synthetic benchmark, 2026-10-05)

Purpose: measure real model latency for the two per-turn calls before choosing retry/timeout values. See `regression_test_plan.md` §0.13, where the proposal was provisional, and §0.16 (telemetry).

**Measurement only.** No production code, prompts, models, retries or timeouts were changed. `SYSTEM_VERSION` is unchanged (1.3.5).

## 1. Method

- **Server:** the unmodified `server/server.js` (branch `feature/post-pilot-improvements`, system 1.3.5), started locally on port 3101 with the existing configured service account (default key path). No credentials or configuration were changed. `/api/health` confirmed token acquisition for project `cloud-run-455609`, `us-central1`, model `gemini-2.5-flash-lite`.
- **Client code paths:** the benchmark drives the **real client functions** from `src/`:
  - `getPCKFeedback` → `/api/pck-feedback`;
  - `callAI` → `makeProsePrompt` + `ChatMessage.toAIformat` → `/api/generate`.

  So request shapes are exactly production's: full student system prompt, personas, impact analysis, the first-turn addendum copied from `Chat.jsx`, the PCK `conversationHistory` (full `ChatMessage` objects, including image base64) and `feedbackHistory.slice(-3)`.
- **Real Gemini calls, no mocks.** Calls were sequential, one simulated teacher at a time. The scratchpad runner used Jest 23 in a node environment with a minimal `http`-based `fetch`, which sets no timeout, like production.
- **Synthetic data only:**
  - 6 active scenarios × 5 sequential teacher turns = **30 turns per run**, with fixed realistic Hebrew teacher messages per scenario;
  - student replies were real model output and were fed back into the history, so context grows turn by turn;
  - the cast rotated over the 9 personas (3 per scenario);
  - **4 text+drawing turns** per run, using the repo's static geometry PNGs `public/images/rotated-square.png` (8.4 KB) and `rotated-parallelogram.png` (7.6 KB);
  - no image-only turns (PCK skips those by design);
  - **no participant data, nothing written to Firestore** (`ConversationLog` not used).
- **Runs:** 2 runs (run 1 ≈ 161 s, run 2 ≈ 212 s wall time), **120 calls in total** (60 PCK, 60 student).
- **Recorded per call:** agent, scenario, turn, history message count and text characters, PCK request bytes, server `latencyMs` (telemetry), benchmark-measured round trip, `clientLatencyMs` (genai), `attempts`, `finishReason`, success / error.
- The benchmark scripts and raw JSON live in the session scratchpad only (not added to the repo).

## 2. Aggregate results

Server latency = model-call wall time from telemetry, including the existing 429 back-off. Round trip ≈ server latency + 3–11 ms (local loopback; see limitations). Percentiles are nearest-rank, in milliseconds.

### PCK (`/api/pck-feedback`)

| sample | n | min | p50 | p90 | p95 | max | mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| run 1 | 30 | 1523 | 3487 | 4480 | 4804 | 12487 | 3678 |
| run 2 | 30 | 1526 | 3680 | 4803 | 11215 | 19163 | 4343 |
| **pooled** | **60** | **1523** | **3577** | **4711** | **10998** | **19163** | **4010** |
| pooled, excluding the 4 spikes > 6 s | 56 | 1523 | 3474 | 4480 | 4711 | 4804 | 3335 |

- Calls with `attempts > 1`: **1/60** (run 2, S1 T3). The server logged a real `429 / rate limit` and retried after 2 s; total 19.2 s.
- `finishReason`: `STOP` 60/60.
- Failures: **0/60**. That includes 0 C10 parse/schema rejections under JSON mode.
- Feedback shown: 49/60 turns (the synthetic messages mostly respond to errors).
- PCK request size: 2.8 KB – 28 KB (median ≈ 9.7 KB). The larger requests carry image base64 in `conversationHistory`.

### Student generation (`/api/generate`)

| sample | n | min | p50 | p90 | p95 | max | mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| run 1 | 30 | 1022 | 1635 | 2131 | 2453 | 2505 | 1687 |
| run 2 | 30 | 1146 | 1634 | 2345 | 12385 | 14024 | 2700 |
| **pooled** | **60** | **1022** | **1635** | **2144** | **2505** | **14024** | **2194** |
| pooled, excluding the 3 spikes > 6 s | 57 | 1022 | 1634 | 2131 | 2345 | 2505 | 1673 |

- `attempts > 1`: 0/60.
- `finishReason`: `STOP` 60/60.
- Failures: **0/60** (no parse failures).
- Replies per turn: 2 or 3 students.

### Whole turn as the teacher experiences it (PCK round trip + student round trip, sequential)

Pooled, n = 60: min 2556, **p50 5182**, p90 6754, p95 17072, max 21088, mean 6215 ms.

## 3. Comparisons

| comparison | PCK p50 (p90) | student p50 (p90) | note |
|---|---|---|---|
| early turns 1–2 (n = 24) | 2850 (3906) | 1460 (2080) | Turn 1 PCK is fastest (~1.5–2 s, short history; often a Gate 0 decision) |
| turn 3 (n = 12) | 3752 (4804) | 1653 (2453) | |
| late turns 4–5 (n = 24) | 3999 (4803) | 1864 (2144) | |
| history ≤ median chars (run 1: ≤ 443) | 3461 | 1524 | |
| history > median chars | 3752 | 1857 | |
| student text-only (n = 52) | | 1609 (2095) | includes 3 spikes |
| student text+drawing (n = 8) | | 2043 (2505) | small sample; ~+0.4 s at the median |

- **Context:** latency grows moderately with turn position / history: PCK p50 +1.1 s and student p50 +0.4 s from turns 1–2 to 4–5. History here reached only ~1.7k characters (5 turns). Pilot conversations have a median of 8 and a maximum of 44 turns, so longer contexts are **untested** and will be slower.
- **Drawings:** text+drawing student calls were slightly slower (n = 8, too small for a firm conclusion). No spike involved a drawing turn.
- **Spikes are not explained by context size.** For example, run 2 S5 T2 student took 12.4 s with a 149-character history.

## 4. Outliers and failures

| run | turn | agent | server ms | attempts | history chars | note |
|---|---|---|---:|---:|---:|---|
| 1 | S4 T5 | pck | 12487 | 1 | 1251 | single slow attempt |
| 2 | S1 T3 | pck | 19163 | **2** | 465 | **429 rate limit** → 2 s back-off → retry |
| 2 | S2 T2 | pck | 10998 | 1 | 235 | single slow attempt |
| 2 | S6 T4 | pck | 11215 | 1 | 1284 | single slow attempt |
| 2 | S4 T4 | student | 14024 | 1 | 854 | single slow attempt |
| 2 | S5 T2 | student | 12385 | 1 | 149 | single slow attempt, short history |
| 2 | S6 T4 | student | 9862 | 1 | 1284 | same turn as a PCK spike |

- **7 of 120 calls (~6%) exceeded 6 s**, all between 9.9 and 19.2 s. Excluding them, the distributions are tight: PCK ≤ 4.8 s, student ≤ 2.5 s.
- Spikes clustered in run 2 (6 of 7). That suggests time-varying service latency (load or queueing), not a property of particular requests.
- **No failures:** 0 errors, 0 parse/schema rejections, and all `finishReason` values were `STOP`.
- **One quota (429) event** at single-user sequential load. With a classroom of concurrent teachers, 429s should be expected more often; the existing back-off (2 / 4 / 8 s) then adds directly to latency.

## 5. Provisional timeout proposal

These values are not chosen from the single maximum. They combine two references:
- the stable **body** of the distribution (PCK p99 ≈ 4.8 s, student p99 ≈ 2.5 s);
- the observed **single-attempt spike ceiling** (≈ 12.5 s PCK, ≈ 14 s student).

They assume the timeout is implemented **together with one retry** (§0.13: retry on timeout / 5xx / 429 within the budget). A timeout without a retry would turn every spike above it into a visible failure.

| | PCK | student generation | rationale / safety margin |
|---|---|---|---|
| **Per-attempt model timeout** | **20 s** (range 15–25 s) | **20 s** (range 15–20 s) | ≈ 4× (PCK) / 8× (student) the body p99, and ≈ 1.4–1.6× the slowest observed single attempt. A lower value (~12–15 s) would cut the spike tail and rely on the retry. That may reduce tail latency, but it is unproven: it needs the retry in place and production data on whether retries of spiked calls come back fast. |
| **Total server request budget** (all attempts + back-off) | **45 s** | **45 s** | 2 attempts × 20 s + ≤ 5 s of back-off (the 429 back-off must be capped to fit). |
| **Client hard timeout** (`AbortController`) | **50 s** | **50 s** | Server budget + 5 s for transport/proxy. Each request stays under the IIS/ARR default of 120 s. |
| Resulting worst-case locked turn | ≈ 100 s (50 + 50) | | Typical turn ≈ 5 s (p50), p90 ≈ 7 s. |

Compared with the earlier, data-free proposal (§0.13.4: PCK 25 / 55 / 60 s, student 20 / 45 / 50 s), the data supports **similar or slightly lower** PCK values and **unchanged** student values.

Optional UX threshold (decision 5 in §0.13.7): a "still working" hint after **≈ 8 s**. That is above the body p99 of a whole turn (~7 s), so it would appear only on spike turns.

## 6. Is ~30 turns enough?

- **For the body of the distribution: yes.** Medians and p90s were stable between the two runs (PCK p50 3.5 vs 3.7 s; student p50 1.6 vs 1.6 s), and failure/parse rates were 0. That is enough to fix the **order of magnitude** of the timeouts and the timeout hierarchy.
- **For the tail (p95 / p99), and for the spike and 429 frequency: no.**
  - Spikes were 1 of 60 calls in run 1 and 6 of 60 in run 2. The tail is time-varying, and 120 calls cannot estimate p99 reliably.
  - Before tightening timeouts below ~20 s, or tuning retry aggressiveness, use **production telemetry** (`turns[].telemetry`, `failedAttempts`, available since 1.3.5) from real sessions, or a larger synthetic run spread over different times of day (e.g. ≥ 300 calls per agent).

## 7. Limitations

- **Local and synthetic.**
  - Calls went from this development machine directly to Vertex `us-central1`.
  - **No production IIS/ARR proxy, no production server host or network, no browser.** The measured client overhead (3–11 ms) is loopback-only, so real `clientLatencyMs` will be higher. Production telemetry will show by how much.
- **Single-user sequential load.** No concurrent teachers. Quota/429 behaviour under classroom load is not represented beyond the one 429 seen.
- **Short conversations:** at most 5 turns and ~1.7k characters of history, while pilot conversations run up to 44 turns. Late-conversation latency is extrapolated, not measured.
- **Fixed teacher messages:** they do not adapt to student replies, so pedagogical flow differs from real lessons. Latency is driven mainly by prompt and output size, which are representative.
- **Drawings:** two small static PNGs (7.6–8.4 KB). Real canvas exports sent to the model are full-resolution and typically larger, so the drawing effect may be underestimated. n = 8.
- **Run window:** two runs within about 10 minutes on one day. The latency variation over time (spikes) is under-sampled.
- **Telemetry granularity:** server `latencyMs` includes back-off and does not split per-attempt time (the 19.2 s call had a 429 plus a 2 s back-off).
- **Cost:** 120 short real calls. No participant data was sent.
