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
