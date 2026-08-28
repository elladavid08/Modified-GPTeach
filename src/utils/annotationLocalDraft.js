/**
 * Durable local backup for conversation annotation drafts.
 *
 * This is the safety net that does not depend on the network: whatever the
 * reason the editor goes away (reload, back/forward, redirect, render crash,
 * connectivity loss), the annotator's work is still on disk and is offered back
 * when the same assignment is reopened.
 */

const KEY_PREFIX = 'convAnnotationDraft:v1';

export function draftKey(uid, assignmentId) {
  return `${KEY_PREFIX}:${uid}:${assignmentId}`;
}

/**
 * Deterministic JSON serialization: object keys are emitted in sorted order so
 * that two structurally equal drafts always produce the same string, regardless
 * of whether they came from Firestore or from the in-memory editor.
 */
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  const parts = keys
    .filter(k => value[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${canonicalize(value[k])}`);
  return `{${parts.join(',')}}`;
}

/**
 * Short content fingerprint. Length is combined with an FNV-1a 32-bit digest so
 * that a collision would require both the same length and the same digest.
 */
export function hashContent(committed) {
  const str = canonicalize({
    feedbackPoints: (committed && committed.feedbackPoints) || [],
    generalComment: (committed && committed.generalComment) || '',
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${str.length}-${h.toString(16)}`;
}

export function readLocalDraft(uid, assignmentId) {
  if (!uid || !assignmentId) return null;
  try {
    const raw = localStorage.getItem(draftKey(uid, assignmentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Write the backup. Returns true on success; a quota failure is reported to the
 * caller (which logs it as a diagnostic event) rather than thrown.
 */
export function writeLocalDraft(uid, assignmentId, record) {
  if (!uid || !assignmentId) return false;
  try {
    localStorage.setItem(draftKey(uid, assignmentId), JSON.stringify({ ...record, version: 1 }));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalDraft(uid, assignmentId) {
  if (!uid || !assignmentId) return;
  try {
    localStorage.removeItem(draftKey(uid, assignmentId));
  } catch {
    // Ignore.
  }
}

/**
 * The only automatic pruning path.
 *
 * A backup may be removed only when every locally held byte is provably present
 * in the persisted server draft AND there is no uncommitted modal work. A
 * successful autosave alone is NOT sufficient, because an open FeedbackPointEditor
 * can hold work that has not yet reached `feedbackPoints`.
 */
export function isSafeToPrune(record) {
  if (!record) return false;
  if (record.modalDraft) return false;
  if (!record.serverAckHash) return false;
  return record.committedHash === record.serverAckHash;
}
