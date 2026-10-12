const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { BusinessScopeService } = require('../dist/business/business-scope.service');
const { FarmReportStatusService } = require('../dist/business/farm-report-status.service');

test('report status follows farm time zone, due rules, saved reports and access scope', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const postgres = { pool: { query: (...args) => {
    const result = pending.then(() => client.query(...args));
    pending = result.then(() => {}, () => {});
    return result;
  } } };
  const scope = new BusinessScopeService(postgres);
  const settings = { getRules: async () => ({ dailyReportDue: '18:00',
    weeklyReportDueWeekday: 2, weeklyReportDueTime: '12:00' }) };
  const service = new FarmReportStatusService(postgres, scope, settings);
  const beforeDue = new Date('2026-10-11T16:30:00Z'); // Monday 01:30 in Jayapura
  const afterDailyDue = new Date('2026-10-12T10:00:00Z'); // Monday 19:00 in Jayapura
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Report Test','active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,time_zone,status)
      VALUES ($1,$2,'Papua Farm','Papua','Asia/Jayapura','active') RETURNING id`,
    [`farm-${suffix}`, company])).rows[0].id;
    const manager = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'Report TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`tm-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    await client.query(`INSERT INTO user_farm_assignments (user_id,farm_id,assigned_at)
      VALUES ($1,$2,$3)`, [manager, farm, beforeDue]);
    const principal = { userId: manager, companyId: company, role: 'technical_manager' };
    const initial = await service.get(principal, `farm-${suffix}`, beforeDue);
    assert.deepEqual(initial, {
      dailyToday: { reportId: null, state: 'not_started', date: '2026-10-12',
        dueAt: '2026-10-12T09:00:00.000Z', savedAt: null },
      weeklyThisWeek: { reportId: null, state: 'not_started',
        weekStart: '2026-10-12', weekEnd: '2026-10-18',
        dueAt: '2026-10-20T03:00:00.000Z', savedAt: null },
      lastSubmitted: null,
    });
    assert.equal((await service.get(principal, `farm-${suffix}`, afterDailyDue))
      .dailyToday.state, 'overdue');
    const dailyId = `daily-${suffix}`;
    await client.query(`INSERT INTO reports
      (public_id,farm_id,type,report_date,technical_manager_id,due_at,saved_at)
      VALUES ($1,$2,'daily','2026-10-12',$3,'2026-10-12T09:00:00Z',
        '2026-10-12T05:00:00Z')`, [dailyId, farm, manager]);
    const draft = await service.get(principal, `farm-${suffix}`, beforeDue);
    assert.equal(draft.dailyToday.state, 'draft');
    assert.equal(draft.dailyToday.reportId, dailyId);
    assert.equal(draft.dailyToday.savedAt, '2026-10-12T05:00:00.000Z');
    assert.equal((await service.get(principal, `farm-${suffix}`, afterDailyDue))
      .dailyToday.state, 'overdue');
    const weeklyId = `weekly-${suffix}`;
    await client.query(`INSERT INTO reports
      (public_id,farm_id,type,week_start,week_end,technical_manager_id,due_at)
      VALUES ($1,$2,'weekly','2026-10-12','2026-10-18',$3,
        '2026-10-13T03:00:00Z')`, [weeklyId, farm, manager]);
    assert.equal((await service.get(principal, `farm-${suffix}`, beforeDue))
      .weeklyThisWeek.state, 'draft');
    await client.query(`UPDATE reports SET status='submitted',submitted_by=$2,
      submitted_at='2026-10-12T08:00:00Z' WHERE public_id=$1`, [dailyId, manager]);
    const submitted = await service.get(principal, `farm-${suffix}`, afterDailyDue);
    assert.equal(submitted.dailyToday.state, 'submitted');
    assert.deepEqual(submitted.lastSubmitted, {
      id: dailyId, type: 'daily', farm: { id: `farm-${suffix}`, name: 'Papua Farm' },
      date: '2026-10-12', status: 'submitted',
      technicalManager: { id: `tm-${suffix}`, name: 'Report TM' },
      submittedAt: '2026-10-12T08:00:00.000Z',
      dueAt: '2026-10-12T09:00:00.000Z',
      savedAt: '2026-10-12T05:00:00.000Z',
    });
    await assert.rejects(service.get(principal, 'missing-farm', beforeDue),
      (error) => error.getStatus() === 404);
    await assert.rejects(service.get({ ...principal, role: 'farms_manager' },
      `farm-${suffix}`, beforeDue), (error) => error.getStatus() === 403);
    await client.query('SAVEPOINT duplicate_report');
    await assert.rejects(client.query(`INSERT INTO reports
      (public_id,farm_id,type,report_date,technical_manager_id,due_at)
      VALUES ($1,$2,'daily','2026-10-12',$3,'2026-10-12T09:00:00Z')`,
    [`duplicate-${suffix}`, farm, manager]), (error) => error.code === '23505');
    await client.query('ROLLBACK TO SAVEPOINT duplicate_report');
    await client.query('SAVEPOINT invalid_week');
    await assert.rejects(client.query(`INSERT INTO reports
      (public_id,farm_id,type,week_start,week_end,technical_manager_id,due_at)
      VALUES ($1,$2,'weekly','2026-10-13','2026-10-19',$3,
        '2026-10-13T03:00:00Z')`, [`invalid-${suffix}`, farm, manager]),
    (error) => error.code === '23514');
    await client.query('ROLLBACK TO SAVEPOINT invalid_week');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
