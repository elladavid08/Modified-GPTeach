// Replay plans for the six production scenarios (research-only; no participant data).
//
// `turns` are the 12 fixed teacher turns used for the 1.3.9, 1.3.10 and 1.3.11 sequential replays
// (reconstructed verbatim from the session harness, see README "Provenance"). {A} {B} {C} are cast
// slots: A = cast[0] (addressed at T2, T7), B = cast[1] (T4, T11), C = cast[2] (T10).
// `move` tags each scripted turn's pedagogical function; Mode B uses it (lib/teacher.js).
// `answerIfUnsure` (Mode B): answer-bank category the planned question targets; if the addressed student
// is unsure or silent, the teacher gives that answer before the next planned move.
// `drawing` is the CORRECTED benchmark asset id (config/drawings in lib/assets.js);
// `historicalDrawing` is the production image the 1.3.9-1.3.11 runs attached instead.
//
// `scenarioIndex` is the index in src/config/scenarios/geometry_scenarios.js (production, read-only).

// Bump when the teacher plans, answer bank, rules, labels or assets change (recorded in every run manifest).
// 1.1.0: prompt-example sets per SYSTEM_VERSION (1.3.12 neutral examples), placeholder / invalid-name labels.
export const HARNESS_VERSION = '1.1.0';

export const MOVES = Object.freeze({
  OPEN: 'open',
  DIRECT_Q: 'direct_question',
  PROBE_ACK: 'probe_ack', // "אוקיי"
  PROBE_VALIDATE: 'probe_validate', // "נכון" / "יפה": may not confirm a misconception in Mode B
  PROBE_QMARK: 'probe_qmark', // "?"
  PEER_Q: 'peer_question', // "B, what do you think about what was said?"
  EXPLAIN: 'explain', // the teacher addresses the scenario misconception
  CHECK: 'check_question', // re-ask of the T2 question (check for understanding)
  CONTENT_Q: 'content_question',
  DRAWING_Q: 'drawing_question',
  SUMMARY: 'summary_request',
  CLOSING: 'closing',
});
const M = MOVES;

export const SCENARIOS = [
  {
    id: 1,
    slug: 'square-rectangle-inclusion',
    scenarioIndex: 0,
    turns: [
      { text: 'שלום כיתה! בשיעור הקודם למדנו על מלבן. מה ההגדרה של מלבן?', move: M.OPEN },
      { text: '{A}, האם ריבוע הוא מלבן לדעתך?', move: M.DIRECT_Q },
      { text: 'אוקיי', move: M.PROBE_ACK },
      { text: '{B}, מה דעתך על מה שנאמר?', move: M.PEER_Q },
      { text: 'בואו נבדוק לפי ההגדרה: מלבן הוא מרובע שכל זוויותיו ישרות. לריבוע יש ארבע זוויות ישרות, ולכן כל ריבוע הוא מלבן. המראה לא משנה, רק ההגדרה.', move: M.EXPLAIN },
      { text: 'נכון', move: M.PROBE_VALIDATE },
      { text: '{A}, אז עכשיו - האם ריבוע הוא מלבן?', move: M.CHECK },
      { text: 'ומה לגבי ההפך - האם כל מלבן הוא ריבוע?', move: M.CONTENT_Q },
      { text: '?', move: M.PROBE_QMARK },
      { text: '{C}, תן או תני דוגמה למלבן שאינו ריבוע.', move: M.CONTENT_Q },
      { text: '{B}, סכם או סכמי במשפט אחד מה למדנו היום.', move: M.SUMMARY },
      { text: 'יפה מאוד, כל הכבוד.', move: M.CLOSING },
    ],
  },
  {
    id: 2,
    slug: 'rhombus-perpendicular-diagonals',
    scenarioIndex: 1,
    turns: [
      { text: 'שלום לכולם. מה אתם יודעים על האלכסונים במעוין?', move: M.OPEN },
      { text: '{A}, אם במרובע האלכסונים מאונכים, האם הוא בהכרח מעוין?', move: M.DIRECT_Q },
      { text: 'יפה', move: M.PROBE_VALIDATE },
      { text: '{B}, את או אתה מסכים?', move: M.PEER_Q },
      { text: 'שרטטתי על הלוח מרובע שהאלכסונים שלו מאונכים אבל הוא לא מעוין - זה דלתון. אז אלכסונים מאונכים הם תנאי הכרחי למעוין, אבל לא מספיק.', move: M.EXPLAIN, drawing: 'kite', historicalDrawing: 'rotated-square.png' },
      { text: 'נכון', move: M.PROBE_VALIDATE },
      { text: '{A}, אז האם אלכסונים מאונכים מספיקים כדי לקבוע שמרובע הוא מעוין?', move: M.CHECK },
      { text: 'מה עוד צריך לדעת על האלכסונים כדי לקבוע שזה מעוין?', move: M.CONTENT_Q },
      { text: 'אוקיי', move: M.PROBE_ACK },
      { text: '{C}, מה ההבדל בין תכונה הכרחית לתכונה מספיקה?', move: M.CONTENT_Q, answerIfUnsure: 'NEC_SUF' },
      { text: '{B}, אם האלכסונים מאונכים וגם חוצים זה את זה - זה מעוין?', move: M.CONTENT_Q },
      { text: 'יפה, תודה לכם.', move: M.CLOSING },
    ],
  },
  {
    id: 3,
    slug: 'rectangle-visual-prototype',
    scenarioIndex: 2,
    turns: [
      { text: 'בוקר טוב! מי יכול לתאר לי מה זה מלבן?', move: M.OPEN },
      { text: '{A}, האם מלבן חייב להיות ארוך וצר?', move: M.DIRECT_Q },
      { text: 'אוקיי', move: M.PROBE_ACK },
      { text: '{B}, מה דעתך?', move: M.PEER_Q },
      { text: 'ההגדרה של מלבן היא מרובע שכל זוויותיו ישרות. אין שום דרישה שיהיה ארוך או צר. גם צורה שמסובבת על הצד היא מלבן אם כל זוויותיה ישרות.', move: M.EXPLAIN },
      { text: 'נכון', move: M.PROBE_VALIDATE },
      { text: '{A}, אז אם כל הצלעות שוות וכל הזוויות ישרות - זה מלבן?', move: M.CHECK },
      { text: 'הנה צורה מסובבת על הלוח. איך תבדקו אם היא מלבן?', move: M.DRAWING_Q, drawing: 'rotated-rectangle', historicalDrawing: 'rotated-parallelogram.png' },
      { text: '?', move: M.PROBE_QMARK },
      { text: '{C}, מה צריך לבדוק כדי לדעת שמרובע הוא מלבן?', move: M.CONTENT_Q, answerIfUnsure: 'HOW_CHECK' },
      { text: '{B}, האם מראה של צורה יכול להטעות? תן או תני דוגמה.', move: M.CONTENT_Q },
      { text: 'יפה מאוד.', move: M.CLOSING },
    ],
  },
  {
    id: 4,
    slug: 'diagonal-angle-bisector-overgeneralization',
    scenarioIndex: 3,
    turns: [
      { text: 'היום נבדוק תכונות של אלכסונים במרובעים שונים. באילו מרובעים האלכסונים חוצים את הזוויות?', move: M.OPEN },
      { text: '{A}, האם במלבן האלכסונים חוצים את הזוויות?', move: M.DIRECT_Q },
      { text: 'יפה', move: M.PROBE_VALIDATE },
      { text: '{B}, מה דעתך על הטענה שבכל מרובע שבו האלכסונים חוצים זה את זה, הם גם חוצים את הזוויות?', move: M.PEER_Q },
      { text: 'במלבן ובמקבילית האלכסונים חוצים זה את זה, אבל לא חוצים את הזוויות. רק במעוין ובריבוע הם גם חוצים את הזוויות.', move: M.EXPLAIN },
      { text: 'נכון', move: M.PROBE_VALIDATE },
      { text: '{A}, אז במלבן - האלכסונים חוצים את הזוויות או לא?', move: M.CHECK },
      { text: 'הנה מקבילית על הלוח. מה תגידו על האלכסון שלה?', move: M.DRAWING_Q, drawing: 'parallelogram', historicalDrawing: 'rotated-parallelogram.png' },
      { text: 'אוקיי', move: M.PROBE_ACK },
      { text: '{C}, למה דווקא במעוין האלכסונים חוצים את הזוויות?', move: M.CONTENT_Q, answerIfUnsure: 'WHY' },
      { text: '{B}, סכם או סכמי: באילו מרובעים האלכסונים חוצים את הזוויות?', move: M.SUMMARY },
      { text: 'יפה, תודה.', move: M.CLOSING },
    ],
  },
  {
    id: 5,
    slug: 'square-from-diagonals',
    scenarioIndex: 4,
    turns: [
      { text: 'שלום כיתה. אילו תכונות של אלכסונים אתם מכירים בריבוע?', move: M.OPEN },
      { text: '{A}, אם במרובע האלכסונים שווים, האם הוא ריבוע?', move: M.DIRECT_Q },
      { text: 'אוקיי', move: M.PROBE_ACK },
      { text: '{B}, ואם האלכסונים שווים ומאונכים - זה מספיק?', move: M.PEER_Q },
      { text: 'אלכסונים שווים ומאונכים זה לא מספיק. הם צריכים גם לחצות זה את זה. רק אם האלכסונים שווים, מאונכים וחוצים זה את זה, המרובע הוא ריבוע.', move: M.EXPLAIN },
      { text: 'נכון', move: M.PROBE_VALIDATE },
      { text: '{A}, אז אלכסונים שווים לבד - מספיק לריבוע?', move: M.CHECK },
      { text: 'שרטטתי מרובע שהאלכסונים שלו שווים ומאונכים אבל לא חוצים זה את זה. מה דעתכם?', move: M.DRAWING_Q, drawing: 'equal-perpendicular-not-bisecting', historicalDrawing: 'rotated-square.png' },
      { text: '?', move: M.PROBE_QMARK },
      { text: '{C}, מה הרשימה המלאה של תנאים על האלכסונים שמבטיחה ריבוע?', move: M.CONTENT_Q, answerIfUnsure: 'WHAT_ELSE' },
      { text: '{B}, איך היית מסביר או מסבירה את זה לחבר?', move: M.SUMMARY },
      { text: 'יפה מאוד, כל הכבוד.', move: M.CLOSING },
    ],
  },
  {
    id: 6,
    slug: 'kite-rhombus-inclusion',
    scenarioIndex: 5,
    turns: [
      { text: 'היום נדבר על דלתון ומעוין. מה ההגדרה של דלתון?', move: M.OPEN },
      { text: '{A}, האם מעוין הוא סוג של דלתון?', move: M.DIRECT_Q },
      { text: 'יפה', move: M.PROBE_VALIDATE },
      { text: '{B}, מה דעתך על התשובה?', move: M.PEER_Q },
      { text: 'דלתון הוא מרובע עם שני זוגות של צלעות סמוכות שוות. במעוין כל הצלעות שוות, ולכן גם יש לו שני זוגות של צלעות סמוכות שוות. לכן כל מעוין הוא דלתון.', move: M.EXPLAIN },
      { text: 'נכון', move: M.PROBE_VALIDATE },
      { text: '{A}, אז עכשיו - האם מעוין הוא דלתון?', move: M.CHECK },
      { text: 'והאם כל דלתון הוא מעוין?', move: M.CONTENT_Q },
      { text: 'אוקיי', move: M.PROBE_ACK },
      { text: '{C}, תן או תני דוגמה לדלתון שאינו מעוין.', move: M.CONTENT_Q },
      { text: '{B}, סכם או סכמי את הקשר בין דלתון למעוין.', move: M.SUMMARY },
      { text: 'יפה, תודה לכם.', move: M.CLOSING },
    ],
  },
];

// Persona keys in production order (src/config/students/personas.js); used to reproduce the
// historical cast rotation castFor(si, conv) = [0, 3, 6].map(k => KEYS[(si * 2 + conv + k) % 9]).
export const PERSONA_ORDER = ['נועה', 'תמר', 'יובל', 'דנה', 'יונתן', 'הילה', 'מעיין', 'עדי', 'רועי'];
export const historicalCast = (scenarioId, castIndex) =>
  [0, 3, 6].map((k) => PERSONA_ORDER[((scenarioId - 1) * 2 + castIndex + k) % PERSONA_ORDER.length]);

// Casts used by the 1.3.9-1.3.11 runs (= historicalCast; listed explicitly for reference).
export const HISTORICAL_CASTS = {
  1: [['נועה', 'דנה', 'מעיין'], ['תמר', 'יונתן', 'עדי']],
  2: [['יובל', 'הילה', 'רועי'], ['דנה', 'מעיין', 'נועה']],
  3: [['יונתן', 'עדי', 'תמר'], ['הילה', 'רועי', 'יובל']],
  4: [['מעיין', 'נועה', 'דנה'], ['עדי', 'תמר', 'יונתן']],
  5: [['רועי', 'יובל', 'הילה'], ['נועה', 'דנה', 'מעיין']],
  6: [['תמר', 'יונתן', 'עדי'], ['יובל', 'הילה', 'רועי']],
};

// Designed casts (harness review §3.5): slot A is a misconception carrier whose persona tendencies fit
// the scenario; B/C mix one high-baseline (תמר / דנה) and one medium/low-baseline persona.
export const DESIGNED_CASTS = {
  1: [['רועי', 'תמר', 'הילה'], ['נועה', 'דנה', 'יובל']], // false dichotomy / prototype thinking
  2: [['תמר', 'הילה', 'עדי'], ['רועי', 'דנה', 'מעיין']], // inverse implication / ignores conditions
  3: [['נועה', 'יונתן', 'דנה'], ['יובל', 'תמר', 'עדי']], // prototype + visual bias / surface features
  4: [['תמר', 'מעיין', 'רועי'], ['יובל', 'דנה', 'נועה']], // overgeneralization / surface features
  5: [['רועי', 'דנה', 'הילה'], ['תמר', 'יונתן', 'עדי']], // ignores conditions / inverse implication
  6: [['רועי', 'תמר', 'מעיין'], ['נועה', 'דנה', 'יובל']], // false dichotomy / visual similarity
};

export const castFor = (scenarioId, castIndex, kind) =>
  (kind === 'historical' ? HISTORICAL_CASTS : DESIGNED_CASTS)[scenarioId][castIndex];

/** Fill {A} {B} {C} with the cast. */
export const fillSlots = (text, cast) => text.replace(/\{A\}/g, cast[0]).replace(/\{B\}/g, cast[1]).replace(/\{C\}/g, cast[2]);

/** Deterministic conversation id, e.g. "B-s2-d0-r1". */
export const conversationId = (mode, scenarioId, castKind, castIndex, repeat) =>
  `${mode}-s${scenarioId}-${castKind === 'historical' ? 'h' : 'd'}${castIndex}-r${repeat}`;

/** Commits of the historical runs (student_stability_replay.md). */
export const HISTORICAL_RUNS = [
  { version: '1.3.9', commit: '9eb14e0', section: '§1-§8', casts: 'historical', drawings: 'historical' },
  { version: '1.3.10', commit: '15866e1', section: '§9', casts: 'historical', drawings: 'historical' },
  { version: '1.3.11', commit: '5184c24', section: '§10', casts: 'historical', drawings: 'historical' },
];
