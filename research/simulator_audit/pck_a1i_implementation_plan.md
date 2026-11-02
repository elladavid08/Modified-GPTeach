# A1i in production: implementation plan (not implemented)

Status: plan only, 2026-10-29, revised 2026-11-02 (student data contract, §1a). Based on committed **1.5.1** (`6452787`). Nothing here is implemented; production code, models and `SYSTEM_VERSION` are unchanged.
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
| 6 | Rows left → the sidebar shows exactly these rows (relevance, scores, text); the students get the **student PCK view** built only from the same rows and their signal (§1a) | Stage 2 |
| 7 | Stage 2 failed twice (or its time budget ran out) → the 1.5.1 rows with the leveraging guard, and the 1.5.1 steering, unchanged; no rows left → no feedback | 1.5.1 fallback |
| 8 | Students are generated after step 6 / 7 (they wait for Stage 2) | — |

**Signal from the shown rows** (research `stage2_dep.cjs`, unchanged):
- none = identification scored 0, or every row is 0;
- strong = any row scored 2;
- otherwise partial.

### 1a. Student PCK view on a Stage-2 turn (data contract, revised 2026-11-02; **production target**, rerun passed, §5)

**Reference implementation:**
- `pck_eval/x12/student_view.cjs` (`studentPckView`, `auditStudentInput`; hashes in `pck_eval/x12/CONTRACT.sha256`);
- unit test: `replay_harness/test/student_view.test.js`.

**Why it was revised:**
- The research A1i adapter changed only four fields. The students still received Stage 1's skill lists, `how_addressed`, and the per-student hint reasons.
- On the final candidate's shown B200 turn-passes (717):
  - 47% would tell the students "neutral / WAS NOT addressed" while listing only Stage-1 *demonstrated* skills;
  - 18.5% list as demonstrated a skill that Stage 2 scores 0;
  - 48% print "Misconception WAS NOT Addressed: <Stage-1 description of how it was addressed>".

**Principle:**
- **Stage 2 sets the level.** Every quality statement about the current turn comes from the Stage-2 rows or their signal.
- **Stage-1 context:** Stage-1 fields that Stage 2 does not produce stay only as context:
  - who is likely to speak;
  - the kind of negative reaction (an error *validated* vs *ignored*);
  - tone and mathematical risk.
- **Never above the level:** Stage-1 context may describe a reaction at or below the Stage-2 level, never above it.
- **No Stage-1 assessment text** reaches the students.

| student-prompt field | 1.5.1 / research A1i | **A1i contract** |
|---|---|---|
| `pedagogical_quality` | adapted (A1i) | strong → positive; partial → neutral; none → neutral, or problematic if Stage 1 said problematic (Stage 1 may only lower) |
| `predicted_student_state.understanding_level` | adapted | strong → improved; partial → same; none → same, or Stage 1's confused / more_confused / misconception_reinforced (lower only) |
| `addressed_misconception` | adapted (strong kept Stage 1) | strong → Stage 1's value (Stage 2 cannot say whether the misconception was explicitly addressed); partial / none → false |
| `how_addressed` | Stage 1 (printed even when "WAS NOT") | Stage 1's text only when `addressed_misconception` is true, else "" |
| `demonstrated_skills` | **Stage 1** | **projected from the Stage-2 rows**, with Stage 1's own derivation rule (server.js "Deriving demonstrated_skills"): every row with score ≥ 1 → `{skill_id, evidence: what exists}` |
| `missed_opportunities` | **Stage 1** | **projected:** every row with score 0 → `{skill_id, what_could_have_been_done: what to improve}` |
| hint `student`, `likelihood` | Stage 1 | Stage 1 (who is likely to speak: context) |
| hint `reaction_type` | progress types adapted for partial / none | capped by the signal. Ceiling: strong → understanding_progress; partial → partial_understanding / cautious_clarification; none → persistent_confusion / reinforced_acceptance / misapplied_new_rule. A type above the ceiling becomes the ceiling's type (partial → partial_understanding, none → persistent_confusion). Types at or below the ceiling are kept (the carrier and Mode B behaviours) |
| hint `reason` | Stage 1 free text (often a quality judgement) | **dropped** (the prompt prints a hint without a reason) |
| `response_tone`, `misconception_risk` | Stage 1 | Stage 1 (context; conflicts with the signal on ≤ 1% of turns, except "confident" under none, which is consistent with a confidently held misconception) |
| `who_should_respond`, `likely_reactions` | Stage 1 fallback when no hints | unchanged (used only when there are no hints) |

**Notes on the projection:**
- **Not a new assessment:** it uses the relevance, scores and texts already shown to the teacher, and the same field semantics Stage 1 uses to derive its own lists.
- **Score-1 rows:** like Stage 1, a score-1 row appears only in `demonstrated_skills`. Its improvement text stays teacher-facing.
- **Texts:** both are Hebrew, second person to the teacher, the same register as Stage 1's list texts.

**Turns without Stage 2:**
- Turns Stage 1 hides, suppressed turns and fallback turns keep the 1.5.1 student input, unchanged.
- On hidden turns Stage 1 is 92% neutral, and 94–95% carry no skill list (B200), so this is mostly neutral context.
- Running Stage 2 on every turn would be a separate, unevaluated change.

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
| `server/pck_stage2_policy.js` | `x12/final_pipeline.cjs` + `stage2_dep.cjs` (`signalFromRows`) + `x12/student_view.cjs` (`studentPckView`, the §1a contract tested in the §5 rerun) | `finalizeTurn`: guard → suppress → signal → student PCK view |

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
  - `demonstrated_skills` / `missed_opportunities` replaced by the projection of the same rows (below), so no Stage-1 text can reach a row or the students.
- **Show/hide:** `analysis.should_provide_feedback` is the FINAL decision (false when suppressed).
- **Student fields:** `pedagogical_quality`, `addressed_misconception`, `how_addressed`, `predicted_student_state`, `demonstrated_skills` and `missed_opportunities` are the §1a student PCK view.
  - The display ignores `demonstrated_skills` / `missed_opportunities` whenever relevant `skills_assessment` rows exist.
  - The projected lists hold exactly the row texts, so the display fallback can never show different text.
  - One analysis object therefore serves both the display and the students, and no Stage-1 skill text is left in it.
- **General message:** `feedback_message_hebrew` is emptied when the final rows come from Stage 2. It is never shown in the sidebar, and it would contradict the rows in the exports.
- **Stage-1 fields:** `stage1` carries the unmodified Stage-1 fields, so Stage 1's feedback-history input stays exactly as in 1.5.1. The client stores `stage1` in `feedbackHistory`, not the final analysis.

## 3. Client changes

- **`src/pages/Chat.jsx`:**
  - **Display:** unchanged logic. `buildPckDisplayRows(formattedFeedback)` on the final analysis; feedback is shown only when `should_provide_feedback` is true and a displayable row exists. No new empty state: a suppressed turn calls `setPckFeedback(null)` exactly like a hidden turn.
  - **Students:** `callAI(..., impact_analysis)` gets the final analysis (the §1a view on Stage-2 turns).
  - **Feedback history:** built from `result.stage1`.
  - **Log:** `feedbackForLog` is the final shown feedback, which feeds the end-of-session PCK summary.
- **`src/services/genai.js`:**
  - `getPCKFeedback` returns `{ analysis, stage1 }`.
  - `CLIENT_TIMEOUT_MS` grows by the Stage-2 budget (50 → 65 s), so a slow Stage 2 can never fail a turn.
- **`src/utils/ai.js`:** no change. It already prints exactly these fields, and a hint without a `reason` is already supported.
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
  - signal none / partial / strong.
- **`studentPckView` table (§1a):**
  - the projected lists equal the rows (score ≥ 1 → demonstrated, 0 → missed);
  - no Stage-1 list text, hint reason or "WAS NOT addressed" `how_addressed` survives;
  - hint types never exceed the signal's ceiling;
  - Stage 1 can only lower quality / understanding under none;
  - hidden, suppressed and fallback turns return the Stage-1 analysis unchanged.
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
- students receive the §1a view;
- `feedbackHistory` holds the Stage-1 fields;
- student-prompt fixture: on a Stage-2 turn the PCK section contains only row texts, and on a hidden turn it is byte-identical to 1.5.1;
- telemetry whitelist.

## 5. Targeted student rerun for the §1a contract (X12E, 2026-11-02): PASSED

**Setup:**
- Opportunity bench 1.4.0, `OPP_STUDENT=production`, progression plan, random casts. The same 36 casts in every run; all five runs concurrent on one local server.
- **Stage 2:** both A1i arms call the **frozen final candidate**, unchanged (`FINAL.sha256` verified), through `/stage2_final` with the final policy (`final_pipeline.cjs`). The arms differ only in what the students receive on a turn with Stage-2 rows.
- **Arms:** `sequential_final_contract` (2 × 36), `sequential_final_adapter` (2 × 36, the previously evaluated adapter), and 1.5.1 steering (1 × 36).
- **Scoring:** misconception-arc labels from `scripts/arc_judge.mjs` (gemini-3.5-flash, 0 unparsed) and `scripts/arc_aggregate.mjs`. Prompt flags from `pck_eval/x12/contract_audit.mjs`. Latency from `pck_eval/x12/arch_live.mjs`.

| | 1.5.1 (36) | A1i adapter (2 × 36) | **A1i contract (2 × 36)** |
|---|---|---|---|
| peer confident conclusion right after the hint (T6) | 18 | 15 + 13 = **28** | 14 + 11 = **25** |
| peer confident conclusion at T6–T7 | 22 | 18 + 19 = 37 | 18 + 12 = 30 |
| carrier: confident conclusion right after the hint (premature resolution) | 2 | 2 + 2 = 4 | **0 + 0 = 0** |
| carrier drops the misconception before teaching | 2 | 2 + 5 = 7 | 3 + 0 = 3 |
| carrier voices the misconception (T1–T5) | 34 | 35 + 34 = 69 | 34 + 36 = 70 |
| carrier two-step arc | 26 | 25 + 22 = 47 | 23 + 26 = 49 |
| carrier correct at the check (T8) | 18 | 13 + 14 = 27 | 12 + 9 = 21 |
| carrier justified by the end / still holds it at the end | 36 / 1 | 72 / 3 | 71 / 3 |
| failed turns (student / PCK) | 0 / 0 | 0 / 0 | 0 / 0 |
| Stage-2 fallbacks to Stage 1 (of shown turns) | — | 1 / 559 | 1 / 543 |
| students visible p50 / p90 (1.5.1 in the same runs: 4.4 / 6.7–6.9 s) | 4.4 / 6.7 | 6.5 / 8.9 – 6.6 / 9.1 | 6.5 / 9.0 – 6.5 / 9.1 |
| student call p50 / p90 | 1.46 / 1.76 s | 1.47 / 1.74 s | 1.47 / 1.80 s |

**Prompt consistency** (every turn with Stage-2 rows; adapter 558, contract 542):

| flag | adapter | contract |
|---|---|---|
| a listed demonstrated skill that Stage 2 scores 0 or does not show | 126 (23%) | **0** |
| a listed missed skill that Stage 2 credits | 7 | **0** |
| list text not the shown row text | 558 (100%) | **0** |
| "WAS NOT Addressed" with a Stage-1 description | 365 (65%) | **0** |
| hint type above the signal | 111 (20%) | **0** |
| Stage-1 hint reason present | 558 (100%) | **0** |
| quality / understanding above the signal | 0 | 0 |

**Verdict:**
- **Pass:** the contract performs at least as well as the evaluated adapter within the noise band (±4 per 36).
  - Peer jumps after the hint: 12.5 vs 14 per 36.
  - No carrier premature resolution: 0 vs 4 / 72.
  - Carrier detection, two-step arc and final understanding: the same.
  - No failed turns; no latency difference (the contract is a deterministic mapping).
- **One direction to watch, within noise:** the carrier is correct at the T8 check less often (21 vs 27 / 72). It is justified by the end equally often (71 vs 72), so the carrier resolves one step later, at the full explanation. That is in line with the team's "students understand too fast" feedback.
- **Not exercised:** the bench's fixed teacher plan has no bare acknowledgement after resolution, so the guard and the suppression path never fired (0 / 0). They are covered by the offline sets and the unit tests.

**Before implementation** the remaining step is the production port (§2–§4) and the pre-release checks (§6).

**Original rerun plan (kept for reference):**

**What it changes and what it doesn't:**
- The contract changes the student prompt on 85% of shown turns: projected lists, dropped reasons, capped hint types, emptied `how_addressed`.
- The A1i **student** results were measured with the old adapter, so they do not transfer automatically:
  - peer jumps after the hint (22 → 15 / 36);
  - carrier behaviour.
- The teacher-facing results do not depend on the student prompt and stand as they are: rows, calibration, consistency of the signal with the rows, latency.

**The rerun** (opportunity bench, `OPP_STUDENT=production`, same plan and casts as X12B / X12D):
- **Arms:**
  - **A1i-contract:** a research `studentPckView` in `stage2_dep.cjs`, plus a bench arm `OPP_ARCH=sequential_indep_contract` reusing the frozen Stage-2 service;
  - **A1i-as-evaluated;**
  - **A0 (1.5.1 steering).**
- **Size:** 2 × 36 conversations for the two A1i arms and 1 × 36 for A0, run concurrently. The earlier pooled A0 40 / 72 and A1i 30 / 72 are the reference.
- **Pass:** A1i-contract peer jumps after the hint ≤ A1i-as-evaluated + 4 per 36 (the noise band); carrier detection and premature resolution no worse; no new failed turns.
- **Prompt audit:** an automatic, content-free count over the rerun's student prompts. 0 turns where a listed demonstrated skill is scored 0, and 0 "WAS NOT addressed" lines with a description.
- **If the contract fails the pass bar:** implement A1i as evaluated, with the contradictions documented, and revisit the contract separately.

## 6. Pre-release checks (research harness; no new expert labels)

These are regression checks, not a blind validation. The thresholds R1–R7 are in `pck_eval/x12/REGRESSION_PROTOCOL.md`:
- R1: parity with the frozen files;
- R2: show/hide and suppression;
- R3: operations (fallback ≤ 2%);
- R4: decision cases (≥ 20 / 23);
- R5: the team's cases;
- R6: one B200 consensus + agreed pass;
- R7: live opportunity bench on the production build (peer jumps after the hint ≤ the §5 contract result + 4 per 36, i.e. ≤ 16.5 / 36; carrier premature resolution ≤ 2 / 36; carrier detection no worse than 1.5.1; students ≤ +2.3 s at p50; 0 turns failed by Stage 2; 0 contract audit flags).
- Plus the synthetic benchmark constraints ≥ 80%.

Then the version bump (**1.6.0**: teacher-facing feedback and student steering change), the changelog and the history entry, and the educational team's end-to-end review. That review is the next human validation.

## 7. Rollout and monitoring

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
