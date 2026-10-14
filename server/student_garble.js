/**
 * Garbled student text (1.4.2): DETECTION ONLY. Content-free counters for student-call telemetry.
 * Findings and validation: research/simulator_audit/student_garbled_text_investigation.md.
 *
 * gemini-3.5-flash-lite sometimes emits a token from another script inside a Hebrew word ("לגmרי", "איזה יظה",
 * "אמм"), cantillation marks, a doubled function word ("זה את את זה") or LaTeX. Only these high-confidence,
 * script-level patterns are counted. Nothing is retried, rewritten, dropped or reordered, and no text or token is
 * reported. The low-confidence "digit glued to a Hebrew letter" rule is deliberately not included.
 *
 * Rules (per reply):
 *   foreignScript        a letter whose script is not Hebrew, Latin or Greek, in text whose letters are mostly
 *                        Hebrew (digits, punctuation, symbols, emoji, ״ ׳ and niqqud are not letters of another script)
 *   mixedScriptToken     one token (letters / marks / digits between separators) containing both Hebrew and Latin
 *                        letters ("לגmרי"); "ה-AC", "AC ו-BD", "GeoGebra", "3 cm" are separate tokens
 *   cantillation         Hebrew cantillation marks U+0591-U+05AF (niqqud U+05B0-U+05C7 is legitimate and ignored)
 *   repeatedFunctionWord the same word from a closed list of short function words twice in a row with only
 *                        whitespace between ("את את"); reduplication such as "סוף סוף", "חצי חצי" or "זוגות זוגות"
 *                        is not in the list, and "זה" / "לא" are excluded ("חוצים זה את זה זה…", "לא, לא…")
 *   markup               LaTeX math ($…$ with no line break), a LaTeX command with a brace (\frac{), markdown bold
 *                        (**…**), an HTML-like tag (<b>, </b>) or a code fence (```)
 */

export const FUNCTION_WORDS = new Set(['את', 'של', 'על', 'עם', 'אם', 'כי', 'גם', 'אז', 'הוא', 'היא', 'הם', 'הן', 'זו', 'אל', 'או', 'אבל', 'כמו', 'יש', 'אין']);

const HEBREW_LETTER = /[א-ת]/u;
const LATIN_LETTER = /[A-Za-z]/u;
const MARKUP = /\$[^$\n]+\$|\\[a-zA-Z]+\{|\*\*[^*\n]+\*\*|<\/?[a-zA-Z][^<>\n]*>|```/u;

/** Categories present in one reply text: { foreignScript?, mixedScriptToken?, cantillation?, repeatedFunctionWord?, markup? } */
export function detectGarble(text) {
  const hits = {};
  if (typeof text !== 'string' || text === '') return hits;

  let hebrew = 0;
  let otherLetters = 0;
  let foreign = 0;
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) {
      if (/[֑-֯]/u.test(ch)) hits.cantillation = true;
      continue;
    }
    if (HEBREW_LETTER.test(ch)) hebrew += 1;
    else {
      otherLetters += 1;
      if (!/\p{Script=Latin}|\p{Script=Greek}|\p{Script=Hebrew}/u.test(ch)) foreign += 1;
    }
  }
  if (foreign > 0 && hebrew > otherLetters) hits.foreignScript = true;

  for (const token of text.split(/[^\p{L}\p{M}\p{N}]+/u)) {
    if (HEBREW_LETTER.test(token) && LATIN_LETTER.test(token)) { hits.mixedScriptToken = true; break; }
  }

  const words = text.split(/\s+/u);
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1] && FUNCTION_WORDS.has(words[i])) { hits.repeatedFunctionWord = true; break; }
  }

  if (MARKUP.test(text)) hits.markup = true;
  return hits;
}

const CATEGORY_KEYS = [
  ['foreignScript', 'garbleForeignScript'],
  ['mixedScriptToken', 'garbleMixedScriptToken'],
  ['cantillation', 'garbleCantillation'],
  ['repeatedFunctionWord', 'garbleRepeatedFunctionWord'],
  ['markup', 'garbleMarkup'],
];

/** Telemetry keys, in order: one counter per category, then the number of affected replies. */
export const GARBLE_TELEMETRY_KEYS = [...CATEGORY_KEYS.map(([, key]) => key), 'garbleReplies'];

/**
 * Content-free counters for a returned student output: per category, the number of replies with at least one hit,
 * and `garbleReplies`, the number of replies with any hit. Non-array input or entries without a string message
 * count as clean.
 */
export function countGarbledReplies(responses) {
  const counts = Object.fromEntries(GARBLE_TELEMETRY_KEYS.map((key) => [key, 0]));
  if (!Array.isArray(responses)) return counts;
  for (const reply of responses) {
    const hits = detectGarble(reply && typeof reply.message === 'string' ? reply.message : '');
    let any = false;
    for (const [category, key] of CATEGORY_KEYS) if (hits[category]) { counts[key] += 1; any = true; }
    if (any) counts.garbleReplies += 1;
  }
  return counts;
}
