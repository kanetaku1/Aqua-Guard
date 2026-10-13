const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sideSeverity, anomalyStart } = require('../dist/infrastructure/periodic-severity');

test('periodic boundary checks are strict and separate each direction', () => {
  const threshold = {
    criticalLow: 3.5, warningLow: 4.5, attentionLow: 5,
    attentionHigh: 8.5, warningHigh: 8.7, criticalHigh: 9,
  };
  assert.deepEqual(sideSeverity(4.5, threshold, 'low'),
    { severity: 'attention', boundary: 5 });
  assert.deepEqual(sideSeverity(4.49, threshold, 'low'),
    { severity: 'warning', boundary: 4.5 });
  assert.deepEqual(sideSeverity(3.49, threshold, 'low'),
    { severity: 'critical', boundary: 3.5 });
  assert.deepEqual(sideSeverity(9, threshold, 'high'),
    { severity: 'warning', boundary: 8.7 });
  assert.deepEqual(sideSeverity(9.01, threshold, 'high'),
    { severity: 'critical', boundary: 9 });
  assert.deepEqual(sideSeverity(7, threshold, 'low'),
    { severity: 'normal', boundary: null });
});

test('Attention streak restarts after a missing measurement interval', () => {
  const first = new Date('2026-10-12T00:00:00Z');
  const last = new Date('2026-10-12T00:05:00Z');
  const next = new Date('2026-10-12T00:15:00Z');
  assert.equal(anomalyStart(first, first, last, 6 * 60_000), first);
  assert.equal(anomalyStart(first, last, next, 6 * 60_000), next);
});
