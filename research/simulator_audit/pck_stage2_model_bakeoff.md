# Stage-2 model bakeoff (A1i, frozen x12-final-v5c)

Status: research only, 2026-11-03, on committed **1.6.1** (`3146ba0`). Production code, models and `SYSTEM_VERSION` are unchanged.
- **Expert data:** the local, git-ignored B200 set. Aggregates only; no participant text or model output is reproduced here.
- **Follows:** `pck_a1i_implementation_plan.md` (A1i production design) and `pck_stage2_final_round.md` (frozen candidate).

**Decision:** keep `gemini-3.1-flash-lite` (MINIMAL thinking) as the Stage-2 model. The 1.6.1 production configuration stays as it is.

## 1. What was compared

Only the Stage-2 model changed. Everything else was frozen:
- Stage 1 and its model (`gemini-3.1-flash-lite`, MINIMAL);
- the final Stage-2 prompt, rubric (`rubric_final.FROZEN.json`), schema, validator and retry policy (at most 2 identical attempts);
- the leveraging guard v2 and the "no displayable row → no feedback" policy (`apply_final.mjs`);
- the A1i student contract;
- all evaluation cases and scorers.

There was no per-model prompt tuning.

| tag | model | thinking | maxOutputTokens | note |
|---|---|---|---|---|
| lite31 | `gemini-3.1-flash-lite` | MINIMAL | 1200 | baseline = production |
| flash35 | `gemini-3.5-flash` | MINIMAL | 1200 | |
| flash38 | `gemini-3.8-flash` | LOW | 4096 | rejects MINIMAL (400), so LOW is its lowest level. 4096 is headroom for thinking. Its outputs average ~405 tokens, and a 60-call rerun at 1200 had no truncation. |
| argon | `gemini-4-argon` | LOW | 4096 | rejects MINIMAL. Run as an upper bound. |

**Tooling** (research only):
- `pck_eval/x12/stage2_model_runner.mjs`: a copy of the frozen `stage2_runner_final.mjs` with `--model`, `--think`, `--maxout` and `--limit` options. The frozen runner is unchanged.
- `pck_eval/x12/stage2_model_swap.mjs`: a server preload for the live check. It sends only the Stage-2 request, recognised by the frozen prompt's opening sentence, to another model and thinking level. `server/server.js` is unmodified.

## 2. Evaluation sets

All sets are development and regression data and are **not blind**:
- consensus and agreed are non-blind;
- the cases were written while the rubric was being developed.

**Offline sets.** Every model ran on the same recorded Stage-1 turns.

| set | size | used for |
|---|---|---|
| B200 dev (A1 single-annotated) | 142 shown turns × 2 samples | per-skill metrics, run-to-run stability, steering |
| B200 held-out: consensus + agreed | 589 shown turns × 1 | per-skill metrics, steering |
| Synthetic regression cases (`x11/regression_cases_synthetic.json`) | 6 cases × 8 | regression |
| Team regression cases (local, from the team's feedback) | 6 cases × 8 | regression |
| Fresh decision cases (`x12/fresh_decision_cases.json` v1.1.0) | 24 cases × 8 | rubric decisions D1 / D2 / guard |

**Live check.** The opportunity bench: `OPP_STUDENT=production`, progression plan, random casts, 36 conversations per run, on the unchanged 1.6.1 server.

**Scorers:** `eval_x12.py`, `score_regression.mjs`, `score_fresh.mjs`, `arc_judge.mjs` / `arc_aggregate.mjs`, `opportunity_metrics.mjs` and `contract_audit.mjs`.

## 3. Main comparison (offline)

Per-skill precision (P), recall (R) and F1 are pooled over dev, consensus and agreed. "sel" = turns the model marked relevant / turns the experts marked.

| | lite31 (production) | flash35 | flash38 | argon |
|---|---|---|---|---|
| Error identification F1 / exact score | .55 / 69% | .64 / 72% | .62 / 82% | .66 / 76% |
| Characterisation F1 / exact score | .32 / 39% | .29 / 44% | .32 / 75% | .31 / 73% |
| Interpretation R (P) | .35 (.19) | .40 (.20) | .26 (.23) | .23 (.23) |
| APR F1 / exact / signed bias | .77 / 58% / +.01 | .75 / 58% / +.13 | .78 / 58% / .00 | .78 / 56% / −.14 |
| Leveraging sel / F1 / signed bias | 327/207 / .48 / +.21 | 155/207 / .51 / +.14 | 91/207 / .48 / −.18 | 84/207 / .41 / −.10 |
| All-green feedback (experts: 10% consensus, 16% A1) | 8–10% | 21–24% | 23% | 14–18% |
| Steering κ vs experts (held-out / dev) | .28 / .12 | .31 / .25 | .36 / .30 | .37 / .20 |
| "Strong" steering where experts say none/partial | 13% | 23% | 19% | 13% |
| Fresh decision cases passed (gated) | 19/23 | 18/23 | 21/23 | 22/23 |
| Synthetic / team regression cases passed | 5/6, 4/6 | 5/6, 3/6 | 5/6, 4/6 | 5/6, 4/6 |
| Text contract (shown rows) | 100% | 100% | 100% | 100% |
| Run-to-run: identical rows / same signal | 65% / 86% | 69% / 90% | 76% / 90% | 73% / 88% |
| Stage-2 fallback to 1.5.1 (no time budget) | 0% | 9.7% | 0.1% | 0% |
| Quota (429) errors | 0 | 0 | 0 | 0 |
| Stage-2 call latency p50 / p90 | 2.1 / 2.6 s | 3.7 / 5.5 s | 5.3 / 12.8 s | 9.3 / 28.0 s |
| Fallback under the production budget (8 s per attempt, 12 s total; simulated) | 0% | ~5% | ~17% | ~72% |
| Estimated cost per 1,000 Stage-2 calls (see §6) | ~$1.6 | ~$9.8 | ~$4.3 | ~$11.5 |

**Notes**
- **Cases common to all models:**
  - Team case `E-INTERP-PARTIAL` fails for every model, because Stage 1 hides 2 of its 8 samples. Its outcome is set by Stage 1.
  - Fresh case `GOODBYE-AFTER-RESOLUTION` is never shown by Stage 1 and is not gated.
- **Missed-interpretation cases:** flash38 and argon flag the missed interpretation in neither "missed interpretation during an adapted response" case (0/8 each); lite31 scores 8/8.
- **3.5 Flash failures:** all 312 failed attempts ended with `MAX_TOKENS` at the frozen 1,200-token cap.
- **3.8 Flash latency tail:**
  - It is on the provider side. 60 calls sent one at a time still had 12 attempts over 8 s, with a maximum of 137 s. A par-4 rerun had 4 of 60.
  - Running the four models concurrently did not cause it.
- **Day-to-day noise:**
  - The lite31 run reproduces the earlier frozen-v5c runs within noise: dev identification F1 .60 vs .59, Leveraging F1 .40 vs .40, all-green 8% vs 8%.
  - Consensus Interpretation recall varies by about ±.09 between days.
- **Text proxies:**
  - Third-person reference to the teacher: lite31 27 fields, flash35 2, flash38 1, argon 4.
  - Harsh-word candidates: 25 / 39 / 10 / 14.
- **Blinded text review:**
  - 10 shared held-out turns, 4 anonymised outputs each, one rater; indicative only.
  - lite31 had 5 of the 7 clear problems: a generic row, two wrong or premature Leveraging rows, a wrong characterisation, and criticism in the positive field.
  - flash38 had 2 mild score inflations, argon 1 harsh double 0, flash35 1 tone label.

## 4. Live A1i student check (3.8 Flash)

This ran on the unchanged 1.6.1 server; the preload changes only the Stage-2 model. Each arm is 36 conversations, and the three new runs ran concurrently. "1.6.1 earlier" is the 1.6.1 release regression run.

| | 1.6.1 control | 1.6.1 earlier | 3.8 Flash A | 3.8 Flash B |
|---|---|---|---|---|
| Peer jump at turn 6 | 10 | 6 | 4 | 10 |
| Carrier resolves confidently at first teaching | 0 | 0 | 0 | 0 |
| Check answered correctly | 13 | 17 | 19 | 20 |
| Justified by end / stuck | 35 / 7 | 34 / 3 | 35 / 3 | 35 / 6 |
| Stage-2 fallbacks on shown turns | 0 / 275 | 1 / 281 | 14 / 271 (5%) | 18 / 281 (6%) |
| Suppressed / contract flags | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| Student failures / garbled replies | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| Teacher feedback visible p50 (shown turns) | 5.0 s | 5.1 s | 8.0 s | 8.0 s |
| Students visible p50 / p90 (shown turns) | 7.1 / 9.5 s | 6.9 / 9.5 s | 10.0 / 12.9 s | 10.0 / 13.6 s |

**Live check result**
- **Student behaviour:** unchanged within noise. "Check answered correctly" leans slightly towards 3.8 Flash.
- **Latency:** about +3 s on every shown turn, for both the teacher's sidebar and the students.
- **Fallbacks:** 5–6% of shown turns. On those turns the students are steered by the Stage-1 analysis instead of the Stage-2 rows.
- **Argon:** not run live, because about 72% of its turns would fall back under the production budget.

## 5. Trade-offs

- **3.1 Flash-Lite (production):**
  - The fastest and most reliable option: 2.1 s p50 and no fallbacks.
  - All-green rate close to the experts', and the highest Interpretation recall of the low-latency models.
  - Main weakness: Leveraging over-selection, which production already contains with the leveraging guard and the fresh D2 cases.
  - Weaker on identification and characterisation scoring, and writes more third-person and generic text.
- **3.5 Flash:**
  - Not an improvement: about 10% of turns fall back because output is cut off at the frozen 1,200-token cap.
  - The most over-strong steering (23%) and inflated all-green feedback.
  - Raising the cap would change the frozen design.
- **3.8 Flash:**
  - Better identification and characterisation scoring, steering κ, stability, fresh cases and tone.
  - Removes Leveraging over-selection, but swings to under-selection: it misses about two-thirds of consensus Leveraging turns, and F1 is unchanged.
  - Lower Interpretation recall; this is the area of the accepted R6 exception.
  - More all-green feedback than the experts give.
  - Costs about 3 s more latency and has a provider-side tail, giving about 6–17% fallbacks under the current budget.
- **4-argon:**
  - Similar quality to 3.8 Flash; the best identification and fresh cases.
  - Latency is not compatible with the production budget.

## 6. Cost estimates: not verified

The cost row uses list prices found in third-party articles, **not independently verified** against Google's billing or price list.
- **Prices used:** USD per 1M input / output tokens. Thinking tokens are counted as output.

  | model | input | output | note |
  |---|---|---|---|
  | 3.1 Flash-Lite | 0.25 | 1.50 | |
  | 3.5 Flash | 1.50 | 9.00 | |
  | 3.8 Flash | 0.75 | 3.75 | reported as introductory, later 1.50 / 7.50 |
  | 4-argon | 2.00 | 10.00 | |

- **Calculation:** applied to the mean measured tokens per successful call. About 3,650 input and 400–480 output tokens for every model.
- **Use:** the figures show relative order of magnitude only and **must not be treated as exact accounting figures**.

The decision does not rest on cost. It is driven by **quality, latency and fallback reliability**. Every candidate would cost only a few dollars per 1,000 Stage-2 calls.

**Sources** (accessed 2026-11-03):
- https://www.lindy.ai/blog/vertex-ai-pricing
- https://www.cloudzero.com/blog/google-vertex-ai-pricing/
- https://www.nops.io/blog/vertex-ai-pricing/
- https://www.finout.io/blog/top-16-vertex-services-in-2026
- https://www.pump.co/blog/google-vertex-ai-pricing/
- https://www.betterclaw.io/blog/google-vertex-ai-agent-builder
- https://www.opslyft.com/blog/google-vertex-ai-pricing
- https://calcaas.com/llm-pricing/vertex-ai
- https://markaicode.com/pricing/vertex-ai-pricing/

## 7. Decision

Keep `gemini-3.1-flash-lite` (MINIMAL, 1,200 output tokens, 8 s / 12 s budget) as the Stage-2 model in 1.6.1.

None of the alternatives dominates it on quality:
- the gains of 3.8 Flash and Argon come with lower Interpretation recall, Leveraging under-selection and more all-green feedback;
- the live student behaviour is unchanged;
- every alternative adds latency or fallbacks: 3.5 Flash truncates, 3.8 Flash adds about 3 s and 5–17% fallbacks, and Argon would mostly fall back.

## 8. When to retest 3.8 Flash

Retest 3.8 Flash with the same frozen protocol (`stage2_model_runner.mjs`, then the live check with `stage2_model_swap.mjs`) when any of these holds:
1. **Latency stabilises.** Stage-2 p90 is ≤ 8 s and fewer than 2% of attempts exceed 8 s, in a sequential probe on at least two different days. That means fewer than 2% fallbacks under the current budget, with no budget change.
2. **The team re-prioritises.** It decides that Leveraging precision, scoring calibration and feedback tone matter more than Interpretation recall. Alternatively, a later rubric revision restores 3.8 Flash's Interpretation recall without per-model prompt tuning.
3. **The latency target is relaxed.** The team accepts a longer Stage-2 budget (about 3 s more per shown turn) as a deliberate product change. This changes the frozen design and needs its own sign-off.
4. **The model line changes.** Flash-Lite is deprecated, or a new Flash-Lite or Flash release changes the latency/quality balance.

**Pass criteria** for a retest:
- interpretation recall within day-to-day noise of the baseline (pooled R ≥ .32);
- all-green rate ≤ 16%;
- "strong while expert none/partial" ≤ 15%;
- live fallbacks ≤ 2% and students-visible p50 ≤ +1.5 s over the baseline;
- no worse in the live student check.
