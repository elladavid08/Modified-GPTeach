/**
 * PCK (Pedagogical Content Knowledge) Taxonomy for Backend
 * CommonJS version for Node.js server
 */

const pckSkills = [
  {
    skill_id: "identify-diagonal-misconception-perpendicular",
    skill_name: {
      he: "זיהוי תפיסה שגויה על טענה והטענה ההפוכה - אלכסונים מאונכים"
    },
    description: {
      he: "המורה מזהה בלבול בין טענה לטענה ההפוכה: אלכסונים מאונכים אינם תנאי מספיק למעויין"
    },
    indicators: [
      "מזהה שהבעיה היא בכיוון ההסקה",
      "מבקש לבדוק האם התכונה מספיקה או רק הכרחית",
      "מבקש דוגמה נגדית",
      "מדגיש הבדל בין 'אם' ל'רק אם'"
    ],
    student_scenario: {
      student_says: "אם האלכסונים מאונכים אז זה מעויין",
      misconception: "בלבול בין טענה נכונה לבין הטענה ההפוכה"
    },
    examples: {
      positive: "נכון שבמעויין האלכסונים מאונכים. אבל האם זה מספיק? האם אתה יכול לחשוב על מרובע אחר שיש לו אלכסונים מאונכים אבל הוא לא מעויין?"
    }
  },
  {
    skill_id: "identify-diagonal-misconception-equal",
    skill_name: {
      he: "זיהוי תפיסה שגויה על אלכסונים שווים"
    },
    description: {
      he: "המורה מזהה תפיסה שגויה לפיה אלכסונים שווים מבטיחים שמדובר במלבן"
    },
    indicators: [
      "מבקש לבדוק האם יש מרובעים נוספים עם אלכסונים שווים",
      "משווה בין תכונה הכרחית לתכונה מספיקה",
      "מבקש דוגמה נגדית"
    ],
    student_scenario: {
      student_says: "אם האלכסונים שווים אז זה מלבן",
      misconception: "הנחה שתכונה הכרחית היא גם מספיקה"
    },
    examples: {
      positive: "נכון שבמלבן האלכסונים שווים. אבל האם יש מרובע אחר עם אלכסונים שווים שאינו מלבן?"
    }
  },
  {
    skill_id: "identify-diagonal-misconception-angle-bisectors",
    skill_name: {
      he: "זיהוי תפיסה שגויה על אלכסונים החוצים זוויות"
    },
    description: {
      he: "המורה מזהה הכללה שגויה לפיה חציית זוויות ע״י אלכסונים מבטיחה ריבוע"
    },
    indicators: [
      "מבקש לפרק את תכונות הריבוע",
      "משווה בין ריבוע למעויין",
      "מבקש לחשוב על תכונות חסרות"
    ],
    student_scenario: {
      student_says: "אם האלכסונים חוצים את הזוויות אז זה ריבוע",
      misconception: "הכללת יתר מתכונה חלקית"
    },
    examples: {
      positive: "זו תכונה נכונה של ריבוע, אבל גם של מעויין. מה עוד צריך כדי שזה יהיה ריבוע?"
    }
  },
  {
    skill_id: "identify-inclusion-misconception-square",
    skill_name: {
      he: "זיהוי תפיסה שגויה על יחס הכלה - ריבוע"
    },
    description: {
      he: "המורה מזהה תפיסה לפיה ריבוע הוא צורה נפרדת ואינו מלבן או מעויין"
    },
    indicators: [
      "מדבר על יחס הכלה",
      "משתמש בשפה של 'כל' או 'חלק מ'",
      "מצייר דיאגרמת הכלה או מתאר אותה"
    ],
    student_scenario: {
      student_says: "ריבוע זה לא מלבן, זו צורה אחרת",
      misconception: "הבנת המרובעים כקטגוריות נפרדות"
    },
    examples: {
      positive: "למעשה, כל ריבוע הוא גם מלבן, כי יש לו את כל התכונות של מלבן וגם תכונות נוספות"
    }
  }
];

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
    formatted += `   דוגמה טובה: "${skill.examples.positive}"\n`;
    formatted += `\n`;
  });
  
  return formatted;
}

export {
  pckSkills,
  formatTaxonomyForPrompt
};

