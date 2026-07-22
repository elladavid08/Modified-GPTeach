"""
PCK skill rubrics, ported from the production taxonomy.

Source of truth (production, JavaScript, untouched by this port):
    server/universal_pck_skills.js

Production uses string `skill_id`s (`error-identification`, ...,
`error-leveraging`). Human annotation / pre-post tests use `p1`-`p5`
(see `src/config/testConfig.js` -> `PCK_SKILLS`). This research pipeline
standardizes on `p1`-`p5` everywhere (schemas, prompts, predictions) so
that model outputs can be compared directly against human annotation /
consensus ground truth, while keeping the underlying rubric text and
scoring criteria faithful to production.

`RUBRIC_VERSION` should be bumped by hand whenever the rubric text,
scoring criteria, or the skill_id <-> p-id mapping changes below. Every
`Prediction` written by `run_inference.py` stamps the `RUBRIC_VERSION`
that was active at run time, independent of `prompt_version`, so that
"prompt changed" and "rubric changed" stay distinguishable across runs.
"""

from __future__ import annotations

from typing import TypedDict

# Bump manually whenever rubric text / scoring criteria / mapping changes.
RUBRIC_VERSION = "v1"


class ScoreBand(TypedDict):
    label: str
    description: str
    hebrew_patterns: list[str]
    examples_hebrew: list[str]


class PCKSkill(TypedDict):
    research_id: str  # p1..p5 (canonical id used throughout this pipeline)
    skill_id: str  # production skill_id (server/universal_pck_skills.js)
    name_en: str
    name_he: str
    description_en: str
    description_he: str
    pedagogical_concept: str
    trigger_description: str
    scoring_rubric: dict[int, ScoreBand]  # keys: 0, 1, 2


# Canonical p1-p5 ordering, matching src/config/testConfig.js PCK_SKILLS order.
PCK_SKILLS: dict[str, PCKSkill] = {
    "p1": {
        "research_id": "p1",
        "skill_id": "error-identification",
        "name_en": "Error Identification",
        "name_he": "זיהוי השגיאה",
        "description_en": (
            "The teacher recognizes that a student's statement contains an "
            "error, inaccuracy, or misconception."
        ),
        "description_he": "המורה מזהה שקיימת טעות או טענה לא נכונה או לא מדויקת בדברי התלמיד",
        "pedagogical_concept": (
            "Error identification is the foundational step before any "
            "remediation. The teacher must demonstrate awareness that the "
            "student's reasoning contains a specific flaw."
        ),
        "trigger_description": (
            "This skill is relevant only when a student has expressed an "
            "error, misconception, or incorrect statement."
        ),
        "scoring_rubric": {
            0: {
                "label": "No identification",
                "description": "Teacher ignores the error or reinforces the incorrect statement",
                "hebrew_patterns": ["נכון", "כן, נכון", "[המורה עובר לנושא אחר]", "[אין תגובה לטעות]"],
                "examples_hebrew": [
                    "המורה מתעלם או לא מגיב",
                    "המורה מחזק את הטענה השגויה",
                    "המורה עובר לנושא אחר",
                ],
            },
            1: {
                "label": "Partial or indirect identification",
                "description": "Teacher hints at an error but doesn't explicitly state it",
                "hebrew_patterns": [
                    "בואו נבדוק את זה",
                    "אני לא בטוח שזה תמיד נכון",
                    "האם זה תמיד נכון לדעתך?",
                    "האם ייתכן מצב שבו זה לא יתקיים?",
                    "מה לגבי מצב אחר?",
                ],
                "examples_hebrew": [
                    "לא נאמר במפורש שיש שגיאה",
                    "שאלות שמרמזות על בעיה אבל לא מציינות אותה",
                ],
            },
            2: {
                "label": "Clear and explicit identification",
                "description": "Teacher explicitly states that there is an error or inaccuracy",
                "hebrew_patterns": [
                    "הטענה של X אינה נכונה",
                    "המסקנה אינה נכונה",
                    "יש כאן בלבול",
                    "אתה מבלבל כאן",
                    "זה לא בהכרח נכון",
                    "זה לא תמיד נכון",
                    "לא מדויק מה שאתה אומר",
                    "ההגדרה אינה מדויקת",
                ],
                "examples_hebrew": [
                    "המורה מצביע ישירות על הטעות",
                    "המורה אומר במפורש שיש בעיה",
                ],
            },
        },
    },
    "p2": {
        "research_id": "p2",
        "skill_id": "error-characterization",
        "name_en": "Error Type Characterization",
        "name_he": "אפיון סוג השגיאה",
        "description_en": (
            "The teacher identifies what type of logical or conceptual "
            "error is reflected in the student's statement."
        ),
        "description_he": "המורה מזהה איזה סוג שגיאה לוגית או מושגית משתקפת בטענת התלמיד",
        "pedagogical_concept": (
            "Beyond recognizing an error exists, the teacher diagnoses the "
            "specific type of logical flaw: necessary vs. sufficient "
            "conditions, overgeneralization, visual prototype "
            "misconception, or inclusion relationship confusion."
        ),
        "trigger_description": (
            "This skill is relevant when an error has been identified and "
            "the teacher needs to characterize its type."
        ),
        "scoring_rubric": {
            0: {
                "label": "No characterization",
                "description": "Teacher says it's wrong without explaining the type of error",
                "hebrew_patterns": ["זה לא נכון", "יש כאן בלבול [ללא פירוט]", "לא"],
                "examples_hebrew": [
                    "המורה אומר 'זה לא נכון' ללא הסבר",
                    "אין התייחסות לסוג הכשל",
                ],
            },
            1: {
                "label": "Partial characterization",
                "description": "Teacher mentions the error type but without full precision",
                "hebrew_patterns": [
                    "אתם מערבבים בין תנאי הכרחי למספיק",
                    "אתם מסתמכים רק על תכונה אחת",
                    "אתם מבלבלים ביחס הכלה",
                    "אתם מכלילים ממקרה פרטי",
                ],
                "examples_hebrew": [
                    "זיהוי חלקי של סוג הבעיה",
                    "אזכור הקטגוריה אבל לא הסבר מלא",
                ],
            },
            2: {
                "label": "Precise characterization",
                "description": "Teacher explicitly names the specific logical or conceptual flaw",
                "hebrew_patterns": [
                    "זה תנאי הכרחי אך לא מספיק",
                    "ההיפך אינו נכון",
                    "אתם כאן מכלילים ממקרה פרטי",
                    "לא בכל מקרה זה מתקיים",
                    "אתם מסתמכים על איך שהצורה נראית",
                    "זו תפיסה חזותית מטעה",
                    "ריבוע הוא מקרה פרטי של מלבן",
                    "זה שייך לתת קבוצה",
                ],
                "examples_hebrew": [
                    "המורה מציין במפורש את סוג הכשל הלוגי",
                    "הבחנה ברורה בין תנאי הכרחי למספיק",
                    "זיהוי מדויק של הכללה שגויה או תפיסה חזותית",
                ],
            },
        },
    },
    "p3": {
        "research_id": "p3",
        "skill_id": "diagnostic-interpretation",
        "name_en": "Diagnostic Interpretation of Student Thinking",
        "name_he": "פרשנות אבחונית של חשיבת התלמיד",
        "description_en": (
            "The teacher demonstrates understanding of the source of the "
            "student's incorrect thinking."
        ),
        "description_he": "המורה מגלה הבנה או מנסה להבין את מקור החשיבה השגויה של התלמיד",
        "pedagogical_concept": (
            "The teacher goes beyond identifying what is wrong to "
            "understanding why the student thinks this way - what "
            "assumptions, prior knowledge, or reasoning patterns led to "
            "the error."
        ),
        "trigger_description": (
            "This skill is relevant when the teacher attempts to "
            "understand the cognitive source of a student's error."
        ),
        "scoring_rubric": {
            0: {
                "label": "No interpretation",
                "description": "No attempt to understand the source of student thinking",
                "hebrew_patterns": ["זה לא נכון", "לא"],
                "examples_hebrew": [
                    "אין ניסיון להבין את מקור החשיבה",
                    "רק תיקון ללא הבנה",
                ],
            },
            1: {
                "label": "Partial interpretation",
                "description": "Teacher makes a general observation about student thinking",
                "hebrew_patterns": [
                    "נראה שאתם מתבססים על תכונה אחת",
                    "אתם מזהים כאן לפי המראה",
                    "אתם מכלילים לפי דוגמה אחת",
                ],
                "examples_hebrew": [
                    "התייחסות כללית למקור הטעות",
                    "אזכור הבסיס לחשיבה אבל לא ניתוח עמוק",
                ],
            },
            2: {
                "label": "Deep interpretation",
                "description": (
                    "Teacher articulates the underlying assumption or "
                    "reasoning pattern causing the error"
                ),
                "hebrew_patterns": [
                    "נראה שאתם מניחים ש...",
                    "אתם מתבססים על...",
                    "החשיבה נשענת על...",
                    "אתם מזהים לפי המראה...",
                    "ההיגיון שלכם מבוסס על מקרה פרטי",
                    "כנראה בדקתם רק תכונה אחת",
                    "אתם מתייחסים רק ל...",
                    "אתם מתעלמים מ...",
                ],
                "examples_hebrew": [
                    "נראה שאתם מניחים שאם תכונה אחת מתקיימת אז כל ההגדרה מתקיימת",
                    "אתם מזהים את המרובע לפי הציור המוכר ולכן כשמסובבים אותו אתם לא מזהים אותו",
                    "אתם מכלילים ממקרה אחד שבו... והסקתם ש...",
                ],
            },
        },
    },
    "p4": {
        "research_id": "p4",
        "skill_id": "adapted-pedagogical-response",
        "name_en": "Adapted Pedagogical Response",
        "name_he": "תגובה פדגוגית מותאמת",
        "description_en": (
            "The teacher chooses a pedagogical move that is adapted to the "
            "specific type of error identified, rather than a generic "
            "automatic response."
        ),
        "description_he": "המורה בוחר מהלך פדגוגי שמתאים לסוג השגיאה שזוהתה ולא תגובה כללית אוטומטית",
        "pedagogical_concept": (
            "Effective teaching means selecting the right strategy for the "
            "specific error: guided questions, counterexamples, return to "
            "formal definitions, comparison tasks, or active student "
            "engagement."
        ),
        "trigger_description": (
            "This skill is relevant when the teacher needs to respond to a "
            "student error with an appropriate pedagogical strategy."
        ),
        "scoring_rubric": {
            0: {
                "label": "Direct correction",
                "description": (
                    "Teacher gives the correct answer immediately without "
                    "engaging student thinking"
                ),
                "hebrew_patterns": ["זה לא נכון. ריבוע הוא מלבן", "טעות", "[מתן תשובה נכונה מיד]"],
                "examples_hebrew": [
                    "המורה נותן תשובה נכונה מיד",
                    "אין שאלות אבחון",
                    "אין קישור להגדרה",
                ],
            },
            1: {
                "label": "Partial guidance",
                "description": "Teacher asks a generic question or returns to definition without depth",
                "hebrew_patterns": ["מה ההגדרה של מלבן?", "תחשבו שוב", "בואו נחזור להגדרה"],
                "examples_hebrew": ["שאלה כללית אחת", "חזרה להגדרה בלי העמקה"],
            },
            2: {
                "label": "Deep guidance",
                "description": "Teacher uses targeted diagnostic questions, counterexamples, or active tasks",
                "hebrew_patterns": [
                    "מה ההגדרה של מלבן? אילו תנאים נדרשים?",
                    "האם ריבוע מקיים את כל התנאים?",
                    "בואו נבנה מרובע שבו... אך...",
                    "בואו ניקח דוגמה נגדית",
                    "מה ההבדל בין X ל-Y?",
                    "נבדוק האם מתקיימים כל התנאים",
                ],
                "examples_hebrew": [
                    "שאלות אבחון מדויקות",
                    "קישור להגדרה עם העמקה",
                    "שימוש בדוגמה נגדית",
                    "הפעלה פעילה של תלמידים",
                ],
            },
        },
    },
    "p5": {
        "research_id": "p5",
        "skill_id": "error-leveraging",
        "name_en": "Leveraging Error for Learning",
        "name_he": "מינוף השגיאה ללמידה",
        "description_en": (
            "The teacher sees the error as a learning resource, not just a "
            "problem, and uses it to create deeper conceptual "
            "understanding."
        ),
        "description_he": (
            "המורה רואה בשגיאה משאב ללמידה ולא רק בעיה. הוא משתמש בה כדי "
            "ליצור הבנה מושגית עמוקה יותר"
        ),
        "pedagogical_concept": (
            "The error becomes an opportunity to build general principles, "
            "create conceptual distinctions, or develop broader "
            "mathematical understanding beyond just fixing the immediate "
            "mistake."
        ),
        "trigger_description": (
            "This skill is relevant when there's an opportunity to use the "
            "error for deeper conceptual learning beyond immediate "
            "correction."
        ),
        "scoring_rubric": {
            0: {
                "label": "No leveraging",
                "description": "Teacher only corrects, no conceptual expansion",
                "hebrew_patterns": ["זה לא נכון", "זה לא מדויק", "ריבוע הוא מלבן וזהו"],
                "examples_hebrew": ["המורה רק מתקן", "אין הרחבה מושגית"],
            },
            1: {
                "label": "Partial leveraging",
                "description": "Teacher addresses correct and incorrect parts but stays within narrow context",
                "hebrew_patterns": ["זה תנאי לא מספיק", "נכון שאלכסונים מאונכים במעויין, אבל לא רק בו"],
                "examples_hebrew": ["התייחסות לחלק נכון וחלק שגוי", "הרחבה קטנה בלבד"],
            },
            2: {
                "label": "Full leveraging",
                "description": "Teacher uses error to build general principles or conceptual relationships",
                "hebrew_patterns": [
                    "זו הזדמנות להבין את ההבדל בין תנאי הכרחי לתנאי מספיק",
                    "מה למדנו מזה על תכונות המגדירות מושג?",
                    "בואו נבדוק באילו מרובעים נוספים...",
                    "מה אפשר ללמוד מזה?",
                    "מה ניתן לשנות כך שהטענה תהיה נכונה?",
                    "מה יקרה אם נחליף... ב...?",
                    "האם ניתן להכליל את הטענה?",
                    "זה מדגיש את ההבדל בין...",
                ],
                "examples_hebrew": [
                    "בניית עיקרון כללי",
                    "הדגשת קשר בין מושגים",
                    "יצירת הבחנה מושגית רחבה",
                ],
            },
        },
    },
}

# Convenience mappings between the two id systems.
SKILL_ID_TO_RESEARCH_ID: dict[str, str] = {
    skill["skill_id"]: research_id for research_id, skill in PCK_SKILLS.items()
}
RESEARCH_ID_TO_SKILL_ID: dict[str, str] = {
    research_id: skill["skill_id"] for research_id, skill in PCK_SKILLS.items()
}

# Canonical ordering used everywhere (prompts, schemas, CLI output).
PCK_DIMENSION_IDS: tuple[str, ...] = ("p1", "p2", "p3", "p4", "p5")


def get_skill(research_id: str) -> PCKSkill:
    """Look up a skill by its research id (p1-p5). Raises KeyError if unknown."""
    return PCK_SKILLS[research_id]


def all_dimension_ids() -> tuple[str, ...]:
    return PCK_DIMENSION_IDS


def format_skills_for_prompt() -> str:
    """
    Python port of `formatSkillsForPrompt` in server/universal_pck_skills.js,
    emitting `p1`-`p5` labels instead of production `skill_id` strings.
    """
    blocks: list[str] = []
    for research_id in PCK_DIMENSION_IDS:
        skill = PCK_SKILLS[research_id]
        rubric = skill["scoring_rubric"]
        block = (
            f"\n**{research_id}: {skill['name_en']}**\n"
            f"{skill['description_en']}\n\n"
            f"Concept: {skill['pedagogical_concept']}\n\n"
            f"When relevant? {skill['trigger_description']}\n\n"
            f"Score 0 ({rubric[0]['label']}): {rubric[0]['description']}\n"
            f"Hebrew patterns: {', '.join(rubric[0]['hebrew_patterns'][:3])}\n\n"
            f"Score 1 ({rubric[1]['label']}): {rubric[1]['description']}\n"
            f"Hebrew patterns: {', '.join(rubric[1]['hebrew_patterns'][:3])}\n\n"
            f"Score 2 ({rubric[2]['label']}): {rubric[2]['description']}\n"
            f"Hebrew patterns: {', '.join(rubric[2]['hebrew_patterns'][:3])}\n"
        )
        blocks.append(block)
    return "\n---\n".join(blocks)
