# Student duplicate guard: criterion study and design (no implementation)

Status: design study, 2026-10-07. No production code was changed, `SYSTEM_VERSION` is unchanged, and nothing was committed. The analysis used only:
- **Pilot:** the existing export (`research/pck_feedback/data/raw/conversations`, 133 conversations, 1,257 turns, 3,163 student replies). Read-only; no identifiers are reproduced here.
- **Replays:** the synthetic sequential replays on 1.3.9 (280 replies) and 1.3.10 (260 replies) from `student_stability_replay.md`.

Scripts (dependency-free Python: `features.py`, `evaluate.py`) and the label lists are in the session scratchpad. They are not part of the repo.

## Recommendation in brief

| question | recommendation |
|---|---|
| Compared against | **the same student's earlier replies in the same conversation** (all earlier turns, not only the previous one). Other students' replies are not compared. |
| Normalization | trim; `\r\n` → `\n`; collapse every whitespace run, including line breaks, to one space; ignore trailing terminal punctuation (`. ! ? … , ; : " ' ״ ׳ ( )`). No word removal, no case or semantic rewriting. |
| Match rule | normalized equality **or** edit similarity ≥ **0.90**. Edit similarity is `1 − Levenshtein(a, b) / max(len a, len b)` on whitespace-normalized text. |
| Short-reply protection | only replies of **≥ 30 characters** (normalized) are checked |
| Expected effect (on the reviewed data) | catches **148 / 172 (86%)** manually judged problematic replays; **0** natural replies flagged; 3 borderline flagged. A re-ask on about 5% of turns (pilot 66 / 1,257; replays 5 / 144 and 8 / 144). |
| Where | **server, inside the existing `/api/generate` attempt loop**, so there are still at most 2 model attempts and no nested retries |
| Re-ask | attempt 2 gets one extra note naming the student and the copied line (wording in §6) |
| If attempt 2 still duplicates | **B: drop only that student's reply.** Exception: if that would leave no replies, keep attempt 2 as is (A). |

## 1. Data and manual review

### 1.1 Features

For every student reply, the script computes its best match among that student's earlier replies in the same conversation. Turns are ordered by `turnNumber`. The features are:
- exact equality;
- equality after whitespace normalization (N1);
- equality after N1 plus terminal punctuation (N2);
- edit similarity;
- token Jaccard, on whitespace tokens with edge punctuation stripped.

### 1.2 Review set

- **Every exact or normalized-equal same-student repeat:** 160 (pilot 136, 1.3.9 10, 1.3.10 14). This includes every repeat event already identified in the pilot and both replays.
- **Every non-equal pair with edit similarity ≥ 0.6 or Jaccard ≥ 0.5:** 232 pairs. This covers the high-similarity sample and the decision boundary.
- **All repeated short replies** found by any rule. This is the whole set, not a sample: greetings, thanks, "כן", readiness lines.
- Replies outside these sets (edit < 0.6 and Jaccard < 0.5) were not reviewed and count as "not a replay".

### 1.3 Labels

All labels are one reviewer's manual judgement. This is not formal annotation: there was no second annotator and no agreement measure.
- **P (problematic replay):** the reply reproduces an earlier substantive reply of the same student verbatim or nearly so. Only trivial edits are allowed: punctuation, one or two words, a discourse prefix such as "רגע," / "אה," / "כן,", a dropped or appended short clause. And the reply does not react to the current teacher move.
- **B (borderline):** a re-statement that partly engages the new move (question → "הבנתי" statement), or a short content answer repeated when the teacher asked the same kind of question again (e.g. "כן, זה מלבן. יש לו ארבע זוויות ישרות." for another drawing).
- **N (natural / not a replay):** greetings, thanks, readiness lines, short agreement, and similar wording with different content.

**The teacher never asked for the repeat.** In 7 of the 136 pilot exact repeats, the teacher's message contained a recall-type keyword ("תגידו", "נסכם" …). On reading, none of them asked the student to repeat their own words. All exact repeats of 40 or more characters were labelled P.

| corpus | replies | P | B | N |
|---|---:|---:|---:|---:|
| pilot | 3,163 | 139 | 60 | 2,964 |
| replay 1.3.9 | 280 | 13 | 6 | 261 |
| replay 1.3.10 | 260 | 20 | 6 | 234 |
| **total** | 3,703 | **172** | 72 | 3,459 |

### 1.4 Naturally repeatable short replies

| reply (normalized) | occurrences | of which repeats of the same student |
|---|---:|---:|
| כן | 5 | 2 |
| תודה (incl. "תודה!") | 17 | 1 |
| לא / לא יודע/ת / אני לא בטוח/ה (as the whole reply) | 0 | 0 |

These generated students rarely answer with a bare word. "אני לא בטוחה" almost always opens a longer sentence. The natural short repeats that do occur are:
- greetings: "היי", "שלום לכולם!";
- thanks: "תודה רבה!", "כן, תודה!", "בדיוק! תודה רבה.";
- readiness lines: "כן, מוכנה!", "אוקיי, נראה מה תצייר לנו.", "מעולה, אני אוהב לזהות צורות.", "אני מוכנה! בוא נראה את הציור.".

**The longest natural repeat is 29 characters.**

## 2. Results by rule and minimum length

Columns:
- **flagged:** replies the rule would re-ask.
- **P / B / N:** flagged replies by label. N = likely false positives.
- **recall:** P caught / 172.
- **missed:** P not caught (likely false negatives).

| rule | min length | flagged | P | B | N (FP) | recall | missed |
|---|---:|---:|---:|---:|---:|---:|---:|
| exact | 0 | 159 | 130 | 4 | **25** | 75.6% | 42 |
| exact | 20 | 138 | 130 | 4 | 4 | 75.6% | 42 |
| exact | 30 | 132 | 129 | 3 | **0** | 75.0% | 43 |
| normalized (whitespace) | 30 | 132 | 129 | 3 | 0 | 75.0% | 43 |
| normalized + terminal punctuation (N2) | 0 | 160 | 130 | 4 | 26 | 75.6% | 42 |
| N2 | 10 | 146 | 130 | 4 | 12 | 75.6% | 42 |
| N2 | 20 | 138 | 130 | 4 | 4 | 75.6% | 42 |
| N2 | 30 | 132 | 129 | 3 | 0 | 75.0% | 43 |
| N2 or edit ≥ 0.95 | 30 | 141 | 138 | 3 | 0 | 80.2% | 34 |
| **N2 or edit ≥ 0.90** | **30** | **151** | **148** | **3** | **0** | **86.0%** | **24** |
| N2 or edit ≥ 0.90 | 25 | 158 | 149 | 3 | 4 | 86.6% | 23 |
| N2 or edit ≥ 0.90 | 35 | 150 | 147 | 2 | 0 | 85.5% | 25 |
| N2 or edit ≥ 0.85 | 30 | 158 | 153 | 5 | 0 | 89.0% | 19 |
| N2 or edit ≥ 0.80 | 30 | 168 | 157 | 9 | 2 | 91.3% | 15 |
| N2 or edit ≥ 0.70 | 30 | 199 | 163 | 22 | 14 | 94.8% | 9 |
| N2 or Jaccard ≥ 0.90 | 30 | 144 | 140 | 4 | 0 | 81.4% | 32 |
| N2 or Jaccard ≥ 0.80 | 30 | 166 | 159 | 7 | 0 | 92.4% | 13 |
| N2 or Jaccard ≥ 0.70 | 30 | 182 | 164 | 15 | 3 | 95.3% | 8 |
| N2 or edit ≥ 0.90 or Jaccard ≥ 0.85 | 30 | 159 | 154 | 5 | 0 | 89.5% | 18 |
| N2 or edit ≥ 0.85 or containment (≥ 30 characters) | 30 | 169 | 159 | 9 | 1 | 92.4% | 13 |

**Normalization:**
- Whitespace and terminal-punctuation normalization changed one pair in this data: "היי." vs "היי".
- The generated replies never differed only in spacing or line breaks.
- Normalization is recommended as cheap robustness, not because it measurably raises recall. Line breaks may appear in future outputs; C5 keeps teacher line breaks.

**Minimum length:**
- **The minimum length is what removes false positives.** For every rule: about 25 natural replies flagged at no minimum, 12 at 10, 4–5 at 20, and **0 at 30**.
- At 30, the only problematic replay lost is one 29-character question ("אז כל הזוויות בו הן 90 מעלות?", part of a replayed turn).
- 30 is just above the longest natural short repeat (29 characters). Below 30, readiness lines and thanks start to be flagged.

**Similarity measure:**
- **Edit similarity at 0.90** adds 19 replays over equality, at no cost in natural replies. These are mostly one changed word or a discourse prefix.
- **Going lower** raises recall but also adds borderline cases: B goes 3 → 5 at 0.85 and 3 → 9 at 0.80. Natural flags appear from 0.80.
- **Jaccard ≥ 0.80** reaches higher recall (92%) with 0 N but 7 B. It ignores word order, and it is the measure most likely to flag a re-formulated answer that legitimately reuses the same vocabulary, for example a student restating the same definition in a summary turn.

**Conservative choice:** for a first version that triggers a re-ask, **N2 or edit ≥ 0.90, minimum 30 characters**. "N2 or edit ≥ 0.90 or Jaccard ≥ 0.85" is the tested next step if live misses matter (+6 P, +2 B, 0 N).

### 2.1 Recommended rule per corpus

| corpus | P | caught | flagged | flagged replies |
|---|---:|---:|---:|---:|
| pilot | 139 | 120 | 123 | 3.9% of replies |
| replay 1.3.9 | 13 | 12 | 12 | 4.3% |
| replay 1.3.10 | 20 | 16 | 16 | 6.2% |

**Every full replay turn named in `student_stability_replay.md` is caught:**
- 1.3.9: 1a T12, 3a T6, 3b T9, 4a T9, 4b T12;
- 1.3.10: 2a T6, 2b T7–T9, 3a T7, 3b T9, 4a T6, 5a T6.

In each, at least the exact copies are flagged. A few near-copies inside those turns are missed (§3.2).

## 3. Examples around the decision boundary

All examples are generated student text. Pilot examples carry no identifiers.

### 3.1 Flagged and correctly so: just above the threshold

| edit similarity | reply | earlier reply of the same student |
|---|---|---|
| 0.98 | כן, זה מרובע ויש **לו** סימנים של זוויות ישרות… | כן, זה מרובע ויש **בו** סימנים של זוויות ישרות… |
| 0.96 | אז אם האלכסונים שווים ומאונכים וגם חוצים זה את זה, אז זה ריבוע? … (1.3.10, 5a T6) | **רגע,** אז אם האלכסונים שווים ומאונכים … |
| 0.94 | **כן,** רק במעוין ובריבוע האלכסונים חוצים את הזוויות. במלבן ומקבילית לא. (1.3.9, 4b T12) | רק במעוין ובריבוע האלכסונים חוצים את הזוויות. במלבן ומקבילית לא. |
| 0.92 | אה, אז הבנתי! אז ריבוע הוא מקרה פרטי של מלבן … (4 צלעות שוות). **זה הגיוני.** | the same without the last two words |
| 0.90 | אני עדיין **לא מבינה**. אם צריך 4 זוויות ישרות, אז למה אמרת שלפחות 3 זה מספיק? | אני עדיין **קצת מבולבלת**. … |

### 3.2 Missed by the recommended rule (likely false negatives, 24)

- **Edit similarity 0.72–0.89, 15: a copy with a prefix, a reordering, a short insertion or a short appended question.** Examples:
  - "אז צריך **שהאלכסונים גם** יחצו זה את זה?" vs "אז צריך **שגם האלכסונים** יחצו זה את זה?" (1.3.10 2b T8; 0.83);
  - "כן, הבנתי! ריבוע הוא מלבן כי…" vs "כן! עכשיו אני מבינה. ריבוע הוא מלבן כי…" (1.3.10 1b T9; 0.85);
  - "אבל אם הוא לא ארוך, זה ריבוע. זה נראה לי שונה." vs the same with an extra clause in the middle (1.3.10 3a T7; 0.72).
- **Edit similarity 0.53–0.69, 8: an earlier reply plus an appended clause, a truncated copy, or two earlier replies concatenated.** Examples:
  - "אז רק במעוין וריבוע האלכסונים חוצים זוויות? זה קצת מבלבל**, אני חשבתי שזה תכונה כללית יותר.**" (0.64);
  - "אז צריך שהאלכסונים גם יחצו זה את זה**, בנוסף לזה שהם מאונכים?**" (1.3.10 2b T9; 0.61);
  - two earlier replies concatenated (0.55).
- **Below the length minimum, 1:** the 29-character replayed question.

A containment check (an earlier reply of ≥ 30 characters appears inside the new one, or the reverse) catches 8 of these misses (recall 86% → 91%), at the cost of 1 natural flag (a closing thanks line) and 4 more borderline flags. Lowering the edit threshold to 0.85 catches 5 more, with 2 more borderline flags. Jaccard ≥ 0.85 catches 6 more, also with 2 more borderline flags. None of these is recommended for version 1; they are the tested options if the live misses turn out to matter.

### 3.3 Flagged but not clearly problematic (borderline, 3)

All three are short content answers repeated when the teacher asked about another drawing:
- "לא, זה לא מלבן. זה נראה כמו מעוין." (34 characters);
- "כן, זה מלבן. יש לו ארבע זוויות ישרות." (37);
- "כן, ברור שזה מלבן. יש לו ארבע זוויות ישרות." (43).

The content may be right for the new drawing, but the identical wording is unnatural. A re-ask would only reword them, so this is a low-harm flag.

### 3.4 Not flagged and correctly so (natural, below 30 characters or below threshold)

- "תודה רבה!", "כן, תודה!", "היי", "כן, מוכנה!", "אוקיי, נראה מה תצייר לנו." (25), "אני מוכנה! בוא נראה את הציור." (29);
- "תודה רבה! היה שיעור מעניין." vs "תודה רבה! זה היה שיעור מעניין." (27 characters, two lessons' endings apart);
- "אני חושבת שהימנית היא מלבן…" vs "…השמאלית היא מלבן…" (different content, edit 0.60).

## 4. Where the guard should live

| | browser (`callAI` / `Chat.jsx`) | **server `/api/generate` (recommended)** |
|---|---|---|
| Sees same-student history | yes (`ChatMessage.agent`) | yes. The client sends the whole history as `{role: "assistant", content, name}` (C8), so the server can group earlier replies by `name`. Legacy nameless messages are skipped. |
| Attempt limit (B24: at most 2 model attempts per request, one retry layer) | **Broken.** A browser re-ask is a second request with up to 2 attempts of its own, so up to 4 model attempts and a nested retry layer. | **Kept.** The re-ask is attempt 2 of the existing `callModelWithPolicy` loop. |
| Timeouts / budget | A second request needs its own 50 s client timeout; turn latency can double. | Uses the existing 20 s per attempt and 45 s total budget, and the existing "not enough budget left" check. |
| Telemetry | Two calls to merge; `attempts` per call loses the link | One `meta` per call; `attempts` stays meaningful; reason counters can be added (§5) |
| Stored conversation format | unchanged either way | unchanged: only the final messages are returned and stored, as now |
| Testability | jsdom orchestration tests | deterministic server tests with the fake Vertex model, like the B24 tests |

**Server-side design sketch (not implemented):**
1. A pure function, e.g. `server/student_duplicate_guard.js`: `findSelfDuplicates(responses, history) → [{student, earlier}]`. It uses the normalization, threshold and length minimum above, and is unit-tested on its own.
2. In `/api/generate`, the `interpret` callback runs it after `validateStudentOutputText` succeeds.
   - On a hit with an attempt left, it returns a retryable failure of a new kind, `duplicate`, carrying the parsed attempt-1 output.
3. `callModelWithPolicy` needs two small, generic extensions:
   - **(a)** an optional `requestForNextAttempt(lastFailure)` hook, so attempt 2 can carry the re-ask note. Today every attempt reuses the same request.
   - **(b)** an optional fallback value, so that if the re-ask attempt fails for a technical reason (timeout, parse, model error), the call still returns attempt 1's usable output, with the final policy applied, instead of turning a valid turn into a failure.
   - Neither extension adds attempts.

### 4.1 Interaction with the 2-attempt policy

| attempt 1 | attempt 2 | outcome |
|---|---|---|
| valid, no duplicate | — | returned as today (`attempts: 1`) |
| valid, duplicate | valid, no duplicate | attempt 2 returned (`attempts: 2`, duplicate resolved) |
| valid, duplicate | valid, still duplicate | final policy (§7) applied to attempt 2 |
| valid, duplicate | technical failure, or no budget left | attempt 1 returned with the final policy applied; never a failed turn |
| technical failure (retryable) | valid, duplicate | no attempt left: final policy applied to attempt 2 |
| technical failure | technical failure | unchanged: existing failure path (C7 / B24) |

There is never a third attempt. A duplicate never makes a successful turn fail.

## 5. Telemetry

- **Today:** a retry that succeeds shows only `attempts: 2` (A16/A17).
- **Recommended:** three additive non-negative integers in the student `meta`, whitelisted in `callTelemetry.js` (`TELEMETRY_KEYS`):
  - `duplicateRetries` (0/1);
  - `duplicatesDropped` (number of replies removed by the final policy);
  - `duplicatesAccepted` (number of duplicate replies kept by the zero-reply exception).
- They contain no text, so the A17 guarantee (no prompt, output or message content) holds. The turn and message format stays the same.
- This is an additive telemetry change under A17 and needs its own test.
- Without these counters, a duplicate-driven retry looks identical to a timeout retry in the data.

## 6. Re-ask instruction (attempt 2 only)

**Placement:**
- Added as one extra text part at the end of the last teacher (user) content of the attempt-2 request, in memory only.
- It is not part of the history the client stores.
- The system prompt and every other message stay byte-identical.

**Wording:** one block per flagged student. The earlier reply is quoted, cut to 150 characters.

```
[Regeneration note — not part of the conversation]
In your previous draft, {name}'s reply repeated, word for word or almost, what {name} already said earlier in this conversation: "{earlier reply}".
Write the responses again. {name} must react to the teacher's latest message instead of restating that earlier reply. Keep {name}'s current understanding, doubt or misconception unless the teacher's latest message changed it, but put it in new words: react to what the teacher just said, ask about a specific part, or give a brief natural reaction. Do not reuse the wording of any earlier student message. The output format is unchanged.
```

**Why this wording:**
- It names the student and the copied line, so the model knows exactly what to avoid.
- It keeps the state: "keep … unless the teacher's latest message changed it". This matches the 1.3.10 rule, which kept confusion in new words without making students agreeable (`short_message_repetition_experiment.md`).
- It offers concrete alternatives instead of only a prohibition.
- It does not invite silence, which would interact with B6 / A3.
- Other students may also change in attempt 2. That is acceptable, because the whole attempt-2 output replaces attempt 1, and nothing is merged.

**This wording is not validated.** It must be tested live before shipping (§8).

## 7. If attempt 2 is still a duplicate

| option | natural classroom behaviour | research integrity | B6 / zero replies | teacher experience |
|---|---|---|---|---|
| **A. accept attempt 2 anyway** | The visible failure stays: a student repeats a whole earlier answer. | The record contains a known copy (flagged in telemetry). | No new zero-reply cases | Same as today for these turns |
| **B. drop only that student's reply** | A student with nothing new to say stays quiet, which is ordinary. The other students' replies are kept. | No new content is lost: the dropped text already exists earlier in the record. The drop is counted in telemetry. | **Can create zero replies** if every replying student duplicates, which then hits B6 (prompt says ≥ 1, parser allows 0) and A3 (a silent turn is not logged, so the teacher's message would be missing from the record). | Fewer bubbles, no error |
| **C. fail the whole student turn** | Not a classroom behaviour; a technical error for a content-quality issue | A failure diagnostic (C7); the turn is not logged | none, but the turn is lost | Error banner; the teacher must re-send, and the same context often repeats |

**Recommended: B, with an A-exception for the zero-reply case.**
- Drop a still-duplicate reply only when at least one other reply remains in the turn.
- If dropping would leave the turn empty, keep attempt 2 unchanged and count it in `duplicatesAccepted`.
- **Reasons:**
  - Option C turns a content issue into a visible technical failure and loses the teacher's turn.
  - Pure B can silently drop the teacher's message from the research record (A3) until B6 is decided.
  - A is only needed in the case where B would do that harm.
- **If B6 is later decided** so that silent turns are logged, the exception can be removed and B applied fully.

## 8. Before implementing

1. Get your decision on the rule (§2), the final policy (§7) and the telemetry fields (§5). The fields are an additive A17 change.
2. **Tests first** (deterministic):
   - the normalization and threshold function, including the natural short replies in §3.4 and the boundary cases in §3.1–3.3;
   - `/api/generate` with the fake model:
     - attempt 1 duplicate → attempt 2 carries the note → never more than 2 attempts;
     - the fallback rows of §4.1;
     - drop vs zero-reply exception;
     - telemetry counters;
     - no text in `meta`.
3. **A live check of the re-ask** on the saved duplicate contexts (1.3.9 / 1.3.10 replays: 3b T9, 2b T7–T9, 3a T7, 4a T6, 5a T6, 2a T6, 1a T12, 4b T12). Measure:
   - how often attempt 2 is still a duplicate;
   - whether student state is kept;
   - the added latency (about one student call, p50 ≈ 1.2 s, on about 5% of turns).
4. Then a sequential replay (`student_stability_replay.md` method) as the acceptance test.
5. `SYSTEM_VERSION` bump and changelog when implemented, since it changes the student output.

## 9. Limitations

- **One reviewer.** Labels are one reviewer's judgement, with no second annotator. P/B boundaries (§1.3) are judgement calls, especially "short answer to a repeated question" (B) vs replay (P).
- **Unreviewed pairs.** Replies with edit < 0.6 and Jaccard < 0.5 were not reviewed and are assumed not to be replays. Paraphrased semantic loops are out of scope here, and string similarity cannot catch them.
- **Pilot versions differ.** Pilot replies come from versions 1.1.0–1.3.0, before C8/C9/1.3.10. The replays are synthetic, with a scripted teacher. The 30-character margin rests on the longest natural repeat seen (29 characters); other personas or scenarios may produce longer natural repeats.
- **Cross-student copies are not addressed.** In the pilot, 39 exact repeats were by a different student (`student_agent_findings.md` §2.1). The pilot also has 9 same-turn duplicates.
- **Re-ask success is unknown.** The rates in §2 measure detection only. How often the re-ask fixes the copy has not been measured (§8.3).
