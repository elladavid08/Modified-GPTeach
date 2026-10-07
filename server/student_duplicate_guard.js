/**
 * Same-student duplicate guard for the student agent (since 1.3.11).
 *
 * A generated reply is a duplicate when it repeats, word for word or almost, an earlier reply of the
 * SAME student in the same conversation. Criterion and regeneration note exactly as validated in
 * research/simulator_audit/student_duplicate_guard_study.md and student_duplicate_reask_experiment.md:
 *   - only replies of at least 30 characters (after whitespace normalization) are checked;
 *   - duplicate if equal after normalization (whitespace + trailing punctuation), or if the
 *     edit similarity 1 - Levenshtein / max(length) of the whitespace-normalized texts is >= 0.90.
 * Replies by other students, teacher messages and nameless (legacy) messages are never compared.
 * Pure functions: no I/O, no logging of message content.
 */

export const DUPLICATE_MIN_CHARS = 30;
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.9;
export const DUPLICATE_OUTCOMES = Object.freeze(['none', 'resolved', 'dropped', 'kept', 'reask_failed']);
const MAX_QUOTED_CHARS = 150;

/** Trim, normalize line endings and collapse every whitespace run (incl. line breaks) to one space. */
export function normalizeReply(text) {
  return String(text == null ? '' : text).replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

/** normalizeReply plus ignoring trailing punctuation. No words are removed. */
export function normalizeReplyForEquality(text) {
  return normalizeReply(text).replace(/[\s.!?…,;:"'״׳()]+$/u, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 - Levenshtein / max(length), on whitespace-normalized text. */
export function editSimilarity(a, b) {
  const x = normalizeReply(a);
  const y = normalizeReply(b);
  const longest = Math.max(x.length, y.length);
  return longest === 0 ? 1 : 1 - levenshtein(x, y) / longest;
}

/** Is `reply` a duplicate of `earlier` (both by the same student)? */
export function isSelfDuplicate(reply, earlier) {
  if (normalizeReply(reply).length < DUPLICATE_MIN_CHARS) return false;
  if (normalizeReplyForEquality(reply) === normalizeReplyForEquality(earlier)) return true;
  return editSimilarity(reply, earlier) >= DUPLICATE_SIMILARITY_THRESHOLD - 1e-9;
}

/**
 * Find replies in `responses` that duplicate an earlier reply by the same student in `messages`
 * (the request history: earlier student replies are `{role: 'assistant', name, content}`, C8).
 * @returns {{index: number, student: string, earlier: string}[]}  earlier = the matched earlier reply
 *          (exact match preferred, otherwise the most similar one)
 */
export function findSelfDuplicates(responses, messages) {
  const earlierByStudent = new Map();
  for (const m of Array.isArray(messages) ? messages : []) {
    if (m && m.role === 'assistant' && typeof m.name === 'string' && m.name.trim() && typeof m.content === 'string') {
      const name = m.name.trim();
      if (!earlierByStudent.has(name)) earlierByStudent.set(name, []);
      earlierByStudent.get(name).push(m.content);
    }
  }
  const duplicates = [];
  (Array.isArray(responses) ? responses : []).forEach((r, index) => {
    if (!r || typeof r.student !== 'string' || typeof r.message !== 'string') return;
    const earlier = earlierByStudent.get(r.student.trim()) || [];
    const matches = earlier.filter((e) => isSelfDuplicate(r.message, e));
    if (matches.length === 0) return;
    const exact = matches.find((e) => normalizeReplyForEquality(e) === normalizeReplyForEquality(r.message));
    const best = exact || matches.reduce((a, b) => (editSimilarity(r.message, b) > editSimilarity(r.message, a) ? b : a));
    duplicates.push({ index, student: r.student, earlier: best });
  });
  return duplicates;
}

const quote = (text) => {
  const t = normalizeReply(text);
  return t.length > MAX_QUOTED_CHARS ? `${t.slice(0, MAX_QUOTED_CHARS)}…` : t;
};

/** The validated regeneration note (single student verbatim; tested concise plural form for several). */
export function buildRegenerationNote(duplicates) {
  const head = '[Regeneration note — not part of the conversation]';
  const line = ({ student: n, earlier }) =>
    `In your previous draft, ${n}'s reply repeated, word for word or almost, what ${n} already said earlier in this conversation: "${quote(earlier)}".`;
  if (duplicates.length === 1) {
    const n = duplicates[0].student;
    return `${head}\n${line(duplicates[0])}\nWrite the responses again. ${n} must react to the teacher's latest message instead of restating that earlier reply. Keep ${n}'s current understanding, doubt or misconception unless the teacher's latest message changed it, but put it in new words: react to what the teacher just said, ask about a specific part, or give a brief natural reaction. Do not reuse the wording of any earlier student message. The output format is unchanged.`;
  }
  const names = duplicates.map((d) => d.student);
  const list = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${head}\n${duplicates.map(line).join('\n')}\nWrite the responses again. ${list} must each react to the teacher's latest message instead of restating their earlier reply. Keep each of these students' current understanding, doubt or misconception unless the teacher's latest message changed it, but put it in new words: react to what the teacher just said, ask about a specific part, or give a brief natural reaction. Do not reuse the wording of any earlier student message. The output format is unchanged.`;
}

/**
 * Copy of Gemini `contents` with the note appended, after a blank line, to the text of the last
 * teacher (user) content, as tested. Only the regeneration request carries it; it is never stored.
 */
export function appendRegenerationNote(contents, note) {
  const copy = JSON.parse(JSON.stringify(contents));
  for (let i = copy.length - 1; i >= 0; i--) {
    if (copy[i].role !== 'user') continue;
    const part = copy[i].parts.find((p) => typeof p.text === 'string');
    if (part) part.text = `${part.text}\n\n${note}`;
    else copy[i].parts.unshift({ text: note });
    return copy;
  }
  copy.push({ role: 'user', parts: [{ text: note }] });
  return copy;
}

const isUsableReply = (r) => r && typeof r.student === 'string' && typeof r.message === 'string';

/**
 * Final fallback for replies that are still duplicates on the last attempt: drop only those replies;
 * if no usable reply would remain, keep the responses unchanged.
 * @returns {{value: object, dropped: number, kept: number}}
 */
export function dropDuplicateReplies(value, duplicates) {
  const flagged = new Set(duplicates.map((d) => d.index));
  const remaining = value.responses.filter((_, i) => !flagged.has(i));
  if (!remaining.some(isUsableReply)) {
    return { value, dropped: 0, kept: duplicates.length };
  }
  return { value: { ...value, responses: remaining }, dropped: duplicates.length, kept: 0 };
}
