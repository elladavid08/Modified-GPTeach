# PCK skills, relevance/score rubric, and feedback-text rules

Labels: **[EXPERT]** expert/production-provided · **[RESEARCHER]** research-team text · **[EVAL-…]** measured · **[INFERENCE]** mine.

## 1. ID mapping

| research id | production `skill_id` | English | Hebrew |
|---|---|---|---|
| p1 | `error-identification` | Error Identification | זיהוי השגיאה |
| p2 | `error-characterization` | Error Type Characterization | אפיון סוג השגיאה |
| p3 | `diagnostic-interpretation` | Diagnostic Interpretation of Student Thinking | פרשנות אבחונית של חשיבת התלמיד |
| p4 | `adapted-pedagogical-response` | Adapted Pedagogical Response | תגובה פדגוגית מותאמת |
| p5 | `error-leveraging` | Leveraging Error for Learning | מינוף השגיאה ללמידה |

Source: `src/pck_feedback/pck_skills.py` (`PCK_SKILLS`, `SKILL_ID_TO_RESEARCH_ID`).

## 2. Skill definitions and 0/1/2 bands [EXPERT — ported from production `server/universal_pck_skills.js`]

The rubric text below is the v1 port. Rubric v2/v2.1 [RESEARCHER] rewrote some `trigger_description`s
(relevance) and the p5 score descriptions; those changes are noted inline. Full Hebrew pattern lists are in
`pck_skills.py`. The prompt includes only the first 3 patterns per band, and says they are illustrative.

**p1 Error Identification** — teacher recognizes the student statement contains an error/inaccuracy/misconception.
- 0 No identification: ignores the error or reinforces it (e.g. "נכון", moves on).
- 1 Partial/indirect: hints at an error without stating it ("בואו נבדוק את זה", "האם זה תמיד נכון לדעתך?").
- 2 Clear/explicit: states there is an error ("הטענה של X אינה נכונה", "יש כאן בלבול", "זה לא תמיד נכון").
- Relevant (v1 [EXPERT]): only when a student has expressed an error/misconception.

**p2 Error Type Characterization** — teacher identifies the *type* of logical/conceptual error.
- 0 says it's wrong without the type · 1 mentions type imprecisely ("אתם מערבבים בין תנאי הכרחי למספיק") ·
  2 names the specific flaw ("זה תנאי הכרחי אך לא מספיק", "ריבוע הוא מקרה פרטי של מלבן").
- Relevant (v2 [RESEARCHER]): only when an actual error is present **and** the teacher characterizes its type;
  merely signaling "wrong" is p1.

**p3 Diagnostic Interpretation** — teacher understands/tries to understand the *source* of the wrong thinking.
- 0 no attempt · 1 general observation ("נראה שאתם מתבססים על תכונה אחת") · 2 articulates the underlying
  assumption/reasoning pattern ("נראה שאתם מניחים ש...", "אתם מזהים לפי המראה...").
- Relevant (v2.1 [RESEARCHER], "missed-opportunity rule"): an actual student error exists and the turn
  reasonably calls for interpreting it. **If the teacher does not attempt it, p3 stays relevant with score 0.**
  Irrelevant only if no error exists, or the turn is greeting/logistics/task setup before any error.

**p4 Adapted Pedagogical Response** — move adapted to the specific error, not a generic reply.
- 0 Direct correction: gives the right answer immediately, no engagement ("זה לא נכון. ריבוע הוא מלבן").
- 1 Partial guidance: generic question or return to definition without depth ("מה ההגדרה של מלבן?", "תחשבו שוב").
- 2 Deep guidance: targeted diagnostic questions, counterexamples, active tasks ("בואו ניקח דוגמה נגדית",
  "האם ריבוע מקיים את כל התנאים?").
- Relevant (v2 [RESEARCHER]): teacher makes an instructional move adapted to an actual **or likely**
  misconception; a meaningful targeted task can be p4 **before** students err.

**p5 Leveraging Error for Learning** — error used as a resource for broader conceptual understanding.
- v1 [EXPERT]: 0 only corrects · 1 addresses correct+incorrect parts, narrow context · 2 builds general principles.
- v2 [RESEARCHER] score descriptions: 0 addresses local issue only · 1 explicitly begins connecting to a broader
  idea, transfer limited · 2 explicitly builds a general principle / conceptual distinction / transferable strategy.
- Relevant (v2, strict): only when the teacher **actually** leverages the error beyond local correction —
  *not* merely because an opportunity existed.

## 3. Relevance vs. score, and the "N" class

- Each dimension per turn is one of **N** (not relevant) / **0** / **1** / **2**. N is nominal — not "below 0"
  (`reports/p1_p4_reduced_task_v1/p1_p4_joint_4class_evaluation_v1.md`).
- **Relevance means "should be evaluated in this turn"**, not "teacher succeeded". A relevant dimension the
  teacher failed at is **score 0**, not N. [RESEARCHER, v2.1 — `pck_skills_v2_1.RELEVANCE_VS_PERFORMANCE`]
- **Score = quality of the teacher move, not severity of the student error.** A well-handled turn can score 2;
  feedback can then be confirming. [RESEARCHER — `baseline_prompt._general_assessment_guidance`]
- **Decision invariant:** `should_provide_feedback == any(dimension relevant)`. [RESEARCHER; holds in all gold]
- Opening greetings: all dimensions N. [RESEARCHER]
- p1/p2/p3 require an actual student error in the current or immediately preceding student messages. A task
  targeting a *likely* misconception may make p4 relevant but not p1/p2/p3. [RESEARCHER, v2]

### Gold distributions (577 held-out p1/p4 turns) [EVAL-P1/P4]
| dim | N | 0 | 1 | 2 | relevant |
|---|---:|---:|---:|---:|---:|
| p1 | 400 | 65 | 29 | 83 | 177 (30.7%) |
| p4 | 221 | 38 | 224 | 94 | 356 (61.7%) |

Note p1 is bimodal (0 or 2, rarely 1); p4 is dominated by score 1.

## 4. Boundary decision rules [RESEARCHER — `pck_skills_v2.BOUNDARY_DECISION_RULES`]

- **p1 vs p2:** p1 = notices/signals a problem. p2 requires naming the error type (inclusion-relation confusion,
  visual prototype, necessary-vs-sufficient, overgeneralization, definition confusion). "Not accurate / let's
  check / rethink" alone is p1.
- **p2 vs p3:** p2 = *what* the error is; p3 = *why* the student thinks so (assumption, mental image, prior
  knowledge, strategy).
- **p3 vs p4:** understanding the student's thinking is not p4; p4 needs an actual pedagogical action.
- **p4 vs p5:** p4 addresses the local error; p5 explicitly builds transferable understanding. Continuing the
  discussion or another local example is not p5.
- **p1 vs p4 (reduced prompt):** noticing an error alone is not an adapted response; a turn may show either or both.

Scenario-specific misconception guides (6 geometry scenarios: square/rectangle inclusion, kite/rhombus inclusion,
rhombus diagonals, square diagonals, rectangle definition/visual prototype, quadrilateral diagonals) with common
errors and adapted responses: `pck_skills_v2.SCENARIO_GUIDES`, selected by `scenario_guidance_for_prompt()`.

## 5. What feedback text should contain

### 5.1 What exists in the evidence
- **No expert-written guideline for feedback text was found** anywhere in the research tree (docs, config,
  reports, IRR exports). Annotators wrote **one `feedbackText` + one score per selected dimension**; there is no
  separate turn-level text (0/577 gold turns have `feedback_text_overall`).
- The score-conditioned template below is **[RESEARCHER]**, codified from a pattern observed in expert
  annotations, originally to control formatting for BERTScore comparisons
  (`reports/format_and_overprediction_v2_1/proposed_prompt_template_instruction.md`).

### 5.2 The template [RESEARCHER; enforced by `scripts/evaluate_p1_p4_reduced_v1.py::template_issue`]
| score | required structure |
|---|---|
| 2 | `מה קיים:` only (what the teacher did well), no `המלצה:` |
| 1 | `מה קיים:` then `המלצה:` (in that order) |
| 0 | `המלצה:` only (what to do instead), no `מה קיים:` |
| N | `feedback_text = null` |
Plus: Hebrew, short, actionable.

### 5.3 How well experts themselves follow it [EVAL — counts from gold]
- 577 CV eval turns: 484/533 relevant p1/p4 dimensions comply (90.8%). Joint consensus 66/66 (100%).
- By annotator: Inbal Israel ~94% compliant, mean ~106 chars; Otman Jaber ~48%, ~230 chars (he often writes
  both markers regardless of score, or description + inline `המלצה:`).
- Worst cell: p1 score 2 (54/75 compliant) — experts often add a recommendation even to a good move.
- Train/val gold: 49 non-compliant labels kept as-is (`reports/p1_p4_reduced_task_v1/schema_validation_report.md`).
- **[INFERENCE]** The template reflects one expert's (the majority annotator's) style and the consensus
  style; it is a reasonable house style but not an expert-mandated rule. Whether score-2 feedback should
  ever include a recommendation is an open question for the experts.

### 5.4 Content patterns observed in good expert feedback [INFERENCE from reading gold examples]
- Addressed to the teacher in 2nd person ("זיהית", "כיוונת", "נסה לשאול").
- **מה קיים** names the specific move and ties it to the specific student/error ("זיהית את השגיאה של נועה:
  שוויון בין האלכסונים אינו תנאי למעוין").
- **המלצה** gives one concrete next move, usually: reflect/surface the student's idea before moving on,
  ask for the definition, use a counterexample/drawing, ask the student to justify.
- 1–2 sentences per dimension; trained models averaged ~113 chars/dimension vs ~200 for prompt-only models.
- Expert internal note (Otman Jaber, IRR round 2): the purpose of feedback is to surface the parameters that
  most advance the teacher's PCK — i.e. dimension *selection* should favour the most useful point
  (`data/irr_round2_15/irr_round2_15_double_annotations_raw.json`, session_1781610053241_7muz3gh8h turn 10).
