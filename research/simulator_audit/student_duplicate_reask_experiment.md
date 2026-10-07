# Same-student duplicate re-ask: live validation (no implementation)

Status: live-model behavioural test, 2026-10-07, against the committed 1.3.10 tree. No production code was changed, `SYSTEM_VERSION` is unchanged, and nothing was committed.

It validates the re-ask proposed in `student_duplicate_guard_study.md`, using the approved criterion:
- same student, same conversation;
- normalized equality or edit similarity ≥ 0.90;
- replies ≥ 30 characters.

## Summary

| question | answer |
|---|---|
| 1. Resolved after one re-ask | **36 / 38 triggered calls (95%)**; **73 / 77 flagged replies (95%)** no longer trigger (72 rewritten, 1 student silent) |
| 2. Still duplicate after attempt 2 | **3 / 77 replies (4%)**, in **2 / 38 calls** |
| 3. Pedagogical state kept | Yes: 69 / 73 preserved. 0 "fixed" misconceptions (too correct), 1 mildly more confused, 3 regressions. Two of the regressions only restate a regression already present in the copied line; one is new and mild. |
| 4. New failure modes | None serious: no meta leakage, no invented teacher statements, no new duplicates by other students, no parse errors or retries, replies not longer. Two limits remain (§5): 44% of fresh replies are minimal rewordings, and closings under PCK `improved` stay content-heavy. |
| 5. One re-ask enough | **Yes, for verbatim copying.** It does not address semantic repetition. |
| 6. Fallback | **Keep it.** Both branches occurred: drop-one (1×) and the zero-reply exception (1×). |
| Re-ask wording | **Ready for production as tested,** including the plural form (§2.3). No alternative wording was needed. |
| Criterion | **Implement unchanged.** 77 / 77 triggers were genuine copies; the expected misses below 0.90 were seen (5 replies). |

## 1. Method

### 1.1 Path

- The real client path: `getPCKFeedback` → `callAI` → `makeProsePrompt` → `/api/generate`, on a local, unmodified `server/server.js`.
- Real Gemini `gemini-2.5-flash-lite` with production settings: temperature 0.7, JSON schema, 512 tokens, B24 policy.
- Synthetic replay contexts only. No participant data was used for generation, nothing was written to Firestore, and no identifiers are reported.

### 1.2 Contexts

The 13 contexts are every named repeat event in `student_stability_replay.md`. Each was rebuilt from the saved replay transcript: full history up to the teacher turn, the same cast and scenario, C8 name labels, and drawings re-attached.

| context | run | teacher message | type | frozen PCK level |
|---|---|---|---|---|
| R9-1a12 | 1.3.9 | `יפה מאוד, כל הכבוד.` | closing | more_confused |
| R9-3a6 | 1.3.9 | `נכון` | acknowledgement | confused |
| R9-3b9 | 1.3.9 | `?` | bare `?` (late) | more_confused |
| R9-4a9 | 1.3.9 | `אוקיי` | acknowledgement (late) | more_confused |
| R9-4b12 | 1.3.9 | `יפה, תודה.` | closing | improved *(replay: confused; not matched in 3 tries)* |
| R10-2a6 | 1.3.10 | `נכון` | acknowledgement | improved |
| R10-2b7 | 1.3.10 | `דנה, אז האם אלכסונים מאונכים מספיקים…?` | re-asked question | improved |
| R10-2b8 | 1.3.10 | `מה עוד צריך לדעת על האלכסונים…?` | content follow-up | improved |
| R10-2b9 | 1.3.10 | `אוקיי` | acknowledgement (late) | improved |
| R10-3a7 | 1.3.10 | `יונתן, אז אם כל הצלעות שוות…?` | re-asked question | more_confused |
| R10-3b9 | 1.3.10 | `?` | bare `?` (late) | more_confused |
| R10-4a6 | 1.3.10 | `נכון` | acknowledgement | misconception_reinforced |
| R10-5a6 | 1.3.10 | `נכון` | acknowledgement | more_confused |

- **Frozen PCK:** one real PCK analysis per context, regenerated (the replays did not store full analyses) and reused unchanged for attempts 1 and 2. 12 of 13 matched the replay's level.
- **Pilot data was not used for generation**, as instructed. It shaped the criterion in the study.

### 1.3 Procedure

1. **Attempt 1:** the normal production generation.
2. **Criterion check:** applied to every reply against that student's earlier replies in the history.
   - It is implemented in the benchmark in JavaScript.
   - It reproduces the study's Python counts exactly on both replays (12 and 16 flagged).
3. **Attempt 2, only if triggered:** the identical request plus the regeneration note.
   - **Placement:** appended to the text of the last teacher message, after a blank line, in the outgoing request body only.
   - It had to be placed there because the server reads only the first text part of a multimodal message.
   - **Verified on every call:** the system prompt hash was identical between attempts 1 and 2, and the note arrived (38/38).
4. **Repetitions:** 9 per context (6 + 3), 117 attempt-1 generations in total. Contexts that did not trigger were recorded as not triggered; nothing was forced.

## 2. Aggregate results

### 2.1 Triggering

| context | triggered / attempt-1 runs |
|---|---|
| R9-3b9 `?` | 8 / 9 |
| R10-3b9 `?` | 7 / 9 |
| R10-4a6 `נכון` | 5 / 9 |
| R9-4b12 closing | 4 / 9 |
| R10-2b9 `אוקיי` | 4 / 9 |
| R10-5a6 `נכון` | 4 / 9 |
| R10-2a6 `נכון` | 3 / 9 |
| R10-2b7 re-asked question | 3 / 9 |
| R9-1a12, R9-3a6, R9-4a9, R10-2b8, R10-3a7 | 0 / 9 each (now fresh on 1.3.10) |

- **38 / 117 attempt-1 generations triggered,** with **77 flagged replies:**
  - 71 exact or normalized-equal;
  - 6 near-only, edit 0.95–0.98: a dropped "רגע," or one changed word. All 6 are genuine copies.
- **Flagged replies per triggered call:** 1 (6 calls), 2 (25), 3 (7). In 32 of 38 calls every responding student had copied, so replays tend to be whole-turn.
- **Not caught:** in the 79 calls that did not trigger, 5 replies had edit similarity 0.75–0.87 to an earlier reply of the same student. These are the expected below-threshold misses (study §3.2).
- **Short protection:** no exact repeat under 30 characters occurred.

### 2.2 After one re-ask

| outcome (per flagged reply, n = 77) | count |
|---|---:|
| no longer triggers, rewritten | 72 |
| student silent in attempt 2 (others replied) | 1 |
| **still duplicate (exact)** | **3** |

| outcome (per triggered call, n = 38) | count |
|---|---:|
| fully resolved: no duplicate left in attempt 2 | **36** |
| still contains a duplicate, so the fallback is needed | **2** |
| a *different* student now duplicates | **0** |

- **Distance after the re-ask:**
  - Rewritten replies have edit similarity 0.26–0.66 to the copied line (median ≈ 0.41).
  - To the student's own attempt-1 draft: 0.18–0.59, apart from the 3 failures.
- **Length:** flagged students' replies averaged 84 characters in attempt 1 and 76 in attempt 2. Nothing grew verbose; the longest attempt-2 reply was under 150 characters.
- **Reply count:** 81 replies in both attempt 1 and attempt 2 across the 38 calls (3 calls had one reply fewer).

**By turn type (triggered calls fully resolved):**
- bare `?`: 15/15;
- acknowledgement: 15/16;
- re-asked question: 3/3;
- closing: 3/4.

**By PCK level:**
- misconception_reinforced: 5/5;
- more_confused: 18/19;
- improved: 13/14.

### 2.3 Wording used

The approved text was used verbatim for single-student cases (6 calls). For the 32 calls with 2–3 flagged students, the minimal plural form was used: one "In your previous draft, {name}'s reply repeated…: "{earlier}"." line per student, then:

> Write the responses again. {A, B and C} must each react to the teacher's latest message instead of restating their earlier reply. Keep each of these students' current understanding, doubt or misconception unless the teacher's latest message changed it, but put it in new words: react to what the teacher just said, ask about a specific part, or give a brief natural reaction. Do not reuse the wording of any earlier student message. The output format is unchanged.

The earlier reply was quoted in full; all were under 150 characters.

## 3. Manual review of the 73 resolved replies

The labels are one reviewer's judgement, read against the full history, the copied line and the teacher's message. They are not formal annotation.

| dimension | result |
|---|---|
| **Freshness** | clearly fresh **40** · minimally reworded **32** · still effectively repetitive **1** |
| **Student state** | preserved **69** · became too correct **0** · became more confused **1** · contradiction / regression **3** |
| **Fit to the teacher's message** | good **65** · weak **8** · unrelated **0** |
| **Naturalness** | natural **70** · awkward **3** · meta / instruction leakage **0** |

**Freshness by turn type:**

| type | clearly fresh | minimally reworded | still repetitive |
|---|---:|---:|---:|
| bare `?` | 16 | 13 | 0 |
| acknowledgement | 19 | 10 | 0 |
| re-asked question | 4 | 2 | 0 |
| closing | 1 | 7 | 1 |

**State preservation in detail:**
- **Misconceptions were not "fixed".**
  - R10-4a6 (PCK `misconception_reinforced`): דנה kept her belief that the property holds for all quadrilaterals. Example: "…אבל חשבתי שכל המרובעים אותו דבר."
  - R9-3b9 and R10-3b9: רועי kept his visual-appearance doubt.
  - R10-5a6: הילה kept her "חוצים = נפגשים באמצע" confusion in new words. Example: "אז 'חוצים זה את זה' זה תנאי נוסף? אני חשבתי שזה פשוט שהם נפגשים באמצע."
- **Under PCK `improved`, progress followed the steering, not the note.** Example (R10-2b7): "אני חושבת שהבנתי, אבל אני רוצה לוודא. אז אם האלכסונים מאונכים, זה רק תנאי הכרחי…"
- **Regressions (3):**
  - **Pre-existing (2), R10-2b7 דנה:** the copied line was itself the 1.3.10 replay's regression ("רגע, אז אם האלכסונים מאונכים זה לא מספיק? חשבתי שכן."). In 2 of 3 re-asks she kept that regressed position in new words ("…אני קצת מבולבלת"). In the third she recovered ("אממ, לא, הבנתי שזה לא מספיק. אמרת שהדלתון הוא דוגמה לזה…").
  - **New and mild (1), R10-2b9 דנה:** "מה עוד צריך?" after she had already proposed "צריך שגם יחצו".
  - The re-ask neither fixes nor causes these; that is the job of explicit student state.
- **More confused (1), R10-2b9 נועה:** went from "…הבנתי." to "אני עדיין קצת מבולבלת…". Plausible.
- **Awkward (3):**
  - "…בנוסף לאיך שהם נראים?";
  - a wrong term, "אי-הצטלבות האלכסונים";
  - a grammar slip, "במסובבת".
- **Weak fit (8):** all from one closing context, R9-4b12 `יפה, תודה.`, under PCK `improved`. The students restate the lesson's conclusion in new words ("אוקיי, אז סיכום: רק במעוין וריבוע…") instead of mainly saying goodbye. One of the eight is still effectively a third restatement. This is the 1.3.10 closing issue under positive steering, not caused by the re-ask.
- **Teacher attributions in attempt 2:** 3, all accurate. Examples: "אמרת שהדלתון הוא דוגמה לזה" and "מה שאמרת עכשיו", referring to the teacher's T5 statements. No third-person "המורה" was used.

## 4. Examples

### 4.1 Successful regenerations

| context | copied line (attempt 1 = verbatim copy) | attempt 2 |
|---|---|---|
| R9-3b9 `?`, רועי | "זה נראה כמו מלבן, אבל הוא מסובב. אני לא בטוח אם זה נחשב. איך אפשר לבדוק את הזוויות כשזה ככה?" | "אבל איך אני יודע שהמשולש ישר זווית שלי הוא באמת 90 מעלות? אולי הוא קצת עקום?" *(fresh; the doubt is kept and engages הילה's idea)* |
| R10-5a6 `נכון`, יובל | "רגע, אז אם האלכסונים שווים ומאונכים וגם חוצים זה את זה, אז זה ריבוע? …" | "אוקיי, אז התנאי של 'חוצים זה את זה' הוא חשוב. אבל זה עדיין לא ברור לי למה זה משנה. הרי האלכסונים של כל מרובע נפגשים איפשהו." *(fresh; the confusion is kept and made specific)* |
| R10-4a6 `נכון`, דנה | "אז רק במעוין וריבוע האלכסונים חוצים את הזוויות? חשבתי שזה נכון לכל המרובעים." | "רגע, אז אם האלכסונים לא חוצים את הזוויות במלבן, זה אומר שזה לא מעוין או ריבוע? אבל חשבתי שכל המרובעים אותו דבר." *(misconception kept)* |
| R10-2b9 `אוקיי`, נועה | "אז זה לא תמיד מעוין אם האלכסונים מאונכים... הבנתי." | "אז אם האלכסונים לא מאונכים, זה בטוח לא מעוין?" *(new, natural follow-up)* |
| R10-2a6 `נכון`, יובל | "אה, אז דלתון הוא דוגמה למרובע… עכשיו אני מבין את ההבדל בין תנאי הכרחי למספיק." | "אה, אז אם האלכסונים מאונכים זה לא מספיק. הבנתי, תודה!" *(brief natural reaction; minimally reworded)* |

### 4.2 Minimal rewording (counted as resolved, but still close in meaning)

- **R10-3b9 `?`, הילה:**
  - copied: "אני אבדוק אם כל הזוויות ישרות. אם כן, אז זה מלבן, גם אם הוא מסובב ככה."
  - attempt 2: "אני אבדוק שהזוויות ישרות. גם אם הצורה מסובבת, אם יש לה ארבע זוויות ישרות, זה מלבן." (edit 0.46)
- **R9-4b12 closing, יונתן (third statement of the same conclusion):** "כן, הבנתי. אז התכונה הזו של חציית זוויות היא ספציפית למעוין וריבוע, ולא תכונה כללית."

### 4.3 Failed regenerations (still duplicate after attempt 2)

| context | what happened | fallback outcome |
|---|---|---|
| R10-5a6 `נכון` (1 of 4 triggers) | יובל rewrote; **הילה repeated her line exactly**: "אז מה זה אומר ש'חוצים זה את זה'? זה לא אותו דבר כמו שהם נפגשים באמצע?" | drop הילה's reply, keep יובל's (1 reply remains) |
| R9-4b12 closing (1 of 4 triggers) | **both** responders (עדי, יונתן) returned their T5/T6 lines exactly, ignoring the note | dropping would leave 0 replies, so **keep attempt 2** (zero-reply exception) |

In both failures, several students were flagged and the copied lines were the students' central "position" statements. There is no other pattern in 2 cases.

## 5. Limits found (not regressions caused by the re-ask)

- **Minimal rewording (32 / 73).** The guard removes verbatim copies, but in about 44% of cases the new reply says nearly the same thing in other words. This is mostly natural for `?` (asked to elaborate) and for persistent doubts. Semantic loops (`student_stability_replay.md` §9.5) need explicit student state, not string matching.
- **Closings under PCK `improved`.** These give content restatements instead of goodbyes (8 weak-fit replies, 1 context). This belongs with the 1.3.10 closing rule and the PCK-override interaction (`short_message_repetition_experiment.md`), not with the re-ask.
- **Silence in attempt 2 (1).** One student stayed silent while others replied. This is natural, and no fallback is needed.

## 6. Latency, failures and retries

| | calls | p50 | p90 | max |
|---|---:|---:|---:|---:|
| attempt 1 (all) | 117 | 1,320 ms | 1,658 ms | 2,857 ms |
| **attempt 2 (re-ask)** | 38 | **1,475 ms** | **1,812 ms** | **1,930 ms** |

- No errors, parse or schema failures, server-side retries (`attempts` was 1 on every call), non-STOP finishes or invalid student names.
- **Cost:** about +1.5 s on triggered turns only. That is well inside the B24 budget (20 s per attempt, 45 s total).

## 7. Fallback frequency estimate

| scope | estimate |
|---|---|
| per triggered call (this test) | 2 / 38 ≈ **5%** need the fallback: 1 drop-one, 1 zero-reply exception |
| per flagged reply | 3 / 77 ≈ **4%** still duplicate |
| per normal turn (combined with the study's trigger rate of about 5% of turns: pilot 66 / 1,257; replays 5 and 8 / 144) | ≈ **0.25% of turns** need any fallback; the zero-reply exception about half of that |

These contexts were selected because they had replayed, so they are harder than average turns. The per-turn estimate is an upper-range guess.

## 8. Recommendation

1. **Implement the approved criterion unchanged:** normalized equality or edit ≥ 0.90, ≥ 30 characters, same student, all earlier turns.
2. **Implement exactly one re-ask, server-side** inside the existing 2-attempt loop (study §4).
   - Use the tested wording: verbatim for one student, the plural form in §2.3 for several.
   - **Place the note as tested:** appended after a blank line to the text of the last teacher message in attempt 2's request only. It is never stored.
   - Doing the same on the server, by appending to the last user content's text part, keeps the tested conditions.
3. **Keep the fallback:**
   - If a reply is still duplicate after attempt 2, drop only that student's reply.
   - If that would leave no replies, keep attempt 2 and count it.
   - Both branches occurred in 38 triggers, so the zero-reply exception is not hypothetical.
   - If attempt 2 fails technically, fall back to attempt 1 with the same rule (study §4.1).
4. **Telemetry as proposed:** additive counters `duplicateRetries`, `duplicatesDropped`, `duplicatesAccepted` (A17 whitelist). These are needed to monitor the roughly 5% residual in production.
5. **The wording is ready for production as tested.** No recurring wording-related problem was seen: no leakage, no "fixing" of misconceptions, no verbosity, no invented statements. So no alternative wording was tried.
6. **After implementation:**
   - a sequential replay (the `student_stability_replay.md` method) as the acceptance test;
   - then explicit student state for semantic loops and regressions, which this guard does not address.

## 9. Limitations

- **Small and clustered.** 38 triggered calls from 8 contexts, and two `?` contexts provide 15 of them. The failure rate (2/38) has wide uncertainty.
- **Synthetic contexts, one scripted teacher.** PCK was regenerated and frozen per context; 1 of 13 levels did not match the replay. Pilot contexts were not used for generation, as instructed.
- **Note placement differs slightly from the planned server design.** The note was appended to the teacher message text, not added as a separate content part. The production implementation should reproduce this placement.
- **One reviewer.** Manual labels are one reviewer's judgement, with no second annotator. "Minimally reworded" vs "clearly fresh" is the most subjective dimension.
- **Re-ask only.** Attempt 2's effect on later turns of a conversation is not measured here. The post-implementation replay will show it.
