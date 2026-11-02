X12 FINAL Stage-2 candidate (A1i design), frozen 2026-10-29 (second freeze; supersedes the first freeze of the same day).
Hashes: FINAL.sha256. Report: ../../pck_stage2_final_round.md. Production plan: ../../pck_a1i_implementation_plan.md.

  prompt   stage2.cjs (frozen X12 builder, unchanged) via stage2_final.cjs, score_first, no general bullets
  rubric   rubric_final.FROZEN.json (= rubric_v5c.json): v3 + the team's interpretation and leveraging decisions (v4),
           the summary / restated-conclusion rules resolved from the B200 expert evidence (v5, v5b), and the team's
           "a question about the mathematics itself is not probing" interpretation clarification (v5c)
  guard    leveraging_guard.cjs v2: no leveraging row for a teacher message that is only an acknowledgement
           (closed word list + cast names, <= 5 words, no "?", letter stretching normalised)
  policy   final_pipeline.cjs: Stage 2 only on turns Stage 1 shows; guard; NO FEEDBACK when no displayable row is left
           (students then steered as on any turn without feedback: the Stage-1 analysis unchanged); otherwise the
           rows are the display and the steering signal (stage2_dep.cjs signalFromRows / adaptImpact)
  model    gemini-3.1-flash-lite, production baseGenerationConfig (MINIMAL thinking), maxOutputTokens 1200
  retries  at most 2 attempts with the identical request; failure -> the 1.5.1 rows (with the guard) and 1.5.1 steering

Evidence used (none of it is a fresh blind validation set): the B200 single-annotator tier (development), the B200
consensus and agreed tiers (already used in earlier rounds, so non-blind regression evidence only), the team's 1.5.0
cases and their synthetic paraphrases (regression), and fresh_decision_cases.json v1.1.0 (developer-written synthetic
regression cases, written before any run; first run on this candidate and on the two before it).
The next human validation is the educational team's end-to-end review of the implemented simulator.
