const assert = require('node:assert/strict');
const { test } = require('node:test');
const { WeeklyReportViewService } = require('../dist/business/weekly-report-view.service');

test('weekly draft joins Pond sources and submitted response uses frozen snapshot', async () => {
  const principal = { role: 'technical_manager', companyId: 'company', userId: 'tm' };
  const pond = { id: 'pond-1', name: 'Pond 1' };
  const source = { id: 'uuid', public_id: 'weekly-1', status: 'draft',
    farm_uuid: 'farm-uuid', farm_id: 'farm-1', farm_name: 'Farm 1',
    time_zone: 'Asia/Jakarta', week_start: '2026-10-12', week_end: '2026-10-18',
    manager_id: 'tm-1', manager_name: 'Manager', submitted_at: null,
    due_at: new Date('2026-10-19T05:00:00Z'), saved_at: null,
    farm_condition: null, water_quality_comment: null, technical_summary: null,
    frozen: null };
  const queries = [];
  const postgres = { pool: { query: async (sql) => {
    queries.push(sql);
    if (sql.includes('FROM reports r JOIN farms')) return { rows: [source] };
    if (sql.includes('FROM reports WHERE farm_id')) return { rows: [
      { public_id: 'weekly-previous', week_start: '2026-10-05' },
    ] };
    if (sql.includes('FROM farm_status_daily')) return { rows: [
      { status: 'warning' },
    ] };
    throw new Error(`Unexpected query: ${sql}`);
  } } };
  const production = { get: async () => ({
    samplingDate: '2026-10-18',
    kpis: { biomassKg: 100, survivalRatePct: 90, fcr: 1.2,
      growthDistribution: { behind: 1, onTrack: 0, ahead: 0 } },
    ponds: [{ pond, doc: 12 }], growthCurve: [],
  }) };
  const totals = { snapshot: async () => ({
    feeding: { unit: 'kg', total: 10, previousTotal: null, byPond: [] },
    mortality: { unit: 'pcs', total: 2, previousTotal: null,
      totalKg: 0.02, byPond: [] },
  }) };
  const activity = { snapshot: async () => ({
    alerts: [{ id: 'alert-1', state: 'unacknowledged' }],
    majorActions: [{ id: 'action-1' }],
  }) };
  const service = new WeeklyReportViewService(postgres,
    { visibleFarmIds: async () => ['farm-1'] }, production,
    { detail: async () => ({ status: 'attention' }) }, totals,
    { snapshot: async () => ({ date: '2026-10-15', sampled: 1,
      total: 1, labReceived: 1, notSampled: [] }) },
    { snapshot: async () => [{ pond, waterQuality: { doMin: 5 } }] },
    { snapshot: async () => [{ pond, laboratory: { pending: false } }] },
    activity);
  const draft = await service.get(principal, 'weekly-1');
  assert.equal(draft.previousReportId, 'weekly-previous');
  assert.equal(draft.summary.farmCondition, 'attention');
  assert.equal(draft.summary.alertCount, 1);
  assert.equal(draft.summary.alertsOngoing, 1);
  assert.deepEqual(draft.docRange, { min: 12, max: 12 });
  assert.equal(draft.pondsThisWeek[0].waterQuality.doMin, 5);
  source.week_start = '2026-09-28';
  source.week_end = '2026-10-04';
  const historic = await service.get(principal, 'weekly-1');
  assert.equal(historic.summary.systemFarmStatus, 'warning');
  await assert.rejects(() => service.get({ ...principal, role: 'farms_manager' },
    'weekly-1'), (error) => error.getStatus() === 404);
  source.status = 'submitted';
  source.frozen = { id: 'weekly-1', summary: { feedKg: 99 } };
  const before = queries.length;
  const frozen = await service.get({ ...principal, role: 'farms_manager' }, 'weekly-1');
  assert.equal(frozen.summary.feedKg, 99);
  assert.equal(queries.length, before + 2);
});
