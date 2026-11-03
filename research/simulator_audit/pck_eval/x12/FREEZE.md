X12 Stage 2 frozen 2026-10-28 before any held-out data was used:
  variant v3s = stage2.cjs (prompt, schema, validation) + rubric_v3.FROZEN.json, field order score_first,
  gemini-3.1-flash-lite, production baseGenerationConfig (MINIMAL thinking), maxOutputTokens 1200,
  at most 2 attempts (identical request), fallback to the Stage-1 rows.
Developed only on the A1-only (single-annotator) tier: v1s/v1t, v2s/v2t, v3s (2 samples each). Hashes: FROZEN.sha256.
