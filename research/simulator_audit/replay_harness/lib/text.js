// Text helpers for the replay harness. The production duplicate criterion is imported read-only from
// the server module, so the "guard match" label is exactly what /api/generate checks (B26).
import {
  normalizeReply,
  normalizeReplyForEquality,
  editSimilarity,
  isSelfDuplicate,
} from '../../../../server/student_duplicate_guard.js';

export { normalizeReply, normalizeReplyForEquality, editSimilarity, isSelfDuplicate };

const EDGE_PUNCT = /^[.,!?…;:"'״׳()\-–—]+|[.,!?…;:"'״׳()\-–—]+$/gu;

/** Whitespace tokens with edge punctuation removed; מעויין/מעוין spelling unified. */
export function tokens(text) {
  return normalizeReply(text)
    .replace(/מעויין/g, 'מעוין')
    .split(' ')
    .map((w) => w.replace(EDGE_PUNCT, ''))
    .filter(Boolean);
}

export function jaccard(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/** First shared word n-gram between two texts, or null. */
export function sharedNgram(a, b, n = 5) {
  const ta = tokens(a);
  const tb = tokens(b);
  const grams = new Set();
  for (let i = 0; i + n <= tb.length; i++) grams.add(tb.slice(i, i + n).join(' '));
  for (let i = 0; i + n <= ta.length; i++) {
    const g = ta.slice(i, i + n).join(' ');
    if (grams.has(g)) return g;
  }
  return null;
}

/** All word n-grams of a text (as joined strings). */
export function ngrams(text, n) {
  const t = tokens(text);
  const out = new Set();
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n).join(' '));
  return out;
}

/** Edit similarity with the מעויין/מעוין spelling unified (for prompt-example matching). */
export function spellingInsensitiveSimilarity(a, b) {
  return editSimilarity(normalizeReply(a).replace(/מעויין/g, 'מעוין'), normalizeReply(b).replace(/מעויין/g, 'מעוין'));
}

/** Sentences of a reply (keeps the terminal mark). */
export function sentences(text) {
  return (normalizeReply(text).match(/[^.!?]+[.!?]*/g) || []).map((s) => s.trim()).filter(Boolean);
}
