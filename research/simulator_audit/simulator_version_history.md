# Simulator version history (1.0.0 → 1.5.1)

**Purpose:** one consolidated record of how the teaching simulator changed between its first versioned release and the current released baseline, **1.5.0**, written so that the iterations can later be described in a paper.
- It records what changed in each version, why it changed, and how the behaviour of the system changed.
- Research experiments that did **not** ship are kept in a separate section (§4), so they cannot be mistaken for released behaviour.

**Compiled:** 2026-10-26, from the repository. No production code, prompt, model, schema or `SYSTEM_VERSION` was changed for this document.
**Updated:** 2026-10-28, to add **1.5.1**, the first post-1.5.0 iteration (a development version, not yet merged or deployed; §2, §6).

**Sources (the source of truth, in this order):**
1. `src/config/version.js`: the `SYSTEM_VERSION` constant and its changelog, read on `main` at `1ce6b21`.
2. Git history: every commit that changed `SYSTEM_VERSION`, the commits between those bumps, and the tags `pilot-v1.3.0` and `v2026.05.25-production`.
3. `research/simulator_audit/post_pilot_change_status.md`, `invariants.md`, `regression_test_plan.md` and the experiment and audit documents in `research/simulator_audit/`.
4. `research/b200_handoff/`.

**How a version is identified in data:**
- Every saved simulator conversation carries `systemVersion`, the value of `SYSTEM_VERSION` in the build that produced it. This is the only provenance field (`architecture.md` §4; invariant A6).
- Pre/post questionnaire submissions do **not** record any version (see §2, "Questionnaires").

**Conventions:**
- "Released" means merged to `main`, the production branch. "Development version" means a numbered version that existed only on `feature/post-pilot-improvements` and was never deployed on its own.
- Statements that cannot be tied to code, git or a document are marked **(unverified)** or listed in §8.
- No participant text appears here. Pilot and B200 figures are aggregates taken from the cited documents.

---

## 1. Version timeline

| Version | Date | Main theme | Type |
|---|---|---|---|
| *(no version)* | 2025-10-27 → 2026-03-02 | Origin: "GPTeach with Vertex AI backend" (first commit 2025-10-27), adapted to the geometry domain (2025-11-10). `SYSTEM_VERSION` did not exist yet. | pre-versioning |
| **1.0.0** | 2026-03-03 | Login and user profiles, conversation logging to Firestore, the two-agent architecture (PCK feedback + students) | production (main) |
| **1.1.0** | 2026-03-10 | The five-skill universal PCK framework, filtered real-time feedback, 0/1/2 rubrics, adaptive summary | production (main) |
| **1.2.0** | 2026-04-27 | Student greeting and closing behaviour; per-skill coloured feedback bullets; second-person feedback; sequential skill chain | production (main) |
| **1.3.0** | 2026-05-20 | PCK gates (quoting the student error, most-recent-turn only), feedback continuity, student de-duplication. **Pilot baseline** (tag `pilot-v1.3.0` at `dd5b7a6`, 2026-09-06) | production (main); pilot |
| *2.0.0* | 2026-05-25 | Dialogue-state-tracking (DST) agent pipeline | **unmerged experimental branch, never released** (§4.4) |
| 1.3.1 | 2026-10-05 | Turn lock, empty-message guard, summary grounded in real-time feedback | development |
| 1.3.2 | 2026-10-05 | Visible failure notices and failure diagnostics | development |
| 1.3.3 | 2026-10-05 | Image-only (drawing) turns skip PCK cleanly | development |
| 1.3.4 | 2026-10-05 | Structured (schema-validated) PCK output | development |
| 1.3.5 | 2026-10-05 | Content-free LLM-call telemetry | development |
| 1.3.6 | 2026-10-05 | Retry / timeout policy for per-turn model calls | development |
| 1.3.7 | 2026-10-07 | Multi-line teacher messages preserved | development |
| 1.3.8 | 2026-10-07 | Student speaker identity in the model history | development |
| 1.3.9 | 2026-10-07 | Student prompt aligned with the response schema | development |
| 1.3.10 | 2026-10-07 | Natural responses to short conversational teacher messages | development |
| 1.3.11 | 2026-10-07 | Same-student duplicate guard with one re-ask | development |
| 1.3.12 | 2026-10-12 | Content-neutral student prompt examples | development |
| 1.3.13 | 2026-10-12 | Quote-safe Hebrew abbreviations; truncation telemetry | development |
| 1.4.0 | 2026-10-12 | Migration to split Gemini 3.x models | development |
| **1.3.0-gemini3** | 2026-10-12 | **Production hotfix:** the pilot code (1.3.0) with only the Gemini 3 model migration | **production (main), hotfix**, outside the post-pilot line |
| 1.4.1 | 2026-10-12 | PCK feedback after a bare acknowledgement of a misconception | development |
| 1.4.2 | 2026-10-13 | Garbled-text detection telemetry | development |
| 1.4.3 | 2026-10-13 | PCK sidebar shows the text the model returned for each skill | development |
| 1.4.4 | 2026-10-13 | Persistent teacher briefing; attempted-scenario marks; return after finishing; history reset | development |
| **1.5.0** | 2026-10-14 | Misconception carrier; return before finishing (single exit); drawing Undo and colours; transparent questionnaire images | **production release** (merged to `main` as `1ce6b21`) |
| 1.5.1 | 2026-10-28 | **First post-1.5.0 iteration:** PCK feedback text consistency (one row-text rule for every view and the summary input; no empty rows; one identical re-ask) | development (`feature/post-1.5-educational-feedback`; not merged or deployed) |

**About `1.3.0-gemini3`:**
- It was **not** a step of the post-pilot development line. It was the pilot code (1.3.0) with only the model migration. It was made because `gemini-2.5-flash-lite` retires on Vertex AI on 2026-10-20, and it was merged to `main` (`7f7fb25`, merge `d7fbe55`).
- It contains none of the changes in 1.3.1–1.4.4. The post-pilot line carried out the same migration independently as 1.4.0.
- Production ran `1.3.0-gemini3` from the hotfix deployment until 1.5.0 was deployed. Neither deployment date is recorded in the repository (§8).

**About the development versions:** 1.3.1–1.4.4 were never deployed. Each is a validated, versioned step whose behaviour reached production only through 1.5.0. 1.5.1 starts the next development line, from the released 1.5.0.

---

## 2. Detailed change history

Subsystem tags: **[UI]** teacher UI / flow · **[STU]** student agents · **[PCK]** PCK feedback · **[LOG]** logging / data contract · **[MOD]** model configuration · **[RES]** questionnaires / research UI · **[REL]** reliability / infrastructure.

### Pre-pilot versions (1.0.0 – 1.3.0)
These come from the `version.js` changelog. Changes between version bumps are listed from commit subjects only. Before the pilot, several behaviour changes were made **without** a version bump, so a `systemVersion` from this period does not identify a single behaviour (§8).

**1.0.0 (2026-03-03)**
- **What:** Firebase login and user profiles (Hebrew fields). Automatic conversation logging to Firestore. Protected routes. The two-agent architecture: a PCK feedback agent analyses the teacher's message, and a student agent produces the class's replies. Student behaviour was improved for incomplete teacher messages, multi-part instructions, knowledge tracking and teacher refocusing. **[UI] [LOG] [STU] [PCK]**
- **Why:** the first production version for research use.
- **Unversioned follow-ups (commit subjects):** IIS rewrite configuration (2026-03-04). One scenario ("diagonal bisecting angle") was commented out (2026-03-04).

**1.1.0 (2026-03-10)**
- **What:** the universal PCK framework of five skills supplied by the educational team: error identification, error characterisation, diagnostic interpretation, adapted pedagogical response and error leveraging. Each is scored on a 0/1/2 rubric with relevance detection. Real-time feedback is filtered to pedagogically relevant moments, and the end-of-session summary adapts its length. **[PCK]**
- **Also in this release (commits of the same day):**
  - conversations are saved only once they have content (lazy initialisation);
  - student personas are versioned and stored as references;
  - the user snapshot in conversations is reduced. **[LOG]**
- **Why:** to ground feedback in the educational team's skill framework instead of generic feedback.
- **Unversioned changes recorded under 1.1.0 (commit subjects; behaviour changed while the stamp stayed 1.1.0):**
  - 2026-03-17: drawing-board UX changes, and drawings saved to Firestore;
  - 2026-03-17: scenario texts revised and new geometry scenarios added (scenario titles changed format on this date; `attemptedScenarios.js` normalises the older prefix);
  - 2026-03-17: student reaction alignment refined;
  - 2026-04-13: PCK feedback quality improved, a scenario selector added, the drawing board extended;
  - 2026-04-19: retry back-off, PM2 configuration and an enhanced health check.

**1.2.0 (2026-04-27)**
- **What:**
  - students answer a small-talk opening only socially, and do not raise lesson content before the teacher does; they react to a lesson closing with a brief farewell; **[STU]**
  - real-time feedback is shown as per-skill coloured bullets (green = well used, yellow = partial, purple = missing) instead of a block of text; **[UI] [PCK]**
  - feedback addresses the teacher in the second person; **[PCK]**
  - feedback follows the sequential skill chain (identification → … → leveraging). At most 1–2 skills are assessed per turn, with prerequisite gating. **[PCK]**
- **Why:** more natural classroom openings and closings, and focused, readable feedback.

**1.3.0 (2026-05-20): the pilot baseline**
- **What:**
  - PCK Phase 1 is restructured into three sequential gates: closing and procedural messages are rejected first; pedagogical questions pass Gate 0. **[PCK]**
  - Gate 1 requires the model to quote the exact incorrect student claim before giving error feedback. Correct answers never trigger error identification. Only the most recent student turn counts, and a multi-student turn is handled per student. **[PCK]**
  - Feedback continuity: `skills_assessment` is kept in the feedback history, there is no repeated praise for the same error, and a teacher who follows an earlier suggestion is recognised. **[PCK]**
  - Anti-hallucination: evidence must come from the teacher's last message. **[PCK]**
  - Students may not repeat their previous response, and at least one student responds to every teacher message. **[STU]**
- **Why:** to reduce false or retroactive error feedback and hallucinated evidence before the pilot.
- **Note on stamps:** the commits that implement these changes are dated 2026-05-04 to 2026-05-20, while the stamp was still 1.2.0. The bump commit ("Bump version to 1.3.0 with changelog") came last.
- **Questionnaires [RES]:** the PCK pre/post questionnaire and its annotation interface were added on 2026-05-11 (`bd561b1`), during this period. The questionnaire is not tied to `SYSTEM_VERSION`.
- **Between the 1.3.0 bump and the pilot tag (2026-05-25 → 2026-09-06), research tooling only, no simulator behaviour change and no bump [RES]:**
  - an admin conversation browser, and research-management pages;
  - pre/post completion columns;
  - the conversation annotation module, then agreement analysis, comparison sets and consensus annotation;
  - Excel export of conversations;
  - protection against losing unsaved annotation work;
  - participant and date metadata.
- **The pilot:**
  - conversations were recorded on 1.3.0 with `gemini-2.5-flash-lite` for all agents (temperature 0.7);
  - the B200 expert set comprises 45 pilot conversations from 9 pre-service teachers (`pck_b200_expert_grounding.md` §11; `b200_handoff/experiment_findings.md` §1);
  - a production export dated 2026-07-27 contains 77 v1.3.0 conversations (821 turns) (`feedback_agent_findings.md`);
  - the pilot dates themselves are not recorded in the repository (§8).
  - The pilot code is frozen as tag `pilot-v1.3.0` and branch `archive/pilot-v1.3.0` (invariants §D Q4).
- **Pilot-baseline architecture (`architecture.md`, `llm_pipeline.md`):**
  - a React SPA and one Express server;
  - each turn, PCK analyses the teacher's move **first**, and its analysis steers the student agent;
  - 9 personas, 3 per session; 6 scenarios;
  - students use JSON mode, while PCK output is free text with silent default-filling on parse errors;
  - the browser writes the conversation to Firestore after each turn.
- **Known defects found later:** the summary never received the real-time feedback; score-1 suggestions were hidden; 41% of displayed feedbacks showed 3–5 skills (`feedback_agent_findings.md` §1.3, §2.1).

### Post-pilot development line (1.3.1 – 1.4.4, development versions)

**Starting point (2026-10-05, no bump):**
- a research handoff and the simulator invariants (`invariants.md`);
- a baseline regression test suite;
- a code-order fix in the chat page, with no intended behaviour change.

**Method from here on:** each fix was isolated, tested, versioned and, where it touched model behaviour, live-tested with the replay harness. The harness runs synthetic 12-turn lessons through the real client and server path. Mode A uses a scripted teacher; Mode B uses an adaptive scripted teacher with designed casts. The standard design is 24 conversations per version.

**1.3.1: turn lock, empty turns, grounded summary [UI] [PCK]** (pilot requests #2, #13)
- **What:**
  - Only one simulated turn runs at a time: input, send, drawing toggle and "סיים שיחה" are locked until the turn ends, extra submits are ignored, and logging stays in send order.
  - Empty or whitespace-only submissions without a drawing are ignored.
  - The end-of-session summary now receives the real-time feedback actually shown during the lesson.
- **Why:** concurrent turns mixed up replies and logging. The summary could contradict the real-time feedback because it never saw it (a field-name defect).
- **Behaviour:** turns are strictly sequential; empty turns no longer reach the agents; summaries are grounded in what the teacher saw, and therefore longer.

**1.3.2: visible failures [UI] [LOG] [REL]**
- **What:**
  - Failed PCK or student calls show a short Hebrew notice (sidebar or banner) instead of failing silently.
  - Failures are recorded in an additive `failedAttempts` list. It contains no text and at most 50 entries, and is never mixed into turns.
  - The fake fallback student line ("אני צריך רגע לחשוב על זה...") is no longer generated.
- **Why:** silent failures made conversations look valid when an agent had not answered, and the fake line contaminated data.

**1.3.3: image-only turns [UI] [PCK]**
- **What:** a turn consisting only of an included drawing skips the PCK agent, which cannot see images. There is no misleading failure notice. Students still receive the drawing.
- **Why:** the empty text was rejected by PCK and shown as a technical problem.

**1.3.4: structured PCK output [PCK] [REL]**
- **What:** PCK uses JSON mode with an explicit response schema, and the server validates every analysis. Malformed output is now a reported failure instead of being silently default-filled into a "successful" analysis with placeholder text.
- **Why:** 24 of 30 malformed outputs had passed as successful analyses (invariants C10). This was the B200 handoff's recommendation A1 (§5).
- **Side effect found later:** the model began leaving per-skill `evidence` empty, which made most displayed rows text-less. This was fixed in 1.4.3.

**1.3.5: telemetry [LOG]**
- **What:** each logged turn carries content-free metadata for the PCK and student calls: model, latency, finish reason and attempts. Image-only turns record PCK as "skipped".
- **Why:** to measure latency and failures without storing any text. A latency baseline on 1.3.5 measured PCK p50 3.6 s and student p50 1.6 s (`latency_baseline.md`).

**1.3.6: retry / timeout policy [REL]**
- **What:**
  - At most 2 model attempts per request: 20 s per attempt, 45 s total budget, 50 s browser timeout.
  - Timeouts, transient errors, 429s, empty output and malformed structured output are retried once.
  - If PCK still fails, students are generated without PCK guidance.
- **Why:** to bound waiting time and recover from transient errors. The values come from the latency baseline.

**1.3.7: multi-line teacher messages [UI] [LOG]** (pilot request #10)
- **What:** line breaks typed by the teacher are kept in the chat, in what both agents receive, and in the log.

**1.3.8: student speaker identity [STU]** (pilot requests #1, #2)
- **What:** in the history sent to the student model, each earlier student reply is labelled with its speaker.
- **Why:** unlabelled history let the model confuse who said what, and contributed to repetition (`student_agent_findings.md` §1.1). In the production export used for the audit (133 conversations, all versions up to 2026-07-27), 5.4% of student messages (171 of 3,163) exactly repeated an earlier message, mostly by the same student.

**1.3.9: prompt aligned with the output schema [STU]**
- **What:** the student prompt no longer asks for a "thinking" field the schema never allowed. The decision checklist is kept but worked through silently.
- **Validation:** a 30-context A/B (`student_agent_findings.md` §1.2).

**1.3.10: short conversational teacher messages [STU]** (pilot request #2)
- **What:** one prompt rule. When the teacher only acknowledges, praises, thanks or closes, students respond to that move, do not restate earlier answers, and a confused student stays confused without repeating the same wording.
- **Validation:** a 5-arm experiment (`short_message_repetition_experiment.md`). The chosen arm cut exact self-repeats from 15.5% to 5.5% and problem replies after closings from 10/43 to 0/42. PCK steering was kept.

**1.3.11: same-student duplicate guard [STU] [REL]** (pilot request #2)
- **What:**
  - A reply of 30+ characters that repeats the same student's earlier reply (exactly after normalisation, or edit similarity ≥ 0.90) triggers one re-ask, inside the existing 2-attempt limit.
  - A reply that is still a duplicate is dropped, unless that would leave no reply.
  - Telemetry counts this without storing text.
- **Why:** prompt rules alone left repeats at 5.4% in the 1.3.10 replay.
- **Validation:** the criterion caught 86% of labelled problem replies with 0 natural replies flagged (`student_duplicate_guard_study.md`); a re-ask resolved 95% (`student_duplicate_reask_experiment.md`); the 1.3.11 replay had 0 exact repeats (`student_stability_replay.md` §10).

**1.3.12: content-neutral prompt examples [STU]** (pilot request #1)
- **What:** the three example outputs in the student prompt no longer name cast members, contain lesson geometry or use gendered forms.
- **Why:** the examples were bound to cast positions and could be echoed (`student_prompt_examples_experiment.md`: position-specific echoes 2 → 0).
- **Validation:** the first full Mode B baseline (24 conversations) was run on 1.3.12 (`student_stability_replay.md` §11).

**1.3.13: quote-safe abbreviations [STU] [LOG]**
- **What:**
  - Students write Hebrew abbreviations with gershayim (ס״מ) instead of an ASCII double quote.
  - Detection-only telemetry counts suspected cut replies.
- **Why:** an ASCII `"` inside JSON output silently ended the reply, for example "…באורך 5 ס" (`student_quote_truncation_investigation.md`).
- **Validation:** abbreviation cuts went from 13 to 0 (`student_quote_safety_experiment.md` §9).

**1.4.0: Gemini 3.x migration [MOD]**
- **What:**
  - Student agent: `gemini-3.5-flash-lite`. PCK, summary and the other endpoints: `gemini-3.1-flash-lite`.
  - Vertex `global` endpoint; thinking explicitly MINIMAL; no temperature or topP.
  - Prompts and schemas unchanged.
- **Why:** `gemini-2.5-flash-lite` retires on 2026-10-20.
- **Validation:** a Mode B bakeoff of four configurations (`student_model_bakeoff.md`).
  - 3.1 as the student caused premature correctness in 8 of 12 carriers.
  - 3.5 as PCK showed far less feedback (38 of 144 turns).
  - The split configuration kept misconception persistence near 2.5 (6/12) at a lower whole-turn latency (p50 3.8 s vs 4.6 s).
- **Expected differences (changelog):** PCK feedback is shown on fewer turns (about 60% vs 93%).

**1.4.1: feedback after a bare acknowledgement of a misconception [PCK]** (pilot request #12, partial)
- **What:**
  - One clarification block in PCK Gate 0: a hedged or tag-question wrong claim still counts, and answering it with only "אוקיי" / "יפה" / "נכון" is a missed error identification.
  - A server guard shows feedback on such a bare acknowledgement only if it is that missed error identification.
- **Why:** on 1.4.0, 8 of 18 such moments got no feedback.
- **Validation:** frozen contexts went from 2/48 to 48/48 shown, and controls stayed controlled with the guard. In Mode B, critical feedback was shown in 15 of 16 cases (`pck_missed_misconception_experiment.md`; `student_stability_replay.md` §13).

**1.4.2: garbled-text telemetry [LOG]**
- **What:** content-free counters for garbled student text (a foreign-script letter inside a Hebrew word, cantillation marks, doubled function words, markup), plus a counter for replies under a name outside the cast. Detection only; nothing the teacher sees changes.
- **Why:** `gemini-3.5-flash-lite` garbles about 2.1% of replies (34 of 1,608). The text is already corrupted in the raw model output, and lowering the temperature has no effect (`student_garbled_text_investigation.md`).

**1.4.3: PCK row display contract [PCK] [UI] [RES]** (pilot requests #4, #5)
- **What:** each displayed skill row shows text the model actually returned.
  - Score 2: the positive evidence.
  - Score 1: the positive text plus the improvement suggestion on a "לשיפור:" line. Before, score-1 suggestions were hidden.
  - Score 0: the suggestion.
  - Nothing is generated or inferred.
- **Why:** since 1.3.4 most positive rows had shown only the skill name.
- **Validation:** row-text coverage went from 7.0% to 86.8% on the 1.4.1 outputs (`pck_row_text_contract_experiment.md` §9). The schema variant that was also tested changed feedback decisions and was not shipped (§4).
- **Follow-up `93ff57b` (no bump):** researcher and admin views and the Excel export use the same rule. Exports made before this used the old rule.

**1.4.4: teacher workflow [UI]** (pilot requests #6, #8)
- **What:**
  - The pre-lesson briefing stays available during the lesson as a collapsible panel.
  - Scenarios the teacher has already attempted are marked on the selection screen.
  - After finishing, a "חזרה לבחירת תרחיש" button returns to the selection screen without a reload.
  - A new conversation always starts with an empty history. Previously, an earlier conversation's messages could reach the agents after navigating away and back.
- **Data:** nothing new is stored.
- **Note:** the 1.4.4 bump was committed with the briefing (`9f1c018`). The marks, the return button and the history fix followed in `cf61c03`, with the stamp unchanged.

### 1.5.0 (2026-10-14): production release [STU] [UI] [LOG] [RES]

**Misconception carrier** (pilot request #12, the release blocker)
- **Problem:**
  - On 1.4.4, the scenario misconception usually appeared (29 of 36 synthetic conversations) but was still held when the teacher finally explained it in only 5 of 36.
  - In 24 of the 29 the student talked themselves out of it in response to diagnostic questions, before any teaching (`student_misconception_opportunity_investigation.md`).
  - Mechanism: PCK rates good diagnostic questions as positive / understanding "improved", and the student prompt treated that steering as binding.
- **Change:**
  - At scenario selection, **one student of the fixed cast is designated as the carrier** of the scenario misconception (rule `first-non-low-v1`) and stays the carrier for the whole conversation.
  - The student prompt instructs the carrier to express the idea in their own words, and to keep it through questions, probes, praise, acknowledgements and requests to explain.
  - The carrier revises it only after the teacher actually addresses it: an explanation, a counterexample, a definition check or an explicit confirmation of a correct argument.
  - The other students do not hold it and do not introduce other misconceptions.
  - PCK steering still sets tone and confidence, but can no longer by itself "resolve" the carrier's misconception.
  - PCK, its feedback to the teacher and the UI are unchanged. The carrier is never shown to the teacher.
- **Data:** an additive conversation field `misconceptionCarrier` = `{name, personaId, rule}` (invariants A18, B29).
- **Validation:** the prompt texts are the validated research prototype v1, frozen by prompt hashes in a test fixture.
  - On the opportunity bench, held until teaching went from 6/36 (1.4.4) to 29/36.
  - In the Mode B release validation (24 vs 24), the carrier version:
    - showed the misconception in 24/24;
    - held it until meaningful teaching in 21/24 (79% under a strict reading);
    - self-corrected before teaching in 2/24 (vs 8/24 on 1.4.4);
    - had no conflicting peer misconception (0/24);
    - resolved or progressed after teaching in 24/24;
    - showed no stability regression.
  - A live smoke run of 6 conversations on the production path agreed (`student_misconception_carrier_experiment.md` §9).
- **Known limitations:**
  - Scenario 4 ("a diagonal always bisects the angle") is weak: held in 1 of 4.
  - Peers often give the correct argument first (accepted as realistic).
  - Occasional invented teacher attributions ("אמרת ש…") occur at the 1.4.4 rate.

**Leaving a lesson [UI]**
- "חזרה לבחירת תרחיש" is available for the whole lesson and is the only exit. The former "שיחה חדשה" page reload was removed.
- An unfinished conversation first asks for confirmation, with three choices: finish and get feedback (the existing finish flow), leave anyway, or continue.
- Leaving waits for pending log writes, stores nothing new and offers no resume.

**Drawing board [UI]** (pilot request #7, partial)
- Undo: one step per completed drawing action, up to 50 steps.
- A four-colour palette (black default, blue, red, green; colour-blind-safe).
- Eraser behaviour is unchanged: it erases only freehand strokes, never shapes.
- Partial erasing of shapes and line straightening are deferred.

**Questionnaires [RES]**
- The pre-test (rotated square) and post-test (rotated rectangle) images were replaced with transparent-background versions at roughly the same displayed size.
- Question content is unchanged.
- This asset-only change shipped in the 1.5.0 release commit but is **not** described in the `version.js` changelog. Questionnaire submissions record no version, so submissions can be assigned to the old or new images only by date (§8).

**Validation of the release build (merged tree):** client tests 448/448, server tests 328/328, harness tests 78/78, production build OK. Merged to `main` as `1ce6b21`. The merge resolved 4 conflicts with the hotfix in favour of 1.5.0 and kept the `1.3.0-gemini3` changelog entry.

### 1.5.1 (2026-10-28): first post-1.5.0 iteration, PCK feedback text consistency [PCK] [UI] [LOG]

The first change made after the educational team's feedback round on 1.5.0 (`post_1.5_feedback_investigation.md` §A; regression plan §0.35; invariants B28, A17). It is the deterministic part of that investigation; the model, rubric and architecture questions are left to later experiments.

- **Problem (1.5.0 data):**
  - 96 of 1,077 shown feedbacks had at least one skill row with no text. Most were score-2 rows (about 6%, mostly random), shown as a bare skill name.
  - Score-0 rows ignored the matching `missed_opportunities` text.
  - The sidebar, the viewers, the exports and the summary input did not all derive the row text the same way.
  - Score-1 rows never had a positive part (0 of 152): the model does not list score-1 skills in `demonstrated_skills`.
- **Change:**
  - **One row-text rule** for the sidebar, the conversation-log and admin viewers, the Excel / CSV exports and the summary input:
    - score 2: positive evidence;
    - score 1: positive evidence + improvement;
    - score 0: improvement, now falling back to the single matching `missed_opportunities` text.
  - **Two copies of the rule:** the client (`src/services/pckDisplayRows.js`) and the server (`server/pck_row_text.js`), kept identical by a parity test.
  - **Display:**
    - Teacher-facing views never show a row with no text.
    - Shown feedback with no displayable row at all is neither displayed nor logged (0 of 1,077 in the 1.5.0 data).
    - Exports keep every scored skill.
    - **Interim:** a score-1 row without a positive part still shows its improvement. The full "what exists + what to improve" contract is left to the two-stage PCK work.
  - **Retry:**
    - When feedback that will be shown has a row with no text, the server re-asks once with the identical request, as the existing second attempt (still at most 2).
    - The first answer is the fallback; a still-incomplete second answer is accepted.
    - Expected: one extra PCK call on about 9% of shown turns.
  - **Summary input:** the summary sees the text the teacher saw.
- **Unchanged:** models, the PCK prompt and rubric, the response schema, the show/hide decision (`should_provide_feedback` and the bare-acknowledgement guard), the misconception carrier, the student prompt and the stored PCK fields.
- **Side effect of the re-ask:** on a re-asked turn, the analysis used is the second sample of the identical request. Its scores, display decision and student steering can therefore differ from what the first sample would have given. This is a sampling effect, not a change in the rules.
- **Data:**
  - two additive, content-free telemetry counters: `pckRowsMissingPositive` and `pckRowTextRetries`;
  - conversations carry `systemVersion: "1.5.1"`.
- **Validation:**
  - client tests 462/462, server tests 340/340, harness tests 78/78; production build OK;
  - not yet validated live on the real model.

---

## 3. Post-pilot work grouped by research purpose

| Purpose | What changed (version) | Pilot request |
|---|---|---|
| **Usability and teacher workflow** | Turn lock and empty-turn guard (1.3.1); visible failure notices (1.3.2); image-only turns (1.3.3); multi-line messages (1.3.7); persistent briefing, attempted marks, return after finishing, clean history (1.4.4); single exit with an unfinished-lesson dialog; drawing Undo and colours (1.5.0) | #6, #7 (partial), #8, #10 |
| **Student behaviour: repetition and coherence** | Speaker identity in history (1.3.8); prompt/schema alignment (1.3.9); short-message rule (1.3.10); duplicate guard (1.3.11); neutral examples (1.3.12); quote-safe abbreviations (1.3.13) | #1 (partial), #2 |
| **Student behaviour: misconception persistence** | Model choice partly driven by persistence (1.4.0); designated misconception carrier (1.5.0) | #12 |
| **PCK feedback quality** | Summary grounded in real-time feedback (1.3.1); structured, validated output (1.3.4); feedback on missed misconceptions after bare acknowledgements (1.4.1); every displayed row shows the model's own text, score-1 rows show the suggestion (1.4.3); one row-text rule for every view and the summary, no empty rows, one identical re-ask (1.5.1, post-1.5.0 feedback round) | #4 (partial), #5, #13 |
| **B200-informed feedback changes** | Structured output (handoff A1, 1.3.4); retry policy (A3, modified, 1.3.6); score-1 "what exists + recommendation" presentation (matches the B200 template, 1.4.3). The rest stayed research (§5) | — |
| **Model migration** | Split Gemini 3.x models (1.4.0); same migration on the pilot code as the production hotfix `1.3.0-gemini3` | — |
| **Reliability and logging** | `failedAttempts` diagnostics (1.3.2); telemetry (1.3.5); retry/timeout policy (1.3.6); quote-cut, garble and unknown-speaker counters (1.3.13, 1.4.2); `misconceptionCarrier` provenance (1.5.0); regression suite and replay harness (research tooling) | — |
| **Pre/post questionnaires** | Transparent geometry images (1.5.0, asset-only). Questionnaire content unchanged since the pilot | — |

**Not addressed in production:**
- #3 voice input: open, design first.
- #9 students drawing: deferred.
- #11 student returning to a resolved difficulty: not reproduced.
- #1 inconsistent difficulties: partial.
- #4 feedback length: partial.

Status per request is in `post_pilot_change_status.md` §1.

---

## 4. Experiments evaluated but NOT released

None of the following is production behaviour. Where an experiment led to a released change, the released part is named explicitly.

### 4.1 PCK feedback
All evaluated on 1.4.x with `gemini-3.1-flash-lite`. Per `post_pilot_change_status.md` §2, the scoring research is **paused and changed no production code**.

| Experiment | Question | Main result | Outcome |
|---|---|---|---|
| Row-text schema variant (X1, `pck_row_text_contract_experiment.md`) | Does requiring per-skill text fields put text on every row? | Text on 100% of rows, but decisions shifted (shown controls 2 → 38 of 228) and fabricated evidence appeared | Schema/prompt change **not shipped**; its deterministic display rule **shipped as 1.4.3** |
| Score-conditioned text (X2, `pck_score_conditioned_text_experiment.md`) | Can the prompt alone produce score-specific text (the B200 template)? | Text gain none; shown controls 6 → 50 of 456 (p = 3×10⁻¹⁰): the text instruction itself shifts decisions | Not shipped; motivated the two-stage idea |
| Frozen synthetic benchmark (E3/X4, `pck_eval_benchmark.md`) | A reusable guardrail for PCK changes | 116 rubric-labelled cases; 1.4.3 decision agreement 92% | Tooling only |
| Deterministic consistency layer (X3, `pck_consistency_layer_experiment.md`) | Can rules remove output contradictions without new judgements? | Removes all 140 list contradictions, but changes the steering fields in 18–20% of turns; a continuity rule raised false negatives 19 → 45 | Not implemented (recommended as a later versioned change; paused) |
| B200 expert grounding (`pck_b200_expert_grounding.md`) | How does 1.4.3 compare with expert labels? | Decision vs consensus P 0.96 / R 0.81; adapted pedagogical response (APR) scored 2 in 36 of 37 consensus rows (inflation); experts contradict some strict rubric rules | Evaluation only; set the agenda for X6–X10 |
| APR score calibration (X6, `pck_apr_score_calibration_experiment.md`) | Do expert-aligned APR band texts fix the inflation? | 0 APR score changes in 596 turns; the model never outputs APR = 1 | Not shipped |
| Thinking level LOW vs MINIMAL (X7, `pck_thinking_level_experiment.md`) | Does more reasoning fix APR scoring? | 13% failed requests at 2,000 tokens; APR = 1 in 1 of 129 rows; decision recall 0.79 → 0.47; latency p50 2.6 → 5.6 s | Not shipped; MINIMAL kept |
| Score-first schema ordering (X8, `pck_schema_order_experiment.md`) | Does emitting scores before praise fields remove anchoring? | APR = 1 now used (18%) and APR κ 0.12 → 0.36, but decision recall 0.84 → 0.65 and benchmark agreement 90.1% → 77.8% | Not shipped; causal evidence for anchoring |
| Two-stage scoring v1 (X9, `pck_two_stage_scoring_experiment.md`) | Does a separate rescoring call fix calibration with no decision drift? | APR exact 38% → 52%, bias +0.59 → +0.05, no decision drift, cost +12–13%; error-identification bias +0.15 → −0.46 | Not shipped ("architecture justified, v1 not production-ready") |
| Two-stage scoring v2 (X10, `pck_two_stage_scoring_v2_experiment.md`) | Does an expert-boundary Stage-2 rubric fix v1? | Consensus APR exact 62 → 68 of 108; identification recovers on expert data; but a bare "זה לא נכון" scores identification 0 (6/6) | Not shipped; v3 / "Stage 2 owns APR only" awaits a decision |
| PCK feedback v2 plan (`pck_feedback_v2_plan.md`) | Workstreams W0–W6, experiments X1–X8 | Plan | X1 led to 1.4.3; the rest as above |

### 4.2 Student agent

| Experiment | Main result | Outcome |
|---|---|---|
| C9 options A (remove the reasoning instruction) and C (add a reasoning field), `student_agent_findings.md` §1.2 | A loses the checklist cues; C risks the 512-token limit | Rejected; option B **shipped as 1.3.9** |
| Short-message arms B (no PCK block), D (B + rule), E (remove only "MUST show confusion"), `short_message_repetition_experiment.md` | Removing PCK steering discards state steering; E did not help | Rejected; arm C **shipped as 1.3.10** |
| Duplicate-guard alternatives (lower thresholds, Jaccard, containment, browser-side guard, keep-or-fail policies), `student_duplicate_guard_study.md` | More false flags, or a third model attempt | Rejected; the chosen criterion **shipped as 1.3.11** |
| Quote-rule variants B and D, `student_quote_safety_experiment.md` | B increased opening-quote cuts; D not better than C | Rejected; C **shipped as 1.3.13** |
| Teacher-attribution grounding rule, `student_teacher_attribution_investigation.md` | Problematic attributions 9 vs 10; more "אמרת" references; 2 failed turns | Not shipped |
| "Teacher:" labels on teacher turns, `student_teacher_history_label_experiment.md` | Attribution errors 8 → 12; accurate references halved | Not shipped; attribution recorded as a known limitation |
| Model bakeoff arms (3.1 or 3.5 for both agents), `student_model_bakeoff.md` | 3.1 student: premature correctness 8/12; 3.5 PCK: little feedback | Rejected; the split **shipped as 1.4.0** |
| Lower temperature against garbling, `student_garbled_text_investigation.md` | No effect (p = 0.96); a retry on garble was not tested | Not shipped; detection-only telemetry **shipped as 1.4.2** |
| Misconception options (a) prompt only, (c) change PCK semantics, (d) per-student state machine, (e) make students "less smart", `student_misconception_opportunity_investigation.md` §5 | Judged insufficient or the wrong target | Not pursued; option (b), a designated carrier, became 1.5.0 |
| Carrier variants v2 and v3 (stricter peer wording), `student_misconception_carrier_experiment.md` | No measurable benefit over v1 (peer full resolution 20 and 20 of 36 vs 16) | Rejected; v1 **shipped as 1.5.0** |
| Carrier peer control pc1 (explicit open/addressed state from a teacher-move classifier gating the peers), same document §8 | Peer resolution 16 of 36, the same as v1; the classifier misfired on a scenario-4 question | Rejected; peer correct contributions were then accepted as realistic |
| Mode B second review (`mode_b_baseline_1.3.12_second_review.md`) | 23 judgement-heavy cases prepared for an independent reviewer | Second review not completed |

### 4.3 B200 models (offline, `research/b200_handoff/`)
- Gemini 2.5 Flash-Lite (zero- and 8-shot), and Gemma-4-31B-it (zero-shot, 8-shot, LoRA SFT, DPO, rubric-margin "MODPO", label-only SFT).
- Earlier: Qwen2.5-7B SFT baselines.
- None was deployed. See §5.

### 4.4 Architecture branch never merged
- **`2.0.0` dialogue-state tracking (DST)**, `origin/feature/pck-oriented-dst`, 2026-05-25.
- A third agent maintained a structured dialogue state: pending challenge, misconception lifecycle, per-skill trajectory, feedback given, per-student understanding. That state would have replaced the raw feedback history in the PCK prompt, behind a feature flag.
- The branch was never merged into `main` and no conversation from it is part of any study. No evaluation document exists in this repository **(unverified whether it was evaluated elsewhere)**.
- The post-pilot investigations considered explicit per-student state again and deferred it (`student_stability_replay.md` §11.6; opportunity investigation option (d)).

---

## 5. B200 contribution across versions

**What B200 is:**
- The offline research line on automatic PCK feedback, summarised in `research/b200_handoff/`. Its raw data stays local under `research/pck_feedback/` and is never committed.
- Its expert set: 45 pilot conversations (`systemVersion` 1.3.0) from 9 pre-service teachers, 596 teacher turns, annotated on all five skills by two domain experts. One expert annotated all 45 conversations and the other 20.
- Annotation tiers: consensus 73 turns, double 251, single 272. Expert–expert decision agreement is moderate (κ 0.41) (`pck_b200_expert_grounding.md`).

**1. Expert annotations as evaluation / ground truth**
- B200 labels were the reference against which 1.4.3 and every PCK experiment X6–X10 were measured (§4.1).
- The 1.4.0 model switch was not evaluated against B200 beforehand (it was forced by the model's retirement). The expert replay came afterwards (1.4.3).

**2. Findings that changed production behaviour or rubric decisions**
- Structured output with schema validation (handoff A1) became **1.3.4**.
- The retry policy (A3) was adopted in modified form in **1.3.6**.
- The score-1 presentation ("what exists" plus a recommendation) follows the B200 template and became **1.4.3** (invariants B12, B28).
- The 1.4.1 clarification block follows B200 rubric semantics (a missed error identification on a hedged claim).
- **Not adopted:**
  - B200's semantic rules (A4): the experts themselves contradict B200's strict characterisation and leveraging rules (`pck_b200_expert_grounding.md` §5);
  - score-conditioned text (A5): it shifts decisions;
  - a hard cap on displayed skills (A6): invariant B8 is still under review;
  - few-shot prompting and the two-call decomposition: two-stage research is paused.

**3. Trained or fine-tuned models: evaluated, not deployed**
- Fine-tuning improved the wording of the feedback text but not error-identification precision, and supervised fine-tuning made the feedback decision worse.
- Preference tuning gave negligible gains.
- The handoff itself recommends fine-tuning only with a self-hosted path, and calls preference tuning not worth it for production (`production_recommendations.md` §B9).
- Production PCK has always run on hosted Gemini: 2.5 Flash-Lite up to 1.3.13, 3.1 Flash-Lite from 1.4.0.

In short, B200 entered the simulator as evaluation ground truth and as rubric and presentation decisions, never as a deployed model.

---

## 6. Current baseline

> **Current released baseline: 1.5.0**

- **1.5.0 was merged to `main`** (`1ce6b21`, 2026-10-14) and, as reported by the research team, **deployed to production**. The repository records the merge, not the deployment date.
- The 1.5.0 merge replaced the production hotfix `1.3.0-gemini3`. Conversations recorded in production before the deployment carry `1.3.0-gemini3` (or `1.3.0`, if recorded before the hotfix).
- **1.5.0 is the version the educational team tested** in the subsequent feedback round.
  - Their issue list, **"טבלת בעיות סימולטור 22.10.docx"**, therefore describes issues observed on 1.5.0. It is kept outside the repository.
- **The first change based on that feedback is 1.5.1** (2026-10-28, PCK feedback text consistency, §2). It is a development version on `feature/post-1.5-educational-feedback` and is not merged or deployed. Until it is deployed, production data is 1.5.0.
- The next investigation starts from 1.5.0. Any change it produces must be released under a new `SYSTEM_VERSION`, so data from the team's evaluation stays distinguishable from later versions.

Branch state when this document was written:
- `main` = `1ce6b21` (1.5.0).
- `feature/post-pilot-improvements` = `c68b23c`. It has the same code, but its `version.js` lacks the `1.3.0-gemini3` changelog entry that the merge added.

---

## 7. Documentation rules going forward

1. **Every behaviour-changing production release gets a new `SYSTEM_VERSION`.** This covers prompts, models, settings, UI flow, stored fields and any change in what the teacher or students see. Do not change behaviour under an existing stamp, which happened before the pilot (§2, §8).
2. **Every version entry states what changed and why**, and names the evidence: the experiment document, the validation run and the tests.
3. **Experiments that do not ship stay in the experiment documents and in §4 here.** They are never described as released behaviour. When an experiment informs a release, the release entry names it.
4. **Record the version used in every study or evaluation round:**
   - the exact `SYSTEM_VERSION`;
   - the date range;
   - whether participants or reviewers used production or a local build.

   Questionnaire submissions carry no version, so record the questionnaire state, including asset changes such as the 1.5.0 images, by date, or add a version field in a future versioned change.
5. **Developer testing against the production Firebase project writes real records.** Note the dates and accounts so that such records can be excluded from study data.

---

## 8. Gaps and uncertain entries

- **Pilot dates:** not recorded in the repository. Known only as bounds: 1.3.0 is dated 2026-05-20, the export used in the audit is dated 2026-07-27, and `pilot-v1.3.0` is tagged at 2026-09-06.
- **Deployment dates:** no deployment of any version is recorded in git. 1.0.0–1.3.0 were on `main` (the tag `v2026.05.25-production` points at the 1.3.0 bump), but when each reached the production server is not recorded. The `1.3.0-gemini3` and 1.5.0 deployments are known from the team, not from the repository.
- **Unversioned behaviour changes before the pilot:**
  - several changes were made while the stamp stayed 1.1.0 (2026-03-17 to 2026-04-19);
  - the 1.3.0 behaviour was committed while the stamp was still 1.2.0 (2026-05-04 to 2026-05-20).
  - If these builds were deployed in between, conversations stamped 1.1.0 or 1.2.0 can come from different behaviours. Not verifiable from the repository.
- **Post-pilot changes without their own bump:**
  - the chat code-order fix (2026-10-05, before 1.3.1; no intended behaviour change);
  - `93ff57b` (researcher views, under 1.4.3);
  - `cf61c03` (attempted marks, return after finishing, history reset, under the existing 1.4.4 stamp);
  - the questionnaire images (in the 1.5.0 commit, not in its changelog).
- **Development-version records:** 1.3.1–1.4.4 were never deployed. Local developer testing against the production Firebase project may still have written records with those stamps **(unverified)**. Such records are not participant data.
- **`2.0.0` (DST):** a `SYSTEM_VERSION` value on an unmerged branch. It is not part of the release line, and its evaluation status is unknown.
- **Status document:** `post_pilot_change_status.md` still describes `main` as `1.3.0-gemini3` in its header (written 2026-10-13/14). That is superseded by the 1.5.0 merge.
- **Figures that differ between documents:** some experiment documents report slightly different figures for the same quantity, because of different row sets or reruns. For example, the 1.4.4 hold rate is 5/36 in the opportunity investigation and 6/36 in the carrier experiment, whose benchmark version changed one scenario probe. This document quotes the figure from the document named next to it.
