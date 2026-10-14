# Post-pilot change status (source of truth)

**Verified against:** branch `feature/post-pilot-improvements`, HEAD `69e04ef` (49 commits on `main..HEAD`), `SYSTEM_VERSION` **1.4.3**, on 2026-10-13.

**Update (same day):** #6 and #8 are implemented as **1.4.4**. #6 is committed (`9f1c018`); #8 and the return-to-selection fix (§2) are uncommitted in the working tree on top of it. Everything else below is unchanged.

**Update (2026-10-14):** 1.4.4 is committed (`cf61c03`); the carrier research is committed (`5ae51be`, `c657c09`). The release blocker (#12) is addressed by the misconception carrier, implemented as **1.5.0** in the working tree (uncommitted).
- Mode B release validation passed (`student_misconception_carrier_experiment.md` §9).
- Tests at 1.5.0: client 439 / 439 and server 328 / 328, twice; harness 78 / 78; build OK. This includes the teacher-facing additions to 1.5.0 below: return to scenario selection before finishing (§2), and drawing Undo and colours (#7).

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

**Release blocker (2026-10-13, `student_misconception_opportunity_investigation.md`), addressed in 1.5.0 (2026-10-14):** on the 1.4.4 student setup, the scenario misconception usually appears (29 of 36 synthetic conversations with production-like casts), but it is still held when the teacher explains in only 5 of 36. In 24 of the 29 conversations where it appears, the carrier talks themself out of it after the teacher's diagnostic questions, with no teaching.
- 1.5.0 designates one misconception carrier per conversation.
- On Mode B the carrier holds the misconception until the teacher teaches in 21 of 24 conversations (1.4.4: 15 of 24, often by a student who stays silent), and self-corrects before teaching in 2 of 24 (1.4.4: 8).
- See item 12.

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
| 6 | Initial teacher briefing disappears | **DONE** (`9f1c018`) | 1.4.4 |
| 7 | Drawing-tool improvements | **PARTIAL**: Undo and a colour palette done; partial erasing of shapes and line straightening deferred (to discuss with the educational team) | **1.5.0** (related: 1.3.3 image-only turns) |
| 8 | Visually mark scenarios already attempted | **DONE** (uncommitted on this branch) | 1.4.4 |
| 9 | Students drawing | **DEFERRED** | — |
| 10 | Preserve teacher-message line breaks | **DONE** in the chat, agents and storage; researcher viewers still collapse them | 1.3.7 |
| 11 | Student returns to a resolved difficulty | **NOT REPRODUCED** | (indirect: 1.3.8, 1.3.9, 1.4.0) |
| 12 | Student reaches the correct answer too early | **DONE** (misconception carrier; Mode B validated, pending educational-team testing; scenario 4 weaker) | 1.4.1 (partial), **1.5.0** |
| 13 | Summary contradicts in-conversation feedback | **DONE** | 1.3.1 |

### Per-item detail

#### 1. Multiple students show inconsistent difficulties: PARTIAL

- **2026-10-13 investigation (item 12):** on 1.4.4 a single student carries the misconception in 25 of 29 conversations where it appears, and a conflicting misconception appeared in 1 of 36. The 2.5 student spread it to several students in 20 of 36. Any fix that makes misconceptions persist must therefore name one carrier.

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
  - Committed in `9f1c018`; not yet deployed.

#### 7. Drawing-tool improvements: PARTIAL (Undo and colours in 1.5.0)

- **User-visible problem:** the board is basic.
  - It has select, eraser, pen, line and fixed shapes (rectangle, square, parallelogram, rhombus, trapezoid, kite).
  - It had no undo/redo, no colours or line width, and no text or vertex labels.
- **How the board works (Fabric.js 5):**
  - It starts empty: no scenario geometry is ever loaded onto it.
  - A pen stroke is a Fabric `path`.
  - Shapes are Fabric objects (`Rect`, `Line`, `Polygon`), created while dragging and finished on mouse-up.
  - The eraser, on its first press, flattens only the pen strokes into a background pixel layer and erases pixels of that layer. Shapes stay objects, so the eraser never erases them (the current, intentional semantics).
- **Changes (1.5.0):**
  - **Undo** (`FaUndo` button at the start of the toolbar, "בטל פעולה אחרונה"):
    - It restores the board as it was before the most recent user action; repeated Undo steps further back, up to 50 steps.
    - It is disabled when there is nothing to undo.
    - **One step** is:
      - one finished pen stroke;
      - one drawn shape (not every mouse move);
      - one move, resize or rotate of a shape;
      - deleting the selected shape(s), by the Delete key or the floating 🗑️;
      - one eraser stroke that actually erased something;
      - "נקה הכל".
    - It is implemented as canvas snapshots (`src/utils/drawingHistory.js`).
    - After Undo, the objects take the interactivity of the current tool. The eraser rebuilds its pixel layer from the restored board on its next press, exactly as after switching tools.
    - No Redo and no keyboard shortcut.
  - **Colour palette** (`src/config/drawingPalette.js`):
    - Four swatches from the colour-blind-safe Okabe-Ito set: black `#000000` (default), blue `#0072B2`, red `#D55E00` and green `#009E73`.
    - The selected swatch has a blue ring and `aria-pressed`.
    - It applies to new pen strokes and to every new shape (line, rectangle, square, parallelogram, rhombus, trapezoid, kite).
    - Existing drawings keep their colour. The eraser is unaffected.
  - Unchanged: eraser semantics, the tools, export of the drawing with a message, and the stored data (a drawing is still only a PNG on the teacher message).
- **Tests:** `drawingBoard.test.js` (15, against a Fabric stand-in because jsdom has no canvas); `regression_test_plan.md` §0.34.
- **Deferred, deliberately not implemented:**
  - **partial erasing of shapes:** the educational team asked for it; the intended behaviour is to be discussed with them first, and the eraser still does not touch shapes;
  - **automatic line straightening / shape recognition.**
- **Also still open:**
  - line width, text and vertex labels;
  - PCK visibility of drawings (B17: PCK does not see drawings);
  - vector-state storage.
- **Next step:** discuss partial erasing with the educational team.

#### 8. Visually mark scenarios already attempted: DONE (1.4.4)

- **User-visible problem:** teachers asked to complete all six scenarios over several days forget which ones they already did. The request is a visual distinction, not completion tracking or locking.
- **Change (1.4.4):** an attempted card looks different on the selection screen: a light green card, a green accent on the right edge, and the caption "✓ התנסית בתרחיש זה". It remains fully clickable and starts a new conversation as before.
- **Rule:** at least one saved conversation of the current teacher, with at least one logged turn, for that scenario, finished or not.
  - The conversation document is only created with the first logged turn, so merely opening a scenario does not count.
- **Data source:** the teacher's own conversations, read with the existing `/logs` query (`getConversationsByUser`).
  - They are matched on the stored scenario title (A9), normalised; the pre-2026-03-17 prefix "השיעור של השבוע הוא על " is stripped.
  - If loading fails or is slow, the screen works as before without marks.
- **Data contract:** unchanged. No `completed` state, no `scenarioId`, nothing stored.
- **Evidence:**
  - `attemptedScenarios.test.js` (20);
  - 8 page-level tests in `chatTurnOrchestration.test.js`;
  - `regression_test_plan.md` §0.31.
- **Remaining limitations:**
  - Matching on titles: a future title edit would silently drop the marks (never a false mark). The durable fix is an additive scenario id.
  - The Firestore read rule is not in this repository. Check `/logs` with the demo account; if the read is denied, the screen simply shows no marks.
  - A fresh account shows no marks until it has logged a turn.
  - Not yet committed or deployed.

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

- **Also in the 2026-10-13 investigation:** no regression after teaching in 96 conversations. The observed problem is the opposite: carriers resolve too early (item 12).

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

#### 12. Student reaches the correct answer too early: DONE in 1.5.0 (misconception carrier)

- **User-visible problem:** the student holding the misconception reaches the correct answer before the teacher has taught anything.
- **Changes:** 1.4.1 (missed-misconception PCK fix + B27) removed one cause.
  - When PCK stayed silent after a teacher's bare "אוקיי" to a misconception, the student drifted toward the answer: 3 carriers on 1.4.0, 0 on 1.4.1.
- **Evidence:**
  - Premature correctness is otherwise unchanged: 7 of 24 carriers on 1.3.12 and 1.4.0, 6 of 24 on 1.4.1 (`student_stability_replay.md` §12.3 and §13.3).
  - It occurs mostly in scenarios where the direct question invites self-correction.
- **Investigation (2026-10-13, `student_misconception_opportunity_investigation.md`):** 96 synthetic conversations, all 6 scenarios. The teacher probes neutrally, probes the misconception without giving the answer, asks a diagnostic question and "does everyone agree?", and only then explains.
  - **On 1.4.4 with production-like casts (36):**
    - the misconception appears in 29;
    - it survives at least one teacher turn in 15;
    - it is held until the explanation in only 5 (3 weakly);
    - in 7 the students are correct before the teacher can respond.
  - **By scenario,** held until the explanation:

    | scenario | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---:|---:|---:|---:|---:|---:|
    | held at T6 (of 6) | 1 | 0 | 2 (weak) | 2 | 0 | 0 |

  - **Designed casts (24):** held in 4.
  - **Mechanism:**
    - PCK rates a good probing or diagnostic question as positive / understanding "improved" (36 of 36 at the probe and at "explain how you thought");
    - the student prompt makes that binding ("MUST show understanding progress", "OVERRIDES ALL OTHER INSTRUCTIONS");
    - no student is designated as the carrier, and peers often give the full correct argument;
    - `gemini-3.5-flash-lite` follows the steering more literally than 2.5: under identical steering, 2.5 held the misconception in 29 of 36 but spread it to several students in 20 of 36.
  - **The earlier Mode B persistence** (17–18 of 24) came largely from its bare "אוקיי" probe, which PCK punishes with "misconception_reinforced" steering.
- **Carrier prototype (2026-10-13, `student_misconception_carrier_experiment.md`), experimental only, not promoted:**
  - **Design:** one carrier per session, chosen in code; a carrier rule in the student prompt; the PCK "improved" steering scoped to tone and progress for the carrier.
  - **Result:** on the same bench, the misconception is held until the teacher explains in **29 of 36** (1.4.4: 6 of 36), with no regressions in failures, repetition or latency. The carrier resolves after the explanation.
  - **Still short of the targets:**
    - peers often share the idea (11–14 of 36 conversations) or give the full resolution or counterexample first (16–20 of 36);
    - scenarios 2 and 4 stay weak (held in 2–4 of 6);
    - three peer wordings changed nothing.
  - **Peer control (2026-10-14, experiment §8), failed:** an explicit open/addressed state from a teacher-move classifier gated the peer role, the "addressed" flag and peer progress hints. It did not reduce peer resolution before teaching: 16 of 36, the same as v1. Peers still give one-step definition arguments and the kite counterexample. Stopped before Mode B, per plan.
  - **Decision (2026-10-14):** peer control is not pursued. A peer may give a correct contribution while the carrier still holds the misconception, as in a real classroom, but must not introduce a different misconception.
- **Release validation (2026-10-14, experiment §9):** Mode B, carrier v1 against committed 1.4.4, 24 conversations each, synthetic, all 48 reviewed manually.

  | measure | 1.4.4 | carrier v1 | criterion |
  |---|---:|---:|---|
  | misconception appears | 22 / 24 | **24 / 24** | ≥ 90% |
  | held until the teacher teaches | 15 / 24 | **21 / 24** | ≥ 80–85% |
  | self-correction before teaching | 8 / 24 | **2 / 24** | ≤ 10% |
  | conflicting misconception from a peer | 0 | **0** | ≤ 5% |
  | carrier resolves or progresses after teaching | — | **24 / 24** | ≥ 90% |

  - **Stability:** no regression. Exact duplicates 0 / 0, failures 0 / 0, garble 8 → 3, latency unchanged. Replies per turn rose from 1.71 to 1.86; peers still reply in 86% of turns.
  - **Peers:** correct contributions before teaching in 13 of 24 (accepted).
- **Implementation (1.5.0, working tree, uncommitted):**
  - **When the carrier is chosen:**
    - Once per conversation, when the teacher selects the scenario.
    - Taken from the session's fixed cast (B5) with rule `first-non-low-v1`: the first cast member whose participation baseline is not `low`, else the first (`src/services/misconceptionCarrier.js`).
    - `null` if the scenario has no misconception focus; all six current scenarios have one.
  - **Where it goes:**
    - **Student agent only.** `callAI` receives a copy of the scenario with `misconception_carrier`.
    - **PCK:** gets the unmodified scenario, and its model, prompt and output are unchanged.
    - **Teacher:** never sees the carrier.
  - **When it is saved:**
    - The logger receives it at construction.
    - It is stored as the additive top-level `misconceptionCarrier: {name, personaId, rule}`, in the first saved document (the lazy init at the first logged turn) and in every later save (`toJSON`).
    - `null` when there is no carrier. Older conversations have no field (backward compatible; invariant A18).
  - **Student prompt (`src/utils/ai.js`), only with a carrier:**
    1. **The "Possible misconception to watch for" line is dropped.** The "background only" sentence no longer says "do not force the misconception into every turn"; it points to the carrier block.
    2. **The carrier block replaces the "TARGETED MISCONCEPTION / LIFECYCLE (ONE or TWO students)" block.** The block says:
       - one named student sincerely holds the misconception, and the peers do not hold it or add another misconception about the topic;
       - the carrier voices it in their own words;
       - the carrier keeps it through "why?", "explain how you thought", "are you sure?", "does everyone agree?", "is it always true?", acknowledgements, praise or moving on ("these are not teaching");
       - the carrier revises it only after an explanation, a counterexample, a definition check led by the teacher, or an explicit confirmation;
       - peers should not give the full explanation or the decisive counterexample first.
    3. **The PCK header** no longer reads "takes priority over scenario misconception instructions". It now says the analysis takes priority except over the carrier rule, which it cannot by itself resolve.
    4. **The mandatory alignment rules open with an exception for the carrier:**
       - "positive / improved" sets tone, confidence and progress;
       - until the teacher has actually addressed the misconception (judged from the teacher's messages, not from the analysis), progress for the carrier means clearer reasoning, a doubt or less certainty, not the correct conclusion;
       - "Misconception WAS Addressed" does not apply to the carrier.

    **How PCK steering is kept from erasing the misconception:** PCK keeps steering every student's tone and confidence, and its analysis is passed through unchanged. Points 3 and 4 only stop that steering from being read as teaching for the carrier.

    The texts are the validated prototype v1, frozen by `src/__tests__/fixtures/studentPromptCarrierV1.json` (72 hashes). Without a carrier the prompt is byte-identical to 1.4.4.
  - **Tests (written first):** `studentPromptCarrier.test.js`, plus additions to `chatTurnOrchestration`, `conversationLogger` and `conversationContract`; `regression_test_plan.md` §0.33.
  - **Live smoke on 1.5.0 (6 Mode B conversations, production path):**
    - 0 failures and 0 duplicates; the carrier is recorded in the log;
    - the misconception appears in 6 of 6, is held until teaching in 5 of 6 (the miss is scenario 4) and resolves in 6 of 6.
- **Remaining limitations:**
  - **Scenario 4** ("a diagonal always bisects the angle"): the rectangle question lets the carrier reason its way out before teaching (held in 1 of 4).
  - **Peers** often give the correct argument or the counterexample before the teacher (accepted).
  - **Invented attributions:** the carrier occasionally invents a teacher attribution ("אמרת ש…"), including once the misconception itself. Same rate as 1.4.4.
  - **Evidence scope:** a scripted synthetic teacher only. Real-teacher sessions are the next check.
- **Next step:** educational-team testing on 1.5.0, watching scenario 4 and invented attributions.

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
| **Back to scenario selection** and a clean history per conversation | 1.4.4; **before finishing too: 1.5.0** | **Button:** after "סיים שיחה", a "חזרה לבחירת תרחיש" button in the chat header returns to the selection screen without a reload. It is disabled while a turn or the summary request is running.<br>**Fix:** the chat history (whose provider sits above the router) is cleared when a scenario is chosen. Before, leaving the chat via the navbar and coming back carried the old messages into the next conversation's display and model context. | 7 tests in `chatTurnOrchestration.test.js`; `regression_test_plan.md` §0.32 | The navbar "סימולטור" link still does nothing while on the chat page (unchanged; no navigation redesign). *(The "שיחה חדשה" page-reload button was removed in 1.5.0; see the next row.)* |
| **Back to scenario selection before finishing** | 1.5.0 (uncommitted) | **Availability:** the "חזרה לבחירת תרחיש" button is in the chat header for the whole session (outlined until the conversation is finished, filled after).<br>**Placement:** on the right of the header, where "שיחה חדשה" was. "שיחה חדשה" (a page reload at any time, also during a turn) is removed, so this is the only way out of the session. To repeat a scenario, return and choose it again.<br>**Finished, or no message sent yet:** returns directly, as before.<br>**Unfinished:** an RTL confirmation dialog (`LeaveConversationDialog.jsx`) says the conversation is not finished, recommends finishing to get the summary feedback, and says that what was said is kept in the records and that choosing the scenario again starts a new conversation. Three choices:<br>• "סיים שיחה וקבל משוב" runs the existing finish (`handleFinishConversation`) once and stays in the conversation, where "קבל ניתוח PCK" appears.<br>• "חזרה לבחירת תרחיש" leaves without finishing.<br>• "המשך בשיחה" (or Escape, or a click outside) closes the dialog.<br>**Safety:** the button is disabled during a turn, a pending finish, the summary request, and while already leaving. Leaving waits for queued turn-log writes.<br>**Storage:** leaving without finishing calls nothing on the logger. No new stored field, no unfinished / completed state, no resume. The next selection starts a new conversation (history reset kept). Attempted marks are unchanged. | 12 tests in `chatTurnOrchestration.test.js` ("…before finishing (1.5.0)"); `regression_test_plan.md` §0.34 | The "finished" signal is the existing in-session `isSessionEnded`; an unfinished conversation is still stored without `endTime`, as before. |

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

Implemented in 1.4.4 as an "attempted" marking, as the educational team specified: no completion definition, no badge for completion, no locking. See §1, item 8.

**Neither candidate changes prompts, models, PCK decisions, student behaviour or the stored conversation format.**
