// PCK Pre/Post Test Configuration
// All question text is in Hebrew (RTL).

// The 5 PCK skills measured by the test.
// Each skill maps 1-to-1 to the corresponding question number (p1 → Q1, etc.).
export const PCK_SKILLS = [
  { id: "p1", label: "זיהוי השגיאה",    questionKey: "q1" },
  { id: "p2", label: "אפיון השגיאה",    questionKey: "q2" },
  { id: "p3", label: "פרשנות",           questionKey: "q3" },
  { id: "p4", label: "תגובה פדגוגית",   questionKey: "q4" },
  { id: "p5", label: "מינוף",            questionKey: "q5" },
];

const INCORRECT_QUESTIONS = [
  "מהי השגיאה המופיעה בטענה של התלמיד? הסבר בקצרה.",
  "איזה סוג שגיאה אתה מזהה כאן? נמק.",
  "מהו לדעתך מקור החשיבה האפשרי שהוביל את התלמיד לשגיאה זו?",
  "כיצד היית מגיב לתלמיד בכיתה לאחר שהציג טענה זו?",
  "כיצד ניתן לדעתך להשתמש בשגיאה זו כדי לקדם את הלמידה של התלמידים בכיתה?",
];

export const PRE_TEST = {
  testType: "pre",
  titleHe: "שאלון ידע פדגוגי של תוכן – לפני הסימולציה",
  scenarios: [
    {
      id: "scenario1",
      // Single-student claim
      claim: {
        type: "single",
        student: "מרים",
        prefix: "מרים טוענת",
        text: "מעוין איננו מקבילית כי אלה שתי צורות שונות",
      },
      image: null,
      questionText: "מה דעתך על הטענה של מרים?",
      questionsIncorrect: INCORRECT_QUESTIONS,
    },
    {
      id: "scenario2",
      // Single-student claim with supporting image
      claim: {
        type: "single",
        student: "יובל",
        prefix: "יובל",
        text: "הצורה בצד איננה ריבוע כי הוא לא ישר, הוא כזה מסובב",
      },
      image: "/images/rotated-square.png",
      imageAlt: "ריבוע מסובב",
      questionText: "מה דעתך על הטענה של יובל?",
      questionsIncorrect: INCORRECT_QUESTIONS,
    },
    {
      id: "scenario3",
      // Two-student dialog; question is about the second student's claim
      claim: {
        type: "dialog",
        exchanges: [
          { student: "אמיר", text: "ציירתי מרובע עם שני אלכסונים מאונכים" },
          { student: "רועי", text: "זה אומר שהצורה היא מעויין" },
        ],
      },
      image: null,
      questionText: "מה דעתך על הטענה של רועי?",
      questionsIncorrect: INCORRECT_QUESTIONS,
    },
  ],
};

export const POST_TEST = {
  testType: "post",
  titleHe: "שאלון ידע פדגוגי של תוכן – לאחר הסימולציה",
  scenarios: [
    {
      id: "scenario1",
      claim: {
        type: "single",
        student: "עדן",
        prefix: "עדן טוענת",
        text: "מעויין איננו דלתון כי אלה שתי צורות שונות",
      },
      image: null,
      questionText: "מה דעתך על הטענה של עדן?",
      questionsIncorrect: INCORRECT_QUESTIONS,
    },
    {
      id: "scenario2",
      claim: {
        type: "single",
        student: "אלון",
        prefix: "אלון",
        text: "הצורה בצד איננה מקבילית כי יש בה זוויות ישרות",
      },
      image: "/images/rotated-parallelogram.png",
      imageAlt: "מקבילית מסובבת",
      questionText: "מה דעתך על הטענה של אלון?",
      questionsIncorrect: INCORRECT_QUESTIONS,
    },
    {
      id: "scenario3",
      claim: {
        type: "dialog",
        exchanges: [
          { student: "אמיר", text: "המורה אמר לנו כי אם יש לנו מלבן אז האלכסונים שווים." },
          { student: "נועה", text: "כן, אז מרובע עם שני אלכסונים שווים הוא מלבן." },
        ],
      },
      image: null,
      questionText: "מה דעתך על הטענה של נועה?",
      questionsIncorrect: INCORRECT_QUESTIONS,
    },
  ],
};
