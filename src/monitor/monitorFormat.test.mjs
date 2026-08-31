// src/monitor/monitorFormat.test.mjs — MONITOR number/rank helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPrice, formatChange, changeDirection, formatCompact,
  relativeTime, severityScore, severityTier,
} from './monitorFormat.js';

test('price precision scales with magnitude', () => {
  assert.equal(formatPrice(78711), '78,711');
  assert.equal(formatPrice(2448.7), '2,449');
  assert.equal(formatPrice(1.5), '1.50');
  assert.match(formatPrice(0.00042), /^0\.000?4/);
  assert.equal(formatPrice(Number.NaN), '—');
});

test('change is signed and direction is correct', () => {
  assert.equal(formatChange(1.239), '+1.24%');
  assert.equal(formatChange(-0.26), '-0.26%');
  assert.equal(changeDirection(0.5), 'up');
  assert.equal(changeDirection(-0.5), 'down');
  assert.equal(changeDirection(0), 'flat');
  assert.equal(changeDirection(Number.NaN), 'flat');
});

test('compact counts abbreviate by magnitude', () => {
  assert.equal(formatCompact(1_540_000_000_000), '1.54T');
  assert.equal(formatCompact(78_700_000_000), '78.70B');
  assert.equal(formatCompact(340_000_000), '340.0M');
  assert.equal(formatCompact(12_500), '12.5K');
  assert.equal(formatCompact(42), '42');
});

test('relative time buckets seconds to days', () => {
  const now = Date.parse('2026-08-31T12:00:00Z');
  assert.equal(relativeTime('2026-08-31T11:59:30Z', now), '30s');
  assert.equal(relativeTime('2026-08-31T11:45:00Z', now), '15m');
  assert.equal(relativeTime('2026-08-31T09:00:00Z', now), '3h');
  assert.equal(relativeTime('2026-08-29T12:00:00Z', now), '2d');
  assert.equal(relativeTime('not a date', now), '');
});

test('severity blends magnitude, alert and kind — deterministically', () => {
  assert.ok(severityScore({ magnitude: 7.2 }) > severityScore({ magnitude: 4.5 }));
  assert.equal(severityScore({ alertLevel: 'Red' }), 90);
  assert.ok(severityScore({ kind: 'military strike' }) >= 70);
  // Same input always scores the same.
  const e = { magnitude: 6.1, alertLevel: 'orange', kind: 'flood' };
  assert.equal(severityScore(e), severityScore(e));
  // Bounded 0..100.
  assert.ok(severityScore({ magnitude: 99 }) <= 100);
  assert.equal(severityScore({}), 10);
});

test('severity tiers bucket correctly', () => {
  assert.equal(severityTier(85).tier, 'critical');
  assert.equal(severityTier(65).tier, 'high');
  assert.equal(severityTier(40).tier, 'moderate');
  assert.equal(severityTier(10).tier, 'low');
  assert.equal(severityTier(80).label, 'CRITICAL');
});
