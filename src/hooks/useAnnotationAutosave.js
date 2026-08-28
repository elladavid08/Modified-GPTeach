import { useCallback, useEffect, useRef, useState } from 'react';
import { logEvent } from '../utils/annotationDiagnostics';

const DEBOUNCE_MS = 2000;
const MAX_WAIT_MS = 20000;
const SAFETY_INTERVAL_MS = 60000;
const RETRY_BACKOFF_MS = [5000, 15000, 30000];

/**
 * Debounced autosave for the annotation draft.
 *
 * Guarantees:
 *  - never writes when the content hash is unchanged (no repeated Firestore writes);
 *  - never runs two saves concurrently (requests are coalesced, not stacked);
 *  - a stale response can never advance the saved-hash past a newer one;
 *  - a failed save leaves the state dirty and retries with capped backoff;
 *  - disabled entirely when `enabled` is false (read-only / completed / loading).
 *
 * @param {object}   opts
 * @param {boolean}  opts.enabled
 * @param {string}   opts.contentHash  fingerprint of the current draft
 * @param {Function} opts.getSnapshot  () => ({ payload, hash })
 * @param {Function} opts.save         async (payload) => void
 * @param {Function} [opts.onSaved]    (hash) => void, called after a confirmed save
 */
export function useAnnotationAutosave({ enabled, contentHash, getSnapshot, save, onSaved }) {
  const [status, setStatus] = useState('idle'); // idle | unsaved | saving | saved | error
  const [lastError, setLastError] = useState('');

  const lastSavedHashRef = useRef(null);
  const inFlightPromiseRef = useRef(null);
  const pendingRef = useRef(false);
  const seqRef = useRef(0);
  const lastCompletedSeqRef = useRef(0);
  const retryAttemptRef = useRef(0);

  const debounceRef = useRef(null);
  const maxWaitRef = useRef(null);
  const retryRef = useRef(null);

  // Keep the latest callbacks/values in refs so timers never close over stale state.
  const latest = useRef({ enabled, contentHash, getSnapshot, save, onSaved });
  latest.current = { enabled, contentHash, getSnapshot, save, onSaved };

  const clearDebounce = useCallback(() => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (maxWaitRef.current) { clearTimeout(maxWaitRef.current); maxWaitRef.current = null; }
  }, []);

  const clearRetry = useCallback(() => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
  }, []);

  /** Marks a hash as already persisted (used after load and after a manual save). */
  const markSaved = useCallback((hash) => {
    lastSavedHashRef.current = hash;
    retryAttemptRef.current = 0;
    clearDebounce();
    clearRetry();
    pendingRef.current = false;
  }, [clearDebounce, clearRetry]);

  const cancelPending = useCallback(() => {
    clearDebounce();
    clearRetry();
    pendingRef.current = false;
  }, [clearDebounce, clearRetry]);

  const isDirty = useCallback(() => {
    return latest.current.contentHash !== lastSavedHashRef.current;
  }, []);

  /**
   * Run a save. `force` bypasses the unchanged-content check (manual Save Draft
   * keeps its existing always-write behavior). Concurrent callers await the
   * in-flight request instead of issuing a second one.
   */
  const runSave = useCallback(async (reason, force = false) => {
    if (inFlightPromiseRef.current) {
      if (!force) {
        // Coalesce: flag it and let the in-flight request's finally re-run once.
        pendingRef.current = true;
        return;
      }
      // A forced (manual) save waits for the in-flight write rather than racing
      // it, and must not also set the pending flag or it would write twice.
      try { await inFlightPromiseRef.current; } catch { /* owner handles */ }
    }

    const { enabled: isEnabled, getSnapshot: snapshot, save: doSave, onSaved: saved } = latest.current;
    if (!isEnabled && !force) return;

    const { payload, hash } = snapshot();

    if (!force && hash === lastSavedHashRef.current) {
      logEvent('save_skipped_unchanged', { reason });
      return;
    }

    clearDebounce();
    clearRetry();

    const seq = ++seqRef.current;
    const startedAt = Date.now();
    setStatus('saving');
    logEvent('save_attempt', { reason, seq, force, hash });

    const promise = (async () => {
      await doSave(payload);
    })();
    inFlightPromiseRef.current = promise;

    try {
      await promise;
      // Discard a response that was superseded while in flight.
      if (seq >= lastCompletedSeqRef.current) {
        lastCompletedSeqRef.current = seq;
        lastSavedHashRef.current = hash;
        if (saved) saved(hash, payload);
        retryAttemptRef.current = 0;
        setLastError('');
        setStatus(latest.current.contentHash === hash ? 'saved' : 'unsaved');
      }
      logEvent('save_success', { reason, seq, ms: Date.now() - startedAt });
    } catch (err) {
      // lastSavedHashRef is deliberately NOT advanced: the state stays dirty.
      setLastError(err.message || 'שמירה נכשלה');
      setStatus('error');
      logEvent('save_failure', { reason, seq, ms: Date.now() - startedAt, message: err.message });

      const attempt = retryAttemptRef.current;
      if (attempt < RETRY_BACKOFF_MS.length) {
        retryAttemptRef.current = attempt + 1;
        clearRetry();
        retryRef.current = setTimeout(() => { runSave('retry'); }, RETRY_BACKOFF_MS[attempt]);
      }
      if (force) throw err;
    } finally {
      if (inFlightPromiseRef.current === promise) inFlightPromiseRef.current = null;
      if (pendingRef.current) {
        pendingRef.current = false;
        if (latest.current.enabled && isDirty()) runSave('coalesced');
      }
    }
  }, [clearDebounce, clearRetry, isDirty]);

  // Debounce on content change, with a max-wait cap so continuous typing still persists.
  useEffect(() => {
    if (!enabled) return;
    if (contentHash === lastSavedHashRef.current) {
      if (status === 'unsaved') setStatus('saved');
      return;
    }

    setStatus(prev => (prev === 'saving' ? prev : 'unsaved'));

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { runSave('debounce'); }, DEBOUNCE_MS);

    if (!maxWaitRef.current) {
      maxWaitRef.current = setTimeout(() => { runSave('max_wait'); }, MAX_WAIT_MS);
    }

    return () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentHash, enabled]);

  // Safety interval: fires only when there are unsaved changes.
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      if (isDirty()) runSave('safety_interval');
    }, SAFETY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, isDirty, runSave]);

  // Flush as soon as connectivity returns.
  useEffect(() => {
    if (!enabled) return undefined;
    const onOnline = () => {
      logEvent('online');
      if (isDirty()) runSave('online');
    };
    const onOffline = () => logEvent('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [enabled, isDirty, runSave]);

  // Clear every timer on unmount.
  useEffect(() => () => { clearDebounce(); clearRetry(); }, [clearDebounce, clearRetry]);

  return { status, lastError, runSave, markSaved, cancelPending, isDirty, setStatus };
}
