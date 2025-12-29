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

  // ==================== YOUR SKILLS GO HERE ====================
  // Add your PCK skills below. You can copy-paste the structure above for each skill.
  // Make sure to:
  // 1. Use unique skill_id for each skill
  // 2. Fill in all required fields
  // 3. Write indicators, examples, and feedback in Hebrew
  // 4. Keep the comma after each skill object (except the last one)
  
  // Skill 1: [Add your first skill here]
  {
    "skill_id": "identify-diagonal-misconception-perpendicular",
    
    "skill_name": {
      "en": "Identifying Converse Statement Misconception (Perpendicular Diagonals)",
      "he": "זיהוי תפיסה שגויה על טענה והטענה ההפוכה - אלכסונים מאונכים"
    },
    
    "category": "student_thinking_knowledge",
    "subcategory": "misconceptions_about_quadrilaterals",
    
    "description": {
      "en": "Teacher identifies when a student incorrectly assumes that perpendicular diagonals imply a rhombus",
      "he": "המורה מזהה בלבול בין טענה לטענה ההפוכה: אלכסונים מאונכים אינם תנאי מספיק למעויין"
    },
    
    "indicators": [
      "מזהה שהבעיה היא בכיוון ההסקה",
      "מבקש לבדוק האם התכונה מספיקה או רק הכרחית",
      "מבקש דוגמה נגדית",
      "מדגיש הבדל בין 'אם' ל'רק אם'"
    ],
    
    "student_scenario": {
      "context": "שיחה על תכונות של מעויין",
      "student_says": "אם האלכסונים מאונכים אז זה מעויין",
      "misconception": "בלבול בין טענה נכונה לבין הטענה ההפוכה"
    },
    
    "examples": {
      "positive": [
        {
          "student": "אם האלכסונים מאונכים אז זה מעויין",
          "teacher_good": "נכון שבמעויין האלכסונים מאונכים. אבל האם זה מספיק? האם אתה יכול לחשוב על מרובע אחר שיש לו אלכסונים מאונכים אבל הוא לא מעויין?",
          "why_good": "המורה מזהה שהטענה נכונה רק בכיוון אחד ומוביל לבחינה ביקורתית באמצעות דוגמה נגדית"
        }
      ],
      "negative": [
        {
          "student": "אם האלכסונים מאונכים אז זה מעויין",
          "teacher_bad": "כן, אלכסונים מאונכים זה מעויין",
          "why_bad": "המורה מחזק תפיסה שגויה ולא מתייחס לכיוון ההסקה"
        }
      ]
    },
    
    "feedback_templates": {
      "detected": "כל הכבוד! זיהית בלבול בין טענה לטענה ההפוכה ועזרת לתלמידים להבין שהתכונה אינה מספיקה",
      "missed": "שים לב - התלמיד הסיק מסקנה בכיוון שגוי. כדאי להדגיש שתכונה יכולה להיות נכונה רק בכיוון אחד"
    },
    
    "priority_level": "high"
  }
  ,
  
  // Skill 2: [Add your second skill here]
  {
    "skill_id": "identify-diagonal-misconception-equal",
    
    "skill_name": {
      "en": "Identifying Converse Statement Misconception (Equal Diagonals)",
      "he": "זיהוי תפיסה שגויה על אלכסונים שווים"
    },
    
    "category": "student_thinking_knowledge",
    "subcategory": "misconceptions_about_quadrilaterals",
    
    "description": {
      "en": "Teacher identifies incorrect assumption that equal diagonals imply a rectangle",
      "he": "המורה מזהה תפיסה שגויה לפיה אלכסונים שווים מבטיחים שמדובר במלבן"
    },
    
    "indicators": [
      "מבקש לבדוק האם יש מרובעים נוספים עם אלכסונים שווים",
      "משווה בין תכונה הכרחית לתכונה מספיקה",
      "מבקש דוגמה נגדית"
    ],
    
    "student_scenario": {
      "context": "למידה על מלבנים",
      "student_says": "אם האלכסונים שווים אז זה מלבן",
      "misconception": "הנחה שתכונה הכרחית היא גם מספיקה"
    },
    
    "examples": {
      "positive": [
        {
          "student": "אם האלכסונים שווים אז זה מלבן",
          "teacher_good": "נכון שבמלבן האלכסונים שווים. אבל האם יש מרובע אחר עם אלכסונים שווים שאינו מלבן?",
          "why_good": "המורה מכוון להבנה שתכונה אחת לא מגדירה צורה לבדה"
        }
      ],
      "negative": [
        {
          "student": "אם האלכסונים שווים אז זה מלבן",
          "teacher_bad": "כן, זו אחת התכונות של מלבן",
          "why_bad": "המורה לא מתקן את ההסקה השגויה"
        }
      ]
    },
    
    "feedback_templates": {
      "detected": "יפה! עזרת לתלמיד להבין שתכונה אחת אינה מספיקה להגדרת מלבן",
      "missed": "כדאי להדגיש שתכונה הכרחית אינה תמיד מספיקה, ולבדוק מרובעים נוספים"
    },
    
    "priority_level": "high"
  }
  ,
  
  // Skill 3: [Add your third skill here]
  {
    "skill_id": "identify-diagonal-misconception-angle-bisectors",
    
    "skill_name": {
      "en": "Identifying Misconception About Diagonals Bisecting Angles",
      "he": "זיהוי תפיסה שגויה על אלכסונים החוצים זוויות"
    },
    
    "category": "student_thinking_knowledge",
    "subcategory": "misconceptions_about_quadrilaterals",
    
    "description": {
      "en": "Teacher identifies incorrect generalization that diagonals bisecting angles imply a square",
      "he": "המורה מזהה הכללה שגויה לפיה חציית זוויות ע״י אלכסונים מבטיחה ריבוע"
    },
    
    "indicators": [
      "מבקש לפרק את תכונות הריבוע",
      "משווה בין ריבוע למעויין",
      "מבקש לחשוב על תכונות חסרות"
    ],
    
    "student_scenario": {
      "context": "דיון על תכונות ריבוע",
      "student_says": "אם האלכסונים חוצים את הזוויות אז זה ריבוע",
      "misconception": "הכללת יתר מתכונה חלקית"
    },
    
    "examples": {
      "positive": [
        {
          "student": "אם האלכסונים חוצים את הזוויות אז זה ריבוע",
          "teacher_good": "זו תכונה נכונה של ריבוע, אבל גם של מעויין. מה עוד צריך כדי שזה יהיה ריבוע?",
          "why_good": "המורה משווה בין צורות קרובות ומחדד הבחנה"
        }
      ],
      "negative": [
        {
          "student": "אם האלכסונים חוצים את הזוויות אז זה ריבוע",
          "teacher_bad": "נכון, כי בריבוע האלכסונים חוצים זוויות",
          "why_bad": "המורה מאשר הכללה שגויה"
        }
      ]
    },
    
    "feedback_templates": {
      "detected": "מצוין! חידדת את ההבדל בין תכונות משותפות לתכונות מייחדות",
      "missed": "שים לב - התלמיד ערבב בין ריבוע למעויין. כדאי להשוות ביניהם במפורש"
    },
    
    "priority_level": "medium"
  }
  ,  

  // Skill 4: [Add your fourth skill here]
  {
    "skill_id": "identify-inclusion-misconception-square",
    
    "skill_name": {
      "en": "Identifying Inclusion Misconception (Square vs Rectangle/Rhombus)",
      "he": "זיהוי תפיסה שגויה על יחס הכלה - ריבוע"
    },
    
    "category": "student_thinking_knowledge",
    "subcategory": "misconceptions_about_quadrilaterals",
    
    "description": {
      "en": "Teacher identifies when student sees quadrilaterals as disjoint categories",
      "he": "המורה מזהה תפיסה לפיה ריבוע הוא צורה נפרדת ואינו מלבן או מעויין"
    },
    
    "indicators": [
      "מדבר על יחס הכלה",
      "משתמש בשפה של 'כל' או 'חלק מ'",
      "מצייר דיאגרמת הכלה או מתאר אותה"
    ],
    
    "student_scenario": {
      "context": "סיווג מרובעים",
      "student_says": "ריבוע זה לא מלבן, זו צורה אחרת",
      "misconception": "הבנת המרובעים כקטגוריות נפרדות"
    },
    
    "examples": {
      "positive": [
        {
          "student": "ריבוע זה לא מלבן",
          "teacher_good": "למעשה, כל ריבוע הוא גם מלבן, כי יש לו את כל התכונות של מלבן וגם תכונות נוספות",
          "why_good": "המורה מדגיש יחס הכלה ולא רק שמות צורות"
        }
      ],
      "negative": [
        {
          "student": "ריבוע זה לא מלבן",
          "teacher_bad": "ריבוע ומלבן זה שני דברים שונים",
          "why_bad": "המורה מחזק תפיסה היררכית שגויה"
        }
      ]
    },
    
    "feedback_templates": {
      "detected": "יפה! הצגת נכון את יחס ההכלה בין המרובעים",
      "missed": "כדאי להדגיש שמדובר ביחסי הכלה ולא בצורות נפרדות"
    },
    
    "priority_level": "high"
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

