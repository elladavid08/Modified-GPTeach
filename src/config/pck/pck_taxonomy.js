/**
 * PCK (Pedagogical Content Knowledge) Taxonomy
 * 
 * This file contains the structured PCK skills data for the expert feedback agent.
 * Each skill represents a specific pedagogical competency related to teaching geometry.
 * 
 * The expert agent uses this taxonomy to:
 * 1. Identify which skills the teacher demonstrates
 * 2. Detect missed opportunities
 * 3. Provide targeted feedback
 * 
 * Structure for each skill:
 * {
 *   skill_id: "unique-identifier",
 *   skill_name: {
 *     en: "English name",
 *     he: "שם בעברית"
 *   },
 *   category: "student_thinking_knowledge" | "instructional_strategies" | "curriculum_knowledge" | "assessment",
 *   subcategory: "misconceptions_about_quadrilaterals" | "questioning" | "representations" | etc,
 *   description: {
 *     en: "English description",
 *     he: "תיאור בעברית"
 *   },
 *   indicators: [
 *     "מה המורה אומר או עושה - ביטוי 1",
 *     "מה המורה אומר או עושה - ביטוי 2",
 *     // ... more observable indicators in Hebrew
 *   ],
 *   student_scenario: {
 *     context: "הקשר של השיחה",
 *     student_says: "מה התלמיד אומר",
 *     misconception: "תיאור התפיסה השגויה"
 *   },
 *   examples: {
 *     positive: [
 *       {
 *         student: "מה התלמיד אמר",
 *         teacher_good: "תגובת מורה טובה",
 *         why_good: "למה זה טוב"
 *       }
 *     ],
 *     negative: [
 *       {
 *         student: "מה התלמיד אמר",
 *         teacher_bad: "תגובת מורה פחות טובה",
 *         why_bad: "למה זה בעייתי"
 *       }
 *     ]
 *   },
 *   feedback_templates: {
 *     detected: "משוב חיובי בעברית כשהמורה הצליח",
 *     missed: "הצעה עדינה בעברית כשהמורה החמיץ הזדמנות"
 *   },
 *   priority_level: "foundational" | "intermediate" | "advanced"
 * }
 */

// ========================================
// PCK SKILLS TAXONOMY
// ========================================
// Add your skills data below. Each skill should follow the structure above.

export const pckSkills = [
  // ==================== EXAMPLE SKILL (for reference) ====================
  // You can remove this example once you've added your real skills
//   {
//     skill_id: "example-identify-misconception",
//     skill_name: {
//       en: "Identifying Student Misconceptions",
//       he: "זיהוי תפיסות שגויות של תלמידים"
//     },
//     category: "student_thinking_knowledge",
//     subcategory: "misconceptions_about_quadrilaterals",
//     description: {
//       en: "Teacher recognizes when students express misconceptions about geometric concepts",
//       he: "המורה מזהה כאשר תלמידים מביעים תפיסות שגויות על מושגים גאומטריים"
//     },
//     indicators: [
//       "מזהה במפורש את התפיסה השגויה",
//       "שואל שאלות הבהרה",
//       "מבקש מהתלמיד להסביר את החשיבה שלו",
//       "מתייחס לתפיסה השגויה באופן ישיר"
//     ],
//     student_scenario: {
//       context: "דיון על מרובעים",
//       student_says: "ריבוע זה לא מלבן, הם צורות שונות",
//       misconception: "חוסר הבנה של יחסי הכלה בין מרובעים"
//     },
//     examples: {
//       positive: [
//         {
//           student: "ריבוע זה לא מלבן, הם צורות שונות",
//           teacher_good: "מעניין! למה את חושבת שריבוע אינו מלבן? בואי נבדוק את התכונות של כל אחד",
//           why_good: "המורה זיהה את התפיסה השגויה והוביל לבדיקה של התכונות"
//         }
//       ],
//       negative: [
//         {
//           student: "ריבוע זה לא מלבן, הם צורות שונות",
//           teacher_bad: "נכון, ריבוע ומלבן הם שני מרובעים שונים",
//           why_bad: "המורה לא זיהה את התפיסה השגויה ואישר אותה"
//         }
//       ]
//     },
//     feedback_templates: {
//       detected: "כל הכבוד! זיהית את התפיסה השגויה והתחלת לחקור אותה עם התלמידים",
//       missed: "שים לב - התלמיד הציג תפיסה שגויה על יחסי הכלה. כדאי לשאול אותו להסביר את החשיבה שלו ולבחון את התכונות יחד"
//     },
//     priority_level: "foundational"
//   },

  // ==================== OLD SKILLS (COMMENTED OUT) ====================
  // These skills have been replaced by formal scenarios from the education team
  // Kept here for reference only
  
  // // Skill 1: Perpendicular Diagonals (Old)
  // {
  //   "skill_id": "identify-diagonal-misconception-perpendicular",
  //   
  //   "skill_name": {
  //     "en": "Identifying Converse Statement Misconception (Perpendicular Diagonals)",
  //     "he": "זיהוי תפיסה שגויה על טענה והטענה ההפוכה - אלכסונים מאונכים"
  //   },
  //   
  //   "category": "student_thinking_knowledge",
  //   "subcategory": "misconceptions_about_quadrilaterals",
  //   
  //   "description": {
  //     "en": "Teacher identifies when a student incorrectly assumes that perpendicular diagonals imply a rhombus",
  //     "he": "המורה מזהה בלבול בין טענה לטענה ההפוכה: אלכסונים מאונכים אינם תנאי מספיק למעויין"
  //   },
  //   
  //   "indicators": [
  //     "מזהה שהבעיה היא בכיוון ההסקה",
  //     "מבקש לבדוק האם התכונה מספיקה או רק הכרחית",
  //     "מבקש דוגמה נגדית",
  //     "מדגיש הבדל בין 'אם' ל'רק אם'"
  //   ],
  //   
  //   "student_scenario": {
  //     "context": "שיחה על תכונות של מעויין",
  //     "student_says": "אם האלכסונים מאונכים אז זה מעויין",
  //     "misconception": "בלבול בין טענה נכונה לבין הטענה ההפוכה"
  //   },
  //   
  //   "examples": {
  //     "positive": [
  //       {
  //         "student": "אם האלכסונים מאונכים אז זה מעויין",
  //         "teacher_good": "נכון שבמעויין האלכסונים מאונכים. אבל האם זה מספיק? האם אתה יכול לחשוב על מרובע אחר שיש לו אלכסונים מאונכים אבל הוא לא מעויין?",
  //         "why_good": "המורה מזהה שהטענה נכונה רק בכיוון אחד ומוביל לבחינה ביקורתית באמצעות דוגמה נגדית"
  //       }
  //     ],
  //     "negative": [
  //       {
  //         "student": "אם האלכסונים מאונכים אז זה מעויין",
  //         "teacher_bad": "כן, אלכסונים מאונכים זה מעויין",
  //         "why_bad": "המורה מחזק תפיסה שגויה ולא מתייחס לכיוון ההסקה"
  //       }
  //     ]
  //   },
  //   
  //   "feedback_templates": {
  //     "detected": "כל הכבוד! זיהית בלבול בין טענה לטענה ההפוכה ועזרת לתלמידים להבין שהתכונה אינה מספיקה",
  //     "missed": "שים לב - התלמיד הסיק מסקנה בכיוון שגוי. כדאי להדגיש שתכונה יכולה להיות נכונה רק בכיוון אחד"
  //   },
  //   
  //   "priority_level": "high"
  // },
  
  // // Skill 2: Equal Diagonals (Old)
  // {
  //   "skill_id": "identify-diagonal-misconception-equal",
  //   
  //   "skill_name": {
  //     "en": "Identifying Converse Statement Misconception (Equal Diagonals)",
  //     "he": "זיהוי תפיסה שגויה על אלכסונים שווים"
  //   },
  //   
  //   "category": "student_thinking_knowledge",
  //   "subcategory": "misconceptions_about_quadrilaterals",
  //   
  //   "description": {
  //     "en": "Teacher identifies incorrect assumption that equal diagonals imply a rectangle",
  //     "he": "המורה מזהה תפיסה שגויה לפיה אלכסונים שווים מבטיחים שמדובר במלבן"
  //   },
  //   
  //   "indicators": [
  //     "מבקש לבדוק האם יש מרובעים נוספים עם אלכסונים שווים",
  //     "משווה בין תכונה הכרחית לתכונה מספיקה",
  //     "מבקש דוגמה נגדית"
  //   ],
  //   
  //   "student_scenario": {
  //     "context": "למידה על מלבנים",
  //     "student_says": "אם האלכסונים שווים אז זה מלבן",
  //     "misconception": "הנחה שתכונה הכרחית היא גם מספיקה"
  //   },
  //   
  //   "examples": {
  //     "positive": [
  //       {
  //         "student": "אם האלכסונים שווים אז זה מלבן",
  //         "teacher_good": "נכון שבמלבן האלכסונים שווים. אבל האם יש מרובע אחר עם אלכסונים שווים שאינו מלבן?",
  //         "why_good": "המורה מכוון להבנה שתכונה אחת לא מגדירה צורה לבדה"
  //       }
  //     ],
  //     "negative": [
  //       {
  //         "student": "אם האלכסונים שווים אז זה מלבן",
  //         "teacher_bad": "כן, זו אחת התכונות של מלבן",
  //         "why_bad": "המורה לא מתקן את ההסקה השגויה"
  //       }
  //     ]
  //   },
  //   
  //   "feedback_templates": {
  //     "detected": "יפה! עזרת לתלמיד להבין שתכונה אחת אינה מספיקה להגדרת מלבן",
  //     "missed": "כדאי להדגיש שתכונה הכרחית אינה תמיד מספיקה, ולבדוק מרובעים נוספים"
  //   },
  //   
  //   "priority_level": "high"
  // },
  
  // // Skill 3: Angle Bisectors (Old)
  // {
  //   "skill_id": "identify-diagonal-misconception-angle-bisectors",
  //   
  //   "skill_name": {
  //     "en": "Identifying Misconception About Diagonals Bisecting Angles",
  //     "he": "זיהוי תפיסה שגויה על אלכסונים החוצים זוויות"
  //   },
  //   
  //   "category": "student_thinking_knowledge",
  //   "subcategory": "misconceptions_about_quadrilaterals",
  //   
  //   "description": {
  //     "en": "Teacher identifies incorrect generalization that diagonals bisecting angles imply a square",
  //     "he": "המורה מזהה הכללה שגויה לפיה חציית זוויות ע״י אלכסונים מבטיחה ריבוע"
  //   },
  //   
  //   "indicators": [
  //     "מבקש לפרק את תכונות הריבוע",
  //     "משווה בין ריבוע למעויין",
  //     "מבקש לחשוב על תכונות חסרות"
  //   ],
  //   
  //   "student_scenario": {
  //     "context": "דיון על תכונות ריבוע",
  //     "student_says": "אם האלכסונים חוצים את הזוויות אז זה ריבוע",
  //     "misconception": "הכללת יתר מתכונה חלקית"
  //   },
  //   
  //   "examples": {
  //     "positive": [
  //       {
  //         "student": "אם האלכסונים חוצים את הזוויות אז זה ריבוע",
  //         "teacher_good": "זו תכונה נכונה של ריבוע, אבל גם של מעויין. מה עוד צריך כדי שזה יהיה ריבוע?",
  //         "why_good": "המורה משווה בין צורות קרובות ומחדד הבחנה"
  //       }
  //     ],
  //     "negative": [
  //       {
  //         "student": "אם האלכסונים חוצים את הזוויות אז זה ריבוע",
  //         "teacher_bad": "נכון, כי בריבוע האלכסונים חוצים זוויות",
  //         "why_bad": "המורה מאשר הכללה שגויה"
  //       }
  //     ]
  //   },
  //   
  //   "feedback_templates": {
  //     "detected": "מצוין! חידדת את ההבדל בין תכונות משותפות לתכונות מייחדות",
  //     "missed": "שים לב - התלמיד ערבב בין ריבוע למעויין. כדאי להשוות ביניהם במפורש"
  //   },
  //   
  //   "priority_level": "medium"
  // },

  // // Skill 4: Inclusion Misconception (Old)
  // {
  //   "skill_id": "identify-inclusion-misconception-square",
  //   
  //   "skill_name": {
  //     "en": "Identifying Inclusion Misconception (Square vs Rectangle/Rhombus)",
  //     "he": "זיהוי תפיסה שגויה על יחס הכלה - ריבוע"
  //   },
  //   
  //   "category": "student_thinking_knowledge",
  //   "subcategory": "misconceptions_about_quadrilaterals",
  //   
  //   "description": {
  //     "en": "Teacher identifies when student sees quadrilaterals as disjoint categories",
  //     "he": "המורה מזהה תפיסה לפיה ריבוע הוא צורה נפרדת ואינו מלבן או מעויין"
  //   },
  //   
  //   "indicators": [
  //     "מדבר על יחס הכלה",
  //     "משתמש בשפה של 'כל' או 'חלק מ'",
  //     "מצייר דיאגרמת הכלה או מתאר אותה"
  //   ],
  //   
  //   "student_scenario": {
  //     "context": "סיווג מרובעים",
  //     "student_says": "ריבוע זה לא מלבן, זו צורה אחרת",
  //     "misconception": "הבנת המרובעים כקטגוריות נפרדות"
  //   },
  //   
  //   "examples": {
  //     "positive": [
  //       {
  //         "student": "ריבוע זה לא מלבן",
  //         "teacher_good": "למעשה, כל ריבוע הוא גם מלבן, כי יש לו את כל התכונות של מלבן וגם תכונות נוספות",
  //         "why_good": "המורה מדגיש יחס הכלה ולא רק שמות צורות"
  //       }
  //     ],
  //     "negative": [
  //       {
  //         "student": "ריבוע זה לא מלבן",
  //         "teacher_bad": "ריבוע ומלבן זה שני דברים שונים",
  //         "why_bad": "המורה מחזק תפיסה היררכית שגויה"
  //       }
  //     ]
  //   },
  //   
  //   "feedback_templates": {
  //     "detected": "יפה! הצגת נכון את יחס ההכלה בין המרובעים",
  //     "missed": "כדאי להדגיש שמדובר ביחסי הכלה ולא בצורות נפרדות"
  //   },
  //   
  //   "priority_level": "high"
  // },
  
  // ==================== NEW SKILLS FROM EDUCATION TEAM ====================
  
  // Skill 5: Square-Rectangle Inclusion Relationship (7th Grade)
  {
    skill_id: "kcs-square-rectangle-inclusion-7th",
    
    skill_name: {
      en: "Identifying Inclusion Relationship Misconception: Square vs Rectangle (7th Grade)",
      he: "זיהוי תפיסה שגויה על יחסי הכלה בין ריבוע למלבן - כיתה ז'"
    },
    
    category: "student_thinking_knowledge",
    subcategory: "misconceptions_about_quadrilaterals",
    
    description: {
      en: "Teacher recognizes when students view square and rectangle as completely separate categories based on visual appearance rather than formal definitions, and guides them to check logical relationships",
      he: "המורה מזהה כאשר תלמידים רואים ריבוע ומלבן כשני סוגים שונים לחלוטין על בסיס מראה חזותי ולא הגדרות פורמליות, ומכוון אותם לבדיקה לוגית של יחסי ההכלה"
    },
    
    indicators: [
      "לא מתקן מיד באופן סמכותי",
      "שואל מה ההגדרה של מלבן",
      "מכוון לבדיקה לוגית האם ריבוע מקיים כל סעיף בהגדרה",
      "מתמקד בהגדרה ובתנאים ולא בתכונות חזותיות",
      "מדבר על יחס הכלה כל ריבוע הוא מלבן",
      "משתמש בשפה של כל או חלק מ"
    ],
    
    student_scenario: {
      context: "שיעור על ריבוע ומלבן, לאחר שלמדו את תכונות המלבן",
      student_says: "אבל זה ריבוע, לא מלבן",
      misconception: "ריבוע ומלבן הם שני סוגי מרובעים שונים, ולכן ריבוע אינו מלבן"
    },
    
    examples: {
      positive: [
        {
          student: "אבל זה ריבוע, לא מלבן",
          teacher_good: "שאלה טובה! בואו נבדוק - מה ההגדרה של מלבן?",
          why_good: "המורה לא מתקן מיד, שואל על ההגדרה ומכוון לבדיקה לוגית"
        },
        {
          student: "מלבן זה כזה ארוך",
          teacher_good: "איך אפשר להגדיר מלבן בצורה מדויקת יותר? אילו תכונות יש למלבן?",
          why_good: "המורה מכוון מהגדרה חזותית להגדרה פורמלית"
        },
        {
          student: "לריבוע יש תכונות אחרות",
          teacher_good: "נכון, לריבוע יש תכונות נוספות. אבל האם ריבוע מקיים את כל התכונות של מלבן?",
          why_good: "המורה מכוון לבדיקה לוגית של קיום תנאי ההגדרה"
        }
      ],
      negative: [
        {
          student: "אבל זה ריבוע, לא מלבן",
          teacher_bad: "ריבוע הוא מלבן, ככה זה במתמטיקה",
          why_bad: "תיקון סמכותי - זה סותם דיון, לא מטפל בתפיסה השגויה"
        },
        {
          student: "מלבן זה כזה ארוך",
          teacher_bad: "ריבוע זה כמו מלבן שנראה ככה",
          why_bad: "שימוש בהגדרה לא פורמלית - זה מחזק תפיסה חזותית"
        },
        {
          student: "אם זה ריבוע למה לקרוא לו מלבן",
          teacher_bad: "מלבן זה מרובע עם שתי צלעות ארוכות ושתי קצרות",
          why_bad: "בלבול של המורה עצמו - זו טעות CK שמובילה לכשל KCS"
        }
      ]
    },
    
    feedback_templates: {
      detected: "מצוין! שאלת על ההגדרה וכיוונת לבדיקה לוגית של יחסי ההכלה, במקום לתקן באופן סמכותי",
      missed: "שים לב - התלמיד הציג תפיסה שגויה על יחסי הכלה. כדאי לשאול על ההגדרה הפורמלית ולבדוק האם ריבוע מקיים את התנאים"
    },
    
    priority_level: "high",
    
    curriculum_context: {
      grade: 7,
      topic: "מלבן וריבוע",
      key_points: [
        "מלבן: מרובע שבו 3 זוויות ישרות (נובע מההגדרה)",
        "ריבוע: מלבן שכל צלעותיו שוות",
        "דגש: כל ריבוע הוא מלבן אבל לא כל מלבן הוא ריבוע",
        "יש לנמק: מלבן שלו שתי צלעות סמוכות שוות הוא ריבוע"
      ]
    },
    
    common_teacher_mistakes: [
      {
        mistake: "תיקון סמכותי",
        example: "ריבוע הוא מלבן, ככה זה במתמטיקה",
        why_problematic: "זה סותם דיון, לא מטפל בתפיסה השגויה"
      },
      {
        mistake: "שימוש בהגדרה לא פורמלית",
        example: "ריבוע זה כמו מלבן שנראה ככה",
        why_problematic: "זה מחזק תפיסה חזותית במקום הגדרה מבוססת תכונות"
      },
      {
        mistake: "בלבול של המורה עצמו",
        example: "מלבן זה מרובע עם שתי צלעות ארוכות ושתי קצרות",
        why_problematic: "זו טעות CK (ידע תוכן) שמובילה לכשל KCS"
      }
    ]
  },
  
  // Skill 6: Perpendicular Diagonals - Necessary vs Sufficient Condition (9th Grade)
  {
    skill_id: "kcs-perpendicular-diagonals-necessary-sufficient-9th",
    
    skill_name: {
      en: "Identifying Confusion Between Necessary and Sufficient Conditions: Perpendicular Diagonals (9th Grade)",
      he: "זיהוי בלבול בין תנאי הכרחי לתנאי מספיק - אלכסונים מאונכים - כיתה ט'"
    },
    
    category: "student_thinking_knowledge",
    subcategory: "misconceptions_about_quadrilaterals",
    
    description: {
      en: "Teacher recognizes when students incorrectly assume that perpendicular diagonals are sufficient to identify a rhombus, confusing necessary and sufficient conditions",
      he: "המורה מזהה כאשר תלמידים מניחים בטעות שאלכסונים מאונכים מספיקים כדי לזהות מעוין, תוך בלבול בין תנאי הכרחי לתנאי מספיק"
    },
    
    indicators: [
      "מזהה את החלק הנכון בדברי התלמיד",
      "מערער בעדינות ושואל האם זו הצורה היחידה",
      "שואל שאלות מכוונות על צורות אחרות כמו דלתון",
      "מוביל להבנה שתכונה אחת לא מספיקה",
      "מחזיר להגדרה של מעוין",
      "שואל מה עוד חייב להתקיים",
      "נמנע משפה לוגית לא מותאמת גיל"
    ],
    
    student_scenario: {
      context: "שיעור על זיהוי מעוין, לאחר שלמדו על תכונות המעוין",
      student_says: "זה חייב להיות מעוין, כי האלכסונים מאונכים",
      misconception: "אם במרובע האלכסונים מאונכים אז זו מעוין - בלבול בין תנאי הכרחי לתנאי מספיק"
    },
    
    examples: {
      positive: [
        {
          student: "זה חייב להיות מעוין, כי האלכסונים מאונכים",
          teacher_good: "נכון, במעוין באמת האלכסונים מאונכים. אבל בואו נחשוב - האם זו הצורה היחידה עם התכונה הזו?",
          why_good: "המורה מזהה את החלק הנכון, מאשר אותו, ומערער בעדינות עם שאלה מכוונת"
        },
        {
          student: "זאת התכונה של מעוין",
          teacher_good: "נכון שזו תכונה של מעוין. איזו עוד צורה למדנו שיש לה אלכסונים כאלה? בדלתון - איך האלכסונים נפגשים?",
          why_good: "המורה שואל שאלה מכוונת שמובילה לדוגמה נגדית"
        },
        {
          student: "אין עוד צורה עם תכונה כזאת",
          teacher_good: "אז אם יש יותר מצורה אחת עם אלכסונים מאונכים - התכונה הזו לבדה לא מספיקה כדי לדעת שזו מעוין. מה ההגדרה של מעוין? מה עוד חייב להתקיים?",
          why_good: "המורה מוביל להבנה ומחזיר להגדרה"
        }
      ],
      negative: [
        {
          student: "זה חייב להיות מעוין, כי האלכסונים מאונכים",
          teacher_bad: "לא, זה לא מעוין",
          why_bad: "תיקון ישיר בלי נימוק, בלי תהליך חשיבה"
        },
        {
          student: "למדנו שמעוין תמיד יש לו אלכסונים ניצבים",
          teacher_bad: "אלכסונים מאונכים זה לא מספיק",
          why_bad: "כלל בלי הסבר - לא ברור למה"
        },
        {
          student: "אם זה ככה אז ברור שזו מעוין",
          teacher_bad: "זה תנאי הכרחי אבל לא מספיק",
          why_bad: "שפה לוגית לא מותאמת לגיל - מושג לא מוכר"
        },
        {
          student: "זה חייב להיות מעוין",
          teacher_bad: "לא, יש גם דלתון, טרפז, מרובע לא משוכלל, ועוד",
          why_bad: "הצפת מידע - עומס קוגניטיבי"
        }
      ]
    },
    
    feedback_templates: {
      detected: "מעולה! זיהית את החלק הנכון, שאלת על צורות נוספות, והובלת את התלמידים להבנה שתכונה אחת לא מספיקה",
      missed: "התלמיד הניח שאלכסונים מאונכים מספיקים למעוין. כדאי לשאול האם יש צורות נוספות עם תכונה זו ולהוביל לדוגמה נגדית כמו דלתון"
    },
    
    priority_level: "high",
    
    curriculum_context: {
      grade: 9,
      topic: "מעוין וריבוע - זיהוי על סמך תכונות",
      key_points: [
        "מעוין: מרובע שבו כל הצלעות שוות",
        "תכונה: האלכסונים במעוין מאונכים זה לזה",
        "זיהוי מעוין: צריך להראות שארבע צלעותיו שוות או שהוא מקבילית עם תכונה נוספת",
        "הבחנה בין תנאי הכרחי לתנאי מספיק",
        "דוגמה נגדית: דלתון עם אלכסונים מאונכים שאינו מעוין"
      ]
    },
    
    common_teacher_mistakes: [
      {
        mistake: "תיקון ישיר",
        example: "לא, זה לא מעוין",
        why_problematic: "בלי נימוק, בלי תהליך חשיבה - לא מטפל בתפיסה השגויה"
      },
      {
        mistake: "כלל בלי הסבר",
        example: "אלכסונים מאונכים זה לא מספיק",
        why_problematic: "לא ברור למה - התלמיד לא מבין את ההיגיון"
      },
      {
        mistake: "שפה לוגית לא מותאמת גיל",
        example: "זה תנאי הכרחי אבל לא מספיק",
        why_problematic: "מושג לוגי שלא מוכר לתלמידים - יוצר בלבול"
      },
      {
        mistake: "הצפת מידע",
        example: "יש גם דלתון, טרפז, מרובע כללי, ועוד צורות רבות",
        why_problematic: "עומס קוגניטיבי - יותר מדי מידע בבת אחת"
      }
    ]
  },
  
  // Skill 7: Rectangle Visual Misconception - Must Be "Long" (7th Grade)
  {
    skill_id: "kcs-rectangle-visual-prototype-7th",
    
    skill_name: {
      en: "Identifying Visual Prototype Misconception: Rectangles Must Be Long (7th Grade)",
      he: "זיהוי תפיסה חזותית שגויה - מלבן חייב להיות ארוך - כיתה ז'"
    },
    
    category: "student_thinking_knowledge",
    subcategory: "misconceptions_about_quadrilaterals",
    
    description: {
      en: "Teacher recognizes when students rely on prototypical visual images rather than formal definitions, believing rectangles must be elongated",
      he: "המורה מזהה כאשר תלמידים מסתמכים על דימוי חזותי אב-טיפוסי במקום על הגדרה פורמלית, ומאמינים שמלבן חייב להיות ארוך"
    },
    
    indicators: [
      "לא מתקן מיד",
      "שואל מה ההגדרה של מלבן",
      "שואל האם כתוב בהגדרה משהו על אורך הצלעות",
      "מכוון לבדיקה האם הזוויות ישרות",
      "מפריד בין איך זה נראה לבין מה ההגדרה",
      "מציע השוואה - מה קורה אם מאריכים צלע קצת",
      "מסכם שמלבן יכול להיות ארוך אבל לא חייב"
    ],
    
    student_scenario: {
      context: "זיהוי מלבנים במגוון צורות - ארוכים, כמעט ריבועיים, מסובבים",
      student_says: "זה לא מלבן, זה נראה ריבוע",
      misconception: "מלבן חייב להיות ארוך. אם הוא נראה כמו ריבוע או מוטה בזווית - הוא לא מלבן"
    },
    
    examples: {
      positive: [
        {
          student: "זה לא מלבן, זה נראה ריבוע",
          teacher_good: "בואו נבדוק - מה ההגדרה של מלבן? האם כתוב בה משהו על אורך הצלעות?",
          why_good: "המורה מחזיר להגדרה ושואל שאלה מכוונת על מה כתוב בהגדרה"
        },
        {
          student: "מלבן צריך להיות ארוך",
          teacher_good: "בואו נבדוק: הזוויות כאן ישרות או לא? איך זה נראה - זה פחות חשוב. השאלה היא: האם זה מקיים את ההגדרה?",
          why_good: "המורה מפריד בין מראה חזותי לבין הגדרה פורמלית"
        },
        {
          student: "בספר תמיד מלבן נראה אחרת",
          teacher_good: "אם אאריך קצת צלע אחת - זה יהפוך פתאום למלבן? מלבן יכול להיות ארוך, אבל הוא לא חייב להיות ארוך",
          why_good: "המורה משתמש בהשוואה לחשיפת האבסורד ומסכם בבהירות"
        }
      ],
      negative: [
        {
          student: "זה לא מלבן, זה נראה ריבוע",
          teacher_bad: "זה כן מלבן, תאמינו לי",
          why_bad: "תיקון סמכותי - לא מטפל בשורש הטעות"
        },
        {
          student: "ככה לא מציירים מלבן",
          teacher_bad: "נכון, זה מלבן קצת מוזר",
          why_bad: "חיזוק הדימוי החזותי - מחזק שיש מלבן רגיל וחריג"
        },
        {
          student: "אם הצלעות שוות זה כבר ריבוע",
          teacher_bad: "מלבן זה מרובע עם שתי צלעות ארוכות ושתי קצרות",
          why_bad: "שימוש בהגדרה לא מדויקת - טעות CK שמייצרת טעות מושגית"
        },
        {
          student: "מלבן צריך להיות ארוך",
          teacher_bad: "זה ברור, ממשיכים",
          why_bad: "התעלמות מהקושי - מפספס הזדמנות פדגוגית"
        }
      ]
    },
    
    feedback_templates: {
      detected: "מצוין! החזרת את התלמידים להגדרה הפורמלית והפרדת בין מראה חזותי לבין תכונות מתמטיות",
      missed: "התלמיד מסתמך על דימוי חזותי. כדאי לשאול מה ההגדרה של מלבן ולבדוק האם יש בה דרישה לאורך מסוים"
    },
    
    priority_level: "high",
    
    curriculum_context: {
      grade: 7,
      topic: "מלבן - הגדרה וזיהוי",
      key_points: [
        "מלבן הוא מרובע שלו ארבע זוויות ישרות",
        "ההגדרה לא מתייחסת לאורך הצלעות",
        "צלעות סמוכות ניצבות זו לזו (נובע מההגדרה)",
        "צלעות נגדיות שוות באורכן",
        "מלבן יכול להיות ארוך, אבל הוא לא חייב להיות ארוך"
      ]
    },
    
    common_teacher_mistakes: [
      {
        mistake: "תיקון סמכותי",
        example: "זה כן מלבן, תאמינו לי",
        why_problematic: "לא מטפל בשורש הטעות - התלמיד לא מבין למה"
      },
      {
        mistake: "חיזוק הדימוי החזותי",
        example: "נכון, זה מלבן קצת מוזר",
        why_problematic: "מחזק שיש מלבן רגיל וחריג"
      },
      {
        mistake: "שימוש בהגדרה לא מדויקת",
        example: "מלבן זה מרובע עם שתי צלעות ארוכות ושתי קצרות",
        why_problematic: "טעות CK שמייצרת טעות מושגית"
      },
      {
        mistake: "התעלמות מהקושי",
        example: "זה ברור, ממשיכים",
        why_problematic: "מפספס הזדמנות פדגוגית חשובה"
      }
    ]
  },
  
  // Skill 8: Diagonal Bisecting Angle - Over-generalization (9th Grade)
  {
    skill_id: "kcs-diagonal-angle-bisector-overgeneralization-9th",
    
    skill_name: {
      en: "Identifying Over-generalization: Diagonals Always Bisect Angles (9th Grade)",
      he: "זיהוי הכללת יתר - אלכסון תמיד חוצה זווית - כיתה ט'"
    },
    
    category: "student_thinking_knowledge",
    subcategory: "misconceptions_about_quadrilaterals",
    
    description: {
      en: "Teacher recognizes when students incorrectly generalize that diagonals always bisect angles, based on specific cases like rhombus",
      he: "המורה מזהה כאשר תלמידים מכלילים באופן שגוי שאלכסון תמיד חוצה זווית, על בסיס מקרים ספציפיים כמו מעוין"
    },
    
    indicators: [
      "מכיר במקור הטענה - נכון במעוין",
      "מערער בעדינות - האם זה קורה בכל מרובע",
      "שואל שאלות מכוונות על מלבן וזוויות 90 מעלות",
      "מוביל לבדיקה - מדידה, חישוב, השוואה",
      "מסכם במעוין כן אבל במלבן ומקבילית לא",
      "מנסח הכללה נכונה - לא כל תכונה נכונה לכל המרובעים"
    ],
    
    student_scenario: {
      context: "השוואת תכונות אלכסונים במרובעים שונים",
      student_says: "אלכסון נכנס באמצע הזווית",
      misconception: "אלכסון תמיד חוצה זווית - הכללת יתר מתכונה ספציפית"
    },
    
    examples: {
      positive: [
        {
          student: "במעוין זה חוצה אז גם כאן במקבילית",
          teacher_good: "נכון, במעוין באמת אלכסון חוצה זווית. אבל בואו נבדוק - האם זה קורה בכל מרובע?",
          why_good: "המורה מכיר במקור הטענה ומערער בעדינות עם שאלה מכוונת"
        },
        {
          student: "תמיד אלכסון חוצה זווית",
          teacher_good: "במלבן - מה הזוויות? אם הזווית 90 מעלות, האלכסון חוצה אותה לשתי זוויות שוות? איך נבדוק?",
          why_good: "המורה שואל שאלות מכוונות שמובילות לבדיקה ולא לתשובה ישירה"
        },
        {
          student: "ככה למדנו",
          teacher_good: "אז במעוין - כן. אבל במלבן ובמקבילית - האלכסון לא חוצה זווית בדרך כלל. לא כל תכונה של אלכסון נכונה לכל המרובעים",
          why_good: "המורה מסכם בבהירות ומנסח הכללה נכונה"
        }
      ],
      negative: [
        {
          student: "אלכסון נכנס באמצע הזווית",
          teacher_bad: "לא נכון, אלכסון לא חוצה",
          why_bad: "פסילה ישירה בלי תהליך חשיבה"
        },
        {
          student: "ציירתי וזה יצא באמצע",
          teacher_bad: "ככה זה במתמטיקה",
          why_bad: "סמכותיות - לא מפתח הבנה"
        },
        {
          student: "זה התפקיד של אלכסון",
          teacher_bad: "זה תנאי הכרחי במעוין בלבד",
          why_bad: "שפה לוגית לא מותאמת גיל - מונחים לא מוכרים"
        }
      ]
    },
    
    feedback_templates: {
      detected: "מצוין! זיהית הכללת יתר, הובלת לבדיקה במקרים שונים, וסיכמת את ההבדל בין צורות",
      missed: "התלמיד הכליל תכונה ממעוין לכל המרובעים. כדאי לשאול על מלבן (זוויות 90 מעלות) ולהוביל לבדיקה"
    },
    
    priority_level: "high",
    
    curriculum_context: {
      grade: 9,
      topic: "תכונות אלכסונים במרובעים",
      key_points: [
        "האלכסון הראשי של הדלתון חוצה את זוויות הראש",
        "האלכסונים במעוין חוצים את הזוויות",
        "מקבילית שבה אלכסון חוצה את זווית המקבילית היא מעוין",
        "במלבן ובמקבילית כללית האלכסון לא בהכרח חוצה זווית",
        "חשוב להבחין בין תכונה של צורה מסוימת לתכונה כללית"
      ]
    },
    
    common_teacher_mistakes: [
      {
        mistake: "פסילה ישירה",
        example: "לא נכון, אלכסון לא חוצה",
        why_problematic: "בלי תהליך חשיבה - התלמיד לא מבין למה"
      },
      {
        mistake: "סמכותיות",
        example: "ככה זה במתמטיקה",
        why_problematic: "לא מפתח הבנה - רק דורש ציות"
      },
      {
        mistake: "שפה לוגית לא מותאמת גיל",
        example: "זה תנאי הכרחי במעוין בלבד",
        why_problematic: "מונחים לוגיים לא מוכרים לתלמידים"
      }
    ]
  }
  
  // ... add more skills as needed

];

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get all PCK skills
 * @returns {Array} Array of all PCK skill objects
 */
export function getAllSkills() {
  return pckSkills;
}

/**
 * Get skills by category
 * @param {string} category - Category name
 * @returns {Array} Array of skills in that category
 */
export function getSkillsByCategory(category) {
  return pckSkills.filter(skill => skill.category === category);
}

/**
 * Get skill by ID
 * @param {string} skillId - Skill identifier
 * @returns {Object|null} Skill object or null if not found
 */
export function getSkillById(skillId) {
  return pckSkills.find(skill => skill.skill_id === skillId) || null;
}

/**
 * Get skills by priority level
 * @param {string} priority - Priority level: "foundational", "intermediate", or "advanced"
 * @returns {Array} Array of skills at that priority level
 */
export function getSkillsByPriority(priority) {
  return pckSkills.filter(skill => skill.priority_level === priority);
}

/**
 * Format taxonomy for AI prompt
 * Converts the taxonomy into a readable format for the expert agent prompt
 * @returns {string} Formatted taxonomy string
 */
export function formatTaxonomyForPrompt() {
  let formatted = "PCK Skills Reference:\n\n";
  
  pckSkills.forEach((skill, index) => {
    formatted += `${index + 1}. ${skill.skill_name.he} (${skill.skill_id})\n`;
    formatted += `   תיאור: ${skill.description.he || skill.description}\n`;
    formatted += `   מחפשים:\n`;
    skill.indicators.forEach(indicator => {
      formatted += `   - ${indicator}\n`;
    });
    if (skill.examples && skill.examples.positive && skill.examples.positive[0]) {
      formatted += `   דוגמה טובה: "${skill.examples.positive[0].teacher_good}"\n`;
    }
    formatted += `\n`;
  });
  
  return formatted;
}

// Default export
export default {
  skills: pckSkills,
  getAllSkills,
  getSkillsByCategory,
  getSkillById,
  getSkillsByPriority,
  formatTaxonomyForPrompt
};

