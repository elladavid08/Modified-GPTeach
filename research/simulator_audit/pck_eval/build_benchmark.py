#!/usr/bin/env python3
"""Builds the frozen PCK evaluation benchmark (pck_eval_benchmark.json). Research only; synthetic data only.

Provenance script: the committed JSON fixture is the frozen artifact. Rebuilding needs the git-ignored analysis
captures of the Mode B baseline runs (`aligned.json` per version: every turn of
replay_harness/results/B-baseline-1.4.{0,1}-run{1,2} with the PCK analysis that was captured for it).
Pass their paths with --c140 / --c141.

Labels are written by hand from the expert v1 rubric (server/universal_pck_skills.js) and the B200 handoff
definitions / boundary rules (research/b200_handoff/pck_and_feedback_rules.md §2-§4). They are never taken from
model output. Recorded PCK analyses are used only to rebuild the feedback history that production would send (input
context), never as labels. No participant data and no B200-labelled turns are used.

Label scheme (per case):
  expected.should_provide_feedback: true | false | null (null = not asserted)
  expected.skills[skill_id] = {"relevance": "required" | "not_relevant" | "either", "scores": [allowed scores] | None}
    required      the skill must be relevant; if "scores" is given the score must be one of them
    not_relevant  the skill must not be relevant
    either        not asserted (genuinely open, or outside the case's purpose); if "scores" is given and the
                  skill is relevant, its score must be one of them
  expected.constraints: case-level checks, e.g. "no_score_2" (no relevant skill may score 2)
  confidence: "high" (every asserted label follows from the rubric / boundary rules) or "needs_expert_review"
"""
import argparse, hashlib, json, os, sys

SKILLS = ["error-identification", "error-characterization", "diagnostic-interpretation", "adapted-pedagogical-response", "error-leveraging"]
AB = {"EI": SKILLS[0], "EC": SKILLS[1], "DI": SKILLS[2], "APR": SKILLS[3], "EL": SKILLS[4]}
SCENARIOS = {  # harness scenario id -> production scenario (src/config/scenarios/geometry_scenarios.js, index id-1)
    1: ("square-rectangle-inclusion", "יחסי הכלה בין ריבוע למלבן", "ריבוע ומלבן הם שני סוגי מרובעים שונים, ולכן ריבוע אינו מלבן", 7),
    2: ("rhombus-perpendicular-diagonals", "זיהוי מעוין על סמך תכונות האלכסונים", "אם במרובע האלכסונים מאונכים, אז הוא מעוין.", 9),
    3: ("rectangle-visual-prototype", "הגדרת המלבן וזיהוי מלבנים", "מלבן חייב להיות ארוך או להיראות בצורה טיפוסית; אם הוא מסובב או כמעט ריבועי, הוא לא מלבן.", 7),
    4: ("diagonal-angle-bisector-overgeneralization", "תכונות אלכסונים במרובעים שונים", "אלכסון תמיד חוצה זווית.", 9),
    5: ("square-from-diagonals", "זיהוי ריבוע על סמך תכונות האלכסונים", "אם במרובע האלכסונים שווים ומאונכים, אז הוא בהכרח ריבוע.", 9),
    6: ("kite-rhombus-inclusion", "יחסי ההכלה בין דלתון למעוין", "דלתון ומעוין הם שני סוגי מרובעים שונים, ולכן מעוין אינו דלתון.", 9),
}
RUN = {("c140", "r1"): "B-baseline-1.4.0-run1", ("c140", "r2"): "B-baseline-1.4.0-run2", ("c141", "r1"): "B-baseline-1.4.1-run1", ("c141", "r2"): "B-baseline-1.4.1-run2"}

CASES = []


def lab(fb, **sk):
    """fb: decision; sk: EI=("R",[0]) | "N" | "E" | ("E",[0,1]). Unlisted skills default to "E" (not asserted)."""
    skills = {}
    for short, sid in AB.items():
        v = sk.get(short, "E")
        rel, scores = (v, None) if isinstance(v, str) else v
        skills[sid] = {"relevance": {"R": "required", "N": "not_relevant", "E": "either"}[rel], "scores": scores}
    return {"should_provide_feedback": fb, "skills": skills}


def case(cid, src, conv, turn, expected, *, bucket="high", teacher=None, tags=(), rationale, rules=(), constraints=(),
         review=None, prior=None, divergence=None, authored_turns=None, feedback_history=None):
    """authored_turns: hand-written turns appended after the recorded prefix (recorded turns 1..turn-1); the case's
    teacher message is then the turn after them. feedback_history: a synthetic history replacing the recorded one."""
    CASES.append(dict(id=cid, src=src, conv=conv, turn=turn, teacher=teacher, expected=expected, bucket=bucket, tags=list(tags),
                      rationale=rationale, rules=list(rules), constraints=list(constraints), review=review, prior=prior, divergence=divergence,
                      authored_turns=authored_turns, feedback_history=feedback_history))


ALL_N = dict(EI="N", EC="N", DI="N", APR="N", EL="N")
NO_ERR = dict(EI="N", EC="N", DI="N")  # p1-p3 need an actual student error in the current / immediately preceding student turn

# ───────────────────────── General decision cases ─────────────────────────
for cid, conv, t, tag in [("gen-open-s1", "r1-B-s1-d0-r1", 1, "greeting_opening"), ("gen-open-s4", "r1-B-s4-d0-r1", 1, "greeting_opening"),
                          ("gen-open-s5", "r2-B-s5-d1-r1", 1, "greeting_opening")]:
    case(cid, "c140", conv, t, lab(False, **ALL_N), tags=["general", tag, "control"],
         rationale="Opening turn: greeting plus a recall / lesson question, no student has spoken. Greeting = all dimensions N (B200 §3); p1-p3 need an actual student error; a general opening question is not an adapted response to a misconception.",
         rules=["B200-greeting-all-N"], prior="E1 control (X1/X2)")
for cid, conv, t in [("gen-close-s1", "r1-B-s1-d1-r1", 12), ("gen-close-s2", "r1-B-s2-d1-r1", 12), ("gen-close-s3", "r2-B-s3-d0-r1", 12), ("gen-close-s6", "r2-B-s6-d0-r1", 12)]:
    case(cid, "c140", conv, t, lab(False, **ALL_N), tags=["general", "closing", "control"] + (["prior_false_praise"] if cid == "gen-close-s3" else []),
         rationale="Closing praise after a correct student summary / example. No student error; praise is not a pedagogical move on an error; no leveraging move.",
         prior="E1 control; X2 arm B praised gen-close-s3 as error-leveraging 2 in 15/24 calls (A 7/24)" if cid == "gen-close-s3" else "E1 control")
case("gen-procedural-s2", "c140", "r1-B-s2-d0-r1", 8, lab(False, **ALL_N), teacher="לפני שנמשיך, תעתיקו בבקשה את השרטוט מהלוח למחברת.",
     tags=["general", "procedural", "control"], rationale="Pure logistics after correct student answers (T7). No error, no instructional move on a misconception.")
case("gen-summary-request-s1", "c141", "r2-B-s1-d0-r1", 11, lab(False, **ALL_N), tags=["general", "procedural", "control", "prior_contradiction"],
     rationale="Summary request after a correct example. No error; a summary request is not an adapted response to an error and not a leveraging move.",
     prior="1.4.1 Mode B: not shown, but demonstrated_skills listed APR while no skill was relevant (contradictory lists)")

# Correct answer / correct statements + bare acknowledgement (E1 controls, validated in the missed-misconception experiment)
C1 = [("r2-B-s4-d0-r1", 3, "correct answer + יפה"), ("r2-B-s3-d1-r1", 3, "correct inference question + אוקיי"),
      ("r2-B-s5-d1-r1", 3, "hedged correct answer + אוקיי"), ("r2-B-s4-d1-r1", 3, "hedged correct-leaning answer + אוקיי"),
      ("r1-B-s4-d0-r1", 3, "hedged correct answer (a doubt about the misconception) + אוקיי"),
      ("r1-B-s1-d0-r1", 6, "correct restatements + נכון"), ("r1-B-s2-d0-r1", 6, "correct restatements + נכון"), ("r1-B-s3-d0-r1", 6, "correct restatement + נכון"),
      ("r1-B-s6-d1-r1", 6, "correct restatement + נכון"), ("r2-B-s6-d1-r1", 6, "correct restatements + נכון"),
      ("r1-B-s6-d0-r1", 9, "correct statements + אוקיי"), ("r2-B-s6-d1-r1", 9, "correct statements + אוקיי"), ("r1-B-s2-d1-r1", 9, "correct statements + אוקיי"),
      ("r2-B-s5-d0-r1", 9, "correct statements + ?")]
PRIOR_C1 = {("r1-B-s4-d0-r1", 3): "X1 B′ 8/12 and X2 arm B 22/24 shown as a missed error-identification (false error); A 5/24",
            ("r2-B-s5-d0-r1", 9): "X2 arm B praised the bare '?' (error-leveraging 2, borrowed counterexample) 14/24; A 1/24",
            ("r1-B-s1-d0-r1", 6): "1.4.0 Mode B: demonstrated_skills listed APR while no skill was relevant (contradictory lists)"}
for conv, t, label in C1:
    sc = conv.split("-")[2]
    tags = ["general", "correct_answer_ack", "control", "EI_no_error"]
    if "?" in label: tags.append("prior_false_praise_qmark")
    if "hedged" in label: tags.append("hedged_correct")
    case(f"ctl-correct-{sc}-{conv[:2]}{conv.split('-')[3]}-T{t}", "c140", conv, t, lab(False, **ALL_N), tags=tags,
         rationale=f"{label}. The immediately preceding student turn contains no error, so p1-p3 are N (rubric v1 trigger and B200 §3); a bare acknowledgement is not an instructional move (p4 N) or a leveraging move (p5 N).",
         prior=PRIOR_C1.get((conv, t), "E1 control (X1/X2)"))

# Genuine student questions + acknowledgement
case("ctl-question-s1-r1d0-T9", "c140", "r1-B-s1-d0-r1", 9, lab(False, **ALL_N), tags=["general", "genuine_question_ack", "control", "prior_false_praise_qmark"],
     rationale="Correct tag question and correct statements, then a bare '?'. No error; '?' is not an instructional or leveraging move.",
     prior="X2 arm B: praised as APR 2 quoting an earlier teacher question, 11/24; A 0/24")
case("ctl-question-s5-r1d0-T6", "c140", "r1-B-s5-d0-r1", 6, lab(False, **ALL_N), tags=["general", "genuine_question_ack", "control"],
     rationale="A correct claim and a correct tag question ('צריך את כל שלושת התנאים ביחד, נכון?') + 'אוקיי'. No error.", prior="E1 control (X1/X2)")
for conv, t in [("r1-B-s6-d1-r1", 9), ("r2-B-s6-d0-r1", 9)]:
    case(f"rev-converse-question-{conv[:2]}{conv.split('-')[3]}-T{t}", "c140", conv, t, lab(None, EC="N", EL="N"), bucket="needs_expert_review",
         tags=["general", "genuine_question_ack", "EI_hedged_question"],
         rationale="A student asks 'אולי גם ההפך נכון? כלומר שכל דלתון הוא מעוין?' (a hesitant leaning question proposing the false converse), another student doubts it; teacher says 'אוקיי'. If the leaning question counts as an error, p1 is relevant with score 0; if it is a genuine question, nothing is relevant.",
         review="Does a hesitant 'maybe the converse is also true?' count as a student error (p1 relevant, 0 after a bare 'אוקיי') or as a genuine question (no feedback)?",
         prior="X1 B′ showed it 9/12 as a missed error-identification; A 0/12")
case("rev-hypothesis-question-s2-r1d0-T9", "c140", "r1-B-s2-d0-r1", 9, lab(None, EC="N", EL="N"), bucket="needs_expert_review",
     tags=["general", "genuine_question_ack", "EI_hedged_question"],
     rationale="Correct tag question; a second student asks 'או שאולי צריך לדעת שהם גם שווים באורכם? רגע, אלכסונים שווים זה במלבן או במעוין?' (an unnecessary extra condition, phrased as a question, plus genuine confusion); a third is correct. Teacher: 'אוקיי'.",
     review="Is a questioning hypothesis that adds an unnecessary condition (equal diagonals for a rhombus) an error that the teacher should identify (p1 = 0), or genuine confusion with no feedback due?")

# ───────────────────────── Missed misconception (E1 targets, 1.4.1) ─────────────────────────
TARGETS = [("r1-B-s2-d0-r1", "hedged reversal with stated reasoning"), ("r1-B-s3-d0-r1", "hedged + tag claim"), ("r1-B-s3-d1-r1", "tag claim by a peer"),
           ("r1-B-s4-d1-r1", "hedged reasoning trailing off"), ("r1-B-s5-d0-r1", "tag claim"), ("r1-B-s5-d1-r1", "tag claim with reasoning"),
           ("r2-B-s1-d0-r1", "hedged direct claim"), ("r2-B-s3-d0-r1", "tag claim"), ("r1-B-s1-d0-r1", "hedged direct claim"), ("r1-B-s1-d1-r1", "hedged direct claim"),
           ("r1-B-s2-d1-r1", "tag claim"), ("r1-B-s6-d0-r1", "question-form claim + 'יפה'"), ("r1-B-s6-d1-r1", "hedged direct claim"),
           ("r2-B-s1-d1-r1", "hedged direct claim"), ("r2-B-s2-d1-r1", "tag claim"), ("r2-B-s5-d0-r1", "tag claim"), ("r2-B-s6-d0-r1", "tag claim"), ("r2-B-s6-d1-r1", "hedged direct claim")]
SILENT_140 = {"r1-B-s2-d0-r1", "r1-B-s3-d0-r1", "r1-B-s3-d1-r1", "r1-B-s4-d1-r1", "r1-B-s5-d0-r1", "r1-B-s5-d1-r1", "r2-B-s1-d0-r1", "r2-B-s3-d0-r1"}
for conv, form in TARGETS:
    sc = conv.split("-")[2]
    tags = ["general", "missed_misconception", "EI_missed"] + (["EI_hedged"] if "hedged" in form else []) + (["EI_tag_question"] if "tag" in form else [])
    case(f"missed-{sc}-{conv[:2]}{conv.split('-')[3]}-T3", "c140", conv, 3, lab(True, EI=("R", [0]), EC="N", DI="E", APR="E", EL="N"), tags=tags,
         rationale=f"A student voiced the scenario misconception ({form}) in the preceding turn and the teacher only acknowledged it. p1 is relevant and the teacher ignored / implicitly accepted the error: score 0 (rubric band 0). p2 / p5 cannot be relevant (no characterisation, no leveraging). p3 / p4: not asserted (B200 v2.1 missed-opportunity rule vs the production chain).",
         rules=["1.4.1-hedged-tag-claims"], prior=("1.4.0 baseline silent; recovered by 1.4.1" if conv in SILENT_140 else "1.4.0 baseline shown") + (" ; 1.4.0 listed APR in missed_opportunities without a relevant APR (contradictory lists)" if conv == "r1-B-s3-d0-r1" else ""))

# Explanations after a misconception (E1 explanation contexts)
for conv, t, extra in [("r2-B-s4-d1-r1", 5, "Dana's claim (immediately preceding) that bisecting diagonals bisect the angles"),
                       ("r2-B-s5-d0-r1", 5, "Dana's claim (immediately preceding) that equal + perpendicular diagonals make a square")]:
    sc = conv.split("-")[2]
    case(f"explain-direct-{sc}-{conv[:2]}{conv.split('-')[3]}-T5", "c140", conv, t,
         lab(True, EI=("R", [1, 2]), EC="E", DI="E", APR=("R", [0, 1]), EL="N"), tags=["general", "explanation_after_misconception", "APR_generic_correct", "score_inflation"],
         rationale=f"The teacher answers {extra} by stating the correct fact. The error is in the immediately preceding student turn, so feedback is due (p1 relevant: the statement contradicts the claim, 1-2). p4: the teacher tells the answer without engaging the student's thinking: band 0 ('gives the correct answer immediately') or at most band 1, never band 2 (no targeted question, counterexample task or activity). p5: a local correction is not leveraging.",
         prior="X1 B′ 1/9 and X2 arm B 8/18 lost this feedback (r2 s4); 1.4.x scores explanations APR 2")
for conv, t, what in [("r1-B-s1-d0-r1", 5, "definition-based explanation ending 'המראה לא משנה, רק ההגדרה'"), ("r1-B-s2-d1-r1", 5, "explanation with a drawn kite and 'תנאי הכרחי למעוין, אבל לא מספיק'"),
                      ("r1-B-s3-d0-r1", 5, "definition-based explanation, 'אין שום דרישה שיהיה ארוך או צר'"), ("r2-B-s6-d1-r1", 5, "definition-based explanation, 'לכן כל מעוין הוא דלתון'")]:
    sc = conv.split("-")[2]
    case(f"rev-explain-{sc}-{conv[:2]}{conv.split('-')[3]}-T5", "c140", conv, t, lab(None, DI="N", APR=("E", [0, 1, 2] if "kite" in what else [0, 1])),
         bucket="needs_expert_review", tags=["general", "explanation_after_misconception", "score_inflation"],
         rationale=f"Scripted {what}. The misconception was voiced two turns earlier; the immediately preceding student turn is already correct-leaning. B200 v2 requires the error in the current or immediately preceding student turn for p1-p3, which would make only p4 (and possibly p2 / p5) relevant.",
         review="(a) How far back may the error be for p1-p3 to be relevant to an explanation turn? (b) Is a definition-based explanation that states the conclusion APR 0 (telling) or 1 (return to definition), and is a teacher-drawn counterexample APR 2? (c) Is a closing general statement ('המראה לא משנה, רק ההגדרה' / 'הכרחי אבל לא מספיק') p2 or p5?",
         prior="E1 explanation; 1.4.x usually scores APR 2")

# Partial / good explanations (authored on real prefixes)
case("gen-partial-explanation-s5", "c140", "r1-B-s5-d0-r1", 5, lab(True, EI=("R", [1, 2]), DI="N", APR=("R", [0, 1]), EL="N"), teacher="לא בדיוק, דנה. צריך עוד תנאי.",
     tags=["general", "partial_explanation", "score_inflation"],
     rationale="After Dana's claim that equal + perpendicular diagonals make a square, the teacher signals the claim is inaccurate ('לא בדיוק', p1 1-2) and says a condition is missing, without engaging her thinking or naming the condition: p4 0-1, not 2. No interpretation, no leveraging.")
case("gen-good-response-s5", "c140", "r1-B-s5-d0-r1", 5, lab(True, DI=("R", [2]), APR=("R", [2]), EL="N"),
     teacher="דנה, את מניחה שאם לריבוע יש שתי תכונות, הן מספיקות כדי לזהות אותו. בואו נבדוק: האם יכול להיות מרובע שהאלכסונים שלו שווים ומאונכים אבל הוא לא ריבוע? נסו לשרטט אחד.",
     tags=["general", "good_explanation", "DI_interprets", "APR_well_adapted"],
     rationale="Articulates the assumption behind the error ('את מניחה ש...', p3 band 2) and gives a targeted counterexample task (p4 band 2: counterexample / active task). p1 / p2 not asserted (implicit identification).")
case("gen-good-explanation-s3", "c140", "r1-B-s3-d0-r1", 3, lab(True, DI=("R", [2]), APR=("R", [1, 2]), EL="N"),
     teacher="נועה, את מתארת את המלבן כמו שהוא מופיע בדרך כלל בציורים – ארוך וצר. אבל ההגדרה של מלבן היא רק שכל הזוויות ישרות; האורך לא משנה. גם ריבוע, וגם מלבן מסובב על הצד, הם מלבנים. מה דעתך עכשיו – האם מלבן חייב להיות ארוך?",
     tags=["general", "good_explanation", "DI_interprets"],
     rationale="Names the source of Noa's belief (the typical drawing: p3 band 2), explains from the definition with two boundary examples and checks back with her: p4 relevant, 1-2 (explanation plus a check question; whether it is 'deep guidance' is a judgment). p1 / p2 not asserted.")

# Peer-directed questions and deferrals
case("rev-peer-redirect-s1-T4", "c140", "r1-B-s1-d0-r1", 4, lab(True, EC="N", DI="N", EL="N"), bucket="needs_expert_review",
     tags=["general", "peer_directed_question", "prior_false_praise_deferral"], constraints=["no_score_2"],
     rationale="Two students just stated the misconception; the teacher asks a peer 'תמר, מה דעתך על מה שנאמר?' without signalling any error. Feedback is due (an unaddressed error in the immediately preceding turn), and a generic redirect cannot be score 2 on any skill.",
     review="Is a generic peer redirect after a misconception p1 = 0 (error not identified), p1 = 1 (implicit invitation to re-examine), p4 = 1 (generic redirect, plan W2.5), or a combination?",
     prior="1.4.x praises peer redirects (APR / error-leveraging 2)")
case("deferral-only-s5-T4", "c140", "r1-B-s5-d0-r1", 4, lab(None, **NO_ERR, EL="N"), teacher="הילה, שאלה טובה, נבדוק את זה עוד רגע.",
     tags=["general", "postponing_question", "prior_false_praise_deferral"], constraints=["no_score_2"],
     rationale="The immediately preceding student turn has only questions ('אז זה לא נכון? מה זאת אומרת?', 'איזה עוד מרובע...'), no error claim, so p1-p3 are N. Postponing a question is not a leveraging move and cannot earn score 2. Whether a deferral itself merits feedback is not asserted.",
     prior="1.4.x praises 'שאלה טובה, נבדוק את זה עוד רגע' as APR / error-leveraging")
case("deferral-only-s4-T3", "c141", "r1-B-s4-d1-r1", 3, lab(None, **NO_ERR, EL="N"), tags=["general", "postponing_question", "prior_false_praise_deferral", "EI_no_error"],
     constraints=["no_score_2"],
     rationale="Students give a hedged correct answer and a correct statement; teacher: 'יובל, שאלה טובה, נבדוק את זה עוד רגע.' No error (p1-p3 N); deferral is not leveraging; no score 2.",
     prior="1.4.1 Mode B: shown as APR 2 + error-leveraging 1")
case("deferral-peer-s2-T4", "c140", "r1-B-s2-d0-r1", 4, lab(None, **NO_ERR, EL="N"), tags=["general", "postponing_question", "peer_directed_question", "prior_false_praise_deferral", "control"],
     constraints=["no_score_2"],
     rationale="Preceding student turn: a correct-leaning question and a correct hypothesis ('דלתון אולי?'). Teacher defers and asks 'את או אתה מסכים?'. No error (p1-p3 N); not leveraging; no score 2.",
     prior="E1 social control; X2 arm B praised it (APR 2 / error-leveraging 2)")
for conv, t, src in [("r1-B-s5-d0-r1", 4, "c140"), ("r1-B-s4-d0-r1", 4, "c140")]:
    sc = conv.split("-")[2]
    case(f"rev-deferral-targeted-{sc}-T4", src, conv, t, lab(None, **NO_ERR, EL="N"), bucket="needs_expert_review",
         tags=["general", "postponing_question", "peer_directed_question", "APR_pre_error", "prior_false_praise_deferral"],
         rationale="Deferral of a student question followed by a planned question to another student that probes the scenario misconception (no error in the immediately preceding student turn).",
         review="Is a planned, misconception-targeted question to a peer (with a deferral) an APR move before an error (B200 v2 allows p4 for a targeted task; plan W1.6 is a product decision), and if so what score?",
         prior="1.4.x: shown with APR 2 and error-leveraging 1 (s4)")

# ───────────────────────── Error Identification ─────────────────────────
case("EI-explicit-s5", "c140", "r1-B-s5-d0-r1", 3, lab(True, EI=("R", [2]), DI="E", APR=("E", [0, 1]), EL="N"),
     teacher="רועי, הטענה שלך אינה נכונה: יש מרובעים שהאלכסונים שלהם שווים והם לא ריבועים.", tags=["EI", "EI_explicit"],
     rationale="Explicitly states the claim is wrong ('הטענה של X אינה נכונה' is a band-2 pattern). The added fact is a correction, not a task: if p4 is assessed it is 0-1.")
case("EI-explicit-telling-s1", "c140", "r1-B-s1-d0-r1", 3, lab(True, EI=("R", [2]), DI="E", APR=("R", [0]), EL="N"),
     teacher="רועי, זה לא נכון. ריבוע הוא כן מלבן, כי יש לו ארבע זוויות ישרות.", tags=["EI", "EI_explicit", "APR_direct_correction", "p1_perp_p4"],
     rationale="p1 = 2 (explicitly wrong). p4 = 0: gives the right answer immediately (the rubric's own band-0 example, 'זה לא נכון. ריבוע הוא מלבן'). B200: noticing is not an adapted response; both are assessed.",
     rules=["B200-p1-vs-p4"])
case("EI-explicit-two-students-s1", "c140", "r1-B-s1-d0-r1", 4, lab(True, EI=("R", [2]), EL="N"),
     teacher="תמר ורועי, שניכם אומרים שריבוע ומלבן הם צורות שונות – זה לא נכון.", tags=["EI", "EI_explicit"],
     rationale="Two students voiced the misconception; the teacher names both and says it is wrong: p1 = 2.")
case("EI-hint-s5", "c140", "r1-B-s5-d0-r1", 3, lab(True, EI=("R", [1]), DI="E", APR=("E", [0, 1]), EL="N"), teacher="רועי, האם זה תמיד נכון לדעתך?",
     tags=["EI", "EI_hint", "score_inflation"], constraints=["no_score_2"],
     rationale="'האם זה תמיד נכון לדעתך?' is the rubric's band-1 p1 pattern (hints without stating). A generic question cannot be p4 band 2.")
case("EI-hint-check-s6", "c140", "r1-B-s6-d0-r1", 3, lab(True, EI=("R", [1]), APR=("E", [0, 1]), EL="N"), teacher="בואו נבדוק את זה.",
     tags=["EI", "EI_hint", "score_inflation"], constraints=["no_score_2"],
     rationale="'בואו נבדוק את זה' is the band-1 p1 pattern; nothing targeted follows, so no skill can be 2.")
case("EI-missed-moving-on-s6", "c140", "r1-B-s6-d0-r1", 3, lab(True, EI=("R", [0]), EC="N", EL="N"), teacher="טוב. בואו נעבור לשאלה הבאה: מה ההגדרה של מעוין?",
     tags=["EI", "EI_missed"], rationale="Roee claimed a rhombus is not a kite; the teacher moves on ('נעבור לשאלה הבאה'): p1 band 0 (ignores the error, moves on).")
case("EI-missed-validating-s3", "c140", "r1-B-s3-d0-r1", 3, lab(True, EI=("R", [0]), EC="N", DI="N", APR=("E", [0]), EL="N"), teacher="נכון, מלבן הוא צורה ארוכה.",
     tags=["EI", "EI_missed"], constraints=["no_positive_score"],
     rationale="The teacher confirms the misconception: p1 band 0 ('reinforces the incorrect statement'). Nothing can be scored above 0.")
case("EI-no-error-praise-s1", "c140", "r1-B-s1-d0-r1", 8, lab(False, **ALL_N), teacher="נכון מאוד רועי, ריבוע הוא מלבן כי יש לו ארבע זוויות ישרות.",
     tags=["EI", "EI_no_error", "control"], rationale="Confirms a correct answer (T7). No student error: all N; ordinary confirmation is not leveraging.")
case("EI-no-error-planned-q-s5", "c140", "r1-B-s5-d0-r1", 2, lab(None, EI="N", EC="N", DI="N", EL="N"), tags=["EI", "EI_no_error", "APR_pre_error", "prior_contradiction"],
     review="Open (not asserted): should a targeted pre-error question get APR feedback (B200 v2, plan W1.6)?",
     rationale="Planned question ('רועי, אם במרובע האלכסונים שווים, האם הוא ריבוע?') after two correct student statements. No student error: p1-p3 N under the rubric v1 trigger and B200. Whether a targeted pre-error question earns APR (B200 v2 / W1.6) is not asserted, so the decision is not asserted.",
     prior="1.4.0 Mode B: shown with error-identification 2 + error-characterization 1, and demonstrated_skills listed APR (not relevant)")
case("EI-no-error-planned-q-s2", "c140", "r1-B-s2-d0-r1", 2, lab(None, EI="N", EC="N", DI="N", EL="N"), tags=["EI", "EI_no_error", "APR_pre_error"],
     rationale="Planned question after a correct statement and a student's general remark that she sometimes confuses diagonals ('לפעמים אני מתבלבלת'), which is not an error claim. p1-p3 N; APR (pre-error task) not asserted.",
     review="Open (not asserted): should a targeted pre-error question ('האם הוא בהכרח מעוין?') get APR feedback (B200 v2, plan W1.6), and with which score?",
     prior="1.4.0 Mode B: shown with error-identification 2 + APR 2")
case("rev-EI-question-form-s4-T2", "c140", "r1-B-s4-d0-r1", 2, lab(None, EL="N"), bucket="needs_expert_review", tags=["EI", "EI_hedged_question", "APR_pre_error", "prior_contradiction"],
     rationale="At T1 Roee asked 'רגע, זה לא ככה בכל מרובע שיש לו אלכסונים?' (a question leaning toward the overgeneralization). The teacher's planned question asks Tamar whether the diagonals of a rectangle bisect its angles.",
     review="Is Roee's leaning question an error that makes p1 relevant, and does the teacher's targeted question identify it (p1 1) or is it a pre-error APR task?",
     prior="1.4.0 Mode B: error-identification 2 + error-characterization 1, demonstrated_skills listed APR (contradictory)")
case("rev-EI-teacher-wrong-s4", "c140", "r1-B-s4-d0-r1", 3, lab(None, EL="N"), bucket="needs_expert_review", teacher="לא, רועי, זה לא נכון. במלבן האלכסונים כן חוצים את הזוויות.",
     tags=["EI", "EI_no_error", "teacher_incorrect_content"],
     rationale="Roee's hedged answer is correct (rectangle diagonals do not bisect the angles); the teacher wrongly 'corrects' it. There is no student error, so B200 relevance makes every skill N, yet the move is mathematically harmful (production has a feedback_trigger 'incorrect_content').",
     review="Should a teacher's incorrect correction of a correct answer get feedback, and under which skill (none, p1, p4), given that there is no student error?")
case("rev-EI-late-readdress-s1", "c140", "r1-B-s1-d0-r1", 7, lab(None, EC="N", EL="N"), bucket="needs_expert_review", teacher="רועי, זוכר שקודם חשבת שריבוע אינו מלבן? זה לא היה נכון.",
     tags=["EI", "EI_late_readdress"],
     rationale="After the misconception was corrected (T5) and the students restated it correctly (T6), the teacher re-mentions the earlier error.",
     review="Is re-addressing an error already corrected earlier a (new) error identification, or N because the immediately preceding student turn has no error (plan W2.4)?")

# ───────────────────────── Error Characterization ─────────────────────────
case("EC-names-type-nec-suff-s5", "c140", "r1-B-s5-d0-r1", 3, lab(True, EI=("E", [1, 2]), EC=("R", [2]), EL="N"),
     teacher="רועי, הפכת את הכיוון: בריבוע האלכסונים שווים, אבל אלכסונים שווים הם תנאי הכרחי ולא מספיק לריבוע – גם במלבן הם שווים.",
     tags=["EC", "EC_characterises"], rationale="Names the specific flaw: necessary but not sufficient (band-2 pattern 'זה תנאי הכרחי אך לא מספיק') and the reversed implication.")
case("EC-names-type-inclusion-s1", "c140", "r1-B-s1-d0-r1", 3, lab(True, EI=("E", [1, 2]), EC=("R", [2]), DI="N", APR=("E", [0, 1]), EL="N"),
     teacher="רועי, ריבוע הוא מקרה פרטי של מלבן – זה יחס הכלה, לא שתי צורות נפרדות.", tags=["EC", "EC_characterises"],
     rationale="Names the inclusion-relation confusion ('ריבוע הוא מקרה פרטי של מלבן' is a band-2 p2 pattern). States the answer, so p4 at most 1.")
case("EC-identifies-only-s6", "c140", "r1-B-s6-d0-r1", 3, lab(True, EI=("R", [2]), EC="N", EL="N"), teacher="רועי, זה לא נכון.",
     tags=["EC", "EC_merely_identifies", "EI_explicit", "over_selection"],
     rationale="Signals 'wrong' only: p1 = 2. B200 v2 p1/p2 boundary: merely signalling wrong is p1; p2 is relevant only if the teacher characterises the error type.",
     rules=["B200-v2-p2-strict"], divergence="production v1 chain: error-characterization becomes due after identification (relevant, score 0)")
case("EC-no-attempt-redirect-s3", "c140", "r1-B-s3-d0-r1", 3, lab(True, EI=("R", [2]), EC="N", APR=("E", [0, 1]), EL="N"), teacher="נועה, זה לא נכון. מישהו אחר רוצה לענות?",
     tags=["EC", "EC_no_attempt", "EI_explicit", "over_selection"],
     rationale="Identifies the error explicitly and hands the question to the class without any characterisation: p1 2, p2 N (B200 v2 strict p2). A generic redirect cannot be p4 2 (p4 0-1 if assessed).",
     rules=["B200-v2-p2-strict"], divergence="production v1 chain: error-characterization relevant, score 0")
case("EC-names-type-inclusion-s6", "c140", "r1-B-s6-d0-r1", 3, lab(True, EI=("E", [1, 2]), EC=("R", [2]), DI="N", APR=("E", [0, 1]), EL="N"),
     teacher="רועי, מעוין הוא מקרה פרטי של דלתון – הם לא שתי משפחות נפרדות של מרובעים.", tags=["EC", "EC_characterises"],
     rationale="Names the inclusion-relation confusion ('X הוא מקרה פרטי של Y', band-2 p2 pattern) for the kite/rhombus misconception. States the answer, so p4 at most 1.")
case("EC-names-overgeneralization-s4", "c140", "r2-B-s4-d1-r1", 5, lab(True, EI=("E", [1, 2]), EC=("R", [2]), DI="N", EL="N"),
     teacher="דנה, זו הכללת יתר: האלכסונים חוצים את הזוויות במעוין ובריבוע, אבל לא בכל מרובע שהאלכסונים שלו חוצים זה את זה.", tags=["EC", "EC_characterises"],
     rationale="Dana just claimed that bisecting diagonals always bisect the angles. The teacher names the error type (overgeneralization, one of the B200 p2 types) and states where the property holds: p2 = 2.")
case("rev-EC-imprecise-s2", "c140", "r1-B-s2-d0-r1", 3, lab(True, EC=("R", [1, 2]), EL="N"), bucket="needs_expert_review", teacher="תמר, נראה לי שאת מערבבת בין תנאי הכרחי לתנאי מספיק.",
     tags=["EC", "EC_characterises", "score_inflation"],
     rationale="Uses the rubric's band-1 p2 pattern ('אתם מערבבים בין תנאי הכרחי למספיק') for an error that is exactly a necessary/sufficient reversal.",
     review="Is 'you are mixing necessary and sufficient conditions' an imprecise characterisation (p2 = 1, as the rubric lists it) or exact for this error (p2 = 2)?")
case("rev-EC-vague-confusion-s3", "c140", "r1-B-s3-d0-r1", 3, lab(True, EI=("R", [2]), EL="N"), bucket="needs_expert_review", teacher="נועה, יש פה בלבול כלשהו לגבי מה זה מלבן.",
     tags=["EC", "EC_merely_identifies"],
     rationale="'יש כאן בלבול' is a band-2 p1 pattern; 'לגבי מה זה מלבן' gestures at a definition confusion without naming it.",
     review="Does 'confusion about what a rectangle is' characterise the error type (p2 = 1) or merely identify it (p2 N)?")

# ───────────────────────── Diagnostic Interpretation ─────────────────────────
case("DI-interprets-visual-s3", "c140", "r1-B-s3-d0-r1", 3, lab(True, DI=("R", [2]), APR="N", EL="N"),
     teacher="נועה, נראה לי שאת מזהה מלבן לפי איך שהוא נראה בציורים הרגילים – ארוך וצר – ולא לפי ההגדרה שלו.", tags=["DI", "DI_interprets"],
     rationale="Articulates the reasoning pattern behind the error (band-2 pattern 'אתם מזהים לפי המראה'). No pedagogical action follows: B200 p3/p4 boundary, understanding the thinking is not p4.",
     rules=["B200-p3-vs-p4"])
case("DI-interprets-reversal-s2", "c140", "r1-B-s2-d0-r1", 3, lab(True, DI=("R", [2]), APR="N", EL="N"),
     teacher="תמר, את אומרת שזה 'עובד גם הפוך' – נראה שאת מניחה שאם לכל מעוין יש אלכסונים מאונכים, אז כל מרובע עם אלכסונים מאונכים הוא מעוין.",
     tags=["DI", "DI_interprets"], rationale="Articulates the underlying assumption ('נראה שאת מניחה ש...', band-2 pattern). No action: p4 N.", rules=["B200-p3-vs-p4"])
case("DI-general-observation-s5", "c140", "r1-B-s5-d0-r1", 5, lab(True, DI=("R", [1]), APR="N", EL="N"), teacher="נראה שאתם מתבססים על תכונה אחת או שתיים.",
     tags=["DI", "DI_general", "score_inflation"], constraints=["no_score_2"],
     rationale="After Dana's claim that equal + perpendicular diagonals make a square: a general observation about the students' thinking (the rubric's band-1 p3 pattern 'נראה שאתם מתבססים על תכונה אחת'), without the specific assumption. No action.")
case("DI-simple-correction-s6", "c140", "r1-B-s6-d0-r1", 3, lab(True, EI=("R", [1, 2]), DI=("E", [0]), APR=("R", [0]), EL="N"),
     teacher="רועי, מעוין הוא כן דלתון, כי יש לו שני זוגות של צלעות סמוכות שוות.", tags=["DI", "DI_simple_correction", "APR_direct_correction"],
     rationale="A direct correction with the reason from the definition. It does not interpret why Roee thinks otherwise, so p3 cannot score above 0 (N or 0 under the v2.1 missed-opportunity rule). p4 = 0: gives the right answer immediately.")
case("rev-DI-missed-warranted-s2", "c140", "r1-B-s2-d0-r1", 3, lab(True, EI=("R", [2]), DI=("R", [0]), APR=("E", [0]), EL="N"), bucket="needs_expert_review",
     teacher="תמר, זה לא נכון. לא כל מרובע עם אלכסונים מאונכים הוא מעוין.", tags=["DI", "DI_missed"],
     rationale="Tamar stated her reasoning explicitly ('אמרת שזה מה שמייחד מעוין, אז חשבתי שזה עובד גם הפוך'); the teacher corrects without addressing it. B200 v2.1 missed-opportunity rule: p3 relevant with score 0 when the turn reasonably calls for interpretation.",
     rules=["B200-v2.1-p3-missed-opportunity"], divergence="production: diagnostic-interpretation relevant only when the teacher attempts it",
     review="Does this turn 'reasonably call for' interpreting the student's thinking (p3 = 0), or is p3 N because the teacher made no attempt?")
case("rev-DI-generic-why-s1", "c140", "r1-B-s1-d0-r1", 3, lab(True, EC="N", EL="N"), bucket="needs_expert_review", teacher="רועי, למה אתה חושב כך?",
     tags=["DI", "DI_general", "EI_hint"], constraints=["no_score_2"],
     rationale="A bare 'why do you think so?' after the misconception. Feedback is due (unaddressed error); a generic question cannot be 2.",
     review="Is 'why do you think so?' an attempt to understand the source (p3), a diagnostic question (p4 1), an implicit hint (p1 1), or several of these?")

# ───────────────────────── Adapted Pedagogical Response ─────────────────────────
case("APR-well-adapted-s1", "c140", "r1-B-s1-d0-r1", 4, lab(True, APR=("R", [2]), DI="N", EL="N"),
     teacher="בואו נבדוק: מלבן הוא מרובע שכל זוויותיו ישרות. רועי, האם לריבוע יש ארבע זוויות ישרות? אז האם הוא מקיים את כל התנאים של מלבן?",
     tags=["APR", "APR_well_adapted"], rationale="Targeted questions that make the student test the square against the definition ('האם ריבוע מקיים את כל התנאים?' is a band-2 pattern).")
case("APR-counterexample-task-s2", "c140", "r1-B-s2-d0-r1", 3, lab(True, APR=("R", [2]), EL="N"),
     teacher="תמר, נסי לשרטט מרובע שהאלכסונים שלו מאונכים אבל הצלעות שלו לא כולן שוות. האם זה אפשרי? מה זה אומר על הטענה?",
     tags=["APR", "APR_well_adapted"], rationale="An active counterexample task aimed at the reversed implication (band 2: counterexamples, active tasks).")
case("APR-partial-definition-s1", "c140", "r1-B-s1-d0-r1", 3, lab(True, EI=("E", [0, 1]), APR=("R", [1]), EL="N"), teacher="רועי, מה ההגדרה של מלבן?",
     tags=["APR", "APR_partial", "score_inflation"], constraints=["no_score_2"],
     rationale="'מה ההגדרה של מלבן?' is the rubric's band-1 p4 pattern (returns to the definition without depth).")
case("APR-partial-rethink-s6", "c140", "r1-B-s6-d0-r1", 3, lab(True, EI=("R", [1]), APR=("R", [1]), EL="N"), teacher="תחשבו שוב.",
     tags=["APR", "APR_partial", "EI_hint", "score_inflation"], constraints=["no_score_2"],
     rationale="'תחשבו שוב' is the band-1 p4 pattern (generic) and an implicit signal of an error (p1 band 1).")
case("APR-partial-rethink-definition-s5", "c140", "r1-B-s5-d0-r1", 3, lab(True, EI=("E", [1]), APR=("R", [1]), EL="N"), teacher="רועי, תחשוב שוב על ההגדרה של ריבוע.",
     tags=["APR", "APR_partial", "score_inflation"], constraints=["no_score_2"],
     rationale="A generic prompt to rethink plus a return to the definition, with nothing targeted (band-1 p4 patterns 'תחשבו שוב' / return to definition). An implicit hint of an error (p1 at most 1).")
case("APR-generic-correct-explanation-s3", "c140", "r1-B-s3-d0-r1", 3, lab(True, EI=("E", [0, 1]), APR=("R", [0, 1]), DI="N", EL="N"),
     teacher="מלבן הוא מרובע עם ארבע זוויות ישרות, הצלעות הנגדיות שלו שוות ומקבילות והאלכסונים שלו שווים וחוצים זה את זה.",
     tags=["APR", "APR_generic_correct", "score_inflation"], constraints=["no_score_2"],
     rationale="Correct but generic: recites properties without addressing Noa's 'long and narrow' belief or engaging her thinking: p4 0-1, never 2. The error is not identified explicitly (p1 0-1 if assessed).")
case("APR-after-missed-EI-validate-s6", "c140", "r1-B-s6-d0-r1", 3, lab(True, EI=("R", [0]), APR=("R", [1, 2]), EC="N", DI="N", EL="N"),
     teacher="נכון, הם נראים שונים. בואו נשרטט מעוין ונבדוק: האם יש לו שני זוגות של צלעות סמוכות שוות?",
     tags=["APR", "APR_after_missed_EI", "p1_perp_p4"],
     rationale="The teacher validates the error ('נכון', p1 band 0) but then sets a targeted task that tests the definition (p4 relevant, 1-2). B200: p1 and p4 are independent; p1 = 0 with p4 relevant occurs in expert gold. A strict chain would wrongly block p4.",
     rules=["B200-p1-perp-p4"], divergence="production chain: 'if skill 1 = 0, give feedback on skill 1 only'")
case("APR-after-missed-EI-ack-s2", "c140", "r1-B-s2-d0-r1", 3, lab(True, EI=("E", [0, 1]), APR=("R", [1, 2]), EC="N", EL="N"),
     teacher="אוקיי. בואו נשרטט על הלוח דלתון ונבדוק מה קורה לאלכסונים שלו.", tags=["APR", "APR_after_missed_EI", "p1_perp_p4"],
     rationale="No explicit identification (p1 0-1: the task is at most an implicit hint), but a targeted counterexample task (p4 relevant, 1-2). p4 must not be blocked by the chain.",
     rules=["B200-p1-perp-p4"], divergence="production chain blocks APR when identification scores 0")
# ───────────────────────── Leveraging the Error ─────────────────────────
case("EL-genuine-principle-s1", "c140", "r1-B-s1-d0-r1", 9, lab(True, **NO_ERR, EL=("R", [2])),
     teacher="שימו לב מה למדנו מהטעות של רועי בהתחלה: כדי לדעת אם צורה שייכת למשפחה של צורות, בודקים אם היא מקיימת את ההגדרה, ולא איך היא נראית. איזה עוד זוג צורות אפשר לבדוק באותה דרך?",
     tags=["EL", "EL_genuine"], rationale="Explicitly turns the earlier error into a general principle (definition over appearance) and asks for transfer to other shapes (p5 band 2). The immediately preceding student turn is correct, so p1-p3 are N.")
case("EL-genuine-nec-suff-s5", "c140", "r1-B-s5-d0-r1", 11, lab(True, **NO_ERR, EL=("R", [2])),
     teacher="הטעות של רועי בהתחלה מלמדת אותנו כלל חשוב: תכונה שיש לכל ריבוע לא בהכרח מספיקה כדי לזהות ריבוע. לכן תמיד נבדוק אם תכונה היא רק הכרחית או גם מספיקה – גם במעוין וגם במלבן.",
     tags=["EL", "EL_genuine"], rationale="Builds a transferable strategy (necessary vs sufficient check) explicitly from the earlier error and extends it to other shapes (p5 band 2).")
case("EL-genuine-definition-s6", "c140", "r1-B-s6-d0-r1", 11, lab(True, **NO_ERR, EL=("R", [2])),
     teacher="הטעות מההתחלה – שמעוין ודלתון 'נראים שונים' – מלמדת אותנו שבגאומטריה מסווגים צורות לפי תכונות ולא לפי מראה. נסו לחשוב באותה דרך: האם ריבוע הוא מעוין? למה?",
     tags=["EL", "EL_genuine"], rationale="Explicitly turns the earlier error into a general classification principle and asks students to transfer it to a new pair (p5 band 2). The preceding student turn is correct (p1-p3 N).")
case("EL-local-correction-s5", "c140", "r1-B-s5-d0-r1", 5, lab(True, EI=("R", [2]), EL="N"), teacher="לא, דנה. גם בדלתון יכולים האלכסונים להיות שווים ומאונכים, אז זה לא בהכרח ריבוע.",
     tags=["EL", "EL_ordinary_correction", "EI_explicit"],
     rationale="Explicit identification ('לא, דנה', p1 2) and a local counterexample. B200 p4/p5 boundary: another local example is not p5.", rules=["B200-p4-vs-p5"])
for src, conv, t in [("c140", "r1-B-s1-d0-r1", 7), ("c141", "r1-B-s1-d1-r1", 7), ("c141", "r1-B-s5-d0-r1", 7), ("c141", "r1-B-s4-d0-r1", 7)]:
    sc = conv.split("-")[2]
    case(f"EL-check-question-{sc}-{src}-{conv[:2]}{conv.split('-')[3]}-T{t}", src, conv, t, lab(None, **NO_ERR, EL="N"),
         tags=["EL", "EL_ordinary_correction", "check_question", "over_selection"] + (["prior_score1_EL"] if src == "c141" else []),
         rationale="A check question after the misconception was corrected; the preceding student turn is correct (p1-p3 N). Checking understanding is not leveraging (p5 strict). Whether a check question is an APR move, and so whether feedback is due, is not asserted.",
         rules=["B200-v2-p5-strict"], prior="1.4.1 Mode B: shown as APR 2 + error-leveraging 1" if src == "c141" else "1.4.x adds error-leveraging rows on check questions")
case("ctl-qmark-s3-c141-T9", "c141", "r1-B-s3-d0-r1", 9, lab(False, **ALL_N), tags=["general", "control", "prior_false_praise_qmark", "over_selection"],
     rationale="A bare '?' after a correct student answer. No error; '?' is not an instructional or leveraging move.", prior="1.4.1 Mode B: shown as APR 2 + error-leveraging 1")
case("rev-EL-analogy-s6", "c140", "r1-B-s6-d0-r1", 8, lab(None, **NO_ERR), bucket="needs_expert_review", teacher="אז מעוין הוא מקרה פרטי של דלתון – קצת כמו ריבוע ומלבן.",
     tags=["EL", "EL_ambiguous"],
     rationale="After correct answers, the teacher connects the result to the square/rectangle relation without referring to the earlier error.",
     review="Is a brief analogy to another inclusion relation p5 = 1 ('begins connecting to a broader idea'), or N because it does not use the error?")
for conv, t, what in [("r1-B-s1-d0-r1", 8, "the converse question 'ומה לגבי ההפך - האם כל מלבן הוא ריבוע?'"), ("r1-B-s1-d0-r1", 10, "'תן או תני דוגמה למלבן שאינו ריבוע'"),
                      ("r1-B-s4-d0-r1", 8, "a new shape on the board ('הנה מקבילית על הלוח. מה תגידו על האלכסון שלה?')")]:
    sc = conv.split("-")[2]
    case(f"rev-EL-activity-{sc}-T{t}", "c140", conv, t, lab(None, **NO_ERR), bucket="needs_expert_review", tags=["EL", "EL_ambiguous", "peer_directed_question"],
         rationale=f"After the misconception was corrected and the students answered correctly, the teacher continues with {what}.",
         review="Does this follow-up activity leverage the earlier error for broader understanding (p5 1-2), is it another local example / APR move, or is nothing relevant (no current error)?",
         prior="1.4.x scores such turns as error-leveraging 1 and APR 2")


# ───────────────────────── Feedback-history continuity (v1.1.0) ─────────────────────────
# Recorded prefix: scenario 5, run 1 cast 0, turns 1-2 (Roee: "אם הם שווים בכל מרובע, זה אומר שזה ריבוע, לא?").
# Turn 3 and the feedback history are hand-written so that exactly one skill was praised on the previous turn.
def _state(level, tone="hesitant"):
    return {"understanding_level": level, "response_tone": tone, "student_reaction_hints": []}
_FH_QUIET = [{"pedagogical_quality": "neutral", "feedback_message_hebrew": "", "predicted_student_state": _state("same", "confident"), "skills_assessment": []},
             {"pedagogical_quality": "neutral", "feedback_message_hebrew": "", "predicted_student_state": _state("same"), "skills_assessment": []}]
_T3_EI = "רועי, הטענה שלך אינה נכונה: יש מרובעים שהאלכסונים שלהם שווים והם לא ריבועים."
_FH_EI = _FH_QUIET + [{"pedagogical_quality": "positive", "feedback_message_hebrew": "זיהית במפורש שהטענה של רועי אינה נכונה – זה זיהוי השגיאה.",
                        "predicted_student_state": _state("same"),
                        "skills_assessment": [{"skill_id": "error-identification", "is_relevant": True, "score": 2, "evidence": "אמרת לרועי במפורש שהטענה שלו אינה נכונה."}]}]
_T3_APR = "בואו נבדוק: האם יכול להיות מרובע שהאלכסונים שלו שווים אבל הוא לא ריבוע? חשבו על מלבן."
_FH_APR = _FH_QUIET + [{"pedagogical_quality": "positive", "feedback_message_hebrew": "הפנית את התלמידים לבדוק דוגמה נגדית (מלבן) – זו תגובה פדגוגית מותאמת.",
                         "predicted_student_state": _state("improved", "thoughtful"),
                         "skills_assessment": [{"skill_id": "adapted-pedagogical-response", "is_relevant": True, "score": 2, "evidence": "שאלת אם יש מרובע עם אלכסונים שווים שאינו ריבוע והפנית למלבן."}]}]
_ROEE_PERSISTS_EI = [{"name": "רועי", "message": "אבל אם האלכסונים שווים, זה עדיין נראה לי כמו ריבוע, לא?"}]
_DANA_NEW_ERROR = [{"name": "רועי", "message": "אה, אז יש עוד מרובעים כאלה? לא ידעתי."},
                   {"name": "דנה", "message": "אז אם האלכסונים שווים וגם מאונכים, זה בטוח ריבוע, לא?"}]
_ROEE_PERSISTS_APR = [{"name": "רועי", "message": "אבל מלבן זה מקרה מיוחד. בדרך כלל אם האלכסונים שווים זה ריבוע, לא?"}]
_CONT = dict(src="c140", conv="r1-B-s5-d0-r1", turn=3)
_CONT_RULES = ["continuity-rule-1", "W1.4-continuity-as-display"]

case("CONT-EI-repeat-same-error", **_CONT, expected=lab(None, EC="N", EL="N"), teacher="רועי, כמו שאמרתי, הטענה הזאת לא נכונה.",
     authored_turns=[{"teacher": _T3_EI, "students": _ROEE_PERSISTS_EI}], feedback_history=_FH_EI,
     constraints=["no_repeat_praise:error-identification"], tags=["continuity", "continuity_repeat_praise"], rules=_CONT_RULES,
     rationale="Error identification was praised on the previous turn for identifying Roee's claim; Roee repeats the same claim and the teacher repeats the same identification. Praising identification again would be redundant (prompt continuity Rule 1). Whether the repeated move merits other feedback is not asserted.")
case("CONT-EI-missed-same-error", **_CONT, expected=lab(True, EI=("R", [0]), EC="N", EL="N"), teacher="אוקיי",
     authored_turns=[{"teacher": _T3_EI, "students": _ROEE_PERSISTS_EI}], feedback_history=_FH_EI,
     tags=["continuity", "continuity_missed_after_praise", "EI_missed", "bare_ack"], rules=_CONT_RULES + ["1.4.1-hedged-tag-claims"],
     rationale="Identification was praised last turn, but Roee now restates the claim (tag form) and the teacher only says 'אוקיי'. Prior praise does not make identification irrelevant: it is a missed identification now (score 0). Rule 1 only forbids repeating *positive* feedback.")
case("CONT-EI-new-error-identified", **_CONT, expected=lab(True, EI=("R", [2]), EL="N"),
     teacher="דנה, גם זה לא נכון – יש מרובעים שהאלכסונים שלהם שווים ומאונכים והם לא ריבועים.",
     authored_turns=[{"teacher": _T3_EI, "students": _DANA_NEW_ERROR}], feedback_history=_FH_EI,
     tags=["continuity", "continuity_new_move", "EI_explicit"], rules=_CONT_RULES,
     rationale="Identification was praised last turn for Roee's error; Dana now voices a different claim (equal + perpendicular diagonals) and the teacher explicitly identifies it. A new error is not 'the same active student error', so identification is evaluable and scores 2.")
case("CONT-EI-new-error-missed", **_CONT, expected=lab(True, EI=("R", [0]), EC="N", EL="N"), teacher="יפה",
     authored_turns=[{"teacher": _T3_EI, "students": _DANA_NEW_ERROR}], feedback_history=_FH_EI,
     tags=["continuity", "continuity_missed_after_praise", "EI_missed", "bare_ack"], rules=_CONT_RULES + ["1.4.1-hedged-tag-claims"],
     rationale="Identification was praised last turn; Dana now voices a new claim (tag form) and the teacher only says 'יפה'. Missed identification: relevant, score 0.")
case("CONT-APR-repeat-same-move", **_CONT, expected=lab(None, EC="N", DI="N", EL="N"), teacher="בואו נבדוק שוב: האם במלבן האלכסונים שווים? האם הוא ריבוע?",
     authored_turns=[{"teacher": _T3_APR, "students": _ROEE_PERSISTS_APR}], feedback_history=_FH_APR,
     constraints=["no_repeat_praise:adapted-pedagogical-response"], tags=["continuity", "continuity_repeat_praise"], rules=_CONT_RULES,
     rationale="The rectangle counterexample move was praised as APR last turn; Roee dismisses it as a special case and the teacher repeats the same rectangle question. Praising the same move again would be redundant. Other feedback (e.g. on not engaging Roee's new objection) is not asserted.")
case("CONT-APR-new-move", **_CONT, expected=lab(True, APR=("R", [1, 2]), EC="N", EL="N"),
     teacher="רועי, אתה אומר שהמלבן הוא 'מקרה מיוחד'. בוא נבדוק עוד מרובע: נסה לשרטט דלתון שהאלכסונים שלו שווים זה לזה. האם הוא ריבוע?",
     authored_turns=[{"teacher": _T3_APR, "students": _ROEE_PERSISTS_APR}], feedback_history=_FH_APR,
     tags=["continuity", "continuity_new_move", "APR_well_adapted"], rules=_CONT_RULES,
     rationale="APR was praised last turn for the rectangle counterexample; the teacher now takes up Roee's new objection with a different, student-performed counterexample (a kite with equal diagonals). This is a new adapted move and must stay evaluable (1-2).",
     divergence="prompt continuity Rule 1 marks a skill already scored >= 1 on the same active error as not relevant, even for a new move")
case("CONT-APR-missed-after-praise", **_CONT, expected=lab(True, EI=("E", [1, 2]), APR=("R", [0]), EC="N", EL="N"),
     teacher="לא, רועי. אלכסונים שווים לא מספיקים כדי שמרובע יהיה ריבוע.",
     authored_turns=[{"teacher": _T3_APR, "students": _ROEE_PERSISTS_APR}], feedback_history=_FH_APR,
     tags=["continuity", "continuity_missed_after_praise", "APR_direct_correction"], rules=_CONT_RULES,
     rationale="APR was praised last turn; when Roee persists, the teacher now just tells him he is wrong and states the rule: a direct correction (APR band 0). Prior praise must not make APR irrelevant here.")


def load(path):
    with open(path) as f:
        return json.load(f)


def analysis_history(cv, turn):
    """The feedback history production would send for `turn`: the last 3 of at most 5 earlier analyses (Chat.jsx)."""
    fh = []
    for t in cv["turns"][: turn - 1]:
        a = t.get("analysis") or {}
        if not a:
            continue
        fh.append({"pedagogical_quality": a.get("pedagogical_quality"), "feedback_message_hebrew": a.get("feedback_message_hebrew", "") if a.get("should_provide_feedback") else "",
                   "predicted_student_state": a.get("predicted_student_state"), "skills_assessment": a.get("skills_assessment") or []})
        fh = fh[-5:]
    return fh[-3:]


def build(c140, c141):
    AL = {"c140": load(c140), "c141": load(c141)}
    out = []
    seen = set()
    for c in CASES:
        if c["id"] in seen:
            sys.exit(f"duplicate id {c['id']}")
        seen.add(c["id"])
        cv = AL[c["src"]][c["conv"]]
        sid = cv["scenarioId"]
        slug, text, focus, grade = SCENARIOS[sid]
        cur = cv["turns"][c["turn"] - 1]
        teacher = c["teacher"] if c["teacher"] is not None else cur["teacher"]
        drawing = None if c["teacher"] is not None else cur.get("drawing")
        history = [{"turn": t["turn"], "teacher": t["teacher"], "teacher_drawing": t.get("drawing"), "students": [{"name": r["student"], "message": r["message"]} for r in t["replies"]]}
                   for t in cv["turns"][: c["turn"] - 1]]
        authored = c["authored_turns"] or []
        for t in authored:
            history.append({"turn": len(history) + 1, "teacher": t["teacher"], "teacher_drawing": None, "students": t["students"]})
        if authored and c["teacher"] is None:
            sys.exit(f"{c['id']}: authored history needs an authored teacher message")
        run_alias, conv_id = c["conv"].split("-", 1)
        exp = c["expected"]
        exp["constraints"] = c["constraints"]
        out.append({
            "id": c["id"],
            "bucket": c["bucket"],
            "confidence": "high" if c["bucket"] == "high" else "needs_expert_review",
            "tags": c["tags"],
            "source": {"kind": "mode_b_turn" if c["teacher"] is None else ("mode_b_prefix_authored_history" if authored else "mode_b_prefix_authored_turn"),
                       "run": RUN[(c["src"], run_alias)], "conversation": conv_id, "turn": len(history) + 1,
                       "recorded_prefix_turns": c["turn"] - 1,
                       "original_teacher_message": cur["teacher"] if (c["teacher"] is not None and not authored) else None},
            "scenario": {"id": sid, "index": sid - 1, "slug": slug, "text": text, "misconception_focus": focus, "grade_level": grade},
            "cast": cv["cast"],
            "history": history,
            "recent_student_turns": history[-1]["students"] if history else [],
            "teacher_message": teacher,
            "teacher_drawing": drawing,
            "feedback_history": c["feedback_history"] if c["feedback_history"] is not None else analysis_history(cv, c["turn"]),
            "feedback_history_kind": "synthetic" if c["feedback_history"] is not None else "recorded",
            "expected": exp,
            "rationale": c["rationale"],
            "rules": c["rules"],
            "production_divergence": c["divergence"],
            "review_question": c["review"] if c["bucket"] != "high" else None,
            "open_question": c["review"] if c["bucket"] == "high" else None,
            "prior_behaviour": c["prior"],
        })
        if c["teacher"] is None and c["src"] == "c140" and cur["teacher"] != teacher:
            sys.exit("teacher mismatch")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--c140", required=True, help="aligned capture of B-baseline-1.4.0-run{1,2}")
    ap.add_argument("--c141", required=True, help="aligned capture of B-baseline-1.4.1-run{1,2}")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "pck_eval_benchmark.json"))
    a = ap.parse_args()
    cases = build(a.c140, a.c141)
    doc = {
        "benchmark": "rambam-pck-eval",
        "version": "1.1.0",
        "created": "2026-10-13",
        "data": "synthetic only (replay-harness Mode B runs + hand-written teacher turns); no participant or B200-labelled data",
        "label_basis": "expert v1 rubric (server/universal_pck_skills.js) + B200 v2/v2.1 relevance and boundary rules (research/b200_handoff/pck_and_feedback_rules.md); decision = any relevant skill",
        "labels_not_from_model_output": True,
        "skills": SKILLS,
        "label_scheme": {
            "should_provide_feedback": "true | false | null (null = not asserted)",
            "relevance": {"required": "must be relevant", "not_relevant": "must not be relevant", "either": "not asserted"},
            "scores": "allowed scores if the skill is relevant (null = score not asserted)",
            "constraints": {"no_score_2": "no relevant skill may score 2", "no_positive_score": "no relevant skill may score above 0",
                            "no_repeat_praise:<skill>": "shown feedback must not display <skill> with a score above 0 (it was already praised for the same move on the same error; relevance itself is not asserted)"},
        },
        "replay": "rebuild history as ChatMessage('Teacher', teacher, 'user', drawingPng) / ChatMessage(student, message, 'assistant'); "
                  "drawings are replay-harness asset ids (lib/assets.js DRAWINGS); scenario = geometry_scenarios.js[scenario.index]; feedback_history as stored (or [] for a no-history variant)",
        "cases": cases,
    }
    body = json.dumps(doc, ensure_ascii=False, indent=1)
    with open(a.out, "w") as f:
        f.write(body + "\n")
    print(f"{len(cases)} cases -> {a.out} sha256 {hashlib.sha256((body + chr(10)).encode()).hexdigest()[:16]}")
