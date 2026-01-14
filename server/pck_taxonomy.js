/**
 * PCK (Pedagogical Content Knowledge) Taxonomy for Backend
 * CommonJS version for Node.js server
 */

const pckSkills = [
  // Skill 5: Square vs Rectangle Inclusion (7th Grade) - NEW FORMAL SCENARIO
  {
    skill_id: "kcs-square-rectangle-inclusion-7th",
    skill_name: {
      en: "Identifying Inclusion Relationship Misconception: Square vs Rectangle (7th Grade)",
      he: "זיהוי תפיסה שגויה על יחסי הכלה בין ריבוע למלבן - כיתה ז'"
    },
    description: {
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
          text: "שאלה טובה! בואו נבדוק - מה ההגדרה של מלבן?",
          why: "המורה לא מתקן מיד, שואל על ההגדרה ומכוון לבדיקה לוגית"
        },
        {
          text: "איך אפשר להגדיר מלבן בצורה מדויקת יותר? אילו תכונות יש למלבן?",
          why: "המורה מכוון מהגדרה חזותית להגדרה פורמלית"
        }
      ],
      negative: [
        {
          text: "ריבוע הוא מלבן, ככה זה במתמטיקה",
          why: "תיקון סמכותי - זה סותם דיון, לא מטפל בתפיסה השגויה"
        },
        {
          text: "מלבן זה מרובע עם שתי צלעות ארוכות ושתי קצרות",
          why: "בלבול של המורה עצמו - זו טעות CK שמובילה לכשל KCS"
        }
      ]
    },
    common_teacher_mistakes: [
      {
        mistake: "תיקון סמכותי",
        example: "ריבוע הוא מלבן, ככה זה במתמטיקה"
      },
      {
        mistake: "שימוש בהגדרה לא פורמלית",
        example: "ריבוע זה כמו מלבן שנראה ככה"
      }
    ]
  },
  
  // Skill 6: Perpendicular Diagonals - Necessary vs Sufficient (9th Grade) - NEW FORMAL SCENARIO
  {
    skill_id: "kcs-perpendicular-diagonals-necessary-sufficient-9th",
    skill_name: {
      en: "Identifying Confusion Between Necessary and Sufficient Conditions: Perpendicular Diagonals (9th Grade)",
      he: "זיהוי בלבול בין תנאי הכרחי לתנאי מספיק - אלכסונים מאונכים - כיתה ט'"
    },
    description: {
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
          text: "נכון, במעוין באמת האלכסונים מאונכים. אבל בואו נחשוב - האם זו הצורה היחידה עם התכונה הזו?",
          why: "המורה מזהה את החלק הנכון, מאשר אותו, ומערער בעדינות עם שאלה מכוונת"
        },
        {
          text: "נכון שזו תכונה של מעוין. איזו עוד צורה למדנו שיש לה אלכסונים כאלה? בדלתון - איך האלכסונים נפגשים?",
          why: "המורה שואל שאלה מכוונת שמובילה לדוגמה נגדית"
        }
      ],
      negative: [
        {
          text: "לא, זה לא מעוין",
          why: "תיקון ישיר בלי נימוק, בלי תהליך חשיבה"
        },
        {
          text: "זה תנאי הכרחי אבל לא מספיק",
          why: "שפה לוגית לא מותאמת לגיל - מושג לא מוכר"
        }
      ]
    },
    common_teacher_mistakes: [
      {
        mistake: "תיקון ישיר",
        example: "לא, זה לא מעוין"
      },
      {
        mistake: "שפה לוגית לא מותאמת גיל",
        example: "זה תנאי הכרחי אבל לא מספיק"
      },
      {
        mistake: "הצפת מידע",
        example: "יש גם דלתון, טרפז, מרובע כללי, ועוד צורות רבות"
      }
    ]
  },
  
  // Skill 7: Rectangle Visual Prototype (7th Grade) - NEW FORMAL SCENARIO
  {
    skill_id: "kcs-rectangle-visual-prototype-7th",
    skill_name: {
      en: "Identifying Visual Prototype Misconception: Rectangles Must Be Long (7th Grade)",
      he: "זיהוי תפיסה חזותית שגויה - מלבן חייב להיות ארוך - כיתה ז'"
    },
    description: {
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
      misconception: "מלבן חייב להיות ארוך - דימוי אב-טיפוסי"
    },
    examples: {
      positive: [
        {
          text: "בואו נבדוק - מה ההגדרה של מלבן?",
          why: "המורה לא מתקן מיד, שואל על ההגדרה"
        },
        {
          text: "ההגדרה אומרת משהו על כמה הצלעות צריכות להיות ארוכות?",
          why: "המורה מכוון לבדיקת ההגדרה ולא המראה החזותי"
        }
      ],
      negative: [
        {
          text: "גם ריבוע הוא מלבן",
          why: "תיקון ישיר שלא מתייחס לתפיסה החזותית"
        },
        {
          text: "זה בסדר לקרוא לו מלבן",
          why: "לא מטפל בבעיה האמיתית - תלות בדימוי חזותי"
        }
      ]
    },
    common_teacher_mistakes: [
      {
        mistake: "תיקון ישיר",
        example: "גם ריבוע הוא מלבן"
      },
      {
        mistake: "לא מטפל בתפיסה החזותית",
        example: "זה בסדר לקרוא לו מלבן"
      }
    ]
  },
  
  // Skill 8: Diagonal Angle Bisector Overgeneralization (9th Grade) - NEW FORMAL SCENARIO
  {
    skill_id: "kcs-diagonal-angle-bisector-overgeneralization-9th",
    skill_name: {
      en: "Identifying Overgeneralization: Diagonals Always Bisect Angles (9th Grade)",
      he: "זיהוי הכללת יתר - אלכסון במרובע תמיד חוצה זווית - כיתה ט'"
    },
    description: {
      he: "המורה מזהה כאשר תלמידים מכלילים תכונה ספציפית של מרובעים מיוחדים (ריבוע, מעויין) לכל המרובעים"
    },
    indicators: [
      "מבקש לבדוק האם התכונה נכונה לכל מרובע",
      "שואל על מלבן כדוגמה נגדית",
      "מחזיר להגדרות ולתכונות של מרובעים שונים",
      "מפריד בין ריבוע למעויין לבין מרובעים אחרים",
      "מבקש לבדוק זוויות במרובעים ספציפיים"
    ],
    student_scenario: {
      context: "שיעור על תכונות אלכסונים במרובעים שונים",
      student_says: "אם אלכסון חוצה זווית, אז זה ריבוע",
      misconception: "הכללת יתר של תכונה ממרובעים מיוחדים לכל המרובעים"
    },
    examples: {
      positive: [
        {
          text: "בואו נבדוק האם התכונה הזו נכונה לכל מרובע. מה קורה במלבן?",
          why: "המורה מבקש לבדוק בדוגמה נגדית"
        },
        {
          text: "איזה מרובעים למדנו שיש להם את התכונה הזו? איזה מרובעים בטוח אין להם?",
          why: "המורה מוביל להפרדה בין סוגי מרובעים"
        }
      ],
      negative: [
        {
          text: "לא, זה לא נכון",
          why: "תיקון ישיר בלי הסבר"
        },
        {
          text: "זה נכון רק למעויין וריבוע",
          why: "מתן תשובה מוכנה בלי תהליך חקירה"
        }
      ]
    },
    common_teacher_mistakes: [
      {
        mistake: "תיקון ישיר",
        example: "לא, זה לא נכון"
      },
      {
        mistake: "מתן תשובה מוכנה",
        example: "זה נכון רק למעויין וריבוע"
      }
    ]
  }
];

/**
 * Get a PCK skill by its ID
 * @param {string} skillId - The skill ID to look up
 * @returns {Object|null} The skill object or null if not found
 */
function getPCKSkillById(skillId) {
  return pckSkills.find(skill => skill.skill_id === skillId) || null;
}

/**
 * Format PCK taxonomy for AI prompt
 * @returns {string} Formatted taxonomy string in Hebrew
 */
function formatTaxonomyForPrompt() {
  let formatted = "**מיומנויות PCK שהמערכת בודקת (אלו בלבד!):**\n\n";
  
  pckSkills.forEach((skill, index) => {
    formatted += `${index + 1}. **${skill.skill_name.he}**\n`;
    formatted += `   ${skill.description.he}\n`;
    formatted += `   מה לחפש:\n`;
    skill.indicators.forEach(indicator => {
      formatted += `   - ${indicator}\n`;
    });
    
    // Format examples
    if (skill.examples && skill.examples.positive && Array.isArray(skill.examples.positive)) {
      formatted += `   דוגמאות טובות:\n`;
      skill.examples.positive.forEach(ex => {
        formatted += `   - "${ex.text}" (${ex.why})\n`;
      });
    }
    formatted += `\n`;
  });
  
  return formatted;
}

/**
 * Format conversation history for AI prompt
 * @param {Array} history - Array of message objects with role and text
 * @returns {string} Formatted conversation string in Hebrew
 */
function formatConversationHistory(history) {
  if (!history || history.length === 0) {
    return "אין היסטוריה קודמת - זו התגובה הראשונה של המורה";
  }
  
  let formatted = "";
  history.forEach((msg, index) => {
    if (msg.role === 'user') {
      formatted += `מורה: ${msg.text}\n`;
    } else if (msg.role === 'assistant' || msg.name) {
      const name = msg.name || 'תלמיד';
      formatted += `${name}: ${msg.text}\n`;
    }
  });
  
  return formatted.trim();
}

export {
  pckSkills,
  getPCKSkillById,
  formatTaxonomyForPrompt,
  formatConversationHistory
};

