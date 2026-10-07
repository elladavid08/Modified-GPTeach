# Student-stability replay harness: review and corrected design

Status: evaluation-method review, 2026-10-07. No production code or `SYSTEM_VERSION` was changed, and nothing was committed. No benchmark was re-run.
- **Mechanics check (offline):** the adaptive-teacher logic proposed here was dry-run against the saved 1.3.9–1.3.11 transcripts, with no model calls.
- **Corrected drawings:** generated as benchmark-only prototypes in the session scratchpad.

## Summary

- **The harness, not only the student model, produced a large share of the "loops" and "regressions" counted so far.**
  - Under the definitions in §4, **all 4 semantic loops** reported for 1.3.11 are unanswered-question repetitions or follow a contradictory drawing.
  - **All 3 regressions** follow an artefact: an ambiguous validating "נכון", a scenario-5 drawing that contradicts the script, and a prompt-example copy (§6).
  - So the 1.3.9–1.3.11 loop and regression counts cannot be used as a baseline for explicit student state.
- **The causes:**
  - **A fixed teacher script that never answers student questions:** in 121 of 396 scripted turns across the three runs, the preceding student turn contained an open question.
  - **Validating acknowledgements** ("נכון", "יפה") that can confirm a wrong claim.
  - **Two drawings that contradict the teacher's statement** (scenarios 2 and 5), and one mislabelled drawing (scenario 4).
- **Fix:**
  - **Mode A**, a fixed probe script with corrected drawings, for short-message and duplicate regressions.
  - **Mode B**, a deterministic, minimally adaptive teacher, for state, loop and regression measurement.
  - Precise labels, with "resolved" defined by evidence.
- **Prompt-example copying.** One verbatim whole-turn copy happened (1.3.11, 6a T6). All three students reproduced the prompt example attributed to their position in the cast (`students[0..2]`). That turn was mis-counted as a regression. It is rare (0 near-verbatim copies in 3,163 pilot replies with the same examples), but the examples carry scenario content and are bound to cast positions.

## 1. The harness as used for 1.3.9–1.3.11

- **Location:** `replay.bench.js` and `analyze.py` / `compare*.py`, in the session scratchpad. **They are not in the repo**, so the benchmark is not reproducible after this session (§8.1).
- **Design:**
  - 6 scenarios × 2 casts × 12 fixed teacher turns.
  - Casts come from a rotation over the 9 personas (`[0, 3, 6] + offset`).
  - The real `getPCKFeedback` → `callAI` path.
  - Drawings attached at 4 turns: s2 T5 and s5 T8 use `public/images/rotated-square.png`; s3 T8 and s4 T8 use `public/images/rotated-parallelogram.png`.
- **The scripts:** every scenario uses the same skeleton:

| turn | move | turn | move |
|---|---|---|---|
| T1 | opening question | T7 | re-ask the T2 question to A (check for understanding) |
| T2 | direct content question to student A | T8 | converse question, or a drawing |
| T3 | probe: `אוקיי` / `יפה` | T9 | probe: `?` / `אוקיי` |
| T4 | "B, what do you think?" | T10 | content question to C |
| T5 | teacher explanation (the misconception is addressed) | T11 | summary request to B |
| T6 | probe: `נכון` | T12 | closing: praise / thanks |

## 2. Audit of scripts and drawings

### 2.1 Drawings

| asset (production file) | what it actually shows | used in the replay as | verdict |
|---|---|---|---|
| `rotated-square.png` | a **square** rotated 45° (sides about 127–130 px, right angles); no diagonals drawn | **s2 T5**: "שרטטתי … מרובע שהאלכסונים שלו מאונכים אבל הוא לא מעוין - זה דלתון" | **Contradiction.** A square *is* a rhombus; its diagonals are perpendicular *and* bisect each other. |
| `rotated-square.png` | same | **s5 T8**: "שרטטתי מרובע שהאלכסונים שלו שווים ומאונכים אבל לא חוצים זה את זה" | **Contradiction.** A square's diagonals do bisect each other. |
| `rotated-parallelogram.png` | a **rectangle** rotated about 20° (sides about 221 × 79 px, angles about 90°); no diagonals | **s3 T8**: "הנה צורה מסובבת … איך תבדקו אם היא מלבן?" | **Correct**, and on purpose: a rotated rectangle. |
| `rotated-parallelogram.png` | same | **s4 T8**: "הנה מקבילית על הלוח. מה תגידו על האלכסון שלה?" | **Mislabelled for this use.** It is a rectangle (a special parallelogram), so students say "it looks like a rectangle". "The diagonal" is not drawn. |

**Production assets are not wrong.** Both files are used only by `src/config/testConfig.js`, the pre/post questionnaire, where they illustrate exactly what they show:
- "הצורה בצד איננה ריבוע כי הוא לא ישר" uses the rotated square;
- "הצורה בצד איננה מקבילית כי יש בה זוויות ישרות" uses a rectangle, which needs right angles.

(The alt text "מקבילית מסובבת" is technically true.) **No production change is proposed;** the replay should use its own assets (§5).

### 2.2 Unanswered student questions (measured)

**Method:** a scripted turn counts as following an open question when, in the preceding student turn, a reply had a sentence ending in "?" with an interrogative (למה / איך / מה ההבדל / מה עוד / …), excluding pure tag questions. Counts are out of 6 conversations per scenario-turn (3 versions × 2 casts).

| scenario | turns where most runs (≥ 4/6) followed an open question | none of these turns answers it |
|---|---|---|
| 1 (square / rectangle) | T4 (4/6) | T4 asks B for an opinion instead |
| 2 (rhombus / perpendicular diagonals) | T5 (4/6), **T6 (6/6)**, **T7 (5/6)**, **T11 (6/6)** | T6 is `נכון`, T7 a re-ask, T11 a new yes/no question. "What else is needed?" is never answered before T11. |
| 3 (rectangle prototype) | none ≥ 4; T4, T5, T9, T10 at 3/6 | "How do I check the angles when it's rotated?" (asked after T8) is never answered |
| 4 (diagonals bisecting angles) | none ≥ 4; T10 at 3/6 | "Why only rhombus and square?" (from T5) is never answered; T10 asks a *student* the same "why" |
| 5 (square from diagonals) | **T6 (5/6)**, **T9 (6/6)**, **T10 (6/6)**, T11 (4/6) | after the contradictory T8 drawing, "how can they be equal and perpendicular but not bisect?" is never answered |
| 6 (kite / rhombus) | T7 (4/6) | "What is the difference between a kite and a rhombus?" is never answered |

**Overall:** 121 of 396 scripted turns (31%) followed a pending open question. **No scripted turn answers a student question.** Only T5 explains, and it addresses the scenario's misconception, not the questions asked.

### 2.3 Issue table and the bias each one introduces

| # | issue | where | semantic loops | regressions | premature correctness | contamination |
|---|---|---|---|---|---|---|
| H1 | Student questions never answered; the script advances | all scenarios; §2.2 | **inflates.** Re-asking an unanswered question is reasonable. | — | — | slight: peers echo the open question |
| H2 | Validating probes `נכון` (T6) and `יפה` (T3) confirm whatever was said, including a stated misconception. PCK then predicts `misconception_reinforced`, and the student prompt says to "accept it with more confidence". | T3 in s2, s4, s6; T6 everywhere | — | **inflates.** A "regression" can be the student following an apparent teacher validation. | — | inflates: a validated claim spreads to peers |
| H3 | Contradictory drawing (square shown as "a kite, not a rhombus") | s2 T5 | inflates ("but it looks like a rhombus") | inflates | — | — |
| H4 | Contradictory drawing (square shown as "diagonals not bisecting") | s5 T8 | **inflates** (5b T8–T11 loop) | **inflates** (5a T9 יובל) | — | — |
| H5 | Mislabelled drawing (rectangle called "parallelogram"; "its diagonal" not drawn) | s4 T8 | inflates ("looks like a rectangle", "which diagonal?") | mild | — | — |
| H6 | The script assumes a prior answer exists: "{B}, מה דעתך על מה שנאמר / על התשובה / את מסכים?" | T4 in s1, s2, s6 | — | — | — | **inflates:** B is pushed to react to A, so agreeing looks like adopting A's claim. Fails when T3 had no reply (3a in 1.3.10). |
| H7 | Re-asked T2 question (T7, "אז עכשיו - …?") and a "?" probe (T9) invite restating an answer | T7 and T9 everywhere | **inflates** unless restatement after a re-ask counts as requested | — | — | — |
| H8 | `?` probe is ambiguous (repeat? elaborate? confused?) | T9 in s1, s3, s5 | inflates | — | — | — |
| H9 | Closing praise ("יפה מאוד, כל הכבוד") after a possibly wrong summary | T12 | — | can mask an unresolved misconception | — | — |
| H10 | Cast rotation does not guarantee a misconception carrier. High-baseline personas are often A or B and answer correctly at T2. | casts | — | — | **inflates** at class level | — |
| H11 | T10 asks a student "why" (s4) instead of the teacher explaining; the reason is never given | s4 T10 | inflates (4a "why" ×4–5) | — | — | — |
| H12 | Single run per version, PCK trajectories differ (positive turns: 9 / 53 / 41 in 1.3.9 / 1.3.10 / 1.3.11) | all | noise | noise | noise | noise |
| H13 | Harness lives only in the session scratchpad; the review was one reviewer | — | reproducibility | reproducibility | — | — |
| H14 | Prompt examples copied (§6) | 1.3.11 6a T6 | — | **mis-counted** as regression (6a T6 תמר) | — | looks like cross-scenario contamination |

### 2.4 1.3.11 findings re-read under the corrected view

| 1.3.11 finding (`student_stability_replay.md` §10.5) | explanation | counts as a student defect? |
|---|---|---|
| Loop 4a T5–T12 "למה דווקא במעוין וריבוע?" | H1 / H11: the question is never answered, and T10 asks a student instead | no: justified repetition |
| Loop 2a T6–T10 (kite vs rhombus; "what else?") | H1: unanswered until T11's yes/no question | no: justified |
| Loop 2b T7–T9 "צריך גם שיחצו… זה מספיק?" | H1 / H7: a confirmation request never confirmed, plus a re-ask | no: justified |
| Loop 5b T8–T11 | H4: contradictory drawing | no: artefact |
| Regression 2b T6 דנה | H2: an ambiguous `נכון` right after her own question | not established |
| Regression 6a T6 תמר | H14: a reversed copy of prompt EXAMPLE 1 | no: example copying (a separate defect) |
| Regression (artefact) 5a T9 יובל | H4 | no: artefact |

**What remains as genuine student-model signals in 1.3.11:**
- 1 invented attribution (2b T8);
- the prompt-example copy;
- persona-consistent persistence, which is not a defect.

**This does not show that semantic loops are absent.** It shows that the current harness cannot measure them.

## 3. Corrected benchmark design

### 3.1 Two modes

| | **Mode A: probe benchmark** | **Mode B: adaptive lesson benchmark** |
|---|---|---|
| purpose | Regression check for short-message handling (1.3.10) and the duplicate guard (1.3.11); comparable to the 1.3.9–1.3.11 numbers | Measuring state, loops, regressions, premature correctness and contamination (explicit-state experiments) |
| teacher | the fixed 12-turn scripts (unchanged texts) | the same 12-turn plan, plus deterministic answer and gating rules (§3.2) |
| drawings | **corrected** benchmark assets (§5) | same corrected assets |
| primary metrics | exact / near duplicates, replay turns, closings and acknowledgements, duplicate-guard telemetry | §4 labels; semantic loops counted only when not justified |

Mode A keeps the probes (`אוקיי`, `נכון`, `?`, closings) on purpose: they are the stimuli whose handling is being regression-tested. Its loop and regression numbers should no longer be reported as student defects.

### 3.2 Mode B: deterministic, minimally adaptive teacher

The lesson plan stays fixed: the same 12 moves in the same order, so the pedagogical progression and the T5 intervention are preserved. Before each scripted move the harness applies deterministic rules to the previous student turn:

1. **Detect pending questions.** A sentence ending in "?" with an interrogative (למה, איך, מה ההבדל, מה עוד, מה כן, מה זה, מה צריך, מה התנאי, מה ההגדרה, מה המיוחד, איזו, האם, אז מה, מה הקשר). A pure tag question ("…, נכון?") is a claim, not a question.
2. **Map the question to the scenario's answer bank** (§3.3) by keyword patterns, in bank order:
   - **Staging:** each entry has an *earliest turn* for the full answer. Before that turn the teacher gives a **hint**, so that answering does not pre-empt the planned discovery (s2 "what else?" before T8; s4 "why?" before T10; s1 "is every rectangle a square?" before T8; s5 "what else?" before T5).
   - **Each answer is given at most once.** If a question's full answer was already given, the question is **not answered again**. It is logged as `repeat_of_answered`, and its repetition is a loop candidate.
   - **Unmatched question:** a **generic answer**, a restatement of the scenario's key fact, at most once per student.
3. **Compose the teacher turn.**
   - **Scripted move is a probe** (`אוקיי`, `נכון`, `יפה`, `?`): it is **replaced** by "{student}, {answer}", and the probe is logged as replaced.
   - **Scripted move is content:** "{student}, {answer} {scripted move}".
   - **Closing:** "{student}, {answer} {closing}".
4. **Validation gate.** If the scripted move is `נכון` or `יפה` and the previous turn contains a scenario misconception claim (a conservative regex per scenario, §3.3), it is replaced by the neutral `אוקיי`. The script never validates a misconception.
5. **Fallback for missing antecedents (H6).** If the previous turn had no reply, "{B}, מה דעתך על מה שנאמר?" becomes "{B}, מה דעתך על השאלה ששאלתי את {A}?".
6. **Log every decision** per turn: pending-question count, template id and stage, addressed student, probe replaced, validation gated, repeat of answered. This log is what makes "justified repetition" computable (§4).

Templates are fixed Hebrew strings. The only data dependency is the student output, so the same student output always produces the same teacher turn, and versions can be compared by template-usage counts as well as by outcomes. No LLM teacher is used: an LLM teacher would make the stimulus differ between versions and would itself need evaluating.

### 3.3 Answer bank (prototype; benchmark-only)

| scen. | key | trigger (regex on the question) | answer (full); *hint before earliest turn* |
|---|---|---|---|
| 1 | DIFF | מה ההבדל, שני שמות, שמות שונים, בנפרד, הגדרות שונות, מה המיוחד | ריבוע הוא מלבן שיש לו גם ארבע צלעות שוות. לכן יש לו את כל התכונות של מלבן, ועוד תכונה אחת. |
| 1 | RECT_SQUARE (T8) | כל מלבן…ריבוע; מלבן (לא) יכול להיות / הוא ריבוע | לא כל מלבן הוא ריבוע: מלבן שצלעותיו 3 ו-5 הוא מלבן, אבל לא כל צלעותיו שוות. *Hint: נגיע לזה עוד מעט: חשבו אם יש מלבן שאין לו ארבע צלעות שוות.* |
| 1 | DEF / CROOKED | מה ההגדרה; עקומ, לא ישרה | מלבן הוא מרובע שכל זוויותיו ישרות. / אם אחת הזוויות אינה ישרה, הצורה אינה מלבן, וגם לא ריבוע. |
| 2 | WHAT_ELSE (T8) | מה עוד, מה כן, מה מספיק, מה התנאי, מה צריך | אם האלכסונים מאונכים וגם חוצים זה את זה, המרובע הוא מעוין. *Hint: חשבו מה ההבדל בין הדלתון שבשרטוט לבין מעוין: מה קורה בנקודה שבה האלכסונים נפגשים?* |
| 2 | KITE_RHOMBUS (T5) | דלתון, ההבדל בין | בדלתון רק אלכסון אחד חוצה את השני. במעוין כל אלכסון חוצה את השני, וכל הצלעות שוות. |
| 2 | NEC_SUF / MEANING_PERP / EQUAL | הכרחי, מספיק; מה (זה אומר) מאונכים; שווים | תנאי הכרחי מתקיים בכל מעוין; תנאי מספיק הוא תנאי שאם הוא מתקיים, הצורה בטוח מעוין. / מאונכים פירושו שהאלכסונים נחתכים בזווית של 90 מעלות. / במעוין האלכסונים לא חייבים להיות שווים; הם שווים רק בריבוע. |
| 3 | HOW_CHECK | (איך / במה) … (בודק, לבדוק, למדוד, לדעת, יודע, בטוח) | בודקים כל פינה במד-זווית או עם פינה של דף: אם כל ארבע הזוויות הן 90 מעלות, זה מלבן, גם כשהוא מסובב. |
| 3 | SQUARE_RECT / LONG | ריבוע…מלבן; ארוך, צר | לריבוע יש ארבע זוויות ישרות, ולכן הוא מקיים את הגדרת המלבן; ההבדל הוא רק שבריבוע כל הצלעות שוות. / ההגדרה לא אומרת כלום על אורך, רק ארבע זוויות ישרות. |
| 4 | WHY (T10) | למה | במעוין כל הצלעות שוות, ולכן האלכסון יוצר שני משולשים חופפים והוא חוצה את הזווית. במלבן ובמקבילית הצלעות הסמוכות לא שוות, אז זה לא קורה. *Hint: נגיע לזה עוד מעט: חשבו מה מיוחד בצלעות של מעוין.* |
| 4 | MEANING / PARALLELOGRAM (T5) | מה זה (אומר) … חוצ; מקבילית, מלבן | אלכסון חוצה זווית אם הוא מחלק אותה לשתי זוויות שוות. / במלבן ובמקבילית האלכסונים חוצים זה את זה, אבל לא את הזוויות; בשרטוט האלכסון מחלק את הזווית לשני חלקים לא שווים. |
| 5 | MEANING | חוצים, נפגשים באמצע, חצי חצי | "חוצים זה את זה" פירושו שנקודת המפגש היא האמצע של כל אחד מהאלכסונים. |
| 5 | WHAT_ELSE (T5) / WHAT_SHAPE (T8) | מה עוד, מה כן, מה צריך…; מה זה כן, איזו צורה | צריך שהאלכסונים יהיו שווים, מאונכים, וגם יחצו זה את זה. *Hint: חשבו איפה האלכסונים נפגשים בריבוע.* / זה מרובע כללי: לא ריבוע, לא מלבן ולא מעוין. |
| 6 | DIFF / ADJ_OPP / PERP | מה ההבדל, מה המשותף, מה המיוחד; סמוכות, נגדיות; מאונכ | במעוין כל ארבע הצלעות שוות; בדלתון מספיק ששני זוגות של צלעות סמוכות שווים. / צלעות סמוכות נפגשות בקודקוד; נגדיות לא נוגעות זו בזו. / גם בדלתון וגם במעוין האלכסונים מאונכים: תכונה משותפת, לא ההגדרה. |

**Key facts (generic answer):**
- s1: מלבן הוא מרובע שכל זוויותיו ישרות.
- s2: אלכסונים מאונכים מתקיימים בכל מעוין, אבל גם בדלתון.
- s3: מלבן הוא מרובע שכל זוויותיו ישרות, בלי קשר למראה.
- s4: רק במעוין ובריבוע האלכסון חוצה את הזווית.
- s5: ריבוע: אלכסונים שווים, מאונכים וחוצים זה את זה.
- s6: דלתון: שני זוגות של צלעות סמוכות שוות.

**Misconception claims gated** (no `נכון` / `יפה` after them):

| scenario | claim |
|---|---|
| s1 | ריבוע לא/אינו מלבן |
| s2 | אם…מאונכים…(זה) מעוין |
| s3 | (חייב / צריך) להיות ארוך |
| s4 | (בכל) מרובע…חוצ…זווי |
| s5 | שווים ומאונכים…(זה) ריבוע |
| s6 | מעוין לא/אינו דלתון |

### 3.4 Offline mechanics check (dry run on the saved 1.3.9–1.3.11 transcripts)

The rules were applied to the 396 scripted teacher turns of the three saved runs: 12 conversations × 11 turns (T2–T12) × 3 versions. The teacher text was computed, not sent.

| outcome | turns |
|---|---:|
| a pending open question in the previous student turn | 121 (31%) |
| answered by a bank entry (specific key) | 56 |
| answered by the generic key-fact answer | 29 |
| question already answered earlier, so not answered again (`repeat_of_answered`) | 26 |
| still unanswered (the generic answer was already used for that student) | 10 |
| probe replaced by an answer | 34 |
| validating ack gated to `אוקיי` | 3 |

**What spot checks of the matches showed:**
- **Specific keys** hit the intended questions. Examples: "איך אפשר לבדוק את הזוויות כשזה ככה?" → HOW_CHECK; "מה זה אומר 'חוצים זה את זה'?" → MEANING; "למה האלכסון לא חוצה את הזווית במלבן?" → WHY (hint at T6).
- **Generic answers** went to vague or meta questions ("מה ההבדל?", "מה זה אומר?", "מה ההבדל בין מה שאתה שואל עכשיו למה ששאלת את רועי?").
- **Two regex gaps found in the first pass were fixed:** "איך אני יודעת…" and "למה מלבן לא יכול להיות ריבוע?".

**Limit:** because a dry run cannot change what students said afterwards, it validates the mechanics only. The first live Mode B run should be inspected template by template before it is used as a baseline (§8.2).

### 3.5 Casts, repetitions and PCK

- **Casts: fixed and designed, not rotated.**
  - Slot A, addressed at T2 and T7, is a **misconception carrier** whose persona tendencies fit the scenario:
    - s1: רועי (false dichotomy) / נועה (prototype);
    - s2: תמר (inverse implication) / רועי (ignores conditions);
    - s3: נועה (prototype, visual);
    - s4: תמר (overgeneralization) / יובל (surface features);
    - s5: רועי (ignores conditions) / תמר;
    - s6: רועי / נועה (visual similarity).
  - Slots B and C mix one high-baseline and one medium- or low-baseline persona.
  - Two casts per scenario. Every version and condition uses the same casts.
- **Repetitions: at least 2 runs per cast per condition** (24 conversations). A paired design: the same casts and plan across conditions.
  - Single runs were not enough: PCK steering alone varied from 9 to 53 positive turns between runs.
- **PCK:** keep the real PCK, since it is part of the system under test. Report its level distribution per condition. When comparing conditions, report outcomes per PCK level as well as in aggregate.

## 4. Behavioural label definitions

Unit: one student reply, labelled in the context of the full conversation and the harness log (§3.2.6).

| label | definition | evidence required |
|---|---|---|
| **Exact duplicate** | The production detector (B26): same student, ≥ 30 normalized characters, equal after normalization or edit similarity ≥ 0.90 to one of the student's earlier replies. | automatic |
| **Semantic repetition** | Not an exact duplicate, but its **main proposition or question** (the claim made, or the thing asked) is the same as one in an earlier reply by the same student, with no new element: no new reason, example, sub-question or change of stance. | manual; candidates pre-selected by edit ≥ 0.5 or Jaccard ≥ 0.5 against the student's earlier replies |
| **Justified repetition** | A semantic repetition of a **question or confirmation request** that the teacher has **not answered** since it was first asked (log: no answer template for it, and no scripted turn that answers it). Also: restating one's answer when the teacher **re-asks the same question** (T7, H7) or explicitly requests a summary or repetition. | harness log + manual |
| **Semantic loop (counted as a defect)** | **≥ 3 semantic repetitions of the same proposition or question by the same student** in one conversation, at least 2 of them **not justified**. That means occurring after the teacher answered the question (`repeat_of_answered`), or after the teacher addressed the claim. | manual, with the log |
| **Resolved misconception** | A student's misconception counts as resolved only if (a) the teacher has addressed it (T5 or an answer template that refutes it), **and** (b) that **same student** afterwards **states or applies the correct idea in their own words** in reply to a **content** question or task (not only "הבנתי", "נכון", "אוקיי", or an echo of the teacher's sentence), **and** (c) does not hedge it in the same reply ("אבל עדיין…", "אני לא בטוח/ה…"). | manual |
| **Misconception regression** | After resolution (as defined above), the same student again states, or acts on, the misconception **without** an intervening cause: a teacher validation of a wrong claim (blocked in Mode B), a contradictory drawing (removed), a teacher statement that could reasonably reintroduce doubt, or a peer re-voicing the misconception that the student explicitly engages with (that is peer influence, label it separately). | manual; record the cause check |
| **Persistent misconception** | A misconception the student holds and **never** resolved under the definition above. Not a regression. A defect only if it continues after ≥ 2 teacher interventions that addressed it directly **and** the student's persona does not explain it (`self-doubt`, `false-dichotomy`, … may legitimately persist). | manual |
| **Premature correctness** | (a) Student level: the **slot-A misconception carrier** gives up the misconception and states the target idea **before T5**, without engaging any teacher hint or peer counter-argument. (b) Class level: **no** student voices the scenario misconception in T1–T4. Peer-mediated change with an explicit reference is "peer resolution", not premature correctness. | manual |
| **Cross-student contamination** | A student adopts another student's specific claim, misconception, example or question **as their own**, without referring to or engaging with that student, **or** attributes to a peer something the peer never said. Agreeing or disagreeing with a named peer, or answering a teacher's "what do you think about X's answer?", is **not** contamination. | manual |
| **Invented / mixed teacher attribution** | "אמרת / הסברת / ציירת…" or a third-person reference to a teacher statement that does not appear in the history (invented), or that distorts one that does (mixed). | regex candidates + manual |
| **Prompt-example copy** (new) | Edit similarity ≥ 0.6 to a student-prompt example message, or a shared 5-word sequence with one. Report verbatim copies (≥ 0.9) separately. A copy is never counted as regression or contamination. | automatic (§6) + manual |

## 5. Drawing and script corrections (benchmark-only)

**New assets.** Each was verified numerically and rendered: SVG, 300 × 300, same palette as the existing images, with the relevant diagonals drawn as dashed white lines.

| asset | geometry (vertices) | verification | replaces |
|---|---|---|---|
| `s2_kite.svg` | A(40,150) B(100,70) C(260,150) D(100,230); both diagonals; right-angle mark | sides 100, 179, 179, 100 (kite, not a rhombus); diagonals 220 and 160, perpendicular; they meet at 0.27 of AC and at **0.50 of BD** (only one is bisected) | s2 T5 `rotated-square.png` |
| `s4_parallelogram.svg` | A(30,220) B(230,220) C(280,120) D(80,120); diagonal AC | sides 200 and 112 (not a rhombus); angle A 63.4° (not a rectangle); AC splits angle A into **21.8° and 41.6°** (visibly not bisected) | s4 T8 `rotated-parallelogram.png` |
| `s5_equal_perpendicular_not_bisecting.svg` | A(40,150) B(100,60) C(260,150) D(100,280); both diagonals; right-angle mark | diagonals **220 and 220** (equal) and perpendicular; they meet at 0.27 of AC and **0.41 of BD** (neither bisected); sides 108, 184, 206, 143 (general quadrilateral, not a square) | s5 T8 `rotated-square.png` |
| `rotated-rectangle.png` | benchmark copy of `rotated-parallelogram.png`, named for what it shows | rectangle about 221 × 79, angles about 90° | s3 T8 (unchanged content, honest name) |

**Teacher text:** with these assets, no teacher sentence needs to change. The s2 T5, s4 T8 and s5 T8 statements become true of their drawings.

**Production:** `public/images/*` and `testConfig.js` stay unchanged, because they are correct for the questionnaire. **No production scenario content is wrong:** `geometry_scenarios.js` has no drawings.

**Where the assets live:** the benchmark assets currently exist only as prototypes in the session scratchpad. They should move to a non-production location, for example `research/simulator_audit/replay_harness/assets/` (§8.1).

**Other script corrections:**
- **Mode B gating and fallbacks:** §3.2 steps 4–5 (H2, H6).
- **H11 (s4 T10 asks a student "why"):** keep the move as a content question, but the WHY answer template (full from T10) ensures the reason is given right after.
- **H9:** the T12 praise stays as the closing probe. Labelling must not treat praise after an unresolved misconception as resolution.

## 6. Prompt-example copying

### 6.1 The event (1.3.11, conversation 6a, T6, teacher `נכון`, PCK `problematic / more_confused`, kite / rhombus lesson)

The student prompt has three example outputs, each attributed to a cast position (`ai.js` `makeProsePrompt`): EXAMPLE 1 → `students[0]`, EXAMPLE 2 → `students[1]`, EXAMPLE 3 → `students[2]`. For cast 6a = [תמר, יונתן, עדי]:

| student (position) | example attributed to that position | reply at 6a T6 | edit similarity |
|---|---|---|---|
| תמר (0) | EX1 "אה עכשיו הבנתי! אז כל ריבוע הוא גם מלבן כי יש לו 4 זוויות ישרות?" | "אז זה אומר שכל **מלבן** הוא גם **ריבוע** כי יש לו 4 זוויות ישרות?" (EX1's frame with the inclusion **reversed**) | 0.64 (shared 5-word sequence) |
| יונתן (1) | EX2 "רגע, אני עדיין לא מבין למה דווקא במעויין האלכסונים מאונכים. מה המיוחד במעויין?" | identical except the spelling מעוין | **1.00** |
| עדי (2) | EX3 "אוקיי, אז אם אני רואה מרובע שהאלכסונים שלו מאונכים, אני יודע שזה מעויין, נכון?" | identical, including the masculine "אני **יודע**" (עדי speaks in the feminine elsewhere) | **1.00** |

**What this was:** a **whole-turn copy of the examples, each bound to its cast position.** It happened under the steering that matches the examples' labels: PCK `more_confused` corresponds to "still confused" (EX2) and "misconception" (EX3). The copied content is off-topic for scenario 6: square / rectangle inclusion and the scenario-2 misconception. The 1.3.11 review counted the EX1 reversal as a "regression" (§2.4).

### 6.2 Elsewhere

Matching criterion: edit similarity ≥ 0.6 to an example, or a shared 5-word sequence.

| corpus | replies | verbatim (≥ 0.9) | frame echoes (0.6–0.9 or 5-gram) | notes |
|---|---:|---:|---:|---|
| replay 1.3.9 | 280 | 0 | 6 | EX3 frame "אז זה אומר שאם אני רואה מרובע ש…, אני (ישר) יודע/ת…" in **scenario 2**, where it is on-topic (0.63–0.74); EX1 phrasing "…כל ריבוע הוא (גם) מלבן כי יש לו 4 זוויות ישרות" in scenarios 1 and 3 (on-topic) |
| replay 1.3.10 | 260 | 0 | 2 | on-topic (s1 EX1 phrasing; s3 "אני עדיין לא מבין" opener) |
| replay 1.3.11 | 269 | **2** (6a T6) | 6 (incl. 6a T6 תמר) | the rest on-topic (s1 / s3 EX1 phrasing, s2 misconception wording) |
| 2×2 short-message experiment | 548 | 0 | 11 | on-topic EX1 / EX3 frames in s1 / s3 contexts |
| re-ask experiment | 305 | 0 | 2 | EX3 frame in s2 / s3 |
| **pilot export** (same three examples in the prompt since 2025-12-31; read-only aggregate) | 3,163 | **0** (≥ 0.85) | not computed | — |

### 6.3 Assessment

- **Verbatim copying is a one-off so far:** one turn among about 2,100 turns across replays, experiments and pilot.
- **But it is a systematic latent risk, not random noise:**
  - **(a) The examples carry lesson content.** EX1 states scenario 1's target insight; EX2 and EX3 encode scenario 2's misconception. In s1, s2 and s3 their phrasing is regularly echoed on-topic, which can raise premature correctness (s1) or shape how misconceptions are worded (s2).
  - **(b) They are bound to cast positions** (`students[0..2]`), so a copy is attributed to a real student.
  - **(c) They use masculine forms.**
  - **(d) Their labels (understood / still confused / misconception) mirror the PCK `understanding_level` steering,** so strong steering can select an example wholesale.
- **The duplicate guard cannot catch this,** because the copy is not of the student's own earlier reply.
- **Recommendation (not implemented):**
  - make the examples content-neutral: no scenario geometry, placeholder names instead of cast positions, and no reusable full sentences;
  - mark them "structure only; never reuse wording";
  - validate with a small A/B on the copy metric and on premature correctness in s1;
  - meanwhile, the harness reports the prompt-example copy metric (§4) and excludes copies from regression and contamination counts.

## 7. Recommended replay protocol for explicit-state experiments

1. **Move the harness into the repo first** (not production): `research/simulator_audit/replay_harness/`.
   - Contents: the bench, Mode A and Mode B scripts, the answer bank, assets, analysis and label tooling, and a README with the exact commands.
   - Today it exists only in a session scratchpad.
2. **Implement Mode B** as in §3.2–§3.3, with the decision log. Then do one **smoke run** (2 conversations) to check templates, gating and logs live.
3. **Baseline:** Mode B on the current production version (1.3.11), **2 runs × 12 conversations** (6 scenarios × 2 designed casts). Report:
   - the §4 labels per conversation and per student: exact duplicates, unjustified semantic loops, justified repetitions, resolved / persistent / regressed misconceptions, premature correctness, contamination, attributions, prompt-example copies;
   - template usage and `repeat_of_answered` counts;
   - PCK level distribution;
   - duplicate-guard telemetry.
4. **Annotation:**
   - Manual labels by one annotator with the harness log open, plus a second annotator on a 25% sample, reporting agreement for "semantic loop" and "resolved / regression".
   - Pre-register the label rules in §4 before looking at state-condition outputs.
5. **Comparison:**
   - Explicit-state condition vs baseline, same casts and plan, paired by conversation.
   - Primary outcomes: unjustified semantic loops, and regressions after genuine resolution, per conversation.
   - Secondary: premature correctness, contamination, attributions, latency, failures.
   - No significance claims from 24 conversations; look for consistent direction across scenarios and both runs.
6. **Mode A** (corrected drawings) stays the regression check for every student-agent version: duplicates, replays, closings, guard telemetry.

## 8. Recommendations

1. **Is the harness ready for state experiments?** **No, not yet.**
   - It needs Mode B (adaptive answers, validation gate, antecedent fallback), the corrected drawings, designed casts, ≥ 2 runs, and the §4 labels.
   - It also needs to be **moved out of the session scratchpad into the repo.**
   - The design and the core mechanics are specified and dry-run-checked here. After implementation, one live smoke run plus a baseline on 1.3.11 make it ready.
2. **Should prompt-example copying be fixed before explicit state?** **Yes, preferably**, as its own small versioned change, measured with the corrected harness. The risk is rare at the verbatim level. But it confounds exactly the labels a state experiment measures: it produced a fake "regression", it echoes scenario content that can look like premature correctness, and it makes copies of other text look like contamination. The fix is cheap (content-neutral, position-free examples), and doing it first keeps the state experiment's baseline clean. If you prefer not to change the prompt yet, the harness's prompt-example metric (§4) must at least exclude such copies from the state comparison.
3. **The next production investigation, after the harness is corrected:** a **design study for explicit per-student state.**
   - Content: a small per-student ledger (open questions asked and answered; claims resolved by the §4 evidence rule; persisting misconception), and who updates it (PCK step, student step, or a separate small call).
   - Interactions: the PCK `student_reaction_hints` and C8 history.
   - Storage: additive A-section contracts.
   - Evaluation: Mode B, measured against the 1.3.11 baseline from step 3 of §7.

   Before building it, the Mode B baseline should first confirm that **unjustified** semantic loops and genuine regressions still occur once the harness stops creating them. If they are rare, explicit state may not be the highest-value next change.

## 9. Limitations

- **One reviewer, no second annotator.** The audit, the re-reading of the 1.3.11 findings, and the answer-bank design are one reviewer's work.
- **The dry run cannot show behaviour.** It checks the deterministic rules against saved outputs only; students would answer differently once the teacher answers.
- **Regex limits.** Question detection and misconception regexes are conservative and Hebrew-pattern-based: they will miss some questions (generic fallback) and some claims (no gate). The live smoke run is needed to tune them.
- **Prototype assets.** The corrected drawings are scratchpad prototypes (SVG, plus Quick Look PNG renderings), not yet committed assets.
- **Prompt-example search is approximate.** It uses string similarity and 5-grams, so paraphrased example reuse below 0.6 is not counted. The pilot check counted only near-verbatim (≥ 0.85) matches.

Supporting scratchpad files (not in the repo):
- `c17/adaptive_teacher.py` (rules, answer bank, dry run);
- `c17/assets/*.svg|png` (corrected drawings);
- `c16/example_copy.py` (example-copy search).
