# Feedback agent findings: real-time vs summary, and comparison with B200

Legend: [CODE] · [DATA] (133 exported conversations; v1.3.0 subset = 77 conversations, 821 turns) · [HYPOTHESIS].

## 1. Real-time (in-conversation) feedback

**Pipeline:** `Chat.jsx:185-248` → `genai.getPCKFeedback` → `POST /api/pck-feedback` (`server.js:367-909`) → sidebar `PCKFeedbackSidebar`. Full stage table: `llm_pipeline.md` §2.

### 1.1 One call, three jobs [CODE]
A single Gemini call returns:
- (A) a student-impact prediction (`predicted_student_state`, `student_reaction_hints`) that steers the **student agent**;
- (B) the feedback decision with up to five skill assessments and a composed Hebrew `feedback_message_hebrew`;
- (C) the derived `demonstrated_skills` / `missed_opportunities`.

So the feedback decision and the student simulation are coupled. Changing the feedback prompt changes student behaviour (e.g. "positive" → "students MUST show understanding progress", `ai.js:632-637`).

### 1.2 Decision logic in the prompt [CODE]
- **Gate 0** rejects procedural, greeting, closing and topic-opening messages.
- **Gate 1** requires a quotable mathematically incorrect claim in the *most recent* student turn, plus a teacher response to it.
- **Gate 2** assesses quality.
- **Phase 2** treats the 5 skills as a **strict prerequisite chain**: a lifecycle stage A-D picks the starting skill, a score of 0 makes all later skills irrelevant, and at most 2 skills may be relevant.
- **Continuity rules:** do not re-praise a skill already scored ≥1 on the same error (mark it *irrelevant*); score 2 if the teacher followed the previous suggestion.
- **Self-contradictory example** (`server.js:537-542`): "Mixed turn, teacher addresses only the correct student → `should_provide_feedback: false`", and then the reason ends "…so this turn should produce: `should_provide_feedback: true`".

### 1.3 What the teacher actually sees [CODE]
- One row per `skills_assessment` entry with `is_relevant:true`: a coloured dot, the Hebrew skill name, and **`evidence` if score > 0, else `what_could_be_better`**.
- **Score-1 rows hide the improvement suggestion.** In the data, 96 of 103 score-1 assessments had a non-empty `what_could_be_better` that was never shown. [DATA]
- **`feedback_message_hebrew` is never displayed.** The prompt's whole "Feedback Message Rules" section (name ≤ 2 skills, 1-3 sentences, "הוחמצה הזדמנות ל…" structure) shapes text nobody reads. It is only persisted and fed back as context.
- **Nothing in code caps the number of rows.** [DATA, v1.3.0] Among displayed feedbacks, the number of relevant skills was 1: 73 · **2: 219 · 3: 125 · 4: 58 · 5: 20**. So **41% violate the prompt's "never more than 2"**, and teachers can see up to 5 rows.
- Median displayed per-skill text is 137 characters (p90 225, max 390). That makes a 3-5-row sidebar at 22% screen width long. This is the likeliest code-level driver of the pilot complaint "long or unclear pedagogical feedback". [DATA + HYPOTHESIS]
- No numeric score is shown, only a dot colour (green 2 / yellow 1 / lilac 0) with a legend.

### 1.4 Behaviour in the data [DATA]
- **Feedback rate:** v1.3.0 shows feedback on **60%** of turns (495/821). v1.0-1.1 showed it on about 95%.
- **Score distribution** (v1.3.0, relevant skills): 2 = 851 (70%), 1 = 93 (8%), 0 = 274 (22%). Compare B200 gold for p4, where score 1 dominates (224/356), and p1, which is bimodal 0/2.
- **Skill mix** (all versions): error-identification 443, adapted-pedagogical-response 367, error-characterization 322, error-leveraging 135, diagnostic-interpretation 76.
- 18 displayed v1.3.0 feedbacks have `feedback_type: neutral`, although the prompt says neutral → no feedback. Nothing validates this.

### 1.5 Failure behaviour [CODE]
- Free-text output (no JSON mode); fence strip; `JSON.parse`; on error `throw` → 500 → no feedback, students unsteered, nothing logged.
- Missing fields are silently defaulted. A `should_provide_feedback:true` with an empty message gets the placeholder `'המורה התקדם בשיעור'` (in practice invisible, since the message is not displayed).
- No validation of score range, skill ids, the max-2 rule, or decision ↔ relevance consistency.

## 2. Final / summary feedback

**Pipeline:** `Chat.jsx:317-351` → `POST /api/pck-summary` (`server.js:912-1140`) → `PCKSummaryModal`. Stage table: `llm_pipeline.md` §3.

### 2.1 Does the summary re-evaluate independently, or reuse real-time decisions?
**By design it should reuse them. In practice it re-evaluates from scratch.**
- The prompt says: "Use the real-time feedback moments as your primary evidence — do not invent new assessments that contradict them … the skill assessments are fixed."
- But the moment selector filters on `turn.pckFeedback.should_provide_feedback` (`server.js:935`), a field that **is never written** to logged turns (`conversationLogger.js:166-173`). [CODE]
  - Confirmed in history: `git log -S should_provide_feedback -- src/services/conversationLogger.js` returns nothing.
  - Confirmed in data: all 852 logged `pckFeedback` objects lack the key.
- **So `pckMoments` is always `[]`.** Every summary prompt contains *"No significant PCK moments were identified (likely a very short conversation or test)."* and the stats line but not the feedback count.
- The model therefore re-derives assessments from the bare transcript, under an instruction ("0-2 moments → 2-3 sentences ONLY") calibrated as if the conversation were trivial. [CODE]

### 2.2 Other reasons summary and real-time feedback diverge
1. **Bug above.** The summary never sees any real-time score, evidence or suggestion. [CODE]
2. **Different evidence.** The summary sees only *logged* turns: failed or no-reply turns are missing. Neither agent sees drawings. Real-time feedback saw the history up to each turn; the summary sees the whole conversation, including later student uptake. [CODE]
3. **Different rubric framing.** Real-time uses the full rubric plus gates plus the prerequisite chain plus the max-2 rule. The summary gets one-line skill definitions and no gates. [CODE]
4. **Non-displayed decisions are lost.** Turns where real-time decided "no feedback" are not distinguishable in the log from turns never analysed (failed). Even with the bug fixed, the summary could not use negative decisions. [CODE]
5. **Sampling noise.** Temperature 0.7 on both calls, with no seed. [CODE]
6. **What the teacher saw differs from what was logged.** The teacher saw sidebar rows (score-1 = evidence only). The log has the full `skills_assessment`. A summary built from the log could cite suggestions the teacher never saw. [CODE]
7. **Regeneration paths differ.** From `ConversationLogs.jsx` the summary is saved to localStorage only. From `AdminConversationLogs.jsx` it is not saved. So the Firestore `summaryFeedback` may not match what an admin last viewed. [CODE]

## 3. Comparison with the B200 handoff

B200 evidence is mainly p1 (error-identification) and p4 (adapted-pedagogical-response). Rows on p2/p3/p5 are marked accordingly.

| topic | B200 finding / recommendation | production today | gap / risk |
|---|---|---|---|
| JSON mode | A1: enforce `response_mime_type=json` + schema (high confidence) | **Not set** for `/pck-feedback` (it *is* set for students) | exposed to B200 failure modes §1-2 (unescaped `"` in Hebrew, trailing comma) → 500 → silent no feedback |
| Parser | A2: never-throwing; `{…}` substring fallback; type checks; consistency checks; log every coercion; keep raw output + `parse_status` + `finish_reason` | throws on parse error; silent defaults; no raw output or status stored; no `finishReason` | matches the "silent normalisation" anti-pattern (§8) |
| Retry | A3: retry transport/5xx; never 4xx/context; ≤1 re-ask on parse failure; then a safe default, logged | only 429-style retries; parse failure = 500, not retried; nothing logged persistently | partially aligned (safe default = no feedback), but invisible |
| Decision invariant | `should_provide_feedback == any(relevant)` | not checked; the prompt also ties the decision to `pedagogical_quality` (neutral → false), a different rule | inconsistent decision semantics are possible |
| Relevance ≠ success | A4: a relevant but failed skill is score 0, not irrelevant | **Contradicted in places.** Continuity Rule 1 marks a skill *irrelevant* when already praised. The prerequisite chain marks later skills irrelevant after a 0. | mixes "relevant" with "due/new" |
| p1 needs an actual error; **p4 may apply to a targeted task before any error** | A4 / rules §3 [RESEARCHER, EVAL-P1/P4] | **Gate 1 requires a quotable student error for *any* feedback**, and the chain puts p4 only at "Stage D" | systematic **p4 under-detection** on pre-error targeted tasks (B200 example E) and on first responses to an error, where gold p4 is common (61.7% of turns p4-relevant vs 30.7% p1) [inference from rules; not measured on production] |
| Treating p1 and p4 as independent | boundary rule: "a turn may show either or both" | strict chain: p4 needs p1→p2→p3 first (Stage D) | production structure contradicts the B200 gold structure for p1/p4. For p2/p3/p5, B200 has no validated alternative. |
| Over-assertion / over-selection | A6: Flash-Lite claims p1 almost everywhere; prompt-only models select 2-3.5 dims per turn vs 1.63 gold; consider capping the dims shown | prompt says max 2; **41% of displayed v1.3.0 feedbacks have 3-5 relevant skills**; no code cap | consistent with B200: rule-in-prompt is not enough, cap/validate in code |
| Score inflation | Flash-Lite mean score 1.54 vs gold 1.03 | 70% of relevant scores are 2 | consistent with B200 (production data unlabeled, so this is directional only) |
| Temperature | research 0.1 | 0.7 | more variance in decisions; not evaluated |
| Feedback text template | A5: score-conditioned `מה קיים:` / `המלצה:`, short, validated in code (researcher-derived, confirm with experts) | displayed text is a single field chosen by score (`evidence` or `what_could_be_better`); score-1 drops the recommendation; composed message unused | production already approximates "what exists" vs "recommendation" but **loses the recommendation for score 1**, the case where the template wants both |
| Turn-level feedback text | gold has none (`feedback_text_overall` null) | `feedback_message_hebrew` generated but not displayed | aligned by accident; wasted tokens |
| Late-conversation p1 drift | models assert p1 more later; experts less | Continuity rules attempt something related; not measured | untested |
| Scenario guide | include only the current lesson's misconception guide | `formatScenarioContextForPrompt` includes the current scenario's context, plus a "not a script" disclaimer | aligned |
| History | do not truncate to fix accuracy; budget tokens | full history, current teacher message duplicated at the end | fine; the duplication is cosmetic |
| Model | no evidence Flash-Lite is best; evaluate 2-3 candidates offline first | Flash-Lite for everything | research task, not a code change |
| Images | (board-image notice existed in research prompts) | PCK agent never sees drawings | production gap |

**Five-skill caveat.** For p2/p3/p5, B200 provides only noisy 71-turn results and expert κ of 0.07-0.43. Production's chain logic and the "Stage B/C" assumptions for p2/p3 cannot be validated or refuted from the handoff. Expect experts to disagree with *any* model on those skills.

## 4. Summary of the most consequential feedback issues

1. **The summary never receives real-time assessments** (field-name bug). It has always been this way and it directly explains summary vs real-time inconsistency. [CODE + DATA]
2. **No JSON mode and a throwing parser on real-time feedback.** Failures are silent, unlogged, and also leave the student agent unsteered. [CODE]
3. **The "max 2 skills" rule is unenforced** (41% violations) and **the composed short message is hidden**. Together these make the displayed feedback longer and more fragmented than the prompt intends. [CODE + DATA]
4. **Score-1 rows drop the improvement suggestion.** [CODE + DATA]
5. **Prompt rules conflict with B200 semantics** (prerequisite chain, Gate 1 for p4, relevance-as-novelty). Changing them is a research decision, not a bug fix.
6. **Nothing needed to audit feedback is stored:** raw output, parse status, decision for non-displayed turns, `pedagogical_quality`, student-impact output, model/config, prompt version. [CODE]
