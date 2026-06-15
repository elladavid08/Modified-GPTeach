/**
 * Universal PCK Skills Taxonomy
 * Bilingual structure: English for conceptual understanding, Hebrew for pattern matching
 * RAG-ready: Can be used for vector search in future implementation
 */

const universalPCKSkills = [
  {
    skill_id: "error-identification",
    skill_name: {
      en: "Error Identification",
      he: "זיהוי השגיאה"
    },
    
    // Core concept (English for AI reasoning)
    description: {
      en: "The teacher recognizes that a student's statement contains an error, inaccuracy, or misconception.",
      he: "המורה מזהה שקיימת טעות או טענה לא נכונה או לא מדויקת בדברי התלמיד"
    },
    
    pedagogical_concept: "Error identification is the foundational step before any remediation. The teacher must demonstrate awareness that the student's reasoning contains a specific flaw.",
    
    // When is this skill relevant?
    trigger_conditions: {
      student_made_error: true,
      student_stated_misconception: true,
      student_gave_incorrect_answer: true
    },
    
    trigger_description: "This skill is relevant only when a student has expressed an error, misconception, or incorrect statement.",
    
    // Scoring rubric with Hebrew patterns
    scoring_rubric: {
      score_0: {
        label: "No identification",
        description: "Teacher ignores the error or reinforces the incorrect statement",
        hebrew_patterns: [
          "נכון",
          "כן, נכון",
          "[המורה עובר לנושא אחר]",
          "[אין תגובה לטעות]"
        ],
        examples_hebrew: [
          "המורה מתעלם או לא מגיב",
          "המורה מחזק את הטענה השגויה",
          "המורה עובר לנושא אחר"
        ]
      },
      
      score_1: {
        label: "Partial or indirect identification",
        description: "Teacher hints at an error but doesn't explicitly state it",
        hebrew_patterns: [
          "בואו נבדוק את זה",
          "אני לא בטוח שזה תמיד נכון",
          "האם זה תמיד נכון לדעתך?",
          "האם ייתכן מצב שבו זה לא יתקיים?",
          "מה לגבי מצב אחר?"
        ],
        examples_hebrew: [
          "לא נאמר במפורש שיש שגיאה",
          "שאלות שמרמזות על בעיה אבל לא מציינות אותה"
        ]
      },
      
      score_2: {
        label: "Clear and explicit identification",
        description: "Teacher explicitly states that there is an error or inaccuracy",
        hebrew_patterns: [
          "הטענה של X אינה נכונה",
          "המסקנה אינה נכונה",
          "יש כאן בלבול",
          "אתה מבלבל כאן",
          "זה לא בהכרח נכון",
          "זה לא תמיד נכון",
          "לא מדויק מה שאתה אומר",
          "ההגדרה אינה מדויקת"
        ],
        examples_hebrew: [
          "המורה מצביע ישירות על הטעות",
          "המורה אומר במפורש שיש בעיה"
        ]
      }
    }
  },
  
  {
    skill_id: "error-characterization",
    skill_name: {
      en: "Error Type Characterization",
      he: "אפיון סוג השגיאה"
    },
    
    description: {
      en: "The teacher identifies what type of logical or conceptual error is reflected in the student's statement.",
      he: "המורה מזהה איזה סוג שגיאה לוגית או מושגית משתקפת בטענת התלמיד"
    },
    
    pedagogical_concept: "Beyond recognizing an error exists, the teacher diagnoses the specific type of logical flaw: necessary vs. sufficient conditions, overgeneralization, visual prototype misconception, or inclusion relationship confusion.",
    
    trigger_conditions: {
      student_made_error: true,
      error_was_identified: true
    },
    
    trigger_description: "This skill is relevant when an error has been identified and the teacher needs to characterize its type.",
    
    scoring_rubric: {
      score_0: {
        label: "No characterization",
        description: "Teacher says it's wrong without explaining the type of error",
        hebrew_patterns: [
          "זה לא נכון",
          "יש כאן בלבול [ללא פירוט]",
          "לא"
        ],
        examples_hebrew: [
          "המורה אומר 'זה לא נכון' ללא הסבר",
          "אין התייחסות לסוג הכשל"
        ]
      },
      
      score_1: {
        label: "Partial characterization",
        description: "Teacher mentions the error type but without full precision",
        hebrew_patterns: [
          "אתם מערבבים בין תנאי הכרחי למספיק",
          "אתם מסתמכים רק על תכונה אחת",
          "אתם מבלבלים ביחס הכלה",
          "אתם מכלילים ממקרה פרטי"
        ],
        examples_hebrew: [
          "זיהוי חלקי של סוג הבעיה",
          "אזכור הקטגוריה אבל לא הסבר מלא"
        ]
      },
      
      score_2: {
        label: "Precise characterization",
        description: "Teacher explicitly names the specific logical or conceptual flaw",
        hebrew_patterns: [
          "זה תנאי הכרחי אך לא מספיק",
          "ההיפך אינו נכון",
          "אתם כאן מכלילים ממקרה פרטי",
          "לא בכל מקרה זה מתקיים",
          "אתם מסתמכים על איך שהצורה נראית",
          "זו תפיסה חזותית מטעה",
          "ריבוע הוא מקרה פרטי של מלבן",
          "זה שייך לתת קבוצה"
        ],
        examples_hebrew: [
          "המורה מציין במפורש את סוג הכשל הלוגי",
          "הבחנה ברורה בין תנאי הכרחי למספיק",
          "זיהוי מדויק של הכללה שגויה או תפיסה חזותית"
        ]
      }
    }
  },
  
  {
    skill_id: "diagnostic-interpretation",
    skill_name: {
      en: "Diagnostic Interpretation of Student Thinking",
      he: "פרשנות אבחונית של חשיבת התלמיד"
    },
    
    description: {
      en: "The teacher demonstrates understanding of the source of the student's incorrect thinking.",
      he: "המורה מגלה הבנה או מנסה להבין את מקור החשיבה השגויה של התלמיד"
    },
    
    pedagogical_concept: "The teacher goes beyond identifying what is wrong to understanding why the student thinks this way - what assumptions, prior knowledge, or reasoning patterns led to the error.",
    
    trigger_conditions: {
      student_made_error: true,
      error_was_identified: true
    },
    
    trigger_description: "This skill is relevant when the teacher attempts to understand the cognitive source of a student's error.",
    
    scoring_rubric: {
      score_0: {
        label: "No interpretation",
        description: "No attempt to understand the source of student thinking",
        hebrew_patterns: [
          "זה לא נכון",
          "לא"
        ],
        examples_hebrew: [
          "אין ניסיון להבין את מקור החשיבה",
          "רק תיקון ללא הבנה"
        ]
      },
      
      score_1: {
        label: "Partial interpretation",
        description: "Teacher makes a general observation about student thinking",
        hebrew_patterns: [
          "נראה שאתם מתבססים על תכונה אחת",
          "אתם מזהים כאן לפי המראה",
          "אתם מכלילים לפי דוגמה אחת"
        ],
        examples_hebrew: [
          "התייחסות כללית למקור הטעות",
          "אזכור הבסיס לחשיבה אבל לא ניתוח עמוק"
        ]
      },
      
      score_2: {
        label: "Deep interpretation",
        description: "Teacher articulates the underlying assumption or reasoning pattern causing the error",
        hebrew_patterns: [
          "נראה שאתם מניחים ש...",
          "אתם מתבססים על...",
          "החשיבה נשענת על...",
          "אתם מזהים לפי המראה...",
          "ההיגיון שלכם מבוסס על מקרה פרטי",
          "כנראה בדקתם רק תכונה אחת",
          "אתם מתייחסים רק ל...",
          "אתם מתעלמים מ..."
        ],
        examples_hebrew: [
          "נראה שאתם מניחים שאם תכונה אחת מתקיימת אז כל ההגדרה מתקיימת",
          "אתם מזהים את המרובע לפי הציור המוכר ולכן כשמסובבים אותו אתם לא מזהים אותו",
          "אתם מכלילים ממקרה אחד שבו... והסקתם ש..."
        ]
      }
    }
  },
  
  {
    skill_id: "adapted-pedagogical-response",
    skill_name: {
      en: "Adapted Pedagogical Response",
      he: "תגובה פדגוגית מותאמת"
    },
    
    description: {
      en: "The teacher chooses a pedagogical move that is adapted to the specific type of error identified, rather than a generic automatic response.",
      he: "המורה בוחר מהלך פדגוגי שמתאים לסוג השגיאה שזוהתה ולא תגובה כללית אוטומטית"
    },
    
    pedagogical_concept: "Effective teaching means selecting the right strategy for the specific error: guided questions, counterexamples, return to formal definitions, comparison tasks, or active student engagement.",
    
    trigger_conditions: {
      student_made_error: true,
      error_was_identified: true
    },
    
    trigger_description: "This skill is relevant when the teacher needs to respond to a student error with an appropriate pedagogical strategy.",
    
    // Teaching strategies (for reference)
    teaching_strategies: {
      guided_questions: ["האם זה תמיד נכון ש...?", "מה התנאים הדרושים?", "האם זה תנאי מספיק?"],
      counterexample: ["בואו ניקח דוגמה נגדית", "נמצא מקרה שלא מתאים"],
      return_to_definition: ["לפי ההגדרה...", "נחזור להגדרה של...", "מה ההגדרה של...?"],
      comparison: ["מה ההבדל בין... לבין...", "במה ריבוע שונה ממלבן?"],
      active_task: ["נסו למיין...", "בדקו אילו תכונות מתקיימות"],
      representation: ["נסובב את הצורה ונראה", "נבדוק ב-GeoGebra"]
    },
    
    scoring_rubric: {
      score_0: {
        label: "Direct correction",
        description: "Teacher gives the correct answer immediately without engaging student thinking",
        hebrew_patterns: [
          "זה לא נכון. ריבוע הוא מלבן",
          "טעות",
          "[מתן תשובה נכונה מיד]"
        ],
        examples_hebrew: [
          "המורה נותן תשובה נכונה מיד",
          "אין שאלות אבחון",
          "אין קישור להגדרה"
        ]
      },
      
      score_1: {
        label: "Partial guidance",
        description: "Teacher asks a generic question or returns to definition without depth",
        hebrew_patterns: [
          "מה ההגדרה של מלבן?",
          "תחשבו שוב",
          "בואו נחזור להגדרה"
        ],
        examples_hebrew: [
          "שאלה כללית אחת",
          "חזרה להגדרה בלי העמקה"
        ]
      },
      
      score_2: {
        label: "Deep guidance",
        description: "Teacher uses targeted diagnostic questions, counterexamples, or active tasks",
        hebrew_patterns: [
          "מה ההגדרה של מלבן? אילו תנאים נדרשים?",
          "האם ריבוע מקיים את כל התנאים?",
          "בואו נבנה מרובע שבו... אך...",
          "בואו ניקח דוגמה נגדית",
          "מה ההבדל בין X ל-Y?",
          "נבדוק האם מתקיימים כל התנאים"
        ],
        examples_hebrew: [
          "שאלות אבחון מדויקות",
          "קישור להגדרה עם העמקה",
          "שימוש בדוגמה נגדית",
          "הפעלה פעילה של תלמידים"
        ]
      }
    }
  },
  
  {
    skill_id: "error-leveraging",
    skill_name: {
      en: "Leveraging Error for Learning",
      he: "מינוף השגיאה ללמידה"
    },
    
    description: {
      en: "The teacher sees the error as a learning resource, not just a problem, and uses it to create deeper conceptual understanding.",
      he: "המורה רואה בשגיאה משאב ללמידה ולא רק בעיה. הוא משתמש בה כדי ליצור הבנה מושגית עמוקה יותר"
    },
    
    pedagogical_concept: "The error becomes an opportunity to build general principles, create conceptual distinctions, or develop broader mathematical understanding beyond just fixing the immediate mistake.",
    
    trigger_conditions: {
      student_made_error: true,
      error_was_identified: true,
      opportunity_for_generalization: true
    },
    
    trigger_description: "This skill is relevant when there's an opportunity to use the error for deeper conceptual learning beyond immediate correction.",
    
    scoring_rubric: {
      score_0: {
        label: "No leveraging",
        description: "Teacher only corrects, no conceptual expansion",
        hebrew_patterns: [
          "זה לא נכון",
          "זה לא מדויק",
          "ריבוע הוא מלבן וזהו"
        ],
        examples_hebrew: [
          "המורה רק מתקן",
          "אין הרחבה מושגית"
        ]
      },
      
      score_1: {
        label: "Partial leveraging",
        description: "Teacher addresses correct and incorrect parts but stays within narrow context",
        hebrew_patterns: [
          "זה תנאי לא מספיק",
          "נכון שאלכסונים מאונכים במעויין, אבל לא רק בו"
        ],
        examples_hebrew: [
          "התייחסות לחלק נכון וחלק שגוי",
          "הרחבה קטנה בלבד"
        ]
      },
      
      score_2: {
        label: "Full leveraging",
        description: "Teacher uses error to build general principles or conceptual relationships",
        hebrew_patterns: [
          "זו הזדמנות להבין את ההבדל בין תנאי הכרחי לתנאי מספיק",
          "מה למדנו מזה על תכונות המגדירות מושג?",
          "בואו נבדוק באילו מרובעים נוספים...",
          "מה אפשר ללמוד מזה?",
          "מה ניתן לשנות כך שהטענה תהיה נכונה?",
          "מה יקרה אם נחליף... ב...?",
          "האם ניתן להכליל את הטענה?",
          "זה מדגיש את ההבדל בין..."
        ],
        examples_hebrew: [
          "בניית עיקרון כללי",
          "הדגשת קשר בין מושגים",
          "יצירת הבחנה מושגית רחבה"
        ]
      }
    }
  }
];

const pckBoundaryRules = [
  {
    boundary_id: "error-identification-vs-error-characterization",
    skills: ["error-identification", "error-characterization"],
    title: "Error Identification vs. Error Characterization",
    guiding_questions: [
      "Does the teacher only hint that there is a problem/error, or also explain what type of problem/error it is?"
    ],
    distinctions: {
      "error-identification": {
        definition: "The teacher expresses disagreement, reservation, doubt, or suggests rechecking the claim. The teacher identifies that there is a problem/error, but does not explain its nature.",
        examples: [
          "האם זה תמיד נכון?",
          "אתה בטוח שזה נכון?",
          "אני לא בטוח שזה מדוייק",
          "בוא נבדוק את זה שוב"
        ]
      },
      "error-characterization": {
        definition: "The teacher identifies the type of error.",
        indicators: [
          "שגיאה הנוגעת ליחס הכלה בין צורות",
          "דימוי מושג שגוי או תפיסה חזותית שגויה",
          "בלבול בין תנאי הכרחי / מספיק",
          "שגיאה הנוגעת להגדרה או בלבול בהגדרה",
          "הכללה שגויה"
        ]
      }
    }
  },
  {
    boundary_id: "error-characterization-vs-diagnostic-interpretation",
    skills: ["error-characterization", "diagnostic-interpretation"],
    title: "Error Characterization vs. Diagnostic Interpretation",
    guiding_questions: [
      "Does the teacher only identify what type of error the student made, or also explain what in the student's thinking led to this error?",
      "Does the teacher focus on the error itself, or on the assumptions and reasoning patterns that caused the student to make it?",
      "Does the teacher answer the question \"What is the error?\", or also the question \"Why did the student reach this error?\""
    ],
    distinctions: {
      "error-characterization": {
        definition: "The teacher describes or classifies the type of error, but does not refer to the reason the student reached it. The focus is on the error itself. The question the teacher answers is: \"What error did the student make?\"",
        examples: [
          "זו הכללה ממקרה פרטי",
          "יש כאן תפיסה חזותית שגויה",
          "יש כאן בלבול בין תנאי מספיק לתנאי הכרחי",
          "יש כאן בלבול ביחסי הכלה בין המושגים"
        ]
      },
      "diagnostic-interpretation": {
        definition: "The teacher offers an explanation of the thinking, assumption, image, prior knowledge, or strategy that led the student to the error. The focus shifts from the error itself to the student's thinking. The question the teacher answers is: \"What in the student's thinking led to this error?\" Diagnostic Interpretation includes Error Characterization, possibly implicit, together with an explanation of why the error happened.",
        examples: [
          "נראה שאתם מכלילים משום שבדקתם רק מספר דוגמאות בלבד",
          "נראה שאתם מזהים את הצורה לפי המראה שלה ולא לפי ההגדרה",
          "נראה שאתם תופסים ריבוע ומלבן כקטגוריות נפרדות, כי אתם לא תופסים את יחסי ההיררכיה בין המרובעים",
          "נראה שאתם מניחים כי תכונה אחת מספיקה לקבוע את סוג המרובע"
        ]
      }
    }
  },
  {
    boundary_id: "diagnostic-interpretation-vs-adapted-pedagogical-response",
    skills: ["diagnostic-interpretation", "adapted-pedagogical-response"],
    title: "Diagnostic Interpretation vs. Adapted Pedagogical Response",
    guiding_questions: [
      "Does the teacher's response only indicate understanding of the source of the student's thinking, or does it also indicate an action/treatment path related to the error that moves the student forward?"
    ],
    distinctions: {
      "diagnostic-interpretation": {
        definition: "The teacher explains the source of the student's thinking, but does not offer a way to move forward.",
        examples: [
          "נראה שאתה חושב שסיבוב משנה את סוג הצורה",
          "כנראה שאתה מסתמך על דוגמאות שראית בעבר"
        ]
      },
      "adapted-pedagogical-response": {
        definition: "The teacher performs a pedagogical move that is adapted to the identified difficulty.",
        move_examples: [
          "asks a guiding question",
          "gives an example or counterexample",
          "returns to the definition",
          "uses an appropriate representation",
          "compares cases",
          "performs systematic checking"
        ],
        examples: [
          "תנסה לסובב דף / מלבן ולבדוק מה השתנה / מה נשמר",
          "בואו נחזור להגדרה של המושג / צורה (מקבילית / מעויין וכו')"
        ]
      }
    }
  },
  {
    boundary_id: "adapted-pedagogical-response-vs-error-leveraging",
    skills: ["adapted-pedagogical-response", "error-leveraging"],
    title: "Adapted Pedagogical Response vs. Leveraging Error for Learning",
    guiding_questions: [
      "Does the teacher address only the specific current error, or use it to promote broader learning, such as reaching a generalization, extending to other shapes, or deepening knowledge in the context of the error/concept?"
    ],
    distinctions: {
      "adapted-pedagogical-response": {
        definition: "The teacher focuses on solving the current difficulty or correcting the specific error. The learning remains at the level of the given case.",
        examples: [
          "תנסו לבדוק אם כל הזוויות ישרות בצורה הנתונה",
          "הנה דוגמה נגדית"
        ]
      },
      "error-leveraging": {
        definition: "The teacher uses the error or difficulty that emerged during the dialogue as a starting point for building broader insight that goes beyond the specific case being discussed.",
        broader_learning_moves: [
          "infer a general principle",
          "distinguish a reasoning pattern",
          "develop a strategy for solving similar problems",
          "reflect on the ways of thinking that led to the error"
        ],
        examples: [
          "מה המקרה הזה מלמד אותנו על היחסים בין מושגים בגיאומטריה?",
          "הראינו כי ריבוע הוא בהכרח מלבן. מה אפשר להסיק לגבי יחסי הכלה בין ריבוע ומקבילית?"
        ]
      }
    }
  }
];

/**
 * Get a PCK skill by its ID
 * @param {string} skillId - The skill ID to look up
 * @returns {Object|null} The skill object or null if not found
 */
function getPCKSkillById(skillId) {
  return universalPCKSkills.find(skill => skill.skill_id === skillId) || null;
}

/**
 * Get all PCK skills
 * @returns {Array} Array of all PCK skill objects
 */
function getAllPCKSkills() {
  return universalPCKSkills;
}

/**
 * Format skills for prompt injection (concise version for API efficiency)
 * @returns {string} Formatted string ready for AI prompt
 */
function formatSkillsForPrompt() {
  return universalPCKSkills.map(skill => {
    return `
**${skill.skill_id}: ${skill.skill_name.en}**
${skill.description.en}

Concept: ${skill.pedagogical_concept}

When relevant? ${skill.trigger_description}

Score 0 (${skill.scoring_rubric.score_0.label}): ${skill.scoring_rubric.score_0.description}
Hebrew patterns: ${skill.scoring_rubric.score_0.hebrew_patterns.slice(0, 3).join(', ')}

Score 1 (${skill.scoring_rubric.score_1.label}): ${skill.scoring_rubric.score_1.description}
Hebrew patterns: ${skill.scoring_rubric.score_1.hebrew_patterns.slice(0, 3).join(', ')}

Score 2 (${skill.scoring_rubric.score_2.label}): ${skill.scoring_rubric.score_2.description}
Hebrew patterns: ${skill.scoring_rubric.score_2.hebrew_patterns.slice(0, 3).join(', ')}
`;
  }).join('\n---\n');
}

/**
 * Format adjacent-skill boundary rules for prompt injection.
 * @returns {string} Concise boundary-rule guidance for an AI prompt
 */
function formatBoundaryRulesForPrompt() {
  return pckBoundaryRules.map((rule) => {
    const distinctionText = rule.skills.map((skillId) => {
      const distinction = rule.distinctions[skillId];
      const parts = [
        `- ${skillId}: ${distinction.definition}`
      ];

      if (distinction.indicators && distinction.indicators.length > 0) {
        parts.push(`  Indicators: ${distinction.indicators.join('; ')}`);
      }

      if (distinction.move_examples && distinction.move_examples.length > 0) {
        parts.push(`  Adapted move examples: ${distinction.move_examples.join('; ')}`);
      }

      if (distinction.broader_learning_moves && distinction.broader_learning_moves.length > 0) {
        parts.push(`  Broader learning moves: ${distinction.broader_learning_moves.join('; ')}`);
      }

      if (distinction.examples && distinction.examples.length > 0) {
        parts.push(`  Examples: ${distinction.examples.join('; ')}`);
      }

      return parts.join('\n');
    }).join('\n');

    return `## ${rule.title}
Guiding question(s):
${rule.guiding_questions.map((question) => `- ${question}`).join('\n')}

Distinction:
${distinctionText}`;
  }).join('\n\n---\n\n');
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
  history.forEach((msg) => {
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
  universalPCKSkills,
  pckBoundaryRules,
  getPCKSkillById,
  getAllPCKSkills,
  formatSkillsForPrompt,
  formatBoundaryRulesForPrompt,
  formatConversationHistory
};
