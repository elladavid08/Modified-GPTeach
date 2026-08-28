/**
 * Durable diagnostic event buffer for the conversation annotation editor.
 *
 * Events are appended to a bounded localStorage ring buffer first and uploaded
 * afterwards. The buffer is the primary record on purpose: the failures we are
 * trying to diagnose (reload, back/forward, auth redirect, render crash) destroy
 * the page before a network request could complete, so anything sent only over
 * the wire would be lost exactly when it matters.
 */

const BUFFER_KEY = 'convAnnotationDiag:v1';
const MAX_EVENTS = 200;
const MAX_BYTES = 96 * 1024;

const API_BASE_URL =
  process.env.REACT_APP_API_URL !== undefined
    ? process.env.REACT_APP_API_URL
    : 'http://localhost:3001';

// Identifies one page load, so events can be grouped across a reload boundary.
const SESSION_NONCE = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

let counter = 0;
let context = {};

export function getSessionNonce() {
  return SESSION_NONCE;
}

/** Fields merged into every subsequent event (uid, assignmentId). */
export function setDiagnosticContext(next) {
  context = { ...context, ...next };
}

function readBuffer() {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBuffer(events) {
  let next = events.slice(-MAX_EVENTS);
  try {
    let serialized = JSON.stringify(next);
    // Drop oldest entries until the buffer fits the byte cap.
    while (serialized.length > MAX_BYTES && next.length > 1) {
      next = next.slice(Math.ceil(next.length / 4));
      serialized = JSON.stringify(next);
    }
    localStorage.setItem(BUFFER_KEY, serialized);
  } catch {
    // Storage unavailable or full — diagnostics must never break the editor.
  }
}

/**
 * Record a diagnostic event.
 * @param {string} event  short event name
 * @param {object} [detail] JSON-serializable payload
 */
export function logEvent(event, detail) {
  try {
    const entry = {
      id: `${Date.now().toString(36)}-${counter++}`,
      ts: new Date().toISOString(),
      sessionNonce: SESSION_NONCE,
      pathname: typeof window !== 'undefined' ? window.location.pathname : '',
      event,
      ...context,
    };
    if (detail !== undefined) entry.detail = detail;

    const events = readBuffer();
    events.push(entry);
    writeBuffer(events);
  } catch {
    // Never throw from instrumentation.
  }
}

/** Read the buffered events (used by the error boundary recovery view). */
export function getBufferedEvents() {
  return readBuffer();
}

function removeFlushed(flushedIds) {
  const ids = new Set(flushedIds);
  writeBuffer(readBuffer().filter(e => !ids.has(e.id)));
}

/**
 * Best-effort upload of buffered events. Events are only removed from the
 * buffer once the server has acknowledged them, so a failed flush is retried
 * on the next mount.
 */
export async function flushEvents() {
  const events = readBuffer();
  if (events.length === 0) return;

  const ids = events.map(e => e.id);
  try {
    const res = await fetch(`${API_BASE_URL}/api/client-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    if (res.ok) removeFlushed(ids);
  } catch {
    // Keep the events buffered for the next attempt.
  }
}

/**
 * Synchronous best-effort flush for page teardown. Uses sendBeacon because
 * fetch is not guaranteed to complete during unload. The buffer is intentionally
 * NOT cleared here: we cannot observe whether the beacon was delivered, and a
 * duplicate log line is far cheaper than a lost one.
 */
export function beaconEvents() {
  try {
    const events = readBuffer();
    if (events.length === 0) return;
    if (!navigator.sendBeacon) return;
    navigator.sendBeacon(
      `${API_BASE_URL}/api/client-events`,
      new Blob([JSON.stringify({ events, viaBeacon: true })], { type: 'application/json' })
    );
  } catch {
    // Ignore.
  }
}

/**
 * Navigation type for the current page load: 'navigate' | 'reload' |
 * 'back_forward' | 'prerender'. This is the single most useful signal for
 * telling a browser refresh apart from a history navigation.
 */
export function getNavigationType() {
  try {
    const entries = performance.getEntriesByType('navigation');
    if (entries && entries.length > 0 && entries[0].type) return entries[0].type;
    // Legacy fallback.
    const legacy = performance.navigation && performance.navigation.type;
    if (legacy === 1) return 'reload';
    if (legacy === 2) return 'back_forward';
    return 'navigate';
  } catch {
    return 'unknown';
  }
}
