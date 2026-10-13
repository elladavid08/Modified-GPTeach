# Post-pilot change status (source of truth)

**Verified against:** branch `feature/post-pilot-improvements`, HEAD `69e04ef` (49 commits on `main..HEAD`), `SYSTEM_VERSION` **1.4.3**, on 2026-10-13.

**Update (same day):** #6 is implemented as **1.4.4**, uncommitted in the working tree on top of that HEAD. Everything else below is unchanged.

**Tests on that HEAD:**
- client: 265 / 265 pass (`npx jest --config jest.config.js`);
- server: 328 / 328 pass (`cd server && npm test`).

**Sources:**
- the code on that HEAD;
- `src/config/version.js` (changelog);
- `git log main..HEAD`;
- `change_map.md`, `invariants.md`, `regression_test_plan.md` §0.8–§0.29;
- `student_stability_replay.md` §9–§13;
- `student_model_bakeoff.md` §9;
- the per-change experiment write-ups in this folder.

This document contains no participant data. Counts from the pilot are aggregates. Replay evidence comes from the Mode B harness (scripted synthetic teacher, designed student casts, 6 scenarios × 2 casts × 2 runs = 24 conversations per version).

**Deployment state (important for any demo):**
- `main` is **not** this system. `main` is `1.3.0-gemini3`: the pilot code plus only the Gemini 3 model hotfix (`7f7fb25`, merged as `d7fbe55`).
- None of the fixes below (1.3.1–1.4.3) are on `main`.
- `main` has 2 commits that this branch does not have. A merge of `main` into this branch conflicts in 4 files: `server/model_config.js`, `server/server.js`, `server/test/api_model_routing.test.mjs` and `src/config/version.js`.
  - The conflicts exist because the same model split was made twice: as the 1.4.0 commit here and as the hotfix on `main`.
  - They are expected to resolve to this branch's side, but that has not been done.

**Status legend:**
- **DONE**: implemented, tested and versioned; the user-visible problem is addressed.
- **PARTIAL**: improved, but part of the request remains.
- **OPEN**: not started on this branch.
- **DEFERRED**: deliberately postponed (design or research first).
- **NOT REPRODUCED**: not observed in post-fix replays; no dedicated fix.

---

## 1. Pilot requests

### Summary matrix

| # | request | status | version(s) |
|---|---|---|---|
| 1 | Multiple students show inconsistent difficulties | **PARTIAL** | 1.3.8, 1.3.9, 1.3.12, 1.4.0 (+1.4.2 telemetry) |
| 2 | Repeated student sentences | **DONE** | 1.3.1, 1.3.8–1.3.11 |
| 3 | Voice input | **OPEN** (design first) | — |
| 4 | Feedback too long | **PARTIAL** | 1.4.0, 1.4.1, 1.4.3 |
| 5 | Yellow / score-1 feedback unclear | **DONE** (display) | 1.4.3 (+ researcher views, no bump) |
| 6 | Initial teacher briefing disappears | **DONE** (uncommitted on this branch) | 1.4.4 |
| 7 | Drawing-tool improvements | **OPEN** | — (related: 1.3.3 image-only turns) |
| 8 | Mark completed simulations | **OPEN** | — |
| 9 | Students drawing | **DEFERRED** | — |
| 10 | Preserve teacher-message line breaks | **DONE** in the chat, agents and storage; researcher viewers still collapse them | 1.3.7 |
| 11 | Student returns to a resolved difficulty | **NOT REPRODUCED** | (indirect: 1.3.8, 1.3.9, 1.4.0) |
| 12 | Student reaches the correct answer too early | **OPEN** (one contributing cause fixed in 1.4.1) | 1.4.1 (partial) |
| 13 | Summary contradicts in-conversation feedback | **DONE** | 1.3.1 |

### Per-item detail

#### 1. Multiple students show inconsistent difficulties: PARTIAL

- **User-visible problem:** in a multi-student class, students' difficulties did not stay consistent with who holds which misconception. A student would take on another's idea, or the cast would behave as one voice.
- **Changes:**
  - **1.3.8 (C8):** earlier student replies reach the student model labelled with the speaker ("<name>: <text>"). Before, all past student replies were anonymous, so the model could not tell who had said what.
  - **1.3.9 (C9):** the student prompt no longer demands a `thinking` object that the response schema forbids.
  - **1.3.12:** content-neutral prompt examples. The old examples were bound to the first three cast members and contained lesson geometry.
  - **1.4.0:** new student model, `gemini-3.5-flash-lite`.
  - **1.4.2:** an `unknownSpeaker` telemetry counter (replies under a name outside the cast).
- **Evidence:**
  - Mode B 1.4.1 (`student_stability_replay.md` §13): cross-student contamination 0 of 12 candidates; persistence, regressions and loops 0; all 18 carriers who held the misconception resolved it after teaching.
  - 1.4.0: the addressed student failed to answer 1 time in 123.
  - Tests: `api_generate.test.mjs` (history labelling); B5 cast-consistency tests in `chatTurnOrchestration.test.js`.
- **Remaining limitations:**
  - There is no explicit per-student knowledge state. `student_stability_replay.md` §11.6 judged it not justified on current evidence.
  - The replay teacher is scripted and minimal.
  - About 2% of 3.5 Flash-Lite replies have garbled surface text, which once included a wrong speaker name. This is detection only (1.4.2).
  - Students still sometimes attribute to the teacher what the teacher did not say: about 5 mixed attributions in 24 conversations on 1.4.1.
- **Next step:** a live check with real teachers. If the problem recurs, a scenario-level carrier instruction (cheaper than per-student state).

#### 2. Repeated student sentences: DONE

- **User-visible problem:** students repeated their own earlier sentences word for word, especially after short teacher messages.
- **Changes:**
  - **1.3.1:** turn lock and empty-send guard. Double submits and empty submits had produced extra turns.
  - **1.3.8:** speaker identity in the history.
  - **1.3.9:** the prompt/schema conflict is removed.
  - **1.3.10:** a conversational-move rule. After an acknowledgement, praise or closing, students respond to that move and do not restate an earlier answer.
  - **1.3.11 (B26):** a server-side same-student duplicate guard.
    - A reply is a duplicate when it is 30+ characters and equal after normalization, or has edit similarity ≥ 0.90.
    - A duplicate triggers one re-ask within the existing 2-attempt budget.
    - If the reply is still a duplicate, only that reply is dropped, never all replies.
    - Content-free telemetry records the outcome.
- **Evidence:**
  - Mode B 1.3.12: 15 guard re-asks, 14 resolved, 1 dropped; 0 exact duplicates in the final output.
  - 1.4.0 and 1.4.1: 0 duplicates and 0 re-asks needed; 0 semantic loops on manual review.
  - Tests: `student_duplicate_guard.test.mjs`, `api_generate_duplicate_guard.test.mjs`, and the C2/C3/C4 tests in `chatTurnOrchestration.test.js`.
  - Write-ups: `short_message_repetition_experiment.md`, `student_duplicate_guard_study.md`, `student_duplicate_reask_experiment.md`.
- **Remaining limitations:**
  - Paraphrased (semantic) repetition is not guarded.
  - Students repeating *another* student's sentence is not compared, by design.
- **Next step:** none required; watch the duplicate telemetry in real sessions.

#### 3. Voice input: OPEN (design first)

- **User-visible problem:** teachers wanted to speak instead of type.
- **Current state:** not implemented.
  - `src/components/RecordingButton.jsx` exists but is unused.
  - It would post audio from the browser directly to an external speech-to-text API with a client-side key. **It must not be wired in as is.**
- **Remaining:**
  - Choose browser speech recognition (Hebrew support varies by browser) or a server-side STT endpoint.
  - Decide consent and privacy for participants' voice, and whether audio is stored.
  - Decide whether the transcript is editable before sending.
  - Add an `input_mode` flag for research.
- **Next step:** a design decision with the educational and research team.

#### 4. Feedback too long: PARTIAL

- **User-visible problem:** too much real-time feedback, both on too many turns and with too many rows per turn.
- **Changes:**
  - **1.4.0 (model migration):** the PCK agent is far more selective.
    - Feedback is shown on about 63% of replay turns, against 92% on 2.5.
    - Explanations and closings are no longer criticised: 17 of 24 and 15 of 24 on 1.3.12, against 0 on 1.4.0.
  - **1.4.1 (B27):** no praise or criticism is displayed on a bare "אוקיי" / "יפה" / "נכון", unless it is a missed error-identification. On 1.4.1, 21 such outputs were suppressed.
  - **1.4.3 (B28):** each row shows only text the model already returned; nothing is composed or added.
- **Evidence:**
  - On 1.4.x a shown feedback always has 1–2 skill rows. On v1.3.0, 41% of displayed feedbacks had 3–5 rows.
  - Sources: `student_stability_replay.md` §12.2 and §13.1; `pck_row_text_contract_experiment.md`; `pck_b200_expert_grounding.md` §6.
- **Remaining limitations:**
  - The 1–2 row limit is model behaviour, not a code rule. B8 is still REVIEW; there is no cap in `pckDisplayRows.js`.
  - The length of each row's text is not controlled.
  - The end-of-session summary got longer after the 1.3.1 fix, by design.
  - Shortening the text (templates, score-conditioned text) was researched and is paused: `pck_score_conditioned_text_experiment.md`, `pck_feedback_v2_plan.md`.
- **Next step:**
  - ask the educational team whether the 1.4.x amount still feels too long;
  - if yes, a deterministic row cap (a product decision: which row to keep).

#### 5. Yellow / score-1 feedback unclear: DONE (display)

- **User-visible problem:**
  - a yellow ("קיים באופן חלקי") row often showed only the skill name;
  - the improvement suggestion for score 1 was hidden, so the teacher could not see what was partial.
- **Changes:**
  - **1.4.3 (B28, B12 implemented):** a pure display view-model, `src/services/pckDisplayRows.js`.
    - **score 2:** the skill's evidence (or the single matching `demonstrated_skills` evidence).
    - **score 1:** the same positive text, plus a second line "לשיפור: …" with the skill's `what_could_be_better`.
    - **score 0:** unchanged.
    - No text is generated. A content-free `pckRowsWithoutText` counter is recorded.
  - **93ff57b (no version bump):** the researcher, admin and annotation views use the same view-model.
- **Evidence:**
  - Tests: `pckDisplayRows.test.js`, `pckDisplayConsistency.test.js`, `pckSkillsDisplay.test.js`.
  - `pck_row_text_contract_experiment.md` §7: 49 of 49 rows render as specified in a live smoke test.
- **Remaining limitations:**
  - Score 1 is **rare** on 1.4.x (≤ 10 rows per arm in the experiment), so it may not appear in a short demo.
  - Score calibration (1 vs 2) against the expert annotations is weak. The two-stage research that addressed it is paused.
  - The "לשיפור:" wording has not been confirmed by the experts.
- **Next step:** expert confirmation of the score-1 format.

#### 6. Initial teacher briefing disappears: DONE (1.4.4)

- **User-visible problem:** the briefing card ("📋 הנחיות") was shown only until the first message. After that, the teacher could not re-read the lesson context and instructions. The left sidebar kept only the topic and the lesson goals.
- **Change (1.4.4, B20):** a new component, `src/components/TeacherBriefingPanel.jsx`, used by `Chat.jsx`.
  - **Before the first message:** the same open pre-lesson card as before.
  - **Once the conversation starts:** a one-line "📋 הנחיות לשיעור" toggle at the top of the chat column, collapsed, which opens the same briefing text (scrollable, at most 30% of the screen height).
  - The teacher can open and close it at any time: during a pending turn, across turns, and after the session has ended.
  - A collapsible panel was chosen over a left-sidebar section because it shows the content once, in the place the teacher already saw it, and takes one line when closed.
- **Data:** display only. The briefing is not stored, and no prompt, model, PCK, student, logging, finish or summary behaviour changed.
- **Evidence:**
  - `chatTurnOrchestration.test.js`: 14 new tests (open before the lesson; collapsed after the first turn; reopen and collapse; persists across turns; no effect on chat state, the lock or finish; all six scenarios; RTL and structure).
  - 3 existing assertions retargeted.
  - `teacherBriefingPanel.test.js` (2).
  - `regression_test_plan.md` §0.30.
- **Remaining limitations:**
  - The briefing's last sentence ("…כתבו הודעה בחלון השיחה והתחילו את השיעור") is reused as is and reads as stale mid-lesson. Changing the text is a scenario-content decision.
  - Not yet committed or deployed.

#### 7. Drawing-tool improvements: OPEN

- **User-visible problem:** the board is basic.
  - It has select, eraser, pen, line and fixed shapes (rectangle, square, parallelogram, rhombus, trapezoid, kite).
  - It has no undo/redo, no colours or line width, and no text or vertex labels.
- **Current state:**
  - `DrawingBoard.jsx` is unchanged on this branch.
  - Related engineering: image-only turns are handled since 1.3.3 (§2).
- **Remaining:** per-feature UI work (each is low risk; `change_map.md` §7). Separately, design decisions on PCK visibility of drawings (B17: PCK does not see drawings) and vector-state storage.
- **Next step:** prioritise features with the educational team.

#### 8. Mark completed simulations: OPEN

- **User-visible problem:** the scenario selection screen does not show which lessons the teacher has already done.
- **Current code:**
  - `ScenarioSelector.jsx` has no per-user data.
  - Conversation records snapshot `scenario.text`, but no scenario id (A9).
- **Remaining:** see §3.2.

#### 9. Students drawing: DEFERRED

- **User-visible problem:** students cannot draw.
- **Needs:**
  - a student output schema extension;
  - a renderer;
  - persistence;
  - PCK visibility;
  - a turn model that accounts for drawings.
- **Overlap:** the future shared workspace. Whether Flash-Lite can produce correct geometric drawings is untested.
- **Next step:** an offline capability prototype before any production change (`change_map.md` §9).

#### 10. Preserve teacher-message line breaks: DONE (chat); viewers OPEN

- **User-visible problem:** line breaks were removed, with lines glued together without a space. About 4.4% of pilot teacher messages (54 of 1,233) show the effect, so it was also a data problem: the altered text went to the agents and the log.
- **Changes (1.3.7, C5):**
  - teacher (`role: "user"`) text is kept exactly as typed;
  - the same string reaches PCK, the student agent and the stored `turn.teacher.message`;
  - the chat bubble renders it with `white-space: pre-wrap` as plain text (`ChatMessage.js`, `ChatBubble.jsx`);
  - Shift+Enter inserts a line break.
- **Evidence:**
  - `messageLineBreaks.test.js` (7 tests);
  - C5 tests in `chatTurnOrchestration.test.js` (2 tests);
  - `regression_test_plan.md` §0.18.
- **Remaining limitations:**
  - The conversation-history, admin, research and annotation viewers display stored text without `pre-wrap`, so they collapse the line breaks on screen. The stored text is intact.
  - Student messages still have newlines removed, by design.
  - Pilot records before 1.3.7 contain the glued text.
- **Next step:** add `pre-wrap` to the viewers (low risk, display only).

#### 11. Student returns to a resolved difficulty: NOT REPRODUCED

- **User-visible problem:** in the pilot, a student who had understood went back to the misconception.
- **Changes:** no dedicated fix. These are likely contributors:
  - speaker identity (1.3.8);
  - the prompt/schema fix (1.3.9);
  - 1.4.0, where PCK no longer sends "confused" steering on most turns (134 such levels on 1.3.12, 0 on 1.4.0).
- **Evidence:** 0 regressions in every post-fix Mode B baseline:
  - 1.3.12: about 16 carrier trajectories;
  - 1.4.0: 17;
  - 1.4.1: 18.
- **Remaining limitations:**
  - the scripted teacher;
  - late regressions under positive steering are under-sampled;
  - a rare regression rate is not excluded.
- **Next step:** check in real sessions. If it recurs, design explicit per-student state (`change_map.md` §4).

#### 12. Student reaches the correct answer too early: OPEN (one cause fixed)

- **User-visible problem:** the student holding the misconception reaches the correct answer before the teacher has taught anything.
- **Changes:** 1.4.1 (missed-misconception PCK fix + B27) removed one cause.
  - When PCK stayed silent after a teacher's bare "אוקיי" to a misconception, the student drifted toward the answer: 3 carriers on 1.4.0, 0 on 1.4.1.
- **Evidence:**
  - Premature correctness is otherwise unchanged: 7 of 24 carriers on 1.3.12 and 1.4.0, 6 of 24 on 1.4.1 (`student_stability_replay.md` §12.3 and §13.3).
  - It occurs mostly in scenarios where the direct question invites self-correction.
- **Remaining:** there is no targeted fix.
- **Next step:** a scenario-level carrier instruction experiment on Mode B (`student_stability_replay.md` §11.6).

#### 13. Summary contradicts in-conversation feedback: DONE

- **User-visible problem:** the end-of-session summary could contradict the real-time feedback.
  - Root cause: the summary never received the real-time moments.
  - Its filter required a field the logger never stores, so every summary prompt said no PCK moments had been identified.
- **Changes (1.3.1, C1):**
  - `/api/pck-summary` builds one moment per turn whose feedback was displayed, with skill, score, evidence, suggestion and recorded message, in turn order;
  - legacy records are handled;
  - the existing "do not contradict the scores already given" instruction now has something to hold to.
- **Evidence:**
  - `api_pck_summary.test.mjs`; `regression_test_plan.md` §0.11.
  - Summary smoke check on the 1.4.0 summary model (`student_model_bakeoff.md` §9.3): 4 of 4 summaries ground their main point in the shown moments, the turn references match, and there is no contradiction.
- **Remaining limitations:**
  - Minor: the teacher's grammatical gender varies between summaries.
  - Minor: a skill is sometimes relabelled.
  - Summaries are longer, by design.
  - The Mode B harness does not exercise the summary; only the 4-conversation smoke check covers it.
- **Next step:** none required.

---

## 2. Post-pilot engineering fixes (not on the pilot list)

| fix | version | what changed | evidence | remaining |
|---|---|---|---|---|
| **Turn locking** (C2/C3) and empty sends (C4) | 1.3.1 | **Lock:** one turn at a time. From submit until the turn ends, the input, send button, board toggle and "סיים שיחה" are disabled and the typing indicator stays visible. The lock is released on every success and failure path. Log writes are queued in send order.<br>**Empty sends:** empty or whitespace submits without a drawing are ignored. | 10 + 7 tests in `chatTurnOrchestration.test.js`; `regression_test_plan.md` §0.8–§0.9 | — |
| **Visible model failures** (C7 phase 1, C6) | 1.3.2 | **Notices:** a Hebrew notice (PCK in the sidebar, students in a banner) with no technical detail.<br>**Diagnostics:** an additive `failedAttempts` list on the conversation (A16, at most 50 entries, no text). Failed attempts are never turns.<br>**No fake reply:** the fallback student line is no longer produced. | `turnDiagnostics.test.js`; 6 C7 tests; §0.12 | Raw PCK output is not captured. |
| **Image-only turns** (B22) | 1.3.3 | A drawing without text skips PCK (it cannot see drawings), with no failure notice. Students still receive the drawing, and the turn is logged. | 6 B22/E1 tests; §0.14 | PCK visibility of drawings (B17) is a design question. |
| **Structured PCK output** (C10, B23) | 1.3.4 | **Format:** JSON mode plus a response schema.<br>**Validation:** strict server validation (`server/pck_feedback_contract.js`).<br>**Failures:** malformed output is reported as a failure instead of being default-filled into a "successful" analysis. | `pck_feedback_contract.test.mjs`. Of 30 malformed fixtures, the old logic accepted 24; now all 30 are rejected. §0.15 | Some semantic consistency rules are deliberately not validated (`invariants.md` C10). |
| **Telemetry** (A17) | 1.3.5, extended in 1.3.11, 1.3.13, 1.4.2, 1.4.3 | **Base fields:** an additive, content-free `telemetry` field per turn (model, latency, finish reason, attempts, browser round trip).<br>**Counters added later:** duplicate guard, quote cuts, garbling and `unknownSpeaker`, `pckRowsWithoutText`. | `callTelemetry.test.js`; §0.16 | — |
| **Retry / timeout policy** (B24, B2) | 1.3.6 | **Server:** at most 2 model attempts per request, 20 s per attempt, 45 s total.<br>**Browser:** one request with a 50 s timeout.<br>**Retried:** timeouts, 5xx, 429, empty and malformed output.<br>**After a final PCK failure:** a notice, then students are generated unsteered (B2). | `api_retry_policy.test.mjs`, `llm_call_policy.test.mjs`; `latency_baseline.md`; §0.17 | The values are provisional (latency baseline). |
| **Student speaker identity** (C8) | 1.3.8 (+1.3.9 C9) | Past student replies are labelled "<name>: <text>" in the model-facing history only. The stored data is unchanged. | `api_generate.test.mjs`; `student_teacher_history_label_experiment.md`; §0.19–§0.20 | Teacher attributions remain a known limitation (§1, item 1). |
| **Duplicate guard** (B26) | 1.3.11 | See §1, item 2. | See §1, item 2. | Paraphrased repetition is not guarded. |
| **Quote safety** | 1.3.13 | **Prompt rule:** one student-prompt rule: write Hebrew abbreviations with gershayim (״). An ASCII `"` closed the JSON string and silently cut replies.<br>**Telemetry:** detection-only quote-cut counters. | `student_quote_safety_experiment.md` §9: abbreviation cuts went from 13 to 0. `student_quote_cut.test.mjs`, `student_quote_truncation.test.mjs` | Opening-quote cuts are rare and now visible. |
| **Gemini 3.x migration** | 1.4.0 | **Models:** student `gemini-3.5-flash-lite`; PCK, summary and other endpoints `gemini-3.1-flash-lite` (`server/model_config.js`).<br>**Endpoint:** the `global` endpoint.<br>**Settings:** thinking MINIMAL, no temperature or topP.<br>**Why:** 2.5 Flash-Lite retires on Vertex on 2026-10-20. | `api_model_routing.test.mjs`; `student_model_bakeoff.md` §9; Mode B §12: 0 failures, whole turn p50 3.7 s (was 4.6 s) | `main` carries a separate hotfix with the same split (`1.3.0-gemini3`), so a merge conflicts (see the top of this document). About 2% garbled replies (see below). |
| **Missed-misconception PCK fix** (B27) | 1.4.1 | **Prompt:** one Gate-0 clarification: a hedged or tag-question incorrect claim followed by a bare acknowledgement is a missed error-identification.<br>**Guard:** a display guard on bare "אוקיי" / "יפה" / "נכון". | `pck_missed_misconception_experiment.md`; `pck_bare_ack_guard.test.mjs`; Mode B §13: critical-moment feedback 10 of 18 → 15 of 16; 21 invalid praises suppressed | One self-contradictory claim was still missed. Praise for peer redirects is a rubric question. |
| **Garbled-text telemetry** | 1.4.2 | Six content-free counters for garbled student text (foreign script, mixed-script tokens, cantillation marks, doubled function words, markup). Nothing the teacher sees changes. | `student_garble.test.mjs`; `student_garbled_text_investigation.md` | About 2% of replies are garbled (9–10 per roughly 515 replies in Mode B). Detection only; no fix yet. |
| **PCK row-text / display consistency** (B28) | 1.4.3, + `93ff57b` (no bump) | See §1, item 5. Researcher, admin and annotation views use the same view-model. | `pckDisplayRows.test.js`, `pckDisplayConsistency.test.js`; §0.28–§0.29 | Some score > 0 rows (about 2–12%) have no text anywhere. They are now counted. |

Other prompt changes in the same period:
- 1.3.10: conversational-move rule.
- 1.3.12: content-neutral student prompt examples.

Both are covered under §1, items 1–2.

The PCK scoring research is paused and changed no production code:
- the frozen benchmark;
- the consistency layer;
- B200 expert grounding;
- APR calibration;
- thinking level;
- schema order;
- two-stage scoring v1 and v2.

---

## 3. Candidates before the educational-team meeting (assessed, not implemented)

### 3.1 #6: a persistent lesson briefing

Implemented in 1.4.4 as a collapsible panel at the top of the chat, not in the left sidebar. See §1, item 6.

### 3.2 #8: a completed-simulation indicator

- **Scope:**
  - On the selection screen, mark each scenario the teacher has completed (a "✓ הושלם" badge on the card).
  - Read the teacher's own conversations with the existing `firestoreService.getConversationsByUser(currentUser.uid)`, the same query the teacher-facing `/logs` page already uses.
  - Map them to scenarios with a pure, tested helper.
  - If the fetch fails or is slow, show no badges; never block selection.
  - The selection screen appears again after "שיחה חדשה" (a page reload), so badges refresh naturally.
- **Product decision needed:** what "completed" means.
  - **Recommended:** `endTime` set, which means the teacher clicked "סיים שיחה".
  - **Alternatives:** a summary was generated, or a minimum number of turns.
  - Partial conversations do exist. In the pilot export, 41 of 133 conversations had no `endTime`. A conversation document is only created after the first logged turn.
- **Scenario identity (A9, the `scenario.text` / `scenarioId` issue):** this does **not block** a display-only indicator today.
  - The six active titles have been byte-identical since commit `1eb3da6` (2026-03-17), so they cover every pilot-era record.
  - The titles are unique, as asserted in `configContracts.test.js`.
  - Records from before 2026-03-17 use a "השיעור של השבוע הוא על " prefix, which one normalisation step can strip.
  - The risk is silent: a future title edit would make badges disappear (false negatives, never false positives).
  - The durable fix is an additive `scenario.id` in the config and the stored snapshot, plus a text→id map for old records. That is a data-contract change, so it should not be made tonight.
- **Data contract:** no change if matching uses `scenario.text`.
- **Dependencies:**
  - Firestore must allow a teacher to read their own conversations. The rules are not in the repository, but `/logs` relies on the same query.
  - **Verify on the demo account by opening `/logs`.**
  - The query fetches full documents (turns, including drawings), at most 100, unordered. That is fine for a typical teacher, but slow for heavy accounts.
  - A fresh demo account shows no badges until a conversation has been finished.
- **Versioning:** UI change, so `1.4.4`.
- **Risk:** low to medium. It is the only one of the two that reads user data on the selection screen, and it depends on the Firestore rule and on the "completed" definition.

**Neither candidate changes prompts, models, PCK decisions, student behaviour or the stored conversation format.**
