/**
 * @file Pure formatting + ranking helpers for the MONITOR dashboard.
 *
 * Kept free of the DOM and the network so the numbers the dashboard shows are
 * unit-tested independently of how they are rendered.
 *
 * @module monitor/monitorFormat
 */

/**
 * Compact price string with sensible precision for the magnitude.
 * @param {number} value - Price in USD.
 * @returns {string}
 */
export function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (Math.abs(n) >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Sub-dollar (small-cap coins): keep enough significant digits to be useful.
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

/**
 * Signed percent string, e.g. "+1.24%".
 * @param {number} value - Percentage.
 * @returns {string}
 */
export function formatChange(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/**
 * Direction class for a change value: up, down or flat.
 * @param {number} value
 * @returns {'up'|'down'|'flat'}
 */
export function changeDirection(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}

/**
 * Abbreviate large counts (market cap, volume): 1.2B, 340M, 12K.
 * @param {number} value
 * @returns {string}
 */
export function formatCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

/**
 * Relative age of an ISO / RFC timestamp, e.g. "3m", "2h", "4d".
 * @param {string|number} when
 * @param {number} [nowMs=Date.now()]
 * @returns {string}
 */
export function relativeTime(when, nowMs = Date.now()) {
  const t = typeof when === 'number' ? when : Date.parse(when);
  if (!Number.isFinite(t)) return '';
  const secs = Math.max(0, Math.round((nowMs - t) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h`;
  return `${Math.round(secs / 86400)}d`;
}

/**
 * Severity score (0-100) for a situational event, from magnitude/alert cues.
 *
 * Blends earthquake magnitude, GDACS alert level and event kind so the
 * SITUATION view can rank a heterogeneous feed on one axis. Deterministic and
 * bounded — the same event always scores the same.
 * @param {{kind?: string, magnitude?: number, alertLevel?: string}} event
 * @returns {number}
 */
export function severityScore(event) {
  const e = event || {};
  let score = 10;
  if (Number.isFinite(Number(e.magnitude))) {
    // M5 ~ 50, M7 ~ 80, capped.
    score = Math.max(score, Math.min(95, Number(e.magnitude) * 12));
  }
  const alert = String(e.alertLevel || '').toLowerCase();
  if (alert === 'red') score = Math.max(score, 90);
  else if (alert === 'orange') score = Math.max(score, 65);
  else if (alert === 'green') score = Math.max(score, 35);
  const kind = String(e.kind || e.eventType || '').toLowerCase();
  if (/(strike|war|conflict|military|missile)/.test(kind)) score = Math.max(score, 70);
  if (/(cyclone|hurricane|tsunami|flood)/.test(kind)) score = Math.max(score, 60);
  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Bucket a severity score into a tier label + token.
 * @param {number} score
 * @returns {{tier: 'critical'|'high'|'moderate'|'low', label: string}}
 */
export function severityTier(score) {
  const n = Number(score) || 0;
  if (n >= 80) return { tier: 'critical', label: 'CRITICAL' };
  if (n >= 60) return { tier: 'high', label: 'HIGH' };
  if (n >= 35) return { tier: 'moderate', label: 'MODERATE' };
  return { tier: 'low', label: 'LOW' };
}
