# Prompt design, output schema, and few-shot candidates

## 1. Final prompt used in the main line

`prompt_version = p1_p4_reduced_v1_template_controlled`, `rubric_version = v2_1`.
Code: `src/pck_feedback/prompts/p1_p4_reduced_core.py::render_reduced_prompt_text` (canonical text) and
`prompts/p1_p4_reduced.py::build_p1_p4_reduced_prompt` (assembly + few-shot insertion). A full rendered
example is in `reports/p1_p4_reduced_task_v1/reduced_prompt_full_example.md`.

Single user message (no system message), sections joined with blank lines, in this order:

1. Role line: "You are a PCK expert analyzing a Hebrew geometry teacher's pedagogical move, offline, on a single teacher turn…"
2. `## General Assessment Guidance`: evaluate the response to an actual error. p1 is relevant only with an actual error in the current or preceding student messages. p4 can be relevant for a targeted task before an error. The score measures the quality of the teacher's move, not the severity of the error.
3. `## Reduced-Task Relevance Clarifications`: relevant means "should be evaluated", and a relevant dimension can score 0. A greeting has both dimensions irrelevant. A pre-error task does not make p1 relevant.
4. `## Boundary Decision Rules`: p1 vs p4.
5. `## Lesson Context`: grade, topic, prior knowledge, likely misconception, pedagogical focus (`baseline_prompt.format_scenario_context`, a port of production `formatScenarioContextForPrompt`).
6. `## Scenario-Specific Misconception Guide`: only the guide matching the lesson (`pck_skills_v2.scenario_guidance_for_prompt`).
7. `## PCK Skills to Assess (p1+p4)`: definitions, "When relevant?", and the 0/1/2 bands with 3 Hebrew patterns each, marked "illustrative, not exact matching rules".
8. *(few-shot only)* `## Fixed Reduced p1+p4 Few-Shot Demonstrations`: inserted **before** the target history.
9. `## Conversation History (Hebrew)`: the **full** history before the current turn, as `מורה:` / `תלמיד:` lines (port of production `formatConversationHistory`). History is never truncated.
10. `## Teacher's Turn to Analyze`: the quoted teacher message.
11. `## Feedback Template Control`: the score-conditioned `מה קיים:` / `המלצה:` rule.
12. `## Required Output Format`: the strict JSON schema plus its rules.

Prompt size [EVAL]: zero-shot prompts were about 2–6.3k tokens (max 6,330). 8-shot prompts reached about 15k tokens (max 15,113).

The five-dimension equivalent is `prompts/baseline_prompt.py::build_template_controlled_prompt` (`baseline_v1_template_controlled`). It has the same structure plus the v2.1 relevance clarifications and p1–p5 boundary rules. It is the better starting point for a production prompt covering all five skills.

## 2. Output schema

```json
{
  "should_provide_feedback": true,
  "dimensions": {
    "p1": {"relevant": true,  "score": 2,    "feedback_text": "מה קיים: ..."},
    "p4": {"relevant": false, "score": null, "feedback_text": null}
  },
  "feedback_text_overall": null
}
```
Rules stated in the prompt:
- When `relevant` is false, `score` and `feedback_text` must be null.
- When `relevant` is true, `score` must be an integer 0, 1 or 2.
- `should_provide_feedback` must be true iff any dimension is relevant.
- `feedback_text_overall` is optional; it is null in all gold data and SFT targets.
- Output must be "STRICT JSON only (no markdown fences or commentary)".

The label-only variant (`p1_p4_label_only_core.py`, Stage A) drops scores and text. It also adds `## Turn Position` ("This is turn N of the conversation.").

## 3. Prompt lessons

Each lesson below is tagged with the kind of evidence behind it.

1. **An explicit score-conditioned template is needed to get the format.** [EVAL-5D-SMALL, EVAL-P1/P4]
   - Without it, Gemini and Gemma base zero-shot had 0% template adherence (`format_and_overprediction_v2_1/format_adherence_by_run.csv`).
   - With it, Gemma base complied fully, but Gemini Flash-Lite still violated the template on 333 dimensions (251/577 turns) zero-shot and 124 dimensions few-shot.
   - Trained models complied 100%.
2. **Few-shot demos teach format, not decisions.** [EVAL-P1/P4]
   - For Gemini, 8 demos cut template failures from 333 to 124, but p1 precision fell from 0.451 to 0.391 and p1 F1 from 0.609 to 0.557.
   - For Gemma, few-shot raised p1 F1 by about 0.03 over zero-shot (null on p4).
   - On an earlier single split, the few-shot vs zero-shot ranking **inverted** between validation and test, and retrieval-selected demos (k = 4/8/12) were judged NO-GO (`protocol_shift_finding.md`, `retrieval_v3_validation_summary.md`).
3. **Explicit "relevance ≠ success" wording matters for p3.** [RESEARCHER rationale; EVAL-5D-SMALL] Rubric v2.1 added the p3 missed-opportunity rule because models marked a failed p3 as irrelevant instead of giving it score 0.
4. **Strict p5 wording reduces p5 over-selection.** [RESEARCHER; EVAL-5D-SMALL, descriptive only] The rule is to require an actual leveraging move, not just an opportunity for one.
5. **Over-selection of dimensions is the default failure of prompt-only models.** [EVAL-5D-SMALL]
   - Gold has a mean of 1.63 dimensions per turn.
   - Prompt-only models selected 3.45 (Gemini zero-shot), 2.76 (Gemini few-shot), 2.03 (Gemma zero-shot) and 1.94 (Gemma few-shot).
   - SFT selected 1.66.
6. **Turn position in the prompt did not help.** [EVAL-P1/P4] Stage A added a turn-number section, and its pre-registered criterion for fixing the late-conversation p1 decline failed (0.7457 → 0.7333).
7. **Hebrew patterns are flagged as illustrative.** [RESEARCHER] This is a deliberate guard against string-matching. It was not ablated.
8. **Gemini emitted ASCII `"` inside Hebrew text and trailing commas** when JSON mode was off. See `failure_modes.md`.

## 4. Few-shot candidates (expert-labeled, template-compliant)

### 4.1 Selection
- All candidates come from the CV3 gold (`data/training/sft/gemma_rubric_v2_1_p1_p4_user_cv3_v1/fold*/eval_turns.jsonl`). Labels were re-checked directly in that file.
- **None was used as a demo in any experiment.** The experiment demo files contain only scores 0 or 1, and their "neither" demos are all turn-1 greetings, so these candidates add coverage the experiments lacked.
- "Consensus" means jointly reconciled by both experts. Single-annotator rows are by Inbal Israel (majority annotator).
- Context caveat: the model sees only the history *before* the teacher turn, while the experts saw the whole conversation.

Recommended core set: **A, B, C, D, E, F** (six). Alternatives are listed at the end for scenario diversity, since A/B/C/F share two rhombus-diagonal conversations.

**A. p1=2, p4=2**
- Source: `session_1781720089323_lyz4m00u3__6`, fold 3, consensus. Scenario: identifying a rhombus from diagonal properties.
- Students: "אז אם האלכסונים מאונכים וגם חוצים את הזוויות, אז זה מעוין?" / "אולי צריך שהאלכסונים גם יהיו שווים באורכם?…"
- Teacher (trimmed): "הילה, הזכרת תכונה נכונה של מעוין… נועה, במעוין האלכסונים לא חייבים להיות שווים באורכם. אלכסונים שווים מתאימים למלבן… עכשיו הסתכלו על נקודת החיתוך של האלכסונים במעוין: כיצד היא מחלקת כל אחד מהאלכסונים?…"
- p1=2: `מה קיים: זיהית את השגיאה של נועה: שוויון בין האלכסונים אינו תנאי למעוין.`
- p4=2: `מה קיים: כיוונת את התלמידים לתכונה החסרה על ידי שאלות מכוונות (האלכסונים חוצים זה את זה)`

**B. p1=1, p4=1**
- Source: `session_1781451387562_qp0wrral6__4`, fold 1, consensus.
- Students: "רגע, אז אם האלכסונים מאונכים, זה אומר שזה מעויין? כי ככה למדנו." / "זה נראה כמו מעויין אם האלכסונים מאונכים."
- Teacher: "רק רגע יובל, כבר הכל יתבהר לך. הצורה ששירטטתי על הלוח היא אכן מעוין! אבל לא סתם מעוין. האלכסונים גם שווים זה לזה! איזו צורה זאת יכולה להיות?"
- p1=1: `מה קיים: זיהית בעקיפין את השגיאה בדברי יובל.\nהמלצה: עצור ושקף את התפיסה שעלתה מדברי התלמידים לפני המעבר להשוואה בין צורות.`
- p4=1: `מה קיים: קידמת את הדיון באמצעות השוואה בין מעוין לריבוע והזמנת את התלמידים לחשוב על הקשר בין תכונות של צורות שונות.\n\nהמלצה: התייחס תחילה לתפיסה השגויה שהציגו התלמידים.`

**C. p1=0 (relevant but missed), p4=1**
- Source: `session_1781451387562_qp0wrral6__5`, fold 1, consensus.
- Student: "רגע, אם האלכסונים שווים זה לזה וגם מאונכים, אז זה ריבוע? ריבוע זה סוג של מעויין?"
- Teacher (trimmed): "אתם צודקים! יש לכם אינטואיציה נפלאה!… עכשיו אשרטט לפניכם צורה נוספת. ניתן לראות כי האלכסונים מאונכים זה לזה גם כאן. אבל האם זה מעוין?"
- p1=0: `המלצה: התלמידים ממשיכים להביע את התפיסה שאלכסונים מאונכים מספיקים לזיהוי מעוין. עצור ושקף את הרעיון החוזר בדברי התלמידים לפני המשך הפעילות.`
- p4=1: `מה קיים: השתמשת בדוגמה נוספת כדי לאתגר את חשיבת התלמידים ולעורר ספק לגבי מסקנתם.\nהמלצה: לאחר הצגת הדוגמה, התייחס במפורש לתפיסה שהעלו התלמידים והובל אותם לבחון אותה מחדש.`

**D. p1=2, p4=0 (identifies the error, then just tells the answer)**
- Source: `rFL4Pcp0l8o1XcuIsSYz__3`, fold 1, Inbal. Scenario: square/rectangle inclusion.
- Student: "אז במלבן רק הצלעות הנגדיות שוות? חשבתי שכל הצלעות שוות..."
- Teacher: "כל הכבוד יובל. ורועי, אל תדאג זה מבלבל בהתחלה, במלבן רק הנגדיות שוות. עכשיו שאלה למחשבה אם בריבוע יש 4 זוויות ישרות, האם הוא בעצם סוג של מלבן?"
- p1=2: `מה קיים: זיהית את הבלבול של רועי.`
- p4=0: `המלצה: נסה לשאול את רועי מה ההגדרה של מלבן. שרטט דוגמאות שונות של מלבנים, ובדוק אם הם אכן מקיימים את הגדרת המלבן.`

**E. p4=2 with p1 N (targeted task before any error)**
- Source: `session_1781720089323_lyz4m00u3__3`, fold 3, consensus.
- Students: "אמרת שהאלכסונים במעוין מאונכים אחד לשני, נכון?" / "האלכסונים גם חוצים את הזוויות של המעוין."
- Teacher: "יפה מאוד! שתיכם הזכרתם תכונות שמתקיימות במעוין. אבל האם כל אחת מהתכונות האלה מספיקה כדי לזהות מעוין? למשל, אם ידוע רק שהאלכסונים של מרובע מאונכים זה לזה, האם אפשר לקבוע בוודאות שהוא מעוין? נסו לחשוב על דוגמה נגדית"
- p1: N
- p4=2: `מה קיים: יצרת באופן מכוון הזדמנות לחשיפת התפיסה השגויה באמצעות שאלה המעודדת את התלמידים לבחון האם תכונה אחת מספיקה לזיהוי מעוין, ואף ביקשת מהם לחשוב על דוגמה נגדית.`

**F. No feedback (mid-lesson, not a greeting)**
- Source: `session_1781451387562_qp0wrral6__10`, fold 1, consensus.
- Student (correct statement): "…אבל אם כל הצלעות שוות, אז זה חייב להיות מעויין."
- Teacher: "נכון מאוד ילדים, אתם אלופים! עכשיו הכל ברור?"
- Gold: `should_provide_feedback=false`, p1 N, p4 N.

**Alternatives**
- `session_1781609069438_vphwsp4c3__4` (p1=2, p4=2, square/rectangle definition vs properties, consensus).
- `session_1781609310273_0x53abgj9__15` (p4=0, p1 N, square/rectangle, consensus): `המלצה: השתמש בשאלתו של יונתן כנקודת פתיחה, ובקש מהתלמידים להסביר כיצד תכונות המלבן מובילות למסקנה שריבוע הוא מקרה פרטי של מלבן.`
- `x8ZD4Z9KfhrFexwDrRvS__9` (p1=0, p4=0, square diagonals, Inbal).
- `session_1781451387562_qp0wrral6__3` (p4=1 pre-error task, consensus).

### 4.2 Caveats for production use
- **No p2/p3/p5 demonstrations exist here.** The demos above have only p1/p4 labels. Five-dimension demo files are `data/few_shot/pck_feedback_fewshot_v2_1.jsonl` (8 shots, p1–p5); they were not re-reviewed for this handoff.
- **These six turns are in the CV eval folds.** Using them as production demos is fine, but they would leak into any re-run of the research CV.
- **[INFERENCE] Evidence on demos is mixed.** Few-shot helped Gemma slightly and hurt Gemini Flash-Lite's p1 precision, so treat demos as a format aid. Include a no-feedback demo (F) and a p1-N/p4-relevant demo (E) to counter p1 over-assertion. Measure the effect before adopting.
- **Prompt cost.** Eight demos took the prompt from about 6k to about 15k tokens. Six short demos with trimmed history should add roughly 3–5k tokens [INFERENCE].
