/**
 * PCK_STAGE2: activation of the two-stage PCK feedback (A1i, 1.6.0). Stage 2 is the intended 1.6.0 behaviour, so it
 * is ON unless explicitly switched off:
 *   unset or empty           -> ON  (source "default")
 *   on / 1 / true            -> ON  (source "environment")
 *   off / 0 / false          -> OFF (source "environment": the explicit override; the 1.5.1 behaviour exactly)
 *   anything else            -> ON  (source "default"), with a warning naming the ignored value
 * Values are trimmed and case-insensitive. The server reads the variable per request; the startup log and
 * /api/health report the resolved state.
 */
const ON_VALUES = ['on', '1', 'true'];
const OFF_VALUES = ['off', '0', 'false'];

/** @returns {{enabled: boolean, source: 'default'|'environment', raw: string|null, warning: string|null}} */
export function resolvePckStage2Flag(value) {
  const raw = value === undefined || value === null ? null : String(value);
  const v = raw === null ? '' : raw.trim().toLowerCase();
  if (v === '') return { enabled: true, source: 'default', raw, warning: null };
  if (ON_VALUES.includes(v)) return { enabled: true, source: 'environment', raw, warning: null };
  if (OFF_VALUES.includes(v)) return { enabled: false, source: 'environment', raw, warning: null };
  return {
    enabled: true,
    source: 'default',
    raw,
    warning: `PCK_STAGE2=${JSON.stringify(raw)} is not recognised (use on / 1 / true or off / 0 / false); PCK Stage 2 stays ON (default)`,
  };
}

/** The one-line state for the startup log, e.g. "PCK Stage 2: ON (default)" / "PCK Stage 2: OFF (explicit override, PCK_STAGE2=off)". */
export function describePckStage2Flag(flag) {
  if (!flag.enabled) return `PCK Stage 2: OFF (explicit override, PCK_STAGE2=${flag.raw.trim()})`;
  if (flag.source === 'environment') return `PCK Stage 2: ON (environment, PCK_STAGE2=${flag.raw.trim()})`;
  if (flag.warning) return `PCK Stage 2: ON (default; unrecognised PCK_STAGE2=${JSON.stringify(flag.raw)} ignored)`;
  return 'PCK Stage 2: ON (default)';
}
