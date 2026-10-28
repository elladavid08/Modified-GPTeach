# Investigation of the educational team's feedback on 1.5.0 (X11)

**Baseline:** released **1.5.0** (`1ce6b21`), frozen. Branch `feature/post-1.5-educational-feedback`.
- No production code, prompt, schema, model configuration or `SYSTEM_VERSION` was changed.
- All runs used the unmodified 1.5.0 server and client. Model arms were selected by an analysis-only preload, `pck_eval/x11/x11_arm.cjs`, which swaps only the model id (plus, where a model requires it, the thinking level and output budget) and asserts that every other request field is unchanged.

**Feedback reviewed:** the team's issue table for 1.5.0 (2026-10-22 round).
- It contains 9 concrete cases, mostly as screenshots, in 5 areas:
  - student Hebrew;
  - the feedback text structure;
  - generous scores;
  - wrong or missing skills;
  - fast misconception resolution.
- The document, the transcribed cases and every replay of them stay local (`pck_eval/local_b200/edu_feedback_1.5/`, git-ignored). This file contains only aggregates and synthetic paraphrases.

**Data and tiers:**
- **B200 expert turns:** 596 teacher turns from 45 pilot conversations, local only.
  - Tiers: consensus (73), agreed (expert-agreed items of the 251 double-annotated turns), single-annotator A1 (272).
  - No tuning was done in this phase. Every tier is used only for evaluation.
- **Frozen synthetic benchmark** (`pck_eval_benchmark.json`): 116 rubric-labelled cases, the 95 high-confidence ones scored, 3 repetitions.
- **Regression cases:** 6 exact local cases and 6 tracked synthetic paraphrases (`pck_eval/x11/regression_cases_synthetic.json`), 8 samples each.
- **Student runs:**
  - the opportunity bench 1.2.0 with the new **progression plan**: 36 conversations per model, random production-like casts;
  - Mode B: 24 conversations per model;
  - a targeted Hebrew probe: 6 contexts × 12 samples per model.

---

## Summary

| team issue | root cause (evidence) | does a stronger model fix it? | recommendation |
|---|---|---|---|
| 1. Odd or incorrect student Hebrew | `gemini-3.5-flash-lite` produces word-level corruption and non-words: 2.0% of Mode B replies and 1.0% of progression replies have a confirmed defect; 10% of a blinded sample has a clear error | **yes for students:** `gemini-3.5-flash` had 0 defects in 554 Mode B replies, 1 garble in 764 progression replies and 0 clear errors in the blinded sample | switch the **student** model to `gemini-3.5-flash` after the gates in §G; fix its quota first |
| 2. Green row with no explanation; yellow row without "what was good" | the single PCK call never writes the positive part for score-1 rows (0 of 152), and leaves score-2 evidence empty in about 6% of shown rows (mostly random). The display can only reuse model text | **no:** 3.5 Flash has the same score-1 gap (65 of 67) | deterministic guard for score 2 (one identical re-ask; never render an empty row); the score-1 contract needs a model-side text stage |
| 3. Scores too generous, "everything green" | Leveraging is scored 2 almost always (bias +1.3), and Adapted Pedagogical Response (APR) is inflated (+0.4 to +0.8). A score of 0 stops the skill chain, so missed skills are not shown; 71% of shown feedback is all green | **partly:** 3.5 Flash lowers APR bias to +0.15, but Leveraging stays at 2 and 72% is still all green | **two-stage PCK** with a Stage 2 that owns relevance, scores and text (X12, experiment) |
| 4. Leveraging when absent or early; Interpretation missing; APR instead of Interpretation | the **skill-chain rubric** in the PCK prompt: Interpretation is reachable only in a late stage, and the characterisation definition absorbs "why the student thinks so"; the stage that scores APR also opens Leveraging when APR ≥ 1 | **no:** Interpretation recall stays 0 for all models; a "why do you think" question is scored APR 8 of 8 by every model | the same X12 Stage 2, with B200 boundary rules |
| 5. Students resolve too fast | the **carrier** mostly progresses (only 5 of 27 jump with confidence after a minimal teaching move), but **a peer** states the full conclusion right after the hint in 25 of 36 conversations. Five carrier and steering instructions push full resolution after teaching | 3.5 Flash: carrier jump 1 of 26, peer jump 21 of 36 | carrier two-step arc **plus peer pacing after minimal teaching moves** (student-prompt experiment, §E) |

**Model decision:**
- **PCK:** keep `gemini-3.1-flash-lite` for now.
  - A drop-in switch to 3.5 Flash changes the show/hide decision on 20% of turns (run-to-run noise is 7%) and doubles latency.
  - It does not fix the boundary, Leveraging-score or score-1 problems.
  - 3.8 Flash suppresses most feedback.
  - Revisit the model inside the two-stage design.
- **Students:** `gemini-3.5-flash` is the better student model on Hebrew and slightly better on misconception pacing, at about +0.9 s p50. It needs a quota increase and must pass Mode B gates (§D.4) before release.

---

## A. Feedback text structure: trace and quantification

### A.1 Path of the per-skill text (code trace)
1. **Prompt** (`/api/pck-feedback`):
   - every skill entry has `evidence` and `what_could_be_better` ("only if score < 2");
   - a later step tells the model to copy every relevant entry with **score ≥ 1** into `demonstrated_skills` with its evidence, and score-0 entries into `missed_opportunities`.
2. **Schema** (`pck_feedback_contract.js`): in `skills_assessment` only `skill_id` and `is_relevant` are required. The text fields are optional and not conditioned on the score.
3. **Validation:** structure only. A relevant skill needs a score; its text may be missing.
4. **Show/hide:** `should_provide_feedback` and the B27 guard decide. Text completeness plays no part.
5. **Stored** `pckFeedback`: the model fields as returned.
6. **Display** (`pckDisplayRows.js`, 1.4.3), used by the sidebar, log viewer, CSV and Excel export:
   - score 2 / 1: positive = own `evidence`, else the single matching `demonstrated_skills` evidence;
   - score 1 also shows `what_could_be_better` on a "לשיפור:" line;
   - score 0: own `what_could_be_better`;
   - a row without text is still rendered (dot + skill name) and only counted.
7. **Summary input** (`/api/pck-summary`): reads only `skills_assessment[].evidence` and `what_could_be_better`, with **no** `demonstrated_skills` fallback. The summary model therefore often sees no positive evidence for rows the teacher saw with text.

### A.2 Measured on the expert turns (current PCK, 4 passes, 1,077 shown feedbacks)

| score | rows | own field has the required text | after the 1.5.0 display fallback | where the text is |
|---|---:|---:|---:|---|
| 2 | 1,437 | 2.5% | **93.3%** | positive text in `demonstrated_skills`. Of the empty rows: no `demonstrated_skills` entry (96), text put in `what_could_be_better` (26), no text anywhere (70) |
| 1 | 152 | 0% | **0%** | the model writes **only** the improvement (152 of 152), never a positive part, neither in `evidence` nor in `demonstrated_skills` |
| 0 | 229 | 100% | 100% | — |

- **Empty green rows are mostly random:** of 441 (turn, skill) pairs scored 2 in ≥ 2 passes, 47 were empty in at least one pass but only 11 in every pass.
- **Yellow rows are structurally incomplete:** "what exists + what to improve" cannot be produced by any display rule, because the positive text does not exist in the output.
- **3.5 Flash:** score-1 positive missing 65 of 67, score-2 with text 94.7%.
- **3.8 Flash:** score-1 positive missing 9 of 20, score-2 98.5%, but it shows far less feedback (§C).

**Conclusion:** this is not a parsing or default-filling defect. It is model omission, which the schema allows, validation accepts, the display renders and the summary input ignores.

### A.3 Fix

**Deterministic (no model change):**
1. **One canonical row-text function** used by the sidebar, viewers, exports **and the summary input**:
   - the 1.4.3 rule, plus a score-0 fallback to the single matching `missed_opportunities` item;
   - a client/server parity test.
   - This removes the summary/sidebar mismatch. Score-0 rows are already complete in this data, so the fallback is a safety net.
2. **Completeness guard inside the existing 2-attempt policy** (B24):
   - if shown feedback has a **score-2** row with no positive text after rule 1, re-ask once with the identical request (a re-sample, not a prompt change);
   - if it is still empty, do not render that row; if no row remains, do not show the feedback;
   - count everything in telemetry.
   - Expected: most of the ~6% empty green rows are recovered, and no empty green row is rendered.

**Not deterministic:**

3. **Score 1 needs the model to write a positive part.** Two options, both experiments:
   - (a) a schema-only arm: `evidence` required for scored entries, no prompt block. It has never been run in isolation; X1 showed that the schema **plus** prompt block shifted decisions.
   - (b) the text written by a Stage 2 that receives the fixed decision (§G, X12). This is the structural solution.
   - Until then, a yellow row shows only the improvement, labelled as today.

---

## B. Scoring and relevance against the experts (current PCK, `gemini-3.1-flash-lite`)

Three earlier passes of the identical 1.4.3/1.5.0 request (FL31h) plus one fresh 1.5.0 pass (FL31). The fresh pass reproduces the earlier ones. Relevance is judged on **shown** rows; gold "relevant" includes skills the expert scored 0 (a missed skill).

### B.1 Per skill, consensus tier (73 turns; FL31h, 3 passes pooled)

| skill | relevance P / R / F1 | missed (gold relevant, not shown) | wrongly surfaced | expert scores | model scores | exact | signed bias | weighted κ |
|---|---|---:|---:|---|---|---:|---:|---:|
| error identification | 0.39 / 0.21 / 0.27 | 79% | 9% | 0:6 1:3 2:1 | 0:6 2:4 | 70% | +0.30 | 0.80 |
| error characterisation | 0.25 / 0.05 / 0.08 | 95% | 3% | 1:2 | 2:2 | 0% | +1.0 | — |
| interpretation of student thinking | 0.45 / 0.11 / 0.18 | **89%** | 3% | 0:4 2:1 | 2:5 | 20% | +1.6 | — |
| adapted pedagogical response | 0.95 / 0.73 / 0.83 | 27% | 9% | 1:45 2:65 | 0:1 2:109 | 59% | **+0.39** | 0.05 |
| leveraging | 0.65 / 0.71 / 0.68 | 29% | **15%** | 0:22 1:20 2:3 | 1:6 2:39 | 9% | **+1.29** | −0.01 |

**Other tiers (same arm):**
- **APR signed bias:** +0.46 (agreed) and +0.86 (A1). The experts mostly give 1; the model gives 2 in 94–100 of 104 rows.
- **Leveraging signed bias:** +1.04 (agreed) and +1.62 (A1). The experts give mostly 0 (a missed opportunity); the model never gives 0 and rarely 1.
- **Decision (show/hide) vs experts:** P 0.96 / R 0.80 (consensus), 0.96 / 0.82 (agreed), 0.95 / 0.65 (A1).

### B.2 The reported boundary errors, measured

| pattern | consensus | agreed | A1 |
|---|---:|---:|---:|
| Interpretation relevant for the experts but not shown | 40 of 45 | 18 of 18 | 17 of 17 |
| … with APR shown instead | 25 | 14 | 11 |
| Leveraging shown although the experts mark it not relevant | 24 | 71 | 28 |
| … together with an APR row | 22 | 60 | 27 |
| median turn of a wrongly surfaced Leveraging, after the first error | 2 | 5 | 3 |
| median turn of an expert-relevant Leveraging, after the first error | 7 | 12 | 5 |

- **Score inflation, 1 → 2:** APR 45 of 45 expert-1 rows scored 2 (consensus). Leveraging 20 expert-1 and 22 expert-0 rows were scored 1 or 2, nearly all 2.
- **"Everything green":** 71% of shown feedbacks show only green rows. Missed skills (expert score 0) are almost never shown, because a score of 0 ends the chain (below).

### B.3 Root cause in the rubric (PCK prompt, Phase 2)
1. **A strict sequential chain with lifecycle stages A–D:**
   - only the "due" skill and at most one step forward are assessed;
   - a score of 0 makes every later skill irrelevant ("Stop here").
   - So a missed skill is reported only if it is the first one due, and later missed skills are never surfaced: the "everything green" effect.
2. **Interpretation of Student Thinking is reachable only in stage C** ("error already characterised"). Its neighbour, characterisation, is defined as "*what kind* of error it is **and why the student thinks that way**", which already absorbs interpretation. A teacher's "why do you think…?" in stages A, B or D is therefore assessed as characterisation or APR.
3. **Stage D pairs APR with Leveraging** ("skill 5 only if skill 4 score ≥ 1"). Almost every wrongly surfaced Leveraging comes with an APR row (22 of 24, 60 of 71, 27 of 28).
4. **The model's Leveraging criterion is "turned the error into a learning opportunity that deepens understanding".** The team's criterion (generalising the conclusion beyond the original error, or applying it to other cases) is stricter. Any good continuation is credited.

These causes are in the rubric, so they persist across models (§C) and on the team's exact cases (§F).

---

## C. PCK model bakeoff

**Availability (probed on this project, 2026-10-26, Vertex `global`):**
- available: `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-3.5-flash` (accepts MINIMAL thinking), `gemini-3.8-flash` (MINIMAL unsupported; LOW is its lowest);
- `gemini-3.1-flash` and `gemini-3.8-flash-lite` return 404;
- no Pro model was added (latency and cost).

**Arms:**
- production PCK prompt, schema, validation and guard unchanged;
- **3.5 Flash:** production settings exactly (MINIMAL, 2,000 output tokens);
- **3.8 Flash:** LOW thinking with an 8,192-token budget, the only possible deviation;
- 3 passes each: all 596 turns, then 2 × the 324 consensus/double turns.

| | 3.1 Flash-Lite (current) | 3.5 Flash | 3.8 Flash |
|---|---|---|---|
| decision P / R, consensus | 0.96 / 0.80 | 0.98 / 0.73 | 1.00 / **0.30** |
| decision P / R, A1 | 0.95 / 0.65 | 0.96 / 0.57 | 0.96 / **0.21** |
| decision flips vs current (same turns) | run-to-run noise 41 of 596 (7%) | 120 of 594 (**20%**) | 253 of 595 (43%) |
| error identification F1, consensus / agreed | 0.27 / 0.39 | **0.68 / 0.72** | 0.73 / 0.63 |
| interpretation recall (all tiers) | 0.11 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| APR F1 / signed bias, consensus | 0.83 / +0.39 | 0.65 / **+0.15** | 0.28 / +0.04 |
| APR signed bias, A1 | +0.86 | +0.66 | +0.35 (on 29 rows) |
| leveraging wrongly surfaced, consensus / A1 | 15% / 13% | **5% / 3%** | 0% / 1% |
| leveraging score when shown | 2 in 39 of 45 | 2 in 24 of 24 | 2 in 3 of 4 |
| all-green share of shown feedback | 71% | 72% | 59% |
| score-1 rows with a positive part | 0% | 3% | 55% |
| synthetic benchmark: decision / FP / FN | 90.9% / 9.9% / 8.8% | 87.3% / **21.0%** / 8.8% | 85.3% / 0% / **21.6%** |
| synthetic: case constraints held (no score 2 on partial moves, …) | 23% | **77%** | 92% |
| synthetic: APR score in the allowed range | 51% | **89%** | 83% |
| latency p50 / p90 (PCK call) | 2.5 s / 2.9 s | 5.2 s / 8.8 s | 4.5 s / 8.5 s |
| mean input / output (+thinking) tokens | 9.6k / 0.5k | 9.8k / 0.6k | 9.8k / 0.4k |
| failed calls | 0 of 1,021 | 12 of 1,703 (429 quota, timeouts); 3 hit MAX_TOKENS | 6 of 1,681 |

**Reading:**
- **3.5 Flash** is a better scorer on the score-bound checks (APR, error identification) and almost stops surfacing Leveraging wrongly.
- **But 3.5 Flash is not a drop-in replacement:**
  - it moves the show/hide decision on a fifth of turns, in opposite directions on the two datasets (lower recall on the expert turns, twice the false positives on correct answers in the synthetic set);
  - it keeps Leveraging at 2 when shown, never surfaces Interpretation, and leaves 97% of yellow rows without a positive part;
  - it doubles latency;
  - it hit the project's TPM quota in this run.
- **3.8 Flash** suppresses most feedback (recall 0.21–0.30) and never recognises genuine Leveraging in the synthetic set (0 of 9). It is ruled out.
- **Relative cost:** token volume is the same across models.
  - Third-party list prices (`student_model_options.md` §5): 3.1 Flash-Lite $0.25 / $1.50 and 3.8 Flash $0.75 / $3.75 per million input / output tokens.
  - The 3.5 Flash price was not verified.

**Answer to the key question:** a stronger API model does **not** remove enough of the scoring, relevance and text problems to replace the architectural fix. The boundary and "all green" problems come from the rubric, and the score-1 text from the single-call output design. 3.5 Flash is worth testing as the **Stage-2** model inside X12, where its calibration gains matter and its decision shift cannot occur.

---

## D. Student model bakeoff

**Arms:**
- current `gemini-3.5-flash-lite`;
- `gemini-3.5-flash` (production settings);
- `gemini-3.8-flash` (LOW thinking, 2,048-token budget).

PCK fixed at production 3.1 Flash-Lite. The 1.5.0 student prompt and carrier are unchanged.

### D.1 Hebrew quality

| measure | 3.5 Flash-Lite | 3.5 Flash | 3.8 Flash |
|---|---:|---:|---:|
| blinded manual review, 40 random replies per model: clear language errors | **4** (10%) | 0 | 0 |
| … minor oddities | 0 | 2 | 1 |
| progression transcripts (819 / 764 / 711 replies): garble (foreign letters inside Hebrew words) | **8** (1.0%) | 1 | 0 |
| … numeral–noun agreement errors (automatic) | 1 | 0 | 3 |
| targeted probe, 6 contexts × 12 samples: clear errors (agreement, garble, invented shape name) | 4 in 195 replies | 1 in 170 | 0 in 176 |

- The clear errors on the current model are of the reported kinds: non-words, an Arabic letter or word inside a Hebrew word, a garbled verb form, the "שתי זוגות"-type agreement error, and an invented transliterated shape name in the naming probe.
- 3.8 Flash also made the "שתי זוגות"-type error three times.
- 3.5 Flash reuses some answers across samples: the same short sentence 7 times in one probe context. No repetition problem was seen inside conversations (D.4).

### D.2 Misconception arc (progression bench, 36 conversations per model)

**Judge:**
- an LLM judge (`scripts/arc_judge.mjs`, `gemini-3.5-flash`) labels every carrier reply, and every peer reply at the teaching turns, as misconception / doubt / correct (with or without reason) / other;
- my hand check of 36 sampled T6–T7 carrier labels agreed on the coarse category in 35;
- correct labels were then split mechanically into **confident** and **tentative** (question-form, asks for confirmation).

| measure | 3.5 Flash-Lite | 3.5 Flash | 3.8 Flash |
|---|---:|---:|---:|
| carrier voices the misconception at T3–T5 | 31 of 36 | 35 | 22 |
| carrier corrects itself before teaching (T3–T5) | 8 | 10 | **17** |
| carrier still holds it when teaching starts | 27 | 26 | 15 |
| **carrier's first response after a minimal teaching move (T6–T7), of those holding:** | | | |
| — still holds | 4 | 2 | 0 |
| — doubt / partial | 12 | 14 | 3 |
| — tentative correct (question, asks to confirm) | 6 | 9 | 10 |
| — **confident full conclusion** | **5** | **1** | 2 |
| **a peer states the confident full conclusion right after the hint** | **25 of 36** | 21 | **30** |
| carrier correct at the T8 check | 19 | 25 | 35 |
| carrier gives a justified correct answer by T10 | 34 | 34 | 36 |
| carrier still holds the misconception at the end | 3 | 2 | 4 |
| student call p50 / p90 | 1.4 s / 1.8 s | 2.3 s / 4.3 s | 3.1 s / 4.2 s |
| student call errors | 0 of 603 | 4 of 578 (429 quota) | 0 of 549 |

**Reading:**
- On 1.5.0 the **carrier** mostly progresses: doubt, then check, then justified. A confident jump after one minimal teaching move happens in 5 of 27 carriers.
- What the team saw is mainly a **peer** jumping to the full conclusion right after the hint (25 of 36). This matches the team's screenshot, where a peer, not the carrier, states the conclusion.
- Scenario-wise:
  - the carrier's confident jumps concentrate where the hint is close to the answer (scenario 2, perpendicular diagonals; scenario 6, kite–rhombus);
  - scenario 4 still self-corrects before teaching.
- **3.8 Flash** loses the misconception before teaching far more often (17 of 36) and lets peers jump more (30 of 36). It is worse for the core 1.5.0 behaviour.
- **3.5 Flash** paces slightly better: carrier jump 1 of 26, peer jump 21 of 36.

### D.3 Answer to "progressed appropriately" vs "instantly jumped"
- **Carrier (current model, 27 carriers holding the misconception when teaching started):** after the minimal teaching move, 16 held or doubted, 6 reached a tentative conclusion, and **5 jumped** with confidence. Only 3 of all 36 carriers still held the misconception at the end.
- **Peers:** the instant jump is mostly theirs (25 of 36).
- So a carrier-only rule cannot fully fix the reported behaviour. Peer pacing after **minimal** teaching moves is needed as well (§E).

### D.4 Mode B stability (24 conversations per model; 6 scenarios × 2 designed casts × 2 runs; production carrier; PCK 3.1 Flash-Lite)

| measure (`analyze.js` + manual review) | 3.5 Flash-Lite | 3.5 Flash | 3.8 Flash |
|---|---:|---:|---:|
| student replies (turns without a reply) | 557 (0) | 554 (0) | 468 (0) |
| exact self-duplicates / guard matches / prompt-example copies / leaks | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| invalid speaker name | 0 | 1 (an Arabic letter inside a cast name) | 0 |
| repeated question unanswered | 0 | 0 | 1 (justified) |
| semantic-repetition candidates | 7 | 1 | 0 |
| teacher-attribution candidates | 89 | **24** | 15 |
| cross-student contamination candidates (all reviewed for 3.5 Flash: shared correct mathematical phrasing, no misconception transfer) | 13 | 34 | 15 |
| Hebrew defects (garble + agreement, manually confirmed) | **11** (7 garble, 4 agreement) | 0 | 0 |
| student call p50 / p90 | 1.3 s / 1.6 s | 2.1 s / 2.9 s | 2.8 s / 3.9 s |
| PCK failures / student failures | 0 / 0 | 0 / 0 | 0 / 0 |

**Reading:**
- **3.5 Flash shows no stability regression:**
  - far fewer teacher-attribution candidates;
  - no Hebrew defects;
  - one name slip in 554 replies (the client counts such replies as `unknownSpeaker`).
  - Its contamination candidates are vocabulary overlap from longer replies (mean 112 vs 88 characters).
- **3.8 Flash** is quieter (fewer replies, 468) and slower, and §D.2 shows it loses the misconception before teaching.

---

## E. Misconception progression: design (not implemented)

### E.1 Why resolution is fast (1.5.0 student prompt)
After the first move that counts as "addressing" the misconception, five instructions push full resolution:
1. **Carrier rule:** "then … if it was clear, shows the new understanding". A definition check led by the teacher qualifies as addressing.
2. **Steering exception:** applies only "until the teacher has actually addressed it".
3. **PCK alignment rules for positive quality:** "Students MUST show understanding progress", with "אה עכשיו הבנתי!" as the example, "apply or demonstrate what they learned", "move forward".
4. **PCK prompt:** a formal definition → "MUST be improved". The student prompt then says "improved → MUST show improvement" and use `after_good_scaffold`.
5. **Persona `update_response`:** e.g. "accepts and moves on" after a counterexample.

Peers receive the same positive and improved steering and are not bound by any pacing rule after teaching.

### E.2 Smallest change: one student-prompt block, no new call or classifier

**Carrier, two steps:**
- **After a first meaningful teaching move:** partial progress. Take up the teacher's point in your own words, and voice one specific remaining doubt rooted in the original intuition, or apply it tentatively and ask to confirm. Do not restate the original claim as certain.
- **Consolidated understanding** when the idea has been checked, justified or applied:
  - the teacher asks you to check, justify or apply it and you succeed; or
  - the teacher addresses the doubt; or
  - a second teaching move reinforces it.
- **Anti-stuck:** after that, do not keep resisting.

**Peers, pacing after minimal teaching moves:**
- when the teacher's move is a hint or reminder (not a full explanation), peers may add one reasoning step, a question or a doubt, but leave the conclusion to the carrier or the teacher;
- after the teacher's explanation, or once the carrier has checked the idea, peers reason freely.

**Steering exception extended by one step:** until consolidation, "positive / improved" means the partial step for the carrier, and "one step" for peers after a hint.

**What stays as in 1.5.0:**
- the diagnostic-questions rule;
- carrier selection;
- PCK;
- the B27 guard.

**Risks:**
- the carrier lags behind good teaching;
- a formulaic "remaining doubt";
- peers become passive.
- Prompt-only peer control failed before teaching in pc1 (1.5.0 §8). The post-hint pacing is a different and narrower target, but it may fail the same way, so it must be measured.

**Gate** (progression bench + Mode B, vs 1.5.0):
- held through diagnostic questions ≥ 1.5.0;
- carrier confident jump after a minimal teaching move ≤ 10%;
- peer confident jump after a hint ≤ 30% (from 69%);
- carrier consolidated after check, explanation or application ≥ 90%;
- stuck at end ≤ 5%;
- no regression in repetition, garble, attribution or latency.

---

## F. Regression cases (team's examples)

**Files:**
- local exact cases (git-ignored): `pck_eval/local_b200/edu_feedback_1.5/cases_local.json`;
- tracked synthetic paraphrases: `pck_eval/x11/regression_cases_synthetic.json`;
- runner: `pck_eval/bench/regression_cases.bench.js`;
- scorer: `pck_eval/x11/score_regression.mjs`.

**PCK cases** (8 samples each; pass = the team's expectation):

| case (team issue) | 3.1 Flash-Lite | 3.5 Flash | 3.8 Flash |
|---|---|---|---|
| partial Leveraging (new direction, not developed): Leveraging ≤ 1 | **0/8** (always 2) | **0/8** | 8/8 *(feedback hidden)* |
| Leveraging at the start of the discussion: not shown | 8/8 | 7/8 | 7/8 |
| teacher names the reasoning without probing: Interpretation ≤ 1 | 7/8 | 8/8 | 7/8 |
| definition question, Interpretation missed: Interpretation shown | 2/8 | **0/8** | **0/8** |
| "why do you think…?": Interpretation ≥ 1 / APR not shown | 4/8 / **0/8** | 0/8 / **0/8** | 7/8 / **0/8** |
| "כן" after the students conclude: Leveraging not shown | 6/8 | 7/8 | 8/8 *(feedback hidden)* |
| required text on every shown row (all cases) | 38/48 | 35/48 | 48/48 |

- The synthetic paraphrases reproduce the pattern with different strength:
  - partial Leveraging scored 2 in 2/8 (3.1 Flash-Lite) and 8/8 (3.5 Flash);
  - APR on the "why" question in 8/8 (3.1 Flash-Lite), 5/8 (3.5 Flash) and 8/8 (3.8 Flash).
  - So the exact cases, not only the paraphrases, should gate a release.
- **Student cases:**
  - **Hebrew:** the probe contexts H1–H6 (`replay_harness/bench/hebrew_probe.bench.js`, synthetic), D.1.
  - **Rapid resolution:** the progression plan T6–T7 of scenario 1 recreates the team's rectangle-definition case. On the current model a peer stated the confident full conclusion right after the hint in 3 of the 6 scenario-1 conversations, and the carrier jumped in none.

---

## G. Recommendation (prioritised plan; nothing implemented)

### Safe, deterministic: can be done first
| # | change | fixes | evidence | type | benefit | regression risk | gate | version |
|---|---|---|---|---|---|---|---|---|
| G1 | Canonical row text everywhere, incl. the **summary input**; score-0 fallback; client/server parity test | summary sees what the teacher saw; no score-0 empty rows | A.1 step 7; A.2 | display / contract | the summary is grounded in the shown text | none for the sidebar (same rule); the summary wording changes | contract tests; summary smoke on saved conversations | yes |
| G2 | Score-2 completeness guard: one identical re-ask inside the 2-attempt policy; never render an empty green row; telemetry | empty green rows | A.2: 36 of 47 empty pairs are random | validation policy (deterministic trigger) | most empty green rows recovered, the rest not shown | +1 PCK call on about 6% of shown turns; a re-sample may change that turn's decision, which is random noise, not bias | frozen-context and expert replay: 0 empty green rows rendered; re-ask rate; decision distribution unchanged within run-to-run noise | yes |

### Needs an experiment before production
| # | change | fixes | evidence | type | gate | version |
|---|---|---|---|---|---|---|
| G3 | **X12: two-stage PCK.** Stage 1 = the current call, unchanged (decision, steering, B27). Stage 2, for shown turns only: relevance + scores + score-conditioned text with B200 boundary rules (relevance = "should be evaluated", so missed skills are surfaced as 0; Interpretation vs APR; Leveraging only when the conclusion is generalised or applied beyond the original error) and a schema that requires the positive part for 1 and 2 | issues 2 (score 1), 3, 4, all green | B.2–B.3, C, F; X9/X10: zero decision drift, APR calibrated | architecture | develop only on the A1-only tier + synthetic benchmark + synthetic regression cases; freeze; validate once on consensus + agreed + the local exact cases. Targets: Interpretation recall ≥ 0.5; Leveraging wrongly surfaced ≤ 5%, bias ≤ +0.3; APR bias ≤ +0.2; score-1 contract 100%; all-green share ≤ 50%; the decision identical to 1.5.0 by construction. Stage 2 can run in parallel with student generation (students use Stage-1 steering), so the turn is not slower; sidebar p90 ≤ 6 s. Compare 3.1 Flash-Lite vs 3.5 Flash as the Stage-2 model | yes (minor: new feedback semantics) |
| G4 | **Student model → `gemini-3.5-flash`** | Hebrew quality; slightly better pacing | D.1, D.2 | model change | Mode B 24 vs 1.5.0 (D.4: no regression in repetition, garble, attribution, carrier hold); **a quota increase confirmed** (429s seen); student p90 ≤ 5 s | yes |
| G5 | **Carrier two-step arc + peer pacing after minimal teaching moves** | issue 5 | D.2–D.3, E | student-state (prompt) | §E.2 gate on the progression bench + Mode B; frozen prompt fixture updated | yes |
| G6 | (only if G3 is not pursued) schema-only arm: `evidence` required for scored entries | score-1 text | A.3(3a) | schema | decision shift within noise on frozen contexts + expert replay | yes |

### Should not be changed yet
- **Switching PCK to `gemini-3.5-flash` as a standalone change:** decision shift (20% of turns), latency ×2, quota. Its scoring gains belong inside G3.
- **Any `gemini-3.8-flash` use:** it suppresses PCK feedback, and as the student it loses the misconception before teaching.
- **Rewording the single-call PCK prompt** (chain removal, Leveraging criterion, text blocks): X1, X2 and X6–X8 showed that single-call prompt changes move the decision. Put these rules into Stage 2.
- The B27 guard, the carrier selection rule and the 1.5.0 diagnostic-questions rule.

### Order
1. G1 + G2 (one release).
2. G4 and G5 in parallel, as student-side experiments, then one release.
3. G3 (PCK, longest).

Each release gets its own `SYSTEM_VERSION`, so data from the team's 1.5.0 evaluation stays distinguishable.
