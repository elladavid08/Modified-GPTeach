// X12 final candidate: deterministic implementation of the educational team's leveraging decision (2026-10-29):
// "a local confirmation such as 'כן' after the misconception has already been resolved is not automatically a missed
// leveraging opportunity". A teacher message that is ONLY an acknowledgement (every word from the list below or a cast
// name; no question mark) gets no leveraging row. Everything else is left to the Stage-2 model. Research only.
// Precedent: server/pck_bare_ack_guard.js (1.4.1). The list is lexical, closed and versioned; it never infers anything.
// v2 (2026-10-29): letter stretching is normalised ("כןןן", "נכוון" -> "כן", "נכון": runs of one letter count once) and
// the list has the gender / number forms of the praise words, second-person pronouns and class address words.
'use strict';
const GUARD_VERSION = 2;
const ACK_WORDS = ['כן', 'נכון', 'בדיוק', 'יפה', 'מאוד', 'מצוין', 'מצויין', 'כל', 'הכבוד', 'אוקיי', 'אוקי', 'טוב', 'נהדר', 'מעולה',
  'צודק', 'צודקת', 'צודקים', 'לגמרי', 'יופי', 'אחלה', 'תודה', 'נכונה', 'נכונים',
  // v2: praise forms, intensifiers, pronouns and address words
  'מצוינת', 'מצוינים', 'מצוינות', 'נהדרת', 'נהדרים', 'נהדרות', 'מעולים', 'מעולות', 'צודקות', 'נכונות',
  'אלוף', 'אלופה', 'אלופים', 'אלופות', 'תותח', 'תותחית', 'תותחים', 'תותחיות', 'מצטיין', 'מצטיינת', 'מצטיינים', 'מצטיינות',
  'ממש', 'גם', 'בהחלט', 'וואו', 'ואו', 'עבודה', 'רבה', 'את', 'אתה', 'אתם', 'אתן', 'שלי',
  'תלמידים', 'תלמידות', 'חברים', 'חברות', 'ילדים'];
const NAMES = ['דנה', 'הילה', 'יובל', 'יונתן', 'מעיין', 'נועה', 'עדי', 'רועי', 'תמר'];
const ALLOWED = new Set([...ACK_WORDS, ...NAMES]);

/** "כןןן" -> "כן", "מצויין" -> "מצוין": every run of one letter counts once. */
const collapse = (w) => w.replace(/(.)\1+/gu, '$1');
const allowed = (w) => [w, w.replace(/^ו/, '')].some((x) => ALLOWED.has(x) || ALLOWED.has(collapse(x)));

/** true when the message is only an acknowledgement (e.g. "כן", "בדיוק!", "נכון מאוד דנה", "כל הכבוד", "כןןן"). */
function isLocalAcknowledgement(teacherMessage) {
  const t = String(teacherMessage || '').trim();
  if (!t || /[?？]/.test(t)) return false;
  const words = t.replace(/[!.,;:"'״׳()\-–—…\u{1F300}-\u{1FAFF}☀-➿]/gu, ' ').split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 5 && words.every(allowed);
}

/** Drop the leveraging row for a local acknowledgement. Returns { rows, dropped }. */
function applyLeveragingGuard(teacherMessage, rows) {
  if (!rows || !isLocalAcknowledgement(teacherMessage)) return { rows, dropped: false };
  const kept = rows.filter((r) => r.skillId !== 'error-leveraging');
  return { rows: kept, dropped: kept.length !== rows.length };
}

module.exports = { isLocalAcknowledgement, applyLeveragingGuard, ACK_WORDS, GUARD_VERSION };
