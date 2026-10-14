# X7: PCK thinking level (MINIMAL vs LOW), experiment

Status: experiment only, 2026-10-13, on committed **1.4.3** (`5e262a3`). PCK model `gemini-3.1-flash-lite`.
- No production, prompt, schema, model or `SYSTEM_VERSION` change.
- **Expert gold:** the local, git-ignored B200 set (`pck_eval/local_b200/`, see `pck_b200_expert_grounding.md`).
- Aggregates only in this file.
- **Model calls:** the turns went to Gemini on Vertex AI (pilot service account) via unmodified local servers with an analysis-only preload. Nothing was written to Firestore.

## Summary

- **Arm B (LOW, everything else identical) is not operable.**
  - LOW spends about 1,200–1,900 thinking tokens, and they count against the unchanged `maxOutputTokens` 2000.
  - On the first 127 turns: 56 of 169 model calls hit `MAX_TOKENS` (33%), 20 requests needed a second attempt, and **17 failed outright (13%)**. In production a failure shows the teacher the PCK failure notice.
  - B was stopped there.
- **A diagnostic arm B′ (LOW + `maxOutputTokens` 8192, nothing else changed)** answered the scoring question (596 turns, 0 failures):
  - **APR score 1 is still not used:** 1 of 129 relevant APR rows (A: 0 of 601 across three passes);
  - **expert 1 → model 2 persists:** consensus 8 of 17 scored rows (A: 14 of 35);
  - mean signed difference +0.47 (A +0.40).
  - **The decision collapses:**
    - recall against consensus 0.79 → **0.47** (agreed decisions 0.83 → 0.42; A1-only 0.65 → 0.37);
    - κ 0.61 → 0.33;
    - B′ hides 160 turns that A showed, rating 131 of them "positive" quality;
    - decision flips A ↔ B′ 31%, against 7–9% between two A passes.
  - **APR relevance drops** (consensus F1 0.81 → 0.51).
  - **Identification relevance improves** (consensus F1 0.27 → 0.61, agreed 0.39 → 0.55), largely because far less is shown.
  - **Leveraging relevance drops**, and its inflation persists.
- **Interpretation:**
  - With more reasoning, 3.1 applies the 1.4.3 prompt's literal gate ("feedback only when a quotable student error exists"; "no student error → no feedback, regardless of quality") more strictly.
  - The B200 experts contradict that gate (they give APR feedback on non-error teaching moves), so LOW moves **away** from the experts.
  - Its outputs are **shorter** (visible output p50 293 vs 584 tokens) plus about 1,160 hidden thinking tokens. It is not more verbose, and it is not better calibrated.
- **Cost:**
  - latency p50 2.6 → 5.6 s (×2.2), p90 3.9 → 8.8 s;
  - about 1.3–1.6× tokens cost per PCK call (thinking billed as output);
  - B (2000 tokens) adds a 13% failure rate.
- **Verdict: LOW is not worth using in production.**
  - The synthetic guardrail and Mode B were not run: the expert-gold check failed on the primary question and regressed the decision.
  - The next experiment should be the **schema-order probe**: scores before praise. The X6 / X7 evidence points at the contract, not the reasoning budget. The decision gate is an X5 question, now sharper.

## 1. Arms

| arm | thinking | `maxOutputTokens` | everything else |
|---|---|---:|---|
| **A** | MINIMAL (1.4.3) | 2000 | committed 1.4.3 |
| **B** (as specified) | LOW | 2000 | identical (asserted per call) |
| **B′** (diagnostic) | LOW | **8192** | identical (asserted) |

- **Preload:** `pck_eval/x7/x7_arm.cjs` (tracked, no participant data) changes only `generationConfig.thinkingConfig.thinkingLevel` (B), plus `maxOutputTokens` (B′), on PCK calls. It throws if anything else differs.
- **Unchanged:** prompt, schema and order, rules, student model, display, steering.

## 2. Method

**Passes:**
- A: all 596 expert-labelled turns (577 analysed; 19 image-only / empty skipped, as in production), plus 2 more passes over the 324 gold-tier turns (consensus + double);
- B: stopped after 127 turns (§3);
- B′: one full pass (596).

**Noise reference:** decision flips between A passes are 24 / 26 / 28 of 324 (7–9%); APR relevance flips 35–37.

**Context:** as in X6. The real client, the full preceding conversation, the production scenario, an empty feedback history; displayed semantics (a skill counts only if feedback is shown).

## 3. Reliability and cost

| | A (MINIMAL) | B (LOW, 2000) | B′ (LOW, 8192) |
|---|---:|---:|---:|
| model calls | 1,205 | 169 | 579 |
| finish `MAX_TOKENS` | 0 | **56 (33%)** | 0 |
| requests with 2 attempts / final failures | 0 / 0 | 20 / **17 of 127** | 0 / 0 |
| thinking tokens p50 / p90 / max | 0 | 1,227 / 1,916 / 1,921 | 1,158 / 1,852 / 3,721 |
| visible output tokens p50 | 593 | 250 | 293 |
| mean output + thinking tokens | 504 | 1,490 | 1,529 |
| input tokens p50 | 9,628 | 9,494 | 9,503 |
| PCK latency p50 / p90 | 2.60 / 3.90 s | 5.83 / 7.50 s | **5.62 / 8.78 s** |
| relative cost per call (output priced 4× / 8× input) | 1.0 | — | ≈ 1.34 / 1.58 |

- **Latency:** +116% at p50, far above the 15% budget.
- **Student turns:** PCK runs before the student call, so the whole turn would wait about 3 s longer.

## 4. Expert-gold results

### APR

| tier | arm | relevance F1 / κ | scored | exact | mean signed | expert 1 → 2 | expert 0 → 1/2 | expert 2 → 1 | model 1 used |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| consensus | A pass 1 | 0.81 / 0.56 | 35 | 21 | +0.40 | 14 | 0 | 0 | 0 |
| consensus | A, 3 passes pooled | 0.83 / 0.57 | 110 | 65 | +0.39 | 44 | 0 | 0 | 0 |
| consensus | **B′** | **0.51 / 0.25** | 17 | 9 | +0.47 | 8 | 0 | 0 | 0 |
| agreed | A pass 1 | 0.70 / 0.48 | 35 | 14 | +0.49 | 19 | 0 | 0 | 0 |
| agreed | A pooled | 0.70 / 0.49 | 104 | 39 | +0.46 | 55 | 1 | 0 | 0 |
| agreed | **B′** | **0.37 / 0.21** | 13 | 5 | +0.62 | 8 | 0 | 0 | 0 |
| A1-only | A | 0.69 / 0.32 | 104 | 22 | +0.86 | 65 | 14 | 0 | 0 |
| A1-only | **B′** | **0.43 / 0.14** | 52 | 10 | +0.79 | 37 | 3 | 0 | 0 |

- **APR score distribution** (all relevant rows): A 2: 563 / 0: 38; B′ 2: 121 / **1: 1** / 0: 7.
- **Weighted κ:** consensus A 0.05, B′ 0.00. Agreed: A 0.21 (pooled), B′ 0.38 on only 13 rows (not meaningful).
- **Paired, where both arms scored APR:** 5 score changes in 596 turns. LOW does not make the model use APR 1.

### Other skills (pooled A vs B′; relevance F1, score)

| skill | consensus A → B′ | agreed A → B′ | A1-only A → B′ |
|---|---|---|---|
| identification | F1 0.27 → **0.61**; exact 7/10 → 6/10 | 0.39 → **0.55**; weighted κ 0.60 → 0.79 (n 38 → 18) | 0.53 → 0.53; exact 27/40 → 27/38 |
| characterisation | 0.08 → 0.33 (n tiny) | 0.14 → none | 0.07 → 0.38 (6 scored) |
| interpretation | 0.18 → 0.12 | none → 0.20 | none → 0.10 |
| leveraging | 0.68 → **0.37**; signed +1.29 → +1.80 | 0.34 → none (no B′ rows) | 0.42 → **0.22**; signed +1.62 → +1.57 |

**Reading:**
- Identification precision rises because B′ shows mainly turns with a clear error.
- Leveraging relevance halves.
- p2 / p3 stay negligible.
- No skill shows better *score* calibration beyond small-n noise.

### Decision

| tier | A pass 1: P / R / κ | A pooled | B′: P / R / κ |
|---|---|---|---|
| consensus (73) | 0.96 / 0.79 / 0.61 | 0.96 / 0.80 / 0.63 | 1.00 / **0.47** / **0.33** |
| agreed (194) | 0.96 / 0.83 / 0.60 | 0.96 / 0.82 / 0.57 | 0.97 / **0.42** / **0.21** |
| A1-only (272) | 0.95 / 0.65 / 0.39 | — | 0.95 / **0.37** / 0.18 |

**Drift (596 paired turns):**
- 187 decision flips (31%; A noise 7–9%): 160 A-shown → B′-hidden, 13 the other way;
- APR relevance flips 193;
- identification relevance flips 104 (noise 32–37).

**Why B′ hides** (pass 1, 547 analysed turns):
- quality: A positive 282 / neutral 221 / problematic 44; B′ 322 / 190 / 35;
- shown: A 319, B′ 172;
- trigger `excellent_pck_use`: A 276, B′ 138;
- the 160 newly hidden turns were rated "positive" by B′ in 131 cases.
- So B′ judges the move good but withholds feedback, following the prompt's "no student error → no feedback" gate more literally.

**Missed-identification shape** (identification 0, shown): A 38, B′ 31 of 596 turns. The pilot data has almost no bare acknowledgements (5), so the 1.4.1 bare-acknowledgement behaviour cannot be checked here.

## 5. Synthetic guardrails and Mode B

**Not run.** The brief makes them conditional on a real improvement on expert gold. There is none on APR, and the decision regressed far beyond noise.

## 6. Answers

- **Does LOW make 3.1 use APR 1?** No: 1 of 129 rows.
- **Is the improvement worth the latency and cost?** There is no APR improvement. Identification relevance improves, but at the cost of half the expert-confirmed feedback, ×2.2 latency, about 1.3–1.6× cost, and (at the current token limit) 13% failures.
- **Better reasoning or just longer output?** Neither in the useful sense. Visible output is shorter, and the extra reasoning is spent applying the prompt's no-error gate more literally, which the experts disagree with.

## 7. Next

1. **Schema-order probe (recommended next).**
   - Put `skills_assessment` (scores) before `pedagogical_quality` / `demonstrated_skills` (praise) in `PCK_RESPONSE_SCHEMA`, MINIMAL thinking, nothing else changed.
   - Same 324 gold-tier turns, 3 passes against A.
   - It is a contract change, so measure decision drift against the A-vs-A noise above, then the synthetic benchmark.
2. **X5 decision gate.**
   - X7 shows the prompt's error-required gate is what limits recall against the experts.
   - A relevance / decision experiment ("APR feedback on non-error teaching moves") is now better motivated.
   - Test it separately: it interacts with the contested closing / praise controls.
3. **Two-stage scoring** remains the fallback if the order probe also fails (as in X2 / X6).

## 8. Limitations

- **B** was measured on 127 turns only; its failure rate alone excludes it.
- **B′:** one pass. Its effects are 3–5× the A-vs-A noise, so more passes were not needed for the conclusions.
- **Gold:** expert gold on APR scores is modest (consensus 35 scored rows per pass).
- **Cost** uses an assumed output : input price ratio (4–8×).
- **Replay context:** empty feedback history, no drawings for PCK.

**Local files** (git-ignored, `pck_eval/local_b200/`):
- `x7/eval_x7.py`, `x7_eval.json` / `.txt`, `calls-{A,B,Bp}.jsonl`, server and bench logs;
- `replay-x7A-p{1,2,3}.jsonl`, `replay-x7B-p1.jsonl`, `replay-x7Bp-p1.jsonl`.
