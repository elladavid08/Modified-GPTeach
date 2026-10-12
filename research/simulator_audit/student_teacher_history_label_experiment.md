# Labelling teacher turns in the student-model history: live A/B

Status: experiment only, 2026-10-12, on committed **1.3.13** (`7d37615`).
- No production change, no `SYSTEM_VERSION` bump.
- Synthetic data only; no participant data; nothing written to Firestore.
- Follows `student_teacher_attribution_investigation.md` §7 (candidate 1).

## Summary

- **Hypothesis:** the model misattributes statements to the teacher partly because teacher turns reach it unlabelled. Students are labelled `<name>: <text>` (C8), while teacher turns are bare `user` messages.
- **Test:** A, the current history, against B, the identical history with every teacher text prefixed `Teacher: `. 360 calls on the rebuilt failure contexts and on accurate, prior-lesson, peer-address and ordinary controls.
- **Result: no improvement.**
  - Attribution errors: **A 8, B 12**.
  - Invented attributions fell (3 → 1), but peer pickup of an invented attribution doubled (3 → 6 of 12), and mixed attributions rose (2 → 5).
  - Accurate references fell slightly (14 → 7, mostly within noise).
  - No new behaviour: no reply contains `Teacher:`, and no response uses Teacher as a speaker.
- **Not strong enough for a production change. Do not implement.**

## 1. What the model sees today (verified)

`server/server.js` `convertMessagesToGenAI` handles every message the same way, historical and latest alike:
- **Teacher messages** (`role: "user"`, `name: "Teacher"` from `ChatMessage`) become Gemini `user` contents with the **text unchanged**. The name is ignored.
  - The system prompt is prepended to the **first** user message (`<system prompt>\n\n<teacher text>`).
  - With a drawing, the text part comes first and the image second.
- **Student messages** become `model` contents with `"<name>: <text>"` (C8).
- **The duplicate re-ask note** (B26) is appended after the text of the last user message.

## 2. Conditions

**A** is the current model-facing history.

**B** is identical, except the text of **every** teacher message is prefixed `Teacher: `. This covers both historical teacher turns and the latest one.
- It was applied benchmark-side to the outgoing `/api/generate` body (string content, or the first text part of a multimodal message).
- The first message therefore becomes `<system prompt>\n\nTeacher: <text>`, which is what a server-side change would produce.
- Unchanged: student history (`<name>: <text>`), roles, drawings, PCK guidance, prompt rules, examples, personas and model config.

**Integrity** (raw-capture preload):
- In B, all user turns were labelled in **185 of 185** requests; in A, none were (193 of 193).
- Student turns kept their name prefix in both conditions.

## 3. Method

- **Path:** real PCK → `callAI` → local **unmodified** server → Gemini (production settings), with the raw-capture preload.
- **Contexts:** rebuilt exactly (history and drawings), with one real PCK analysis frozen per context and shared by A and B. The condition order alternates.
- **Volume:** 360 calls and 378 raw responses; every response ended with `STOP`.

| group | contexts | calls per condition each |
|---|---|---:|
| failure | F1 acknowledgement → endorsement (s1 cast 1 T3); F2 peer pickup (s1 cast 1 T4, with the invented T3 line in the history); F3 premise + acknowledgement (s2 cast 0 T3); F4 premise (s2 cast 0 run 2 T2); F5 premise (s4 cast 1 run 2 T4); F6 peer → teacher (s3 cast 1 run 2 T9); F7 premise (historical 1.3.9 s3 T2); F8 own statement + acknowledgement (s4 cast 1 T3) | 12 |
| accurate teacher references | G1 s4 cast 0 T7, G2 s5 cast 0 T5, G3 s2 cast 0 T10, G4 s6 cast 0 run 2 T7 | 8 |
| prior-lesson references | P1 s2 cast 1 T4 ("אמרת לנו שבמעוין…"), P2 s5 cast 1 T2 | 8 |
| peer-address "אמרת" | R1 s1 cast 0 run 2 T4, R2 historical 1.3.10 s6 T2 (originally named peer), R3 s3 cast 0 run 2 T4 | 8 |
| ordinary | N1 s2 T5, N4 s1 T5 (explanation turns) | 6 |

**Classification:** every reply with a teacher-attribution marker (`אמרת`, `המורה אמרה`, `הסברת`, `ציירת`, …; self-references "אמרתי" excluded) was classified **manually**, against the full teacher history, the peers' replies and the scenario prior knowledge. Classes:
- **invented:** nothing in the conversation supports it;
- **peer pickup:** a peer repeats an invented attribution;
- **mixed:** a question premise, hint, or the student's own or a peer's content presented as the teacher's assertion;
- **accurate:** the teacher said it, or the student refers to the teacher's question as a question;
- **prior-lesson:** matches the scenario's prior knowledge or "בשיעור הקודם למדנו";
- **peer address:** "אמרת" for a classmate's statement, or plural "אמרתם".

## 4. Results

### 4.1 Attributions

| class | A | B | cases |
|---|---:|---:|---|
| **invented** (not pickups) | **3** | **1** | A: F4 "…זה מעוין. אמרת את זה!", N1 "אמרת שאם הם חוצים אחד את השני זה ריבוע או מלבן", R2 "המורה אמרה שדלתון ומעוין זה שונה"; B: F1 "המורה אמרה שאנחנו צריכים להסתכל על ההגדרה ולא על המראה" |
| **peer pickup of an invented attribution** (F2, 12 calls) | **3** | **6** | "אני חושבת שיובל צודק. (אם) המורה אמרה שזה סוג נפרד…" |
| **mixed** | **2** | **5** | A: F3 own content, G2 question premise ("אמרת שאם … שווים ומאונכים זה מספיק!"); B: F7 own statement, G2 hint → statement, R3 ×3 question premise / mixed ("אמרת שזה לא חייב להיות ארוך וצר") |
| **attribution errors, total** | **8** | **12** | |
| accurate references | 14 | 7 | G1 6 vs 5, G2 1 vs 0, G3 2 vs 1, G4 1 vs 0; references to the teacher's *question* (P2 ×3 in A); R3 "אמרת שנבדוק את זה עוד רגע" in B |
| prior-lesson references | 1 | 4 | A: F7; B: F1 ("…ההגדרה של מלבן היא שיש לו ארבע זוויות ישרות" after T1 "בשיעור הקודם למדנו על מלבן"), F1 (opposite sides, plausible), G2, P2 |
| peer address (unnamed "אמרת", or plural) | 3 | 3 | R1 in both, P2 (A), R2 (B), G2 "אמרתם" (B) |

**By failure pattern** (failure contexts F1–F8):
- **Question premise → statement:** A 1, B 0 (F3–F5, F7).
- **Acknowledgement → endorsement:** A 0, B 1 (F1, F8).
- **Own or peer content → teacher:** A 1, B 1 (F3, F6, F7).
- **Peer pickup:** A 3, B 6 (F2).

In both conditions F5, F6 and F8 produced no attribution at all.

### 4.2 Other behaviour

| | A | B |
|---|---|---|
| addressed student answered | 104 / 112 | 112 / 112 |
| ...of which peer-address contexts | 16 / 24 | 24 / 24 |
| replies per call (failure / accurate / prior / peer-address / ordinary) | 1.67 / 1.50 / 1.56 / 1.33 / 2.50 | 1.73 / 1.50 / 1.25 / 1.75 / 2.58 |
| responders 1 / 2 / 3 (failure contexts) | 41 / 46 / 9 | 34 / 51 / 10 (+1 call with no reply) |
| misconception claims (failure / prior / peer-address) | 28 / 7 / 0 | 24 / 7 / 3 |
| hedged replies (failure contexts) | 41 / 160 | 40 / 166 |
| mean length, failure / ordinary (characters) | 79 / 92 | 76 / 85 |
| student latency p50 / p90, failure contexts | 1,118 / 2,126 ms | 1,045 / 1,580 ms |
| replies containing `Teacher`/`מורה:`; responses with a Teacher speaker | 0 / 0 | 0 / 0 |
| client errors | 0 | 0 |

- **Naturalness** (paired read): no difference. B replies address the teacher in second person exactly as A replies do, and the label never appears in output.
- **Responsiveness:** B answered the addressed student in all peer-address calls (A missed 8 of 24 in R1/R3). This is the only measure where B is clearly better, and it is a single context family.
- **Misconception and confusion preservation:** unchanged.

## 5. Interpretation

- **The label does not address the main mechanism.**
  - In F2 the false attribution is in a **peer's** reply ("המורה אמרה…"). The peer pickup doubled with the label (3 → 6 of 12): the model trusts a classmate's report of what the teacher said even when it can see, labelled, that no teacher turn contains it.
  - Question-premise and own-content misattributions persist (R3, G2, F7).
- **The small drop in invented attributions (3 → 1)** is within noise at these sample sizes, and is outweighed by the rise in pickups and mixed attributions.
- **Accurate references fell (14 → 7):** possibly noise (G1 6 vs 5), and at least not an improvement.
- **The current conversion path is already consistent.** Historical and latest teacher turns are treated identically (unlabelled), so there is no inconsistency between the latest and earlier teacher messages to fix.

## 6. Answers

1. **A vs B attribution errors:** A 8, B 12.
   - Invented: 3 vs 1.
   - Peer pickups: 3 vs 6.
   - Mixed: 2 vs 5.
2. **Correct and legitimate references:** not improved.
   - Accurate references 14 → 7 (largely noise; no clear harm).
   - Prior-lesson references 1 → 4 (all legitimate or plausible).
   - Peer-address references 3 → 3.
3. **New behaviour:** none observed. No leakage of `Teacher:`, no Teacher speaker, no change in tone. Responsiveness to the addressed student was slightly better in one context family.
4. **Strong enough for a versioned production change:** no.
5. **Code change if it had succeeded:** one line in the `user` branch of `convertMessagesToGenAI` (`server/server.js`). It would prefix `${message.name}: ` when a name is present, for both text and multimodal messages, symmetric with C8. All teacher turns, historical and latest, pass through that branch. **It is not recommended** on this evidence.

## 7. Next options (not tested)

- **Peer pickup is now the dominant attribution error in this context set.**
  - It is a cross-student propagation of a peer's claim, not a teacher-turn representation problem.
  - The only lever left within the student prompt is wording, and two wording attempts have now failed (`student_teacher_attribution_investigation.md` §5).
- **Remaining candidates from the investigation:**
  - remove the "אמרת" example from the second-person instruction;
  - revisit PCK's "validation" vocabulary.

  Neither addresses pickup directly.
- **Given the natural rate** (about 0.5% of replies, mostly in early turns of scripted probes), a reasonable decision is to **record this as a known limitation** and stop prompt-tuning for it. Optionally, count attribution candidates in research analyses with the corpus scanner (§2 of the investigation).

## 8. Limitations

- **Sample sizes:** 12 calls per failure context and 8 per control per condition; most differences are within noise.
- **Classification:** done manually by one reviewer. Peer vs teacher addressee for a bare "אמרת" is ambiguous.
- **Reconstruction:** PCK was regenerated per context, so the student prompt is not byte-identical to the original turns.
- **Analysis files** (scratchpad `c26/`): `label.bench.js`, `capture.cjs`, `analyze_label.mjs`, `analysis.txt`, `raw_capture.jsonl`, `client_results.json`, `frozen_pck.json`.
