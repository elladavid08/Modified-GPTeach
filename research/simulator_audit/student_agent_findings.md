# Student agent findings

Legend: **[CONFIRMED-CODE]** read directly in code · **[CONFIRMED-DATA]** measured on the exported production
conversations (`research/pck_feedback/data/raw/conversations`, 133 docs, 1,257 turns, 3,163 student messages,
exported 2026-07-27; read-only aggregate script, no names printed) · **[HYPOTHESIS]** plausible, not verified.

## 1. How the student agent works today

- **One LLM call per teacher message generates every student.** It returns `{"responses":[{student,message},…]}` (`server.js:277-305`). There is no per-student agent and no per-student memory. [CONFIRMED-CODE]
- **Each turn's inputs:** the static persona text and fields for the 3 sampled students; the scenario context and misconception lifecycle text; the full history; the turn's `impact_analysis` from the PCK agent (marked as overriding everything else); and a first-turn addendum. [CONFIRMED-CODE] (`utils/ai.js:340-737`)
- **There is no explicit student state.** No variable records "Noa currently believes X", "misconception resolved at turn 7", or "Tamar has answered correctly". Student knowledge is **re-inferred from the transcript and the current PCK analysis on every call**. [CONFIRMED-CODE]
  - The only quasi-state is `predicted_student_state` inside the PCK output. It is per-turn and is never persisted.
  - `feedbackHistory` (last 3 analyses) reaches the *PCK* prompt, not the student prompt.
- **The cast changes per page load.** `AppContext` shuffles the 9 personas (`AppContext.js:44-58`) and `Chat.jsx:56` takes the first 3. Persona definitions are versioned in Firestore `studentPersonas` (`firestoreService.saveOrGetStudentPersona`). [CONFIRMED-CODE]

### What the model actually sees as history [CONFIRMED-CODE]

> **Update 2026-10-07 (1.3.8, C8 fixed):** speaker identity is now preserved; see §1.1 below. The description in this section is the audited pre-1.3.8 state.

`ChatMessage.toAIformat` → `{role, content: text, name}`. `convertMessagesToGenAI` (`server.js:180-251`) uses only `role` and `content`:

```
user : <student system prompt>\n\n<teacher msg 1>
model: <student A text>            ← no speaker name
model: <student B text>            ← no speaker name
user : <teacher msg 2>             (+ inline_data image if attached, re-sent every turn)
model: ...
```

Consequences:
1. **The model cannot tell which student said what earlier.** Student names reach the model only through its own JSON output, which is never shown back to it. Rules such as "compare each student's draft to what *that same student* said" (`ai.js:404-407`) and "What does this student currently KNOW based on their previous responses?" (`ai.js:443`) cannot be applied reliably. [CONFIRMED-CODE; effect on behaviour is HYPOTHESIS]
2. Prior model turns are bare Hebrew sentences, but the required output is JSON. Several consecutive `model` turns with no `user` in between are an unusual pattern for chat models. [CONFIRMED-CODE]
3. The CoT `thinking` field that the prompt requires is **excluded by the response schema**, so the STEP 0-4 decision procedure, including the "is this the same as my last message?" check, is never written out. The client logs a warning on every turn (`ai.js:285-287`). [CONFIRMED-CODE]

### 1.1 C8 fix: speaker identity in the model-facing history (1.3.8, 2026-10-07) [CONFIRMED-CODE]

- **Root cause (confirmed):** the client already sends each student message as `{role: "assistant", content, name: <student name>}`. The server's `convertMessagesToGenAI` dropped `name` when building Gemini `contents`, and Gemini `Content` has no speaker field (only `role` and `parts`).
- **Fix:** derived representation only, in the server conversion. Each past student reply's text is prefixed with its speaker as `"<name>: <text>"`, the same convention the PCK history (`formatConversationHistory`) and the summary transcript already use. Not changed:
  - teacher messages, images and the system prompt;
  - messages without a name (legacy);
  - the client, `ChatMessage`, stored conversations, personas, random casting and the student prompt.

Exact model-facing history for a synthetic conversation (captured from `/api/generate` with a fake model):

```
before C8                                         after C8
user : "<system prompt>\n\nמה ההגדרה של מלבן?"     user : "<system prompt>\n\nמה ההגדרה של מלבן?"
model: "מרובע עם ארבע זוויות ישרות"                model: "נועה: מרובע עם ארבע זוויות ישרות"
model: "אבל ריבוע זה לא מלבן"                     model: "תמר: אבל ריבוע זה לא מלבן"
user : "תמר, למה את חושבת כך?"                    user : "תמר, למה את חושבת כך?"
model: "כי הוא נראה אחרת"                         model: "תמר: כי הוא נראה אחרת"
```

- **What it does and does not do:**
  - It restores the information the per-student prompt rules depend on, e.g. "compare each student's draft to what *that same student* said".
  - It does **not** by itself fix repetition (§2). Consequences 2 and 3 above are still open: consecutive plain-text model turns vs JSON output, and the `thinking` vs schema conflict (C9). Repetition should be re-measured after C8 and C9 (replay, `regression_test_plan.md` §5.1).
- **Risk to watch:** the model may echo the `"name: "` prefix inside its own `message` output, which would then show in the bubble. Not observed or tested with the live model yet; check it in the replay, and if it appears, strip an echoed own-name prefix in the parser (a separate change). [HYPOTHESIS]

### 1.2 C9 investigation: reasoning requested in the output vs the response schema (2026-10-07)

> **Update: C9 fixed in 1.3.9 (2026-10-07)** with option B exactly as tested below. The production prompt is now byte-identical to the A/B candidate, the obsolete browser `thinking` logging and warning are removed, and the schema, model, temperature, token limit and native-thinking setting (off) are unchanged. Repetition still needs a sequential replay.

**The contradiction**, confirmed in the actual `/api/generate` request (20,443-character system text, captured from the real `callAI`):
- **Three places explicitly demand reasoning in the output:**
  - Format rule 5: `5. INCLUDE the "thinking" field with your analysis`.
  - Header: `🧠 DECISION PROCESS (MUST INCLUDE IN OUTPUT):`, followed by STEP 0-4: lesson phase; summarise the teacher message; analyse context; per student "Should they respond? / Why or why not? / What does this student currently KNOW…? / did the teacher answer…? / Confidence level"; then generate.
  - Three "✅ CORRECT EXAMPLES" whose JSON contains `"thinking": { teacher_message_summary, context_analysis, who_should_respond[{student, should_respond, reason, confidence}] }` next to `"responses"`.
- **The schema has no field for it.** `/api/generate` sends `responseMimeType: application/json` with `responseSchema = {responses: [{student, message}]}` (required: `responses`; items require `student`, `message`). There is no `thinking` property.
- **So the model cannot satisfy both literally.** Schema-constrained decoding cannot emit `thinking`; in the A/B below, **0 / 30 raw CURRENT outputs contained a `thinking` key**.
- No reasoning happens elsewhere either: the request sets no `thinkingConfig`. Gemini 2.5 Flash-Lite's thinking is off by default, according to Google's documentation; that is not verifiable from this repo.
- The client still expects the field: `convertResponseToMessages` logs "No 'thinking' field … Chain-of-Thought may not be working" on every turn.

**Other prompt/schema conflicts found:**
1. "At least ONE student must respond every turn" vs "Number of responses can be: 0" (B6).
2. "NEVER refer to the teacher in third person" and "Do not invent earlier teacher statements" are both violated occasionally. In the A/B, CURRENT produced "המורה אמרה…" twice and one invented teacher attribution.
3. `maxOutputTokens: 512` makes adding a reasoning field (option C) risky: reasoning text would compete with the replies for output tokens and raise truncation (`MAX_TOKENS` → parse failure → retry).

**Options:**

| | A. remove the reasoning instruction | B. "consider silently, output only `responses`" (keep the checklist) | C. add a reasoning field to the schema |
|---|---|---|---|
| natural replies | likely unchanged | unchanged in the A/B | risk: rationale-style wording may bleed into messages |
| schema reliability | contradiction removed | contradiction removed | contract consistent, but more output → more `MAX_TOKENS` / parse risk at 512 tokens |
| repetition risk | the checklist cues ("did the teacher answer? don't repeat") are lost | cues kept as silent guidance | an explicit "was this said before?" step *might* help, but unproven |
| persona / state consistency | loses STEP 3 "what does this student KNOW" guidance | guidance kept | could help, unproven |
| latency / tokens | slightly less input | about the same (A/B p50 1067 vs 1141 ms) | more output tokens, so slower; more prone to truncation |
| research / data | none | none | new generated content to log or drop; privacy and storage decisions (A16 / A17 whitelist) |

**Live A/B sanity check** (synthetic only; real Gemini via the local unmodified `server.js`; same 30 contexts and both conditions interleaved; covered all 6 scenarios, early and late turns, 3 drawing contexts, synthetic PCK guidance positive / neutral / problematic / none). CANDIDATE = option B as three exact edits: rule 5 → "Return ONLY the responses array…"; header → "think through these steps silently… do NOT include them in the output"; the 3 `thinking` blocks removed from the examples.

| metric | CURRENT | CANDIDATE |
|---|---:|---:|
| calls / failures / empty | 30 / 0 / 0 | 30 / 0 / 0 |
| attempts > 1 | 0 | 0 |
| raw output with a `thinking` key | 0 | 0 |
| server latency p50 / p90 / max (ms) | 1141 / 1326 / 2523 | 1067 / 1321 / 1653 |
| student replies (per call) | 49 (1.63) | 55 (1.83) |
| average reply length (chars) | 66.0 | 57.9 |
| exact repeats of an earlier message (any / same student / normalised) | 0 / 0 / 0 | 0 / 0 / 0 |
| intra-turn duplicates | 0 | 0 |
| reasoning / meta-language in messages | 0 | 0 |
| third-person "המורה אמרה" (invented attribution) | 2 | 0 |
| non-cast names / formatting problems | 0 / 0 | 0 / 0 |

- **Manual inspection** (12 matched contexts): both conditions are natural and persona-appropriate.
  - CANDIDATE avoided the invented teacher attributions, held a misconception consistent with "problematic" steering where CURRENT corrected it early (case 19), and referred to the drawing in one drawing context.
  - Both showed one visual-reasoner student drifting back to appearance-based reasoning (case 28).
  - With n = 30 single-turn contexts this is a sanity check only, not an evaluation.

**Relation to repetition:**
- *Plausible but not demonstrated.* The output-check steps were never written out. With Flash-Lite they act at most as conditioning text, which weakens the "don't repeat" self-check.
- Neither condition produced any repetition here. These were fixed single-turn contexts, and the pilot repetition appeared in long sequential conversations, mostly after empty or short teacher input (§2).
- Re-measure repetition with a sequential replay after the C9 fix.

**Recommendation:** option B, as the three edits tested above. It is the smallest change that makes the prompt coherent with the schema and keeps the existing checklist guidance. Do **not** add a reasoning field (option C) without demonstrated need. When implementing, also remove the client's per-turn "No 'thinking' field" warning (log-only), and decide the B6 "at least one student" vs "0 responses" conflict separately.

## 2. Student response repetition (pilot issue)

### 2.1 What the data shows [CONFIRMED-DATA]

| measure | value |
|---|---|
| Student messages that exactly equal an earlier message in the same conversation | **171 / 3,163 (5.4%)** |
| … by the same student | 132; by a different student: 39 |
| Turn gap to the earlier copy | 1 turn: 105 · 2: 27 · 3-5: 19 · 6+: 11 · same turn: 9 |
| Turns where at least one student repeats their previous-turn message verbatim | 59 |
| … where **every** student in the turn repeats their previous-turn message verbatim ("full replay") | **25** |
| Length of repeated messages | 75 of 108 are > 60 characters (14 are > 120). These are not just "כן." |
| Position in conversation (turn/n_turns) | median **0.82**, upper quartile 1.0. Repeats concentrate late, often in the last turn. |
| Occurrences of the parse-fallback string `"אני צריך רגע לחשוב על זה..."` | **0** |
| Teacher message identical to the previous turn's | 3 / 59 |
| Time between the two logged turns (repeat cases) | median 61 s, minimum 6.5 s |
| Repeat rate by version (same-student, gap-1) | 1.1.0: 16/564 · 1.2.0: 7/307 · **1.3.0: 85/2,131**. The 1.3.0 "NO-DUPLICATE RULE" did not reduce it. |

**Repeat rate by the length of the *current* teacher message** (share of consecutive-turn pairs with ≥1 same-student verbatim repeat):

| teacher message | pairs | with repeat | rate |
|---|---:|---:|---:|
| empty (`""`) | 23 | 9 | **39%** |
| ≤ 20 chars | 124 | 16 | **13%** |
| 21-60 chars | 299 | 8 | 2.7% |
| > 60 chars | 680 | 26 | 3.8% |

Examples (truncated): the teacher says "יפה. תודה לכם." / "יפה מאד. סיימנו." / "נכון מאוד" and the students replay their previous 85-145-character answers word for word.

### 2.2 Candidate explanations, evaluated

| candidate | verdict | evidence |
|---|---|---|
| **Parse failure → fallback text** | **Not the cause of the observed repeats.** | The fallback string never appears. The repeats are long, varied, correctly attributed JSON outputs. The fallback *would* produce identical text if it fired, so it remains a latent risk (`ai.js:325-336`). [CONFIRMED-CODE + DATA] |
| **Reuse of the previous valid response in code** | **Ruled out.** | No code path stores and replays a prior response. `onResponse` always receives freshly parsed messages; the logger receives the same `aiMessages`. [CONFIRMED-CODE] |
| **Retries** | **Ruled out for content.** | Retries re-call the model and never substitute cached text. A retried request uses identical inputs, but its output replaces nothing. [CONFIRMED-CODE] |
| **Failed state update / stale React closure** | **Unlikely as primary cause.** | The effect's `history` comes from the render where `isQuerying` became true, which already contains the latest students and teacher (React 18 batching via `createRoot`). The model *must* have seen the earlier text to copy it verbatim; independent re-sampling at T=0.7 rarely reproduces 100+ characters exactly. [CONFIRMED-CODE; reasoning] |
| **Overlapping requests (input re-enabled during generation)** | **Real defect; minor contributor at most.** | `Chat.jsx:176` sets `isQuerying=false` *before* the PCK and student calls run, so the textarea, send button and board toggle are re-enabled and the typing indicator vanishes during the whole (often multi-second) cycle. A second send starts a parallel cycle whose context lacks the first cycle's student replies. That produces near-duplicates, out-of-order bubbles, racing sidebar feedback and possibly out-of-order `turnNumber`s. The median 61 s between repeat turns argues against this as the main mechanism. [CONFIRMED-CODE; contribution HYPOTHESIS] |
| **Uninformative teacher input (empty / very short)** | **Strongest measured correlate.** | Repeat rate is 39% after empty and 13% after ≤20-character messages, against about 3% otherwise. Empty sends are possible because `InputField.handleSubmit` has no empty check. 13 turns in the data have neither text nor image, and 11 more have only an image (the student model then gets an image with no text part). The PCK step marks such turns neutral/"same", and the student prompt then says students should "stay similar". [CONFIRMED-DATA + CODE] |
| **History format (no speaker names, plain-text model turns, no CoT)** | **Likely enabling factor.** | The model cannot run the per-student no-duplicate check it is asked to do (see §1). A degenerate "continue the pattern" copy is a known LLM failure mode when the newest input adds little. [CONFIRMED-CODE; causal link HYPOTHESIS] |
| **Late-conversation / context length** | **Possible contributor.** | Repeats cluster late (median 0.82). Late turns are also where closings and short acknowledgements happen ("יפה. סיימנו!"), so position and short input are confounded. The full prompt grows every turn and is never truncated. Not separable with current data. [HYPOTHESIS] |
| **Malformed model output** | **Not observed in persisted data.** | Malformed 200-responses would show as the fallback string (0). Truncated or blocked responses that cause a 500 are **not persisted at all**, so their frequency is unknown. [CONFIRMED-CODE: blind spot] |
| **Frontend rendering** | **Ruled out for persisted repeats.** | The repeats are in Firestore, which is written from the parsed `aiMessages`, not from the DOM. `ChatBubble` uses index keys, which is harmless for append-only lists. [CONFIRMED-CODE] |

**Bottom line:** the observed exact repetitions are model-generated copies of the model's own prior outputs. They are concentrated after empty or very short teacher messages and late in conversations. Code-level enablers:
- empty sends are allowed;
- the history strips speaker names;
- the CoT is suppressed by the schema;
- there is no post-generation duplicate check;
- temperature 0.7 with no anti-copy guard.

They are **not** produced by parse failure, by retry/fallback logic, or by reuse of stale state. One caveat: the raw outputs are not stored, so I cannot rule out that a handful of repeats stem from unlogged failed turns. For example, a failed student call leaves `[…, S_prev, T_failed]`, and the teacher's follow-up then gets a copy of `S_prev`. [HYPOTHESIS]

### 2.3 Comparison with B200 parsing failure modes

| B200 mode (`failure_modes.md`) | student pipeline exposure |
|---|---|
| §1 unescaped `"` in Hebrew, §2 trailing comma | Low: Vertex `responseSchema` constrained decoding is on. |
| §3 degenerate repetition loop to max tokens | **Exposed.** `maxOutputTokens:512`, no `finishReason` check. A loop yields invalid JSON, which yields the fallback string. Not observed in data. |
| §4 output stops early | Exposed via `stopSequences:["Teacher:"]` on JSON output. Low probability. The result would be the fallback string. |
| §5 field emitted as object | Prevented by the schema. |
| §8 silent normalisation | The parser silently drops invalid entries. Unknown or duplicate student names are accepted. |
| no raw output kept | **Same gap as B200 recommended fixing.** Raw output is console-only. |

### 2.4 After C8 + C9: replay, 2×2 experiment, and the 1.3.10 prompt rule (2026-10-07)

- **Sequential replay** (`student_stability_replay.md`): repetition persists after C8 + C9. There were 10/280 exact self-repeats, all after short teacher messages (0/174 after longer ones), concentrated late in the conversation and at closings.
- **2×2 live experiment on short-message contexts** (`short_message_repetition_experiment.md`):
  - Closing repeats were driven by the PCK block, which "OVERRIDES ALL OTHER INSTRUCTIONS" and outranks the existing LESSON CLOSURE rule. Exact repeats on closings were A 10/43, B (no PCK) 0/40, C (prompt rule) 0/42.
  - Removing only the "MUST show confusion" line did not remove them.
  - The rule kept confused students confused, in new words, and did not turn content questions into social replies.
- **Fixed in 1.3.10 (Condition C, adopted verbatim).** One bullet was added to the student prompt at the end of the NO-DUPLICATE RULE, before `📍 LESSON PHASE DETECTION` (`ai.js` `makeProsePrompt`):

  > When the teacher's latest message is primarily an acknowledgement, praise, thanks, or closing rather than a new content question, respond naturally to that conversational move. Do not restate an earlier answer verbatim. If the student is still confused, preserve that underlying state without forcing the same misconception or wording to be repeated.

  - With and without PCK guidance, the production prompt differs from 1.3.9 only by this line. It is byte-identical to the live-tested condition C prompt.
  - **Unchanged:** the PCK guidance block and the persona/PCK steering section (both pinned by fingerprint tests), personas, model, temperature, schema, C8 and C9.
  - **Not added:** a duplicate check, a re-ask, explicit student state, any special handling of `?` or other messages in code, or native thinking.
  - The rule is prompt guidance only. The application does not classify teacher messages.
- **Still open:**
  - repeats after a bare `?` in synthetic contexts (§2.5);
  - semantic loops, regression of resolved misconceptions and cross-student contamination (§3; `student_stability_replay.md` §4);
  - B6.

  The effect of 1.3.10 on full conversations should be confirmed with a sequential replay.

### 2.5 Pilot check: bare `?` and punctuation-only teacher messages (2026-10-07) [CONFIRMED-DATA]

**Why:** in the synthetic experiment, a bare `?` was the trigger that repeated under every condition. This check asks whether that happens in real pilot use.

**Method:** a read-only aggregate script over the same export as §2.1 (133 conversations, 1,257 turns). It printed only counts and the short teacher strings, with no identifiers or transcripts.
- Teacher text is trimmed.
- Punctuation-only means at least one non-space character, and every character is ASCII punctuation, Unicode punctuation, or Hebrew/typographic punctuation (`׳ ״ ־ ׃ … – — “ ” « » ¿ ¡`). Whitespace-only messages are not counted.
- "Exact repeat" uses the §2.1 definition. The recount gives 162 messages, plus 9 same-turn duplicates = 171, which matches §2.1.

| teacher message (trimmed) | turns |
|---|---:|
| exactly `?` | **0** |
| punctuation-only (`?`, `??`, `...`, `?!` …) | **0** |
| 1–3 characters | 11 (`כן` ×5, `היי` ×3, `יפה` ×2, `הנה` ×1), none of them punctuation |
| 1–20 characters | 195 |
| empty / whitespace-only (no text; includes image-only) | 24 |

| turn after a teacher message that is … | turns | student messages | exact-repeat messages | turns with a gap-1 same-student repeat | full-replay turns |
|---|---:|---:|---:|---:|---:|
| bare `?` | 0 | 0 | 0 | 0 | 0 |
| other punctuation-only | 0 | 0 | 0 | 0 | 0 |
| empty / whitespace-only | 24 | 69 | 19 | 9 | 3 |
| 1–20 characters | 195 | 498 | 48 | 16 | 7 |
| longer | 1,038 | 2,596 | 95 | 34 | 16 |

The full-replay recount here is 26, against 25 in §2.1. The difference comes from ordering turns by `turnNumber`.

**Conclusion:** no pilot repeat followed a bare `?` or any punctuation-only message, because pilot teachers never sent one. The `?` repetition is a **synthetic edge case** from the replay scripts, not an observed pilot failure mode. The pilot's real short-input triggers were:
- empty or image-only sends, now blocked or handled by C4/B22;
- short worded messages such as acknowledgements, praise and closings, which the 1.3.10 rule targets.

No special `?` handling is planned on this evidence.

## 3. Student consistency

### 3.1 Misconception re-emerging after apparent resolution
- **Nothing prevents it.** [CONFIRMED-CODE]
  - There is no "resolved" flag.
  - The misconception lifecycle (`ai.js:547-561`) says "DO NOT keep repeating the same misconception after teacher addressed it properly", but `RESPONSE_INSTRUCTIONS` says "Students should frequently make realistic mistakes" (`constants.js`), and the persona descriptions encode stable misconception tendencies.
  - Whether a misconception is "resolved" is re-decided every turn from the unnamed transcript and the *current* PCK verdict alone.
- **[HYPOTHESIS]** One positive PCK verdict ("MUST show understanding progress") followed by a neutral one ("modest progress or stay similar") lets persona and scenario text pull the student back to the misconception. The model cannot see that *this* student already conceded, because names are absent (§1).

### 3.2 A correct answer too early
- **The PCK verdict forces understanding.** Alignment rules (`ai.js:631-660`) mandate that if `pedagogical_quality = 'positive'`, students MUST show understanding progress, and that `improved` → MUST show improvement. [CONFIRMED-CODE]
- B200 found Gemini Flash-Lite over-asserts positive/relevant skills. Production's PCK prompt itself requires `understanding_level` to be "improved" after any formal-definition move (`server.js:771-774`).
- So a single good teacher move can be converted into immediate full understanding. Nothing models gradual or partial uptake beyond the `reaction_type` hints. [CONFIRMED-CODE; frequency unmeasured]
- Separately, the opening of a teacher-initiated lesson tells students to show "initial thoughts or confusion" (`Chat.jsx:171`), but nothing forbids the correct claim. Prompt guidance only.

### 3.3 Multiple students with different difficulties
- **All students come from one sample in one context**, so they share the model's view of the conversation. Differentiation relies entirely on the persona text and fields embedded in the system prompt. [CONFIRMED-CODE]
- **Hard-coded names in the prompt** (`ai.js:672-676`) assign participation tiers to all 9 personas regardless of who is present. One is inconsistent with the personas file: יונתן is listed as "high" but has `baseline:"medium"`. [CONFIRMED-CODE]
- **Every few-shot example references `students[0..2]`** (`ai.js:483-506`). The prompt therefore **requires at least 3 students** (`Constants.NUM_STUDENTS = 3`), and lowering it would crash. [CONFIRMED-CODE]
- **Intra-turn duplicates:** two students said exactly the same sentence in the same turn in 10 turns. 39 cross-student copies of earlier messages exist. Both are consistent with no name attribution in history. [CONFIRMED-DATA]
- **Different difficulties at once:** there is no mechanism other than the prompt. `student_reaction_hints` come from the PCK agent per student name, which is the only per-student signal. That agent *does* see names, since `formatConversationHistory` prints them. [CONFIRMED-CODE]

### 3.4 Is the behaviour "mostly regenerated from prompt + history each turn"?
**Yes, entirely.** The only inputs that differ from turn to turn are the transcript (without names), any images, and the current turn's PCK `impact_analysis`. [CONFIRMED-CODE]

## 4. Other student-pipeline defects worth knowing

1. **Input re-enabled during generation** (`Chat.jsx:176`). See §2.2. Users get no "students are typing" signal and can double-send. [CONFIRMED-CODE]
2. **Failures are invisible and unlogged.** A student-call error or empty reply leaves the teacher's bubble unanswered with no message. That teacher message and its PCK feedback never reach the log, because `addTurn` runs only on non-empty replies. Research data therefore under-counts failed turns and has gaps in teacher messages. [CONFIRMED-CODE]
3. **Newlines are destroyed** (`ChatMessage.js:9`) for both teacher and student text. They are joined without even a space, so "line one\nline two" becomes "line oneline two" in the UI, in the prompt and in Firestore. [CONFIRMED-CODE]
4. **Student names are passed through `toTitleCase`** and not validated against the cast. A hallucinated name would render as a new speaker. [CONFIRMED-CODE]
5. **`StudyScenario.jsx` / `ChatWithCode.jsx` call `callAI` with the old signature** and are broken or legacy. [CONFIRMED-CODE]
