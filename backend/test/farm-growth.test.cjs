const assert = require('node:assert/strict');
const { test } = require('node:test');
const { growthSeverity, targetAt } = require('../dist/business/farm-growth-status.service');

test('growth status uses configured percentage boundaries', () => {
  assert.equal(growthSeverity(0, 4, 25, 50), 'normal');
  assert.equal(growthSeverity(1, 4, 25, 50), 'attention');
  assert.equal(growthSeverity(2, 4, 25, 50), 'warning');
  assert.equal(growthSeverity(1, 4, 30, 60), 'normal');
  assert.equal(growthSeverity(0, 0, 25, 50), null);
});

test('growth target interpolates by sample DOC and rejects uncovered dates', () => {
  const points = [{ doc: 27, targetAbwG: 5.3 }, { doc: 34, targetAbwG: 7.4 }];
  assert.equal(targetAt(30, points), 6.2);
  assert.equal(targetAt(26, points), null);
  assert.equal(targetAt(35, points), null);
});
