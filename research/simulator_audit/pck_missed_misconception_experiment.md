# PCK silence after a bare acknowledgement of a misconception: investigation and live A/B

Status: experiment only, 2026-10-12, on committed **1.4.0** (`6572594`). PCK model `gemini-3.1-flash-lite`.
- No production change, no `SYSTEM_VERSION` bump.
- Synthetic data only (the 1.4.0 Mode B baseline, `student_stability_replay.md` §12); nothing written to Firestore.

## Summary

- **The problem:** in the 1.4.0 baseline, 8 of 18 genuine "student states a wrong idea → teacher replies only 'אוקיי' / 'יפה'" moments got no feedback (§12.4).
- **These 8 are systematic, not sampling noise:** under the current prompt (A), 7 of them are silent in 6 of 6 repeated calls, and the eighth in 4 of 6. The 10 shown cases are shown in 57 of 60 calls.
- **Why they are missed:** the current prompt contains two rules that can each exclude these turns:
  - Gate 0 lists an acknowledgement ("אוקיי", "נכון") as a *procedural* message and says to decide "before looking at the history";
  - Gate 1 says that "a question contains no claim" and that "I'm not sure" is not an error.

  The silent cases are those where the wrong idea is only implied or packaged as a request for confirmation:
  - an elliptical "כן" / "אז אולי כן?" answer to the teacher's question;
  - "…זה אומר שזה ריבוע, לא?";
  - a peer's error inside a mixed turn.

  The model then reads them as confusion: all 8 have the student hint `persistent_confusion` / `cautious_clarification`, no relevant skill, and quality `neutral`.
- **B (one clarification block) recovers all of them:** missed cases shown **48 of 48** (A: 2 of 48); already-shown cases **60 of 60** (A: 57 of 60), always error-identification relevant with score 0, `problematic`, and the right feedback shape.
- **But B also adds feedback to some non-error turns:**
  - on the 162 control calls: shown 19 → **36**;
  - mostly *positive* praise for "יפה" / "נכון" / "?" after correct answers, and a procedural deferral praised in 6 of 6;
  - 3 negative ones (a hedged *correct* answer flagged once; "אוקיי" after a genuine question 2 of 6).
- **Effect of a deterministic rule, computed offline on the same outputs:** "for a bare acknowledgement, show feedback only when error-identification is relevant with score 0".
  - Bare-acknowledgement controls drop to 1 of 114; the target cases are unchanged (48 of 48, 60 of 60).
  - It also removes A's existing false praise for "נכון" (15 of 84 → 0).
  - One non-bare procedural control remains (6 of 6).
- **Decision:**
  - **B alone is not safe enough** (precision loss).
  - **B + the bare-acknowledgement guard is the recommended next production fix**, after a test-first implementation and one live confirmation (§7).

## 1. The 18 cases

All are T3 of the 1.4.0 Mode B baseline: the scripted bare probe right after the carrier's answer to the direct question (§12.4 of `student_stability_replay.md`). The teacher's T2 is the scenario's direct question.

- **"Form"** describes the incorrect claim:
  - **declarative:** a statement;
  - **hedged:** "נראה לי", "לא בטוח", "אני חושב/ת";
  - **tag:** "…, לא?";
  - **elliptical:** a bare "כן" / "אולי כן" whose wrong content is supplied only by the teacher's question.
- **A** and **B** are the shares of repeated calls that showed feedback in this experiment.

| case | claimant | incorrect claim (form) | teacher | baseline | A | B |
|---|---|---|---|---|---:|---:|
| r1 s2 cast 0 | תמר (addressed) | "אם האלכסונים מאונכים אז כן, לא? … חשבתי שזה עובד גם הפוך" (tag + reported belief; a peer asks a confused question in the same turn) | אוקיי (scripted יפה, neutralized) | silent | 0/6 | 6/6 |
| r1 s3 cast 0 | נועה | "אני חושבת שכן… אם הוא שווה מכל הכיוונים אז הוא כבר ריבוע, לא?" (**elliptical** hedged yes; the tag is on a true side remark) | אוקיי | silent | 0/6 | 6/6 |
| r1 s3 cast 1 | תמר (**a peer**, not the addressed student) | "נראה לי שחייב להיות לו צלע ארוכה וצלע קצרה, לא? אחרת זה סתם ריבוע" (hedged + tag; mixed turn: the addressed יובל and עדי are tentatively correct) | אוקיי | silent | 0/6 | 6/6 |
| r1 s4 cast 1 | יובל | "…זה יוצא 45 ו-45, אז אולי כן?" (**elliptical** hedged yes after a calculation) | אוקיי (scripted יפה) | silent | 0/6 | 6/6 |
| r1 s5 cast 0 | רועי | "אם הם שווים בכל מרובע, זה אומר שזה ריבוע, לא?" (tag, an inference offered for confirmation) | אוקיי | silent | 2/6 | 6/6 |
| r1 s5 cast 1 | תמר | "אם האלכסונים שווים… אז זה אומר שזה ריבוע, לא? כי אמרת שבריבוע האלכסונים שווים!" (tag + justification) | אוקיי | silent | 0/6 | 6/6 |
| r2 s1 cast 0 | רועי | "לא בטוח… ריבוע זה צורה אחרת לגמרי, אז נראה לי שלא" (hedged declarative) | אוקיי | silent | 0/6 | 6/6 |
| r2 s3 cast 0 | נועה | "כן, נראה לי שכן. כלומר, מלבן זה צורה ארוכה כזאת, לא?" (**elliptical** hedged yes + tag) | אוקיי | silent | 0/6 | 6/6 |
| r1 s1 cast 0 | רועי | "לא בטוח… ריבוע הוא סתם ריבוע, לא מלבן" (hedged opener, explicit declarative) | אוקיי | shown | 6/6 | 6/6 |
| r1 s1 cast 1 | נועה | "נראה לי שלא, כי ריבוע נראה שונה ממלבן…" (hedged + stated reason) | אוקיי | shown | 6/6 | 6/6 |
| r1 s2 cast 1 | רועי | "נראה לי שכן… אם האלכסונים מאונכים אז זה מעוין, לא?" (hedged + tag) | אוקיי (scripted יפה) | shown | 6/6 | 6/6 |
| r1 s6 cast 0 | רועי | "מעוין הוא לא מרובע שונה לגמרי? … אז הם לא אמורים להיות שונים?" (rhetorical question) | **יפה** (a validation) | shown | 3/6 | 6/6 |
| r1 s6 cast 1 | נועה | "אני חושבת שלא כי … נראים שונים לגמרי … אז הם צורות שונות, לא?" (hedged + reason + tag) | אוקיי (scripted יפה) | shown | 6/6 | 6/6 |
| r2 s1 cast 1 | נועה | "נראה לי שלא, כי ריבוע נראה שונה ממלבן…" (hedged + reason) | אוקיי | shown | 6/6 | 6/6 |
| r2 s2 cast 1 | רועי | "כן, אם האלכסונים מאונכים אז זה בטוח מעוין, לא?" (firm + tag) | אוקיי (scripted יפה) | shown | 6/6 | 6/6 |
| r2 s5 cast 0 | רועי | "אממ, כן, למה לא? אם האלכסונים שווים זה בטח ריבוע, לא?" (hedged + tag) | אוקיי | shown | 6/6 | 6/6 |
| r2 s6 cast 0 | רועי | "בטח שלא, מעוין זה צורה אחרת לגמרי, לא?" (firm + tag) | **יפה** | shown | 6/6 | 6/6 |
| r2 s6 cast 1 | נועה | "אני חושבת שלא, כי מעוין נראה אחרת לגמרי…" (hedged + reason) | אוקיי | shown | 6/6 | 6/6 |

**Current PCK output** (baseline sample, confirmed by the A repeats):
- **Shown:** `problematic` / `misconception_reinforced`, risk high, trigger `student_misconception_not_addressed`, error-identification relevant with score 0, the claimant hinted `reinforced_acceptance`.
- **Silent:** `neutral` / `same`, risk medium, no trigger, **no relevant skill**, the claimant hinted only `persistent_confusion` / `cautious_clarification`. In two cases APR was listed as missed, but no feedback followed.

**Do the two groups differ as hypothesised?** Partly, and in a more specific way than "hedged or tag".
- Hedging and tags appear in **both** groups (r1 s2 cast 1 and r2 s5 cast 0 are shown and look like r1 s5 cast 0 and cast 1).
- What the silent group has, and the shown group lacks, is a claim in which the student **does not state the wrong proposition as their own belief with a reason**:
  - an elliptical yes/maybe (3);
  - an inference offered for confirmation, "זה אומר ש…, לא?" (3, including r1 s2 cast 0);
  - a peer's error inside a mixed turn (1).
- Every shown case contains an explicit belief or reason ("כי ריבוע נראה שונה", "בטח שלא", "סתם ריבוע, לא מלבן"), or a "יפה" that validates.
- The exception is r2 s1 cast 0 (a hedged declarative, silent).
- Scenarios 3 and 5 account for 5 of the 8 silent cases.

**Why the prompt allows this:**
- **Gate 0** puts "אוקיי" / "נכון" among *procedural* messages ("immediately set should_provide_feedback: false … Do not look at conversation history yet"). Only a later example ("Student error, teacher ignores: 'אוקיי, בואו נמשיך…' → feedback") contradicts it.
- **Gate 1** excludes "a question (questions contain no claim)" and "a student saying 'I'm not sure'".
- An implicit or question-form claim therefore falls into an exception, and the bare acknowledgement into Gate 0.
- The clarification (B) addresses exactly these two points and flips all 8 (§4), which supports this mechanism causally.

## 2. The tested clarification (B)

One block, inserted in Gate 0 directly after the existing "⚠️ IMPORTANT — Questions as pedagogical moves" paragraph and before "If the current message is any of the above ❌ categories → … Stop here.". Nothing else in the prompt changes. It was written once, before any B result was seen, and not tuned.

```
**⚠️ IMPORTANT — A bare acknowledgement of a student's incorrect claim is not a procedural message:**
A student's mathematically incorrect claim counts as a student error even when it is phrased tentatively or hedged (e.g. "נראה לי ש...", "אני חושב ש...", "אז אולי...") or as a tag question that asserts the wrong idea (e.g. "...אז זה ריבוע, לא?"). This is different from a genuine information-seeking question, which contains no claim. If the most recent student turn contains such an incorrect claim and the teacher's current message is only a bare acknowledgement or confirmation such as "אוקיי", "יפה" or "נכון", without identifying or addressing the error, do not stop at Gate 0: this is a missed error-identification opportunity. error-identification is relevant (it must be evaluated) and receives score 0, pedagogical_quality is "problematic", and should_provide_feedback is true (feedback_trigger: "student_misconception_not_addressed"). A bare acknowledgement after a correct answer or a genuine question remains a procedural message with no feedback.
```

It follows the existing rubric and B200 semantics:
- relevance means the skill must be evaluated, not that the teacher succeeded;
- a relevant skill the teacher missed scores 0;
- error-identification requires an actual incorrect claim;
- correct answers and genuine questions keep their no-feedback treatment.

## 3. Method

- **Contexts frozen exactly:** each of the 51 contexts is rebuilt from the recorded 1.4.0 baseline as the harness built it:
  - the same `ChatMessage` history, with drawings;
  - the PCK feedback history (last 3 analyses, message emptied when not shown);
  - the same scenario.

  Each context is sent through the real client `getPCKFeedback` to a local **unmodified** `server/server.js`.
- **Arms:**
  - Arm B's server has an analysis-only preload that inserts the block before the Gate 0 anchor in the PCK request. The anchor is checked to occur exactly once, in both arms.
  - The B prompt is exactly the block longer (31,124 → 32,187 characters); everything else is identical.
- **Contexts:**
  - 8 silent + 10 shown cases, 6 repeats each per arm;
  - 33 controls, 6 repeats each per arm (3 + 3 in two batches):

| control group | contexts | examples |
|---|---:|---|
| correct or correct-leaning answer, then "אוקיי" / "יפה" / "נכון" / "?" | 14 | "יפה" after a self-correction (r2 s4 cast 0 T3); hedged correct answers + "אוקיי" (3); "נכון" after correct restatements following the explanation (5); "אוקיי" / "?" after correct statements (4) |
| genuine (or correct tag) question, then a bare probe | 5 | "אולי גם ההפך נכון?" + "אוקיי" (2); a correct tag question + "?" |
| real explanation (T5) | 6 (3 repeats) | all six scenarios' scripted explanations |
| greeting / closing / procedural | 8 | 3 openings, 4 closings, 1 Mode B deferral "שאלה טובה, נבדוק את זה עוד רגע. הילה, את או אתה מסכים?" |

- **Volume:** 288 calls per arm (576); all valid structured output, all `STOP`, model `gemini-3.1-flash-lite`, 0 thinking tokens.

## 4. Results

### 4.1 Target cases

| | A | B |
|---|---:|---:|
| silent cases: feedback shown | **2 / 48** | **48 / 48** |
| shown cases: feedback shown | 57 / 60 | **60 / 60** |
| error-identification relevant, score 0 (all 108 target calls) | 59 | **108** |
| other skills marked relevant | 0 | 0 |
| quality problematic | 59 | 108 |
| understanding level on the recovered cases | — | misconception_reinforced 33, confused 12, same 3 |

B also stabilises the one flaky shown case (r1 s6 cast 0, "יפה" after a rhetorical question: 3/6 → 6/6).

### 4.2 Controls (6 repeats each, except explanations: 3)

| control group | A shown | B shown | B: error-identification relevant / negative |
|---|---:|---:|---|
| correct answer + bare probe (84) | 15 (all positive praise for "נכון" after the explanation) | **24** | 1 / 1 |
| genuine question + bare probe (30) | 0 | **3** | 0 / 2 |
| explanation (18) | 16 positive | 16 positive | 0 / 0 |
| greeting / closing / procedural (48) | 4 (one closing, positive) | **9** | 2 (scored 2, positive) / 0 |

Controls where B adds feedback:

| context | A | B | what B says |
|---|---:|---:|---|
| "יפה" after the students corrected their own over-generalisation (r2 s4 cast 0 T3) | 0/6 | **4/6** | positive error-leveraging: "חיזקת את התלמידות ברגע שהגיעו להבנה…" |
| procedural deferral + peer question (r1 s2 cast 0 T4; the T3 students only asked questions) | 0/6 | **6/6** | positive APR / error-leveraging ("הפכת את התהייה … למשימת חקירה") |
| "נכון" after correct restatements (r1 s2 cast 0 T6) | 0/6 | 2/6 | positive APR |
| "אוקיי" after "אולי גם ההפך נכון?" (r2 s6 cast 0 T9) | 0/6 | 2/6 | **negative** APR: "הוחמצה הזדמנות … התגובה שלך 'אוקיי' לא קידמה את החקירה" |
| hedged *correct* answer + "אוקיי" (r1 s4 cast 0 T3) | 0/6 | 1/6 | **negative**, error-identification score 0 (a false error) |
| "?" / "אוקיי" after correct statements (3 contexts) | 0–1/6 | 1/6 each | positive; one credits the teacher with an earlier turn's counter-example (anti-hallucination rule broken) |

Openings and closings are unaffected (the closing that A already showed: 4/6 → 3/6). Explanations are unchanged.

### 4.3 Offline check: a deterministic bare-acknowledgement guard

- **The rule:** if the teacher's message, after trimming punctuation, is exactly "אוקיי", "יפה", "נכון" or "?", feedback is shown **only** when error-identification is relevant with score 0. Otherwise `should_provide_feedback` is false.
- **Rationale:** a bare acknowledgement cannot *demonstrate* a PCK skill, so the only valid feedback on it is a missed identification. The rule restates the prompt's own example ("Student correct, teacher confirms → no feedback") in code.
- **Applied to the same 576 recorded outputs:**

| | A | A + guard | B | B + guard |
|---|---:|---:|---:|---:|
| silent cases (48) | 2 | 2 | 48 | **48** |
| shown cases (60) | 57 | 57 | 60 | **60** |
| correct answer + bare probe (84) | 15 | 0 | 24 | **1** (the one false error) |
| genuine question + bare probe (30) | 0 | 0 | 3 | **0** |
| explanations (18) | 16 | 16 | 16 | 16 |
| greeting / closing / procedural (48) | 4 | 4 | 9 | 9 (6 from the non-bare deferral) |

This was not run live. The guard is deterministic post-processing of the returned analysis, so the counts are exact for the show decision. Integration (an emptied message, unchanged student steering) still needs tests.

### 4.4 Feedback text (B, 108 target calls)

- Every message names "זיהוי השגיאה", addresses the teacher in second person, and names at most 2 skills; 104 include a concrete alternative ("יכולת לשאול: 'בואי נבדוק, האם ריבוע מקיים את ההגדרה של מלבן…'").
- The student, the claim and the bare "אוקיי" are usually named correctly ("רועי הציג כשל לוגי שבו הוא מסיק ששוויון אלכסונים מחייב ריבוע, אך הסתפקת באמירה 'אוקיי'").
- **Imprecision:** in the two s3 contexts, about half the messages paraphrase the claim as "ריבוע אינו מלבן", which is implied by the students' words but not what they said. One message calls the students' doubts "מוצדקות" while scoring the turn problematic.

### 4.5 Validity and latency

- 576 of 576 valid structured outputs; 0 parse or schema failures; all `STOP`; 0 thinking tokens.
- First batch (207 calls per arm):
  - PCK latency p50 / p90: A **2.13 / 3.19 s**, B **2.66 / 3.32 s**;
  - output tokens p50: A 312, B 592.

  The difference comes from B producing feedback text much more often on this case-heavy set, not from a slower model. No change in the prompt-input token count beyond the about 1 KB block.

## 5. Interpretation

1. **The 8 misses come from the prompt, not from model noise.**
   - Under A, 7 are never flagged.
   - The prompt's own Gate 0 (acknowledgement = procedural) and Gate 1 (questions or "not sure" are not claims) give the model a rule to follow when the wrong idea is implicit or offered for confirmation.
   - Stating the exception explicitly (B) recovers 48 of 48 with the correct shape, which confirms the mechanism.
2. **B's cost is a loss of precision in *positive* feedback around acknowledgements.**
   - Once told that a bare acknowledgement can merit feedback, the model also *praises* acknowledgements after correct answers and self-corrections. It also once treats a deferral as a pedagogical response to an error from two turns earlier, which is a Gate 1 "most recent student turn" violation.
   - These are wrong messages to a teacher (praise for "יפה"; criticism after a correct student question), so they count as meaningful false positives under the success criterion.
   - None of them is a false *error-identification* except one hedged correct answer (1 of 168 control calls under B).
3. **No obvious wording flaw:** the last sentence of the block already says that an acknowledgement after a correct answer gets no feedback, and the model still praises some. So a second prompt variant was not tried (per the task rules).
   - The over-praise of bare acknowledgements already exists in A ("נכון" after the explanation, 15 of 84).
   - It is a structural fit for a deterministic guard rather than for more prompt text.
4. **Student steering:** under B, the recovered cases now steer students as `misconception_reinforced` (33) or `confused` (12) instead of `same`, the realistic reaction to an unchallenged wrong idea. In the baseline that reaction was the one that kept carriers from drifting toward the answer before teaching (§12.4). This was not measured here (frozen contexts); it needs the Mode B rerun.

## 6. Answers

1. **Why the 8 cases were missed:** the wrong idea is implicit or offered for confirmation (an elliptical "כן" / "אולי כן", "זה אומר ש…, לא?", a peer's error in a mixed turn). The current prompt's Gate 1 exceptions ("questions contain no claim", "not sure") and Gate 0's "acknowledgement = procedural" give 3.1 a rule to classify these turns as confusion plus a procedural reply. It does so consistently: 7 of 8 are 0/6 under A.
2. **A vs B:**
   - **target cases:** silent cases shown 2/48 → **48/48**; shown cases 57/60 → **60/60**; always error-identification score 0, `problematic`, correct feedback shape;
   - **controls:** shown 19/162 → **36/162**;
   - **unchanged:** explanations and openings.
3. **False positives (B):**
   - **positive praise:** for "יפה" after a self-correction (4/6), for a procedural deferral (6/6), for "נכון" / "?" / "אוקיי" after correct statements (1–2/6 each);
   - **negative:** feedback after a genuine converse question (2/6), and one false error-identification on a hedged correct answer (1/6).
   - With the bare-acknowledgement guard, all but the deferral (6/6) and the one false error disappear (bare-acknowledgement controls 27/114 → 1/114).
4. **The exact tested clarification:** §2, verbatim.
5. **Safe enough for a versioned production change?**
   - **Not B alone:** it trades 8 recovered critical moments per 24 conversations for spurious praise or criticism on about 10% of non-error acknowledgement turns.
   - **B together with the deterministic bare-acknowledgement guard: yes, with one confirmation step.**
     - Implement both test-first (prompt-integrity test for the block; unit tests for the guard: missed error shown; praise on a bare acknowledgement suppressed; non-bare messages untouched; message emptied when suppressed; analysis otherwise unchanged).
     - Document the guard in B23 as a second decision normalisation.
     - Run one live check on these 51 frozen contexts, then the 24-conversation Mode B rerun to measure the dynamic effect on students and on later turns. The deferral false positive (r1 s2 cast 0 T4) came from an A-world history and may behave differently once T3 itself shows feedback.
6. **Should this be the next production fix?** **Yes.** It restores the simulator's core feedback at its most important moment (44% of these moments were silent). With the guard it also removes an existing source of unwarranted praise. Its remaining risk is small and measurable.

## 7. Limitations

- Frozen contexts come from A-world histories. In production, the turn after a recovered case will see different feedback history and student steering.
- Controls are drawn from one baseline (6 scenarios); 6 repeats per context.
- One reviewer judged feedback text.
- The guard was evaluated offline only.
- The clarification's Hebrew examples cover the forms seen here; other hedges ("אולי…", "יכול להיות ש…") were not tested separately.

**Files** (scratchpad `c33/`): `clarification.txt`, `pck_arm.cjs` (arm preload), `bench/pck_ab.bench.js`, `contexts.main.json`, `results-{A,B}.jsonl`, `results-{A,B}-extra.jsonl`, `calls-{A,B}.jsonl`, `analyze.py`.
