const assert = require('node:assert/strict');
const { test } = require('node:test');
const { FarmStatusService } = require('../dist/business/farm-status.service');

const principal = { role: 'farms_manager', companyId: 'company', userId: 'fm' };
const now = new Date('2026-10-12T06:00:00Z');

function service({ missing = false } = {}) {
  const postgres = { pool: { query: async (sql, values) => {
    if (sql.includes('FROM farms f LEFT JOIN ponds')) return { rows: [
      { id: 'farm-uuid', public_id: 'farm-a', name: 'Farm A',
        location: 'Java', time_zone: 'Asia/Jakarta', pond_count: '2' },
    ] };
    if (sql.includes('FROM issues')) return { rows: [{ count: '2' }] };
    if (sql.includes('FROM farm_generator_states')) return { rows: [{ state: 'standby' }] };
    if (sql.includes('AS daily_due')) {
      assert.equal(values[3], '2026-10-19');
      return { rows: [{ daily_due: new Date('2026-10-12T11:00:00Z'),
        weekly_due: new Date('2026-10-19T05:00:00Z') }] };
    }
    if (sql.includes('FROM user_farm_assignments')) {
      return { rows: [{ public_id: 'tm', name: 'Manager' }] };
    }
    if (sql.includes('FROM production_cycles')) {
      assert.equal(values[0], 'farm-uuid');
      return { rows: [{ min: '10', max: '20' }] };
    }
    if (sql.includes('FROM reports')) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  } } };
  const water = { snapshot: async () => ({ items: [
    { pond: { name: 'Pond A' }, status: 'warning', values: {
      do: { quality: missing ? 'no_data' : 'live' },
    } },
    { pond: { name: 'Pond B' }, status: 'normal',
      values: { do: { quality: 'live' } } },
  ] }) };
  const growth = { snapshot: async () => ({ sampleBasedStatus: 'attention',
    behind: 1, eligible: 2, behindPonds: [{ name: 'Pond B' }] }) };
  const devices = { snapshot: async () => ({
    sensors: { neverSeen: 0, offline: [] },
    aerators: { unknown: 0 }, pumps: { unknown: 0 },
    equipmentFaults: [], equipmentOffline: [],
  }) };
  return new FarmStatusService(postgres,
    { visibleFarmIds: async () => ['farm-a'] }, water, growth, devices,
    { getRules: async () => ({ dailyReportDue: '18:00',
      weeklyReportDueWeekday: 1, weeklyReportDueTime: '12:00' }) });
}

test('farm list counts before filtering and detail shares the same status', async () => {
  const farms = service();
  const list = await farms.list(principal, { status: 'warning', hasIssues: 'true' }, now);
  assert.deepEqual(list.counts,
    { normal: 0, attention: 0, warning: 1, critical: 0 });
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].status, 'warning');
  assert.equal(list.items[0].mainReason, 'Water quality: 1 of 2 Ponds');
  assert.equal((await farms.list(principal, { status: 'normal' }, now)).items.length, 0);
  const late = await farms.list(principal, {}, new Date('2026-10-12T12:00:00Z'));
  assert.equal(late.items[0].operations.status, 'attention');
  assert.match(late.items[0].operations.detail, /Overdue reports/);
  const detail = await farms.detail(principal, 'farm-a', now);
  assert.equal(detail.status, list.items[0].status);
  assert.deepEqual(detail.docRange, { min: 10, max: 20 });
  assert.deepEqual(detail.technicalManagers, [{ id: 'tm', name: 'Manager' }]);
  await assert.rejects(() => farms.detail(principal, 'outside-farm', now),
    (error) => error.getStatus() === 404);
});

test('missing sensor evidence does not appear as a normal Farm', async () => {
  await assert.rejects(() => service({ missing: true }).list(principal, {}, now),
    (error) => error.getStatus() === 503);
});
