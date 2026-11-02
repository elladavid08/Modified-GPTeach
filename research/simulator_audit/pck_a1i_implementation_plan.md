# A1i in production: implementation plan (not implemented)

Status: plan only, 2026-10-29, on committed **1.5.1** (`6452787`). Nothing here is implemented; production code, models and `SYSTEM_VERSION` are unchanged.
- **Candidate:** `pck_eval/x12/FINAL_FREEZE.md`, hashes in `pck_eval/x12/FINAL.sha256`.
- **Rules and results:** `pck_stage2_final_round.md`.
- **Architecture evidence:** `pck_steering_dependency_experiment.md`, `pck_single_call_streaming_experiment.md`.

## 1. Target behaviour per teacher turn

| step | what | source of truth |
|---|---|---|
| 1 | Stage 1: the unchanged 1.5.1 PCK call (prompt, schema, model, retries, row-text re-ask, B27 bare-acknowledgement guard) | show/hide gate only |
| 2 | Stage 1 hides the turn (1.5.1 rule: `should_provide_feedback` false, or no displayable row) → no Stage 2; students get the Stage-1 analysis unchanged | 1.5.1 |
| 3 | Stage 1 shows the turn → Stage 2: the frozen candidate prompt, at most 2 identical attempts | Stage 2 |
| 4 | Leveraging guard on the Stage-2 rows (a teacher message that is only an acknowledgement gets no leveraging row) | deterministic |
| 5 | No displayable row left → **no feedback this turn**: no sidebar entry, no empty container, no placeholder, nothing logged as shown; students as on any turn without feedback (the Stage-1 analysis, unchanged) | Stage 2 (veto) |
| 6 | Rows left → the sidebar shows exactly these rows (relevance, scores, text); the steering signal is computed from the same rows and written into the student fields | Stage 2 |
| 7 | Stage 2 failed twice (or its time budget ran out) → the 1.5.1 rows with the leveraging guard, and the 1.5.1 steering, unchanged; no rows left → no feedback | 1.5.1 fallback |
| 8 | Students are generated after step 6 / 7 (they wait for Stage 2) | — |

**Steering from the shown rows** (research `stage2_dep.cjs`, unchanged):
- **Signal:**
  - none = identification scored 0, or every row is 0;
  - strong = any row scored 2;
  - otherwise partial.
- **Adapter:** writes only fields and values the student prompt already defines.
  - strong → `pedagogical_quality` positive, `understanding_level` improved.
  - partial → neutral, `same`, `addressed_misconception` false. `understanding_progress` hints become `partial_understanding`.
  - none → neutral (problematic kept), `same` (negative levels kept), `addressed_misconception` false. Progress hints become `persistent_confusion`.
  - All other fields stay as Stage 1 returned them: hint students and reasons, `response_tone`, `misconception_risk`, and the demonstrated / missed lists the student prompt prints.

**Why a suppressed turn steers like a hidden turn:**
- With nothing left to evaluate there is no teacher-facing assessment to be consistent with.
- The 1.5.1 behaviour for turns without feedback is the validated one.
- Suppression is rare: 2.8% of shown dev turn-passes and 1.7% of the consensus / agreed ones.

## 2. Server changes

New modules: ports of the research files, each byte-checked by a parity test against the frozen research version.

| new file | port of | content |
|---|---|---|
| `server/pck_stage2.js` | `x12/stage2.cjs` + `stage2_final.cjs` + `rubric_final.FROZEN.json` | prompt builder (score_first), response schema, strict validator (text contract) |
| `server/pck_leveraging_guard.js` | `x12/leveraging_guard.cjs` (v2) | `isLocalAcknowledgement`, `applyLeveragingGuard` (closed word list + cast names, ≤ 5 words, no "?", letter stretching normalised) |
| `server/pck_stage2_policy.js` | `x12/final_pipeline.cjs` + `stage2_dep.cjs` (`signalFromRows`, `adaptImpact`) | `finalizeTurn`: guard → suppress → signal → student fields |

**`/api/pck-feedback` (server/server.js):**
1. **Stage 1:** exactly as 1.5.1, up to and including `applyBareAcknowledgementGuard`.
2. **Gate:** compute the 1.5.1 display decision on the server with `server/pck_row_text.js` (`buildPckRows` / `isEmptyPckRow`, already in parity with the client).
3. **Context:** if shown, build the Stage-2 context, the same three sections Stage 1 received: lesson context, conversation history, teacher message.
   - Build it from the same formatting code as the Stage-1 prompt.
   - Parity test: on fixtures it equals `extractContext(stage1Prompt)`, which is how every research run got its input.
4. **Call:** Stage 2 through `callModelWithPolicy` (agent `pck_stage2`).
   - Same model and `baseGenerationConfig` (`gemini-3.1-flash-lite`, MINIMAL thinking), `maxOutputTokens` 1200, JSON schema.
   - At most 2 identical attempts; a retry only after an invalid output (`validate`: schema, order, text contract) or a call error.
   - **Budget:** its own policy, 8 s per attempt and 12 s in total. Stage 2 is skipped (fallback) when Stage 1 already used more than 30 s.
   - Measured Stage-2 time: p50 2.0 s, p90 2.4 s.
5. **Finalise:** `finalizeTurn` decides on suppression, the rows and the steering fields.
6. **Response:** additive and backward compatible, see below.

**Response shape:**
```
{ success: true,
  analysis: <the FINAL turn analysis in the 1.5.1 shape>,   // display + students
  stage1:   { pedagogical_quality, feedback_message_hebrew, predicted_student_state, skills_assessment },  // feedback history only
  meta:     { ...1.5.1 telemetry, stage2: { status, attempts, latencyMs, inputTokens, outputTokens, guardDropped, suppressed, signal, source, rubric } } }
```
- **Display fields:** `analysis.skills_assessment` is the Stage-2 rows, mapped as research `to_stage1_shape.mjs` does:
  - shown skills: `is_relevant` true, `score`, `evidence` = what exists, `what_could_be_better` = what to improve;
  - all other skills `is_relevant` false;
  - `demonstrated_skills` / `missed_opportunities` emptied, so no Stage-1 text can reach a row through the display fallback.
- **Show/hide:** `analysis.should_provide_feedback` is the FINAL decision (false when suppressed).
- **Steering fields:** `pedagogical_quality`, `addressed_misconception` and `predicted_student_state` are the adapted ones.
- **Students' skill lists:** the demonstrated / missed lists for the student prompt are kept in a separate field, `analysis.student_skill_notes`. The student prompt reads them as it does today. This is the configuration A1i was evaluated with.
- **General message:** `feedback_message_hebrew` is emptied when the final rows come from Stage 2. It is never shown in the sidebar, and it would contradict the rows in the exports.
- **Stage-1 fields:** `stage1` carries the unmodified Stage-1 fields, so Stage 1's feedback-history input stays exactly as in 1.5.1. The client stores `stage1` in `feedbackHistory`, not the final analysis.

## 3. Client changes

- **`src/pages/Chat.jsx`:**
  - **Display:** unchanged logic. `buildPckDisplayRows(formattedFeedback)` on the final analysis; feedback is shown only when `should_provide_feedback` is true and a displayable row exists. No new empty state: a suppressed turn calls `setPckFeedback(null)` exactly like a hidden turn.
  - **Students:** `callAI(..., impact_analysis)` gets the final analysis; the student prompt reads `student_skill_notes` where it read the two lists.
  - **Feedback history:** built from `result.stage1`.
  - **Log:** `feedbackForLog` is the final shown feedback, which feeds the end-of-session PCK summary.
- **`src/services/genai.js`:**
  - `getPCKFeedback` returns `{ analysis, stage1 }`.
  - `CLIENT_TIMEOUT_MS` grows by the Stage-2 budget (50 → 65 s), so a slow Stage 2 can never fail a turn.
- **`src/utils/ai.js`:** the PCK section prints `student_skill_notes`. Without it, the old fields are used, so the prompt text is byte-identical for the same inputs (fixture test).
- **`src/services/callTelemetry.js`:** whitelist the content-free `stage2` keys (status, attempts, latency, tokens, guardDropped, suppressed, signal, source, rubric version).
- **Unchanged:**
  - the sidebar components, `pckDisplayRows.js`, the log viewer and the exports. They already render whatever `skills_assessment` holds.
  - the end-of-session summary. It reads only logged (shown) feedback.

## 4. Tests

**Server** (`node --import ./test-support/register.mjs --test`):
- **Parity with the frozen research files:**
  - the prompt for 3 fixture contexts equals the research prompt (hash);
  - the schema and the validator give the same results on recorded outputs;
  - the guard word list matches `leveraging_guard.cjs`.
- **`finalizeTurn` table:**
  - hidden;
  - shown with rows;
  - guard drops the leveraging row only;
  - guard leaves no row → suppressed;
  - Stage-2 rows without text → suppressed;
  - fallback with rows / without rows;
  - signal none / partial / strong;
  - the adapter never touches other fields.
- **`/api/pck-feedback` with mocked models:**
  - Stage 2 not called on hidden turns;
  - called once on shown turns;
  - one retry on an invalid output;
  - fallback after two failures;
  - the budget skip;
  - the B27 guard still runs first;
  - `stage1` equals the unmodified Stage-1 fields;
  - the 1.5.1 tests still pass unchanged.

**Client** (jest):
- suppressed turn → no sidebar entry and nothing logged as shown;
- students receive the adapted fields;
- `feedbackHistory` holds the Stage-1 fields;
- `student_skill_notes` keeps the student prompt byte-identical (fixture);
- telemetry whitelist.

## 5. Pre-release checks (research harness; no new expert labels)

These are regression checks, not a blind validation. The thresholds R1–R7 are in `pck_eval/x12/REGRESSION_PROTOCOL.md`:
- R1: parity with the frozen files;
- R2: show/hide and suppression;
- R3: operations (fallback ≤ 2%);
- R4: decision cases (≥ 20 / 23);
- R5: the team's cases;
- R6: one B200 consensus + agreed pass;
- R7: live opportunity bench (peer jumps after the hint no worse than research A1i 15 / 36; carrier detection no worse than 1.5.1; students ≤ +2.3 s at p50; 0 turns failed by Stage 2).
- Plus the synthetic benchmark constraints ≥ 80%.

Then the version bump (**1.6.0**: teacher-facing feedback and student steering change), the changelog and the history entry, and the educational team's end-to-end review. That review is the next human validation.

## 6. Rollout and monitoring

- **Flag:**
  - `PCK_STAGE2=on|off` (server environment, default off until the checks pass).
  - Off = 1.5.1 behaviour bit for bit: no Stage-2 call, response without `stage1` (the client falls back to `analysis`).
- **Telemetry per turn (content free):**
  - Stage-2 status / attempts / latency;
  - fallback;
  - guard drops;
  - suppression;
  - signal and source.
  - Watch fallback and suppression rates and the student wait time during the team review.
- **Cost:** about +49% PCK tokens per shown turn (one extra call: about 3.4k in / 0.44k out).
- **Out of scope for the first release:**
  - streaming A5 (−0.6–0.7 s at p50, a later transport optimisation);
  - Stage-1 prompt changes;
  - student model or pacing changes.
