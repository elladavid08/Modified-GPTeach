/**
 * Leveraging acknowledgement guard (A1i, behind PCK_STAGE2; v2 of the frozen research guard
 * research/simulator_audit/pck_eval/x12/leveraging_guard.cjs; parity: server/test/pck_stage2_parity.test.mjs).
 *
 * The educational team's decision (2026-10-29): a local confirmation such as "כן" after a misconception was resolved is
 * not a missed leveraging opportunity. A teacher message that is ONLY an acknowledgement (every word from the closed
 * list below or a cast name; at most five words; no question mark; letter stretching such as "כןןן" normalised) gets
 * no error-leveraging row. Everything else is left to Stage 2. It never infers anything and never changes other rows.
 * Precedent: pck_bare_ack_guard.js (1.4.1).
 */
export const LEVERAGING_GUARD_VERSION = 2;
export const ACK_WORDS = Object.freeze(['כן', 'נכון', 'בדיוק', 'יפה', 'מאוד', 'מצוין', 'מצויין', 'כל', 'הכבוד', 'אוקיי', 'אוקי', 'טוב', 'נהדר', 'מעולה',
  'צודק', 'צודקת', 'צודקים', 'לגמרי', 'יופי', 'אחלה', 'תודה', 'נכונה', 'נכונים',
  'מצוינת', 'מצוינים', 'מצוינות', 'נהדרת', 'נהדרים', 'נהדרות', 'מעולים', 'מעולות', 'צודקות', 'נכונות',
  'אלוף', 'אלופה', 'אלופים', 'אלופות', 'תותח', 'תותחית', 'תותחים', 'תותחיות', 'מצטיין', 'מצטיינת', 'מצטיינים', 'מצטיינות',
  'ממש', 'גם', 'בהחלט', 'וואו', 'ואו', 'עבודה', 'רבה', 'את', 'אתה', 'אתם', 'אתן', 'שלי',
  'תלמידים', 'תלמידות', 'חברים', 'חברות', 'ילדים']);
export const CAST_NAMES = Object.freeze(['דנה', 'הילה', 'יובל', 'יונתן', 'מעיין', 'נועה', 'עדי', 'רועי', 'תמר']);
const ALLOWED = new Set([...ACK_WORDS, ...CAST_NAMES]);

/** "כןןן" -> "כן", "מצויין" -> "מצוין": every run of one letter counts once. */
const collapse = (w) => w.replace(/(.)\1+/gu, '$1');
const allowed = (w) => [w, w.replace(/^ו/, '')].some((x) => ALLOWED.has(x) || ALLOWED.has(collapse(x)));

/** true when the message is only an acknowledgement (e.g. "כן", "בדיוק!", "נכון מאוד דנה", "כל הכבוד", "כןןן"). */
export function isLocalAcknowledgement(teacherMessage) {
  const t = String(teacherMessage || '').trim();
  if (!t || /[?？]/.test(t)) return false;
  const words = t.replace(/[!.,;:"'״׳()\-–—…\u{1F300}-\u{1FAFF}☀-➿]/gu, ' ').split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 5 && words.every(allowed);
}

/** Drop the leveraging row for a local acknowledgement. Returns { rows, dropped }. */
export function applyLeveragingGuard(teacherMessage, rows) {
  if (!rows || !isLocalAcknowledgement(teacherMessage)) return { rows, dropped: false };
  const kept = rows.filter((r) => r.skillId !== 'error-leveraging');
  return { rows: kept, dropped: kept.length !== rows.length };
}
