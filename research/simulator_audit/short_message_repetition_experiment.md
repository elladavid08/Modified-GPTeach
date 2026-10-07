# Short-message repetition: 2×2 live-model experiment

Status: evaluation only, run on 2026-10-07 against `SYSTEM_VERSION 1.3.9` (C8 + C9 in place). No production code was changed by the experiment.

> **Update (2026-10-07):**
> - Condition C was adopted verbatim in **1.3.10**, with PCK steering unchanged (`regression_test_plan.md` §0.21, invariant B25).
> - A read-only check of the pilot export found **0** bare-`?` and **0** punctuation-only teacher messages in 1,257 turns (`student_agent_findings.md` §2.5). The `?` trigger in §6 is therefore a synthetic edge case, and no `?` handling is planned. Follow-up to `student_stability_replay.md`, which found that every exact student repeat came after a short teacher message.

**Question:** after short teacher messages, are exact student repeats driven mainly by:
- (1) **PCK steering** (`confused` / `more_confused` leading to "MUST show confusion"), or
- (2) the student prompt lacking a rule for **conversational moves** (praise, acknowledgement, thanks, closing)?

## 1. Method

### 1.1 Path and data

- **Model and server:** real Gemini (`gemini-2.5-flash-lite`) through the local, unmodified `server/server.js`.
- **Client path:** the real `callAI`, `makeProsePrompt`, `/api/generate` and parser.
- **Settings:** production temperature (0.7), output schema, token limit and retry policy.
- **Data:** synthetic only, with no participant data and no Firestore writes.

### 1.2 How the variants were applied

The variants were applied **only in the benchmark**: a wrapper around `fetch` rewrites the system message of the outgoing `/api/generate` request. I checked the rewritten prompts with a diff against condition A:
- **C** adds exactly 1 line.
- **E** removes exactly 1 line.
- **B** removes the 60-line PCK block.
- **D** = B + the C line.

### 1.3 Contexts

There are 20 short-message contexts, rebuilt from the saved replay transcripts. Each one has the full history up to the target teacher turn, with the C8 `"<name>: "` labels, the same 3-student cast, the same scenario, and drawings re-attached where the replay had them.

| group | contexts | teacher message | reps per condition |
|---|---|---|---|
| the 5 exact-repeat events from the replay | E1 (1a T12), E2 (3a T6), E3 (3b T9), E4 (4a T9), E5 (4b T12) | `יפה מאוד, כל הכבוד.` / `נכון` / `?` / `אוקיי` / `יפה, תודה.` | 4 |
| praise (mid-lesson) | P1–P3 | `יפה` | 2 |
| acknowledgement | K1–K4 | `אוקיי` / `נכון` | 2 |
| thanks / closing | C1–C4 | `יפה מאוד, כל הכבוד.` ×2, `יפה, תודה לכם.`, `יפה מאוד.` | 2 |
| very short content follow-up | Q1–Q4 | `עדי, מה דעתך?`, `?`, and two new synthetic teacher texts on replay histories: `למה?`, `אז מה זה כן?` | 2 |

For the per-type tables, `?` is grouped as a content follow-up. E1 and E5 count as closings, and E2 and E4 as acknowledgements.

### 1.4 PCK guidance, frozen per context

The replay saved only the PCK quality and level, not the full analysis. So I generated **one** real PCK analysis per context (with a minimal feedback history built from the saved quality and level) and reused it in every PCK-on condition. For replay contexts I retried up to 3 times to get the replay's `understanding_level`.

- **17 of 20 contexts matched the replay.**
- **3 did not:**
  - E1 got `improved` (the replay had `more_confused`);
  - P1 got `misconception_reinforced` (the replay had `confused`);
  - K3 got `same` (the replay had `confused`).
- **Closing coverage is not lost.** C1 and C2 use the same text as E1 (`יפה מאוד, כל הכבוד.`) with `more_confused`.

### 1.5 Calls

There were 50 student calls per condition, interleaved by context and repetition, with the condition order rotating per repetition.

## 2. Conditions

| | PCK guidance | prompt rule | what changes vs A |
|---|---|---|---|
| **A — CURRENT** | frozen original | none | nothing |
| **B — PCK-neutralized** | none (`impact_analysis = null`, the state production already uses on B2 fallback / image-only turns) | none | the whole PCK block is removed (`ai.js:538-635`) |
| **C — Prompt rule only** | frozen original | added | one bullet at the end of the NO-DUPLICATE RULE section (text below) |
| **D — Both** | none | added | B + C |
| **E — exploratory** (not part of the 2×2) | frozen original | none | only `- If understanding_level = 'more_confused' → MUST show confusion` (`ai.js:631`) is removed |

Rule text used in C and D, inserted as `\n- <rule>` directly before `📍 LESSON PHASE DETECTION`:

> When the teacher's latest message is primarily an acknowledgement, praise, thanks, or closing rather than a new content question, respond naturally to that conversational move. Do not restate an earlier answer verbatim. If the student is still confused, preserve that underlying state without forcing the same misconception or wording to be repeated.

Arm E was added to answer review question 4: is the problem specifically the "MUST show confusion" wording?

## 3. Aggregate results

| | A current | B no PCK | C rule | D both | E no "MUST" line |
|---|---:|---:|---:|---:|---:|
| calls | 50 | 50 | 50 | 50 | 50 |
| student responses | 110 | 106 | 110 | 109 | 113 |
| **exact self-repeats** | **17 (15.5%)** | 10 (9.4%) | **6 (5.5%)** | 10 (9.2%) | 10 (8.8%) |
| any-student exact repeats | 17 | 10 | 6 | 10 | 12 |
| turns where every responder repeats | 7 | 4 | 2 | 5 | 4 |
| near-repeats (`difflib` ≥ 0.8, same student) | 19 | 13 | 7 | 11 | 12 |
| brief thanks/goodbye replies (≤ 60 characters) | 12 | 31 | 23 | 31 | 18 |
| calls with 0 replies | 1 | 2 | 0 | 1 | 0 |
| invalid names / empty messages | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| errors / retries / non-STOP finishes | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| latency p50 / p90 / max (ms) | 1255 / 1563 / 1710 | 1185 / 1424 / 1567 | 1321 / 1511 / 1544 | 1225 / 1528 / 1766 | 1326 / 1474 / 3217 |

**Teacher attributions:**
- The regex flagged 1–4 replies per condition. On manual reading, most refer to something the teacher really said, including "אמרת 'יפה'".
- Third-person "המורה אמר/ה" appears in every condition.
- Clearly invented references: D C3 (a question turned into a claim) and D Q3 (נועה claims she drew the shape).
- No condition-specific pattern.

**Cut-off messages:** two messages end mid-sentence with `STOP` (A Q4 "…מה זה אומר ש", E E4). This looks like ordinary model behaviour and is unrelated to the conditions.

## 4. Results by short-message type

### 4.1 Exact self-repeats / responses (turns where every responder repeats)

| type | A | B | C | D | E |
|---|---|---|---|---|---|
| **thanks / closing** (6 contexts, 16 calls) | **10/43 (4)** | 0/40 (0) | **0/42 (0)** | 2/43 (1) | 3/47 (1) |
| acknowledgement (6 contexts, 16 calls) | 1/31 (0) | 2/34 (0) | 2/32 (0) | 0/34 (0) | 0/31 (0) |
| praise (3 contexts, 6 calls) | 0/13 | 0/10 | 0/14 | 0/12 | 0/13 |
| **short content follow-up** (5 contexts, 12 calls) | **6/23 (3)** | **8/22 (4)** | 4/22 (2) | **8/20 (4)** | 7/22 (3) |

**Closing calls with at least one exact repeat:** A 4/16, B 0/16, C 0/16, D 1/16, E 1/16.

**Brief thanks/goodbye replies on closings:** A 12, B 30, C 23, D 29, E 18.

### 4.2 By frozen PCK level

| PCK level | A | B | C | D | E |
|---|---|---|---|---|---|
| `more_confused` (10 contexts) | 12/58 | 10/54 | **4/54** | 8/52 | 10/58 |
| `confused` (5 contexts) | 4/19 | 0/24 | 0/20 | 2/23 | 0/23 |
| other (5 contexts) | 1/33 | 0/28 | 2/36 | 0/34 | 0/32 |

In B and D the level is the one that was frozen for the context, not one shown to the model.

### 4.3 Per context

Only contexts with at least one repeat are listed. All others had 0 repeats in every condition.

| context | type, PCK level | A | B | C | D | E |
|---|---|---|---|---|---|---|
| C1 1b T12 `יפה מאוד, כל הכבוד.` | closing, more_confused | 2/5 | 0/6 | 0/4 | 2/5 | 0/6 |
| C3 2a T12 `יפה, תודה לכם.` | closing, more_confused | 3/6 | 0/6 | 0/6 | 0/6 | 0/6 |
| C4 3b T12 `יפה מאוד.` | closing, more_confused | **5/5** | 0/4 | 0/4 | 0/2 | 3/5 |
| E3 3b T9 `?` | content, more_confused | 2/8 | **8/8** | 4/8 | 6/7 | 7/8 |
| Q2 1a T9 `?` | content, confused | **4/4** | 0/4 | 0/4 | 2/4 | 0/4 |
| K2 5a T6 `נכון` | ack, more_confused | 0/6 | 2/6 | 0/6 | 0/5 | 0/6 |
| K3 6b T9 `אוקיי` | ack, same | 1/5 | 0/6 | 2/6 | 0/6 | 0/5 |

**Most replay events did not reproduce.** E1, E2, E4 and E5 had 0 repeats in all conditions; only E3 (`?`) reproduced. The replay's acknowledgement and closing events look like a context-sensitive but stochastic failure, not a deterministic one.

## 5. Matched examples

### C4: closing `יפה מאוד.` with PCK `more_confused`

- **A (current):** both reps are full replays of T6/T9 messages. Rep 0:
  - "אז אם כל הזוויות ישרות, זה מלבן, בלי קשר לצורה שלו?" (הילה)
  - "אבל מה ההבדל אז בין מלבן לריבוע? בשניהם יש 4 זוויות ישרות." (רועי)
  - יובל's T9 line.
- **B (no PCK):** new content, no copies. For example: "אז גם אם מלבן נראה כמו זה שעל הלוח, הוא עדיין מלבן אם כל הזוויות שלו ישרות?"
- **C (rule):** no copies. The doubts are kept but phrased anew. For example, רועי: "אז אם זה נראה כמו מלבן אבל הזוויות לא בדיוק ישרות, זה לא מלבן?"
- **E (no "MUST" line):** rep 0 is the same 3-message full replay as in A.

### C1: closing `יפה מאוד, כל הכבוד.` with PCK `more_confused`

- **A, rep 1:** a full replay. Both תמר's 190-character message and עדי's "אממ... אני עדיין קצת מבולבלת…" are copied verbatim.
- **C, rep 1:** "איזה כיף! הבנתי את זה סוף סוף!" (תמר) and "אז... זה אומר שריבוע זה מלבן מיוחד? אני עדיין לא בטוחה." (עדי). This is a natural reaction, and עדי is **still unsure**, so the state is preserved.
- **D, rep 0:** the same full replay as in A, even though PCK is removed and the rule is present.

### C3: closing `יפה, תודה לכם.` with PCK `more_confused`

- **A, rep 0:** all three students replay their T9 messages.
- **A, rep 1, and every rep of B, C, D and E:** "תודה רבה!", "תודה!", "בכיף."

### C2: closing with PCK `more_confused`, where the rule keeps the state

- **C, rep 0:** "תודה! אבל אני עדיין לא בטוחה שהבנתי לגמרי מה זה אומר 'חוצים זה את זה'…" (הילה). She thanks the teacher and keeps her specific confusion, in new wording.

### E1: closing praise with PCK `improved`

- **A, C, E:** all three students give long "אה עכשיו הבנתי! כל ריבוע הוא מלבן…" summaries. These are paraphrases, not copies, but they are not a closing either.
- **B, D:** "תודה רבה!" ×3.

With any PCK block present, the closing is treated as a content turn.

### E3: `?` with PCK `more_confused` (the strongest remaining trigger)

The same two messages (הילה "אני אבדוק אם יש לה ארבע זוויות ישרות…", רועי "זה נראה כמו מלבן, אבל הוא מסובב…") are replayed word for word:
- B 4/4 reps;
- D 3/4;
- E 3/4;
- C 2/4;
- A 1/4.

When C does not replay, it rephrases. For example, רועי: "אני עדיין לא מבין איך לבדוק את הזוויות כשהיא ככה מסובבת."

### Q2: `?` with PCK `confused`

- **A:** full replay in 2/2 reps.
- **B, C, E:** 0/2.
- **D:** 1/2.

### Content follow-ups stay substantive under the rule (Q1, Q3, Q4)

- **Q3 `למה?`, C:** "אם הדלתון הזה הוא לא מעוין, אז מה ההגדרה המלאה למעוין?" (מעיין) and "אבל אם זה נראה ככה וגם האלכסונים מאונכים, זה חייב להיות מעוין." (דנה, misconception kept).
- **Q4 and Q1:** answered substantively in every condition. None was treated as a social closing.

### Acknowledgement and praise under the rule (E4, K2, P1)

Confusion and misconceptions persist. For example:
- C/E4: "אני עדיין לא מבינה לגבי מלבן…";
- C/K2: "רועי: …אני עדיין חושב שזה כן.";
- C/P1: "רועי: אבל אמרת שזה יפה. אז זה אומר שזה נכון?"

A crude marker count on acknowledgement turns: understanding phrases ("הבנתי", "ברור לי", "הגיוני") A 5, C 3; confusion phrases ("לא מבין/ה", "לא בטוח/ה", "מבולבל/ת") A 4, C 6. There is no sign that the rule makes students more agreeable or "fixed".

## 6. Interpretation

Each review question is answered below. Samples are small: 16 closing calls per condition, with the repeats clustered in a few contexts. Nothing here is statistically established; the directions are consistent but noisy.

1. **Does neutralizing PCK reduce repetition?**
   - **On closings, yes:** 10/43 → 0/40, and brief goodbyes rose from 12 to 30.
   - **On `?`, no:** content follow-ups went from 6/23 to 8/22, and E3 replayed in 4/4 reps without PCK.
   - So PCK steering drives the closing replays, but it is not the only trigger.
2. **Does the prompt rule reduce repetition and keep the state?**
   - **Yes on closings:** 0/42, the same as removing PCK, while keeping PCK steering.
   - **Lowest overall:** 6/110 against 17/110 for A.
   - **State is kept:** confused students stay confused in new words (C1 עדי, C2 הילה, E4, K2).
   - **On `?` it only partly helps:** 4/22, with E3 still replaying in 2/4 reps.
3. **Does the rule make students too agreeable?** Not observed. On acknowledgement and praise turns, confusion markers are as frequent as or more frequent than under A, and misconceptions persist (Q3 דנה, K2 רועי).
4. **Is the problem specifically "MUST show confusion"?** **No.** Removing only that line (E) cut closing repeats from 10 to 3, but C4 still had a full 3-student replay, and E1 under PCK `improved` still turned the closing into content. The problem is the PCK block as a whole:
   - it is declared to "OVERRIDE ALL OTHER INSTRUCTIONS";
   - it includes "problematic → Students should show confusion or persist in misconception";
   - it includes per-student `persistent_confusion` hints.

   Together these outrank the prompt's existing **LESSON CLOSURE** rule, which already says not to repeat lesson content at closings. The new rule seems to work because it states, in the same section as the no-duplicate rule, that the conversational move takes priority and how to keep the confused state without copying.
5. **Are closings handled naturally?**
   - Without PCK (B, D), almost always a brief thanks.
   - With the rule (C), mostly a thanks or a short in-character reaction. Sometimes a still-confused student adds a new short doubt, which is realistic.
   - Under PCK `improved` (E1), C still produces "הבנתי" summaries instead of goodbyes. These are paraphrases, not copies, but less natural.
6. **Are short content questions still answered substantively?** Yes. Q1, Q3 and Q4 were substantive in every condition, including C and D. Neither the rule nor PCK removal turned content questions into social replies.

**Two distinct short-message triggers remain:**
- **Closings and conversational moves with PCK `confused`/`more_confused` (or `improved`).** Driven by PCK steering overriding the closure rule; fixed in this sample by the prompt rule.
- **A bare `?`.** Repeats under every condition and is worst without PCK. The model reads `?` as "say that again". The tested rule does not target it, because `?` is not praise, thanks or closing.

## 7. Recommended minimal fix (not implemented)

**Where:** the **student prompt** (`makeProsePrompt`), using the rule exactly as tested in C. Not the PCK-to-student wording:
- softening the single "MUST show confusion" line (E) did not remove closing replays;
- removing PCK guidance would discard the state steering that the rule preserves.

Adding PCK removal on top of the rule (D) gave no extra benefit in this sample (closings 2/43 vs 0/42).

**Exact production change:** one line in `src/utils/ai.js`, directly after the NO-DUPLICATE RULE's "IMPORTANT: At least ONE student must respond…" line (`ai.js:396`) and before `📍 LESSON PHASE DETECTION`:

```js
retStr += `\n- When the teacher's latest message is primarily an acknowledgement, praise, thanks, or closing rather than a new content question, respond naturally to that conversational move. Do not restate an earlier answer verbatim. If the student is still confused, preserve that underlying state without forcing the same misconception or wording to be repeated.`;
```

This is a prompt change. Under the project rules it needs a `SYSTEM_VERSION` bump, a changelog entry, and a test that pins the line.

**Not addressed by this fix:** the bare `?` trigger.
- **Candidate (untested):** extend the same bullet with "If the teacher's message is only '?', treat it as a request to explain differently or say more, not to repeat."
- **Alternative:** the deterministic same-student duplicate check with one re-ask, which catches verbatim copies regardless of trigger.
- Both should be tested the same way (E3 and Q2 are ready-made test contexts) before choosing. Duplicate detection and explicit student state were out of scope here.

## 8. Limitations

- **Small, clustered sample.**
  - 50 calls per condition; closing repeats come from 3 contexts (C1, C3, C4) and `?` repeats from 2 (E3, Q2).
  - The 0 vs 10 closing contrast is 0/16 vs 4/16 at call level. That is not significant on its own, though the direction matches every closing context with PCK `more_confused`.
- **Frozen, regenerated PCK.** Each context uses one fresh PCK analysis, not the one from the replay, and its feedback history is minimal (quality and level only, no feedback text). Three contexts did not match the replay level, notably E1 (`improved` instead of `more_confused`). Different PCK outputs may steer differently.
- **Replay events mostly did not reproduce.** 4 of 5 had no repeat even under A, so the original events were partly chance at temperature 0.7.
- **Single synthetic history per context and a scripted teacher.** Results may differ for real teachers' wording, such as `יפה. סיימנו!`, empty sends (not tested) and long sessions.
- **One placement of the rule.** It was tested in one place (end of the NO-DUPLICATE section). Other placements, or adding it inside the PCK block, were not tested.
- **Automated metrics are heuristics.** "Brief thanks/goodbye" means a thanks or goodbye word in ≤ 60 characters, and the agreeableness markers are keyword counts. The manual review covered all closing and content contexts, plus samples of acknowledgement and praise.
- **Not a full-conversation measurement.** Effects on full conversations (later turns, PCK feedback quality) need a sequential replay like `student_stability_replay.md` after any change.

Scripts and raw outputs (`shortmsg.bench.js`, `analyze.py`, `frozen_pck.json`, `shortmsg_results.json`, `contexts.json`, `prompt_samples.json`) are in the session scratchpad and are not part of the repo.
