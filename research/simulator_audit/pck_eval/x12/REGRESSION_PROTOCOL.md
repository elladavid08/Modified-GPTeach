# Final Stage-2 candidate: regression protocol (replaces the fresh-validation protocol)

Decided 2026-10-29: **no new expert annotations and no fresh manually labelled validation set.**
- **Next human validation:** the educational team's end-to-end review of the improved simulator, after A1i is implemented.
- **The sets below:** development and regression checks only. None of them is a fresh blind validation set.

## Evidence sets and what they can and cannot show

| set | size | status | use |
|---|---|---|---|
| B200 A1-only tier | 272 turns, 142 shown by 1.5.1 | development: rubric changes were tuned on it | dev metrics; not evidence of generalisation |
| B200 consensus + agreed tiers | 73 + 251 turns (three Stage-1 passes) | used in X12 / X12b / X12c and in this round | **non-blind** regression: shows that a change did not break expert agreement, not that it generalises |
| team's 1.5.0 cases (exact, local) + synthetic paraphrases (`x11/regression_cases_synthetic.json`) | 6 + 6 cases × 8 samples | seen in every round since X11 | regression on the team's own complaints |
| `fresh_decision_cases.json` v1.1.0 | 24 synthetic cases × 8 samples | developer-written; expectations fixed before any run; first run on 2026-10-29 | rule regression for the team's decisions; the developer wrote both the cases and the rubric |
| synthetic benchmark (`bench/replay.bench`), opportunity bench (`replay_harness`) | — | earlier rounds | live regression before release (carrier, Mode B, peer jumps, latency) |

## Regression thresholds for the production port (same candidate, so it must reproduce the research numbers)

| # | check | threshold |
|---|---|---|
| R1 | parity | the production prompt, schema, validator, guard list and policy equal the frozen research files (`FINAL.sha256`) on fixtures |
| R2 | show/hide | a Stage-2 call only on turns the 1.5.1 rule shows; suppression only when no displayable row is left (research: 2.8% dev / 1.7% consensus+agreed of shown turn-passes) |
| R3 | operations | text contract 100% of shown rows; Stage-1 fallbacks ≤ 2% of shown turns (research: 0 of 873) |
| R4 | `fresh_decision_cases.json` | ≥ 20 of the 23 gatable cases pass (research final: 20); every guard case passes |
| R5 | team cases (exact + synthetic) | no case worse than the research final by more than 2 of 8 samples |
| R6 | B200 consensus + agreed (one pass) | per skill, relevance F1 within 0.05 of the research final; leveraging signed bias within ±0.5 |
| R7 | live (opportunity bench) | premature peer jumps after the hint no worse than research A1i (15 / 36, ±4 noise); carrier detection no worse than 1.5.1; students ≤ +2.3 s at p50 against 1.5.1; 0 turns failed by Stage 2 |

## Tooling

- `stage2_runner_final.mjs`: the frozen candidate on recorded Stage-1 outputs.
- `apply_final.mjs` (`final_pipeline.cjs`): the guard and the no-feedback rule.
- `to_stage1_shape.mjs` with:
  - `x11/score_regression.mjs` for the team cases;
  - `score_fresh.mjs` for the decision cases.
- `local_b200/x12/eval_x12.py`: B200 tiers.
- The steering comparison: `local_b200/x12/arch_eval.py` signals.
