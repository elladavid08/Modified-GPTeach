/**
 * Scenario-specific PCK misconception guidance.
 *
 * These responses are expert-provided examples of suitable adapted
 * pedagogical responses. They are not exhaustive and should be used as
 * guidance rather than as a closed scoring checklist.
 */

const scenarioMisconceptionGuidance = [
  {
    guidance_id: "square-rectangle-inclusion",
    lesson_title: "יחסי הכלה בין ריבוע למלבן",
    match_terms: [
      "יחסי הכלה בין ריבוע למלבן",
      "ריבוע למלבן",
      "ריבוע ומלבן",
      "kcs-square-rectangle-inclusion-7th"
    ],
    misconceptions: [
      {
        misconception_text: "זה ריבוע, לא מלבן",
        suitable_pedagogical_responses: [
          "מה ההגדרה של מלבן?",
          "האם הריבוע מקיים את הגדרת המלבן?"
        ]
      },
      {
        misconception_text: "מלבנים וריבועים הם 2 קבוצות נפרדות",
        suitable_pedagogical_responses: [
          "בואו נסתכל על 2 קבוצות אחרות - קבוצת בעלי החיים וקבוצת הכלבים.",
          "האם אלו קבוצות נפרדות? או שיש ביניהן קשר?",
          "עכשיו נחשוב על קבוצת המלבנים וקבוצת הריבועים - האם יש ביניהן קשר כזה?"
        ]
      },
      {
        misconception_text: "ריבוע אינו מלבן / צורה אחת לא יכולה להשתייך לשתי קבוצות",
        suitable_pedagogical_responses: [
          "נסה לחזור להגדרות של שני המושגים ובקש מהתלמידים להשוות בין התנאים המגדירים אותם.",
          "נסה לבקש מהתלמידים לבדוק האם כל התנאים של המושג הרחב מתקיימים גם במושג הפרטי.",
          "נסה להשתמש בדוגמה של קבוצה ותת־קבוצה כדי לבחון את היחס בין המושגים."
        ]
      }
    ]
  },
  {
    guidance_id: "kite-rhombus-inclusion",
    lesson_title: "יחסי הכלה בין דלתון למעוין",
    match_terms: [
      "יחסי הכלה בין דלתון למעוין",
      "דלתון למעוין",
      "דלתון ומעוין",
      "kcs-kite-rhombus-inclusion-9th"
    ],
    misconceptions: [
      {
        misconception_text: "מעוין זה לא דלתון.",
        suitable_pedagogical_responses: [
          "מה ההגדרה של דלתון?",
          "האם המעוין מקיים את הגדרת הדלתון?"
        ]
      },
      {
        misconception_text: "אלה שתי צורות שונות. צורה אחת לא יכולה להיות 2 דברים.",
        suitable_pedagogical_responses: [
          "בואו נסתכל על 2 קבוצות אחרות - קבוצת בעלי החיים וקבוצת הכלבים.",
          "האם אלו קבוצות נפרדות? או שיש ביניהן קשר?",
          "עכשיו נחשוב על קבוצת הדלתונים וקבוצת המעוינים - האם יש ביניהן קשר כזה?"
        ]
      },
      {
        misconception_text: "בדלתון יש רק שתי צלעות שוות, ובמעוין יש ארבע. אם כל הצלעות שוות זה כבר לא דלתון.",
        suitable_pedagogical_responses: [
          "מה ההגדרה של דלתון?",
          "האם המעוין מקיים את הגדרת הדלתון?",
          "המעוין הוא דלתון מיוחד. הוא גם דלתון וגם מעוין.",
          "נסה להשוות בין הגדרת הדלתון להגדרת המעוין ולבדוק האם קיום יותר משתי צלעות שוות מבטל את הגדרת הדלתון."
        ]
      },
      {
        misconception_text: "מעוין אינו דלתון / צורה אחת לא יכולה להשתייך לשתי קבוצות",
        suitable_pedagogical_responses: [
          "נסה לחזור להגדרות של שני המושגים ובקש מהתלמידים להשוות בין התנאים המגדירים אותם.",
          "נסה לבקש מהתלמידים לבדוק האם כל התנאים של המושג הרחב מתקיימים גם במושג הפרטי.",
          "נסה להשתמש בדוגמה של קבוצה ותת־קבוצה כדי לבחון את היחס בין המושגים."
        ]
      }
    ]
  },
  {
    guidance_id: "rhombus-diagonals-identification",
    lesson_title: "זיהוי מעוין על סמך תכונות האלכסונים",
    match_terms: [
      "זיהוי מעוין על סמך תכונות האלכסונים",
      "זיהוי מעוין",
      "אלכסונים מאונכים",
      "kcs-perpendicular-diagonals-necessary-sufficient-9th"
    ],
    misconceptions: [
      {
        misconception_text: "זה חייב להיות מעוין, כי האלכסונים מאונכים.",
        suitable_pedagogical_responses: [
          "בואו ננסה לבדוק סוגים שונים של מרובעים.",
          "באילו עוד מרובעים האלכסונים מאונכים זה לזה?"
        ]
      },
      {
        misconception_text: "זו תכונה של מעוין. ולכן אם האלכסונים מאונכים אז זה מעוין.",
        suitable_pedagogical_responses: [
          "זו בהחלט תכונה של מעוין, אבל האם היא באמת קובעת שזה מעוין?",
          "בואו נסתכל על מרובעים נוספים שהאלכסונים שלהם מאונכים זה לזה.",
          "לדוגמה דלתון. האם האלכסונים שלו מאונכים זה לזה?",
          "והאם הוא מקיים את הגדרת המעוין?"
        ]
      }
    ]
  },
  {
    guidance_id: "square-diagonals-identification",
    lesson_title: "זיהוי ריבוע על סמך תכונות האלכסונים",
    match_terms: [
      "זיהוי ריבוע על סמך תכונות האלכסונים",
      "זיהוי ריבוע",
      "אלכסונים שווים ומאונכים",
      "אלכסונים שווים וגם ניצבים",
      "kcs-square-identification-equal-perpendicular-diagonals-9th"
    ],
    misconceptions: [
      {
        misconception_text: "זה ריבוע, כי האלכסונים שווים וגם ניצבים. אין עוד צורה עם אלכסונים כאלה.",
        suitable_pedagogical_responses: [
          "The teacher tries to draw two equal and perpendicular segments, while confirming with the students that the segments are equal and perpendicular.",
          "The teacher then connects the endpoints of the segments to create a quadrilateral whose diagonals are those segments.",
          "The teacher asks: \"האם במרובע הזה האלכסונים שווים ומאונכים?\"",
          "The teacher asks: \"האם זהו ריבוע?\"",
          "The teacher asks: \"מה ניתן להסיק מכך?\""
        ]
      }
    ]
  },
  {
    guidance_id: "rectangle-definition-identification",
    lesson_title: "הגדרת המלבן וזיהוי מלבנים",
    match_terms: [
      "הגדרת המלבן וזיהוי מלבנים",
      "הגדרת המלבן",
      "זיהוי מלבנים",
      "תפיסה חזותית",
      "kcs-rectangle-visual-prototype-7th"
    ],
    misconceptions: [
      {
        misconception_text: "זה לא נראה כמו מלבן כי הוא מסובב. מלבן צריך להיות ישר.",
        suitable_pedagogical_responses: [
          "אני מבינה שאתם לא רגילים לראות מלבן בצורה הזו.",
          "בואו ננסה לבדוק ביחד: האם הוא מלבן?",
          "איך בודקים את זה?",
          "לפי הגדרת המלבן - האם כל זוויותיו ישרות?",
          "אם כן - הוא מלבן, למרות שסובבו אותו קצת.",
          "זה כמו שניקח שולחן ונסובב אותו. האם הוא יפסיק להיות שולחן?"
        ]
      },
      {
        misconception_text: "זה לא נראה כמו מלבן כי הוא ריבוע.",
        suitable_pedagogical_responses: [
          "מה ההגדרה של מלבן?",
          "כתוב בה משהו על אורך הצלעות?",
          "בואו נבדוק: הזוויות ישרות או לא?"
        ]
      },
      {
        misconception_text: "מלבן חייב להיות ארוך / מלבן אינו יכול להיות מסובב / ריבוע אינו מלבן כי הוא נראה אחרת",
        suitable_pedagogical_responses: [
          "נסה להפנות את התלמידים להגדרה הפורמלית של המושג במקום למראה החזותי שלו.",
          "נסה להציג מופעים שונים של אותו מושג ולבקש מהתלמידים לבדוק האם ההגדרה עדיין מתקיימת.",
          "נסה לשאול אילו תכונות נשמרות גם כאשר הצורה מסובבת או משנה את מיקומה."
        ]
      }
    ]
  },
  {
    guidance_id: "quadrilateral-diagonal-angle-bisectors",
    lesson_title: "תכונות אלכסונים במרובעים שונים",
    match_terms: [
      "תכונות אלכסונים במרובעים שונים",
      "תכונות אלכסונים",
      "חוצה זווית",
      "kcs-diagonal-angle-bisector-overgeneralization-9th"
    ],
    misconceptions: [
      {
        misconception_text: "במעוין האלכסון חוצה את הזווית, אז גם כאן במלבן",
        response_options: [
          {
            label: "Option 1",
            suitable_pedagogical_responses: [
              "זו באמת תכונה של מעוין, אבל האם היא בהכרח נכונה גם למלבן?",
              "בואו נשרטט מלבן צר וארוך מאד.",
              "ועכשיו נשרטט את האלכסונים.",
              "האם גם כאן זה נראה שהם באמת חוצים את הזוויות?"
            ]
          },
          {
            label: "Option 2",
            suitable_pedagogical_responses: [
              "בואו נבדוק:",
              "The teacher draws a rectangle with two diagonals.",
              "The teacher asks: \"מה גודל הזווית של המלבן?\"",
              "The teacher asks: \"אם האלכסון חוצה אותה לשתיים, מה גודלה של כל זווית?\"",
              "The teacher asks students to look at one of the triangles.",
              "The teacher asks: \"אם כל 2 זוויות שלו הן 45, מה גודל הזווית השלישית לפי סכום זוויות במשולש?\"",
              "The teacher concludes: \"כלומר, קיבלנו שהאלכסונים מאונכים זה לזה.\"",
              "The teacher concludes: \"האם זה קורה בכל מלבן?\"",
              "The teacher concludes: \"מסקנה: האלכסון לא בהכרח חוצה את זוויות המלבן.\""
            ]
          }
        ]
      },
      {
        misconception_text: "ציירתי את האלכסון של המלבן וזה יצא באמצע",
        response_options: [
          {
            label: "Option 1",
            suitable_pedagogical_responses: [
              "לפעמים כשהשרטוט לא מדויק או קטן מדי זה באמת נראה שהאלכסון חוצה את הזווית.",
              "בואו נשרטט מלבן צר וארוך מאד.",
              "ועכשיו נשרטט את האלכסונים.",
              "האם גם כאן זה נראה שהם באמת חוצים את הזוויות?"
            ]
          },
          {
            label: "Option 2",
            suitable_pedagogical_responses: [
              "בואו נבדוק:",
              "The teacher draws a rectangle with two diagonals.",
              "The teacher asks: \"מה גודל הזווית של המלבן?\"",
              "The teacher asks: \"אם האלכסון חוצה אותה לשתיים, מה גודלה של כל זווית?\"",
              "The teacher asks students to look at one of the triangles.",
              "The teacher asks: \"אם כל 2 זוויות שלו הן 45, מה גודל הזווית השלישית לפי סכום זוויות במשולש?\"",
              "The teacher concludes: \"כלומר, קיבלנו שהאלכסונים מאונכים זה לזה.\"",
              "The teacher concludes: \"האם זה קורה בכל מלבן?\"",
              "The teacher concludes: \"מסקנה: האלכסון לא בהכרח חוצה את זוויות המלבן.\""
            ]
          }
        ]
      }
    ]
  }
];

function normalizeForGuidanceMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function collectScenarioText(scenario) {
  if (!scenario) {
    return '';
  }

  const fields = [
    scenario.text,
    scenario.ai_context_summary,
    scenario.ai_prior_knowledge,
    scenario.misconception_focus,
    Array.isArray(scenario.ai_pedagogical_focus) ? scenario.ai_pedagogical_focus.join(' ') : '',
    Array.isArray(scenario.target_pck_skills) ? scenario.target_pck_skills.join(' ') : ''
  ];

  return normalizeForGuidanceMatch(fields.filter(Boolean).join(' '));
}

function scoreGuidanceMatch(guidance, scenarioText) {
  const terms = [guidance.lesson_title, ...(guidance.match_terms || [])];
  let score = 0;

  terms.forEach((term) => {
    const normalizedTerm = normalizeForGuidanceMatch(term);
    if (normalizedTerm && scenarioText.includes(normalizedTerm)) {
      score += normalizedTerm === normalizeForGuidanceMatch(guidance.lesson_title) ? 3 : 1;
    }
  });

  guidance.misconceptions.forEach((item) => {
    const normalizedMisconception = normalizeForGuidanceMatch(item.misconception_text);
    if (normalizedMisconception && scenarioText.includes(normalizedMisconception)) {
      score += 2;
    }
  });

  return score;
}

/**
 * Select the most relevant scenario misconception guidance using available
 * scenario text fields. Matching is intentionally simple and deterministic.
 *
 * @param {Object} scenario - Current scenario object from the frontend
 * @returns {Object|null} Best matching guidance entry, or null if none matches
 */
function getScenarioMisconceptionGuidance(scenario) {
  const scenarioText = collectScenarioText(scenario);

  if (!scenarioText) {
    return null;
  }

  let bestMatch = null;
  let bestScore = 0;

  scenarioMisconceptionGuidance.forEach((guidance) => {
    const score = scoreGuidanceMatch(guidance, scenarioText);
    if (score > bestScore) {
      bestMatch = guidance;
      bestScore = score;
    }
  });

  return bestMatch;
}

function formatMisconceptionResponses(item) {
  if (item.response_options && item.response_options.length > 0) {
    return item.response_options.map((option) => {
      return `${option.label}:\n${option.suitable_pedagogical_responses.map((response) => `  - ${response}`).join('\n')}`;
    }).join('\n');
  }

  return item.suitable_pedagogical_responses.map((response) => `- ${response}`).join('\n');
}

/**
 * Format a scenario guidance entry for prompt injection.
 * This formatter is not wired into the active PCK prompt yet.
 *
 * @param {Object|null} guidance - Guidance returned by getScenarioMisconceptionGuidance
 * @returns {string} Prompt-ready guidance section
 */
function formatScenarioMisconceptionGuidanceForPrompt(guidance) {
  if (!guidance) {
    return '';
  }

  const misconceptionsText = guidance.misconceptions.map((item) => {
    return `Misconception/error: "${item.misconception_text}"
Suitable pedagogical response examples:
${formatMisconceptionResponses(item)}`;
  }).join('\n\n');

  return `## Scenario-Specific Misconception Guidance
Lesson: ${guidance.lesson_title}

Important: These are examples of adapted pedagogical responses. Other suitable responses may also exist.

${misconceptionsText}`;
}

export {
  scenarioMisconceptionGuidance,
  getScenarioMisconceptionGuidance,
  formatScenarioMisconceptionGuidanceForPrompt
};
