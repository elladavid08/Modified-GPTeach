/**
 * Suspected quote cuts in student replies (1.3.13). DETECTION ONLY: content-free counters for telemetry.
 * Nothing here retries, rewrites or drops a reply.
 *
 * Background (research/simulator_audit/student_quote_truncation_investigation.md): under JSON-constrained
 * output, an unescaped ASCII `"` that the model meant as Hebrew gershayim (ס"מ) or as an opening quote
 * closes the `message` string, and the decoder then completes valid JSON. The reply is silently cut,
 * e.g. "…באורך 5 ס" or "אני חושבת ש". The text that follows the quote is lost inside the model.
 *
 * Shapes counted (conservative):
 *  - a reply that does not end in final punctuation and either
 *      (a) ends in a 1-2-letter Hebrew fragment ("…5 ס", "זה קמ", "…חושבת ש"), or
 *      (b) ends in whitespace inside the raw string ("…מה זה אומר "); the client trims it later;
 *  - an attempt that hit the token limit after a closed string followed only by whitespace
 *    (the decoder padding after a cut). That attempt is invalid JSON and is already retried.
 *
 * Known false positives (accepted, telemetry only): a reply whose last word has 1-2 letters and no
 * punctuation ("כן", "…אז גם"). No such reply occurred in the synthetic corpus (2,355 unique replies).
 * Not detected: a cut after a longer word without trailing whitespace (e.g. "…כמו מלבן").
 */

// Characters that end a complete reply (sentence punctuation, closing brackets/quotes, gershayim/geresh)
const FINAL_PUNCTUATION = /[.?!…)\]"'״׳:;*]$/;
const SHORT_HEBREW_FRAGMENT = /(^|[\s(\-–])[א-ת]{1,2}$/;
export const PADDED_TOKEN_LIMIT_MIN_SPACES = 32;
const PADDED_AFTER_CLOSED_STRING = new RegExp(`"\\s{${PADDED_TOKEN_LIMIT_MIN_SPACES},}$`);

/** @param {unknown} message the raw (untrimmed) `message` string of one reply */
export function isSuspectedQuoteCut(message) {
  if (typeof message !== 'string') return false;
  const trimmed = message.trimEnd();
  if (trimmed === '' || FINAL_PUNCTUATION.test(trimmed)) return false;
  const trailingWhitespace = trimmed.length !== message.length;
  return trailingWhitespace || SHORT_HEBREW_FRAGMENT.test(trimmed);
}

/** Number of replies in a parsed `responses` array that look cut. Malformed entries are ignored. */
export function countSuspectedQuoteCuts(responses) {
  if (!Array.isArray(responses)) return 0;
  return responses.filter((r) => r && typeof r === 'object' && isSuspectedQuoteCut(r.message)).length;
}

/** An attempt whose output stopped at the token limit after a closed string followed only by whitespace. */
export function isSpacePaddedTokenLimit(text, finishReason) {
  return finishReason === 'MAX_TOKENS' && typeof text === 'string' && PADDED_AFTER_CLOSED_STRING.test(text);
}
