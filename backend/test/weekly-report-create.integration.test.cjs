const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { BusinessScopeService } = require('../dist/business/business-scope.service');
const { WeeklyReportCreateService } = require('../dist/business/weekly-report-create.service');

test('weekly create checks source data before storing a Monday draft', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const postgres = { pool: { query: (...args) => {
    const result = pending.then(() => client.query(...args));
    pending = result.then(() => {}, () => {});
    return result;
  } } };
  let available = false;
  const view = { renderDraft: async (_principal, draft) => {
    if (!available) throw new Error('Source unavailable');
    return { id: draft.public_id, weekStart: draft.week_start,
      weekEnd: draft.week_end, dueAt: draft.due_at.toISOString() };
  } };
  const settings = { getRules: async () => ({
    weeklyReportDueWeekday: 2, weeklyReportDueTime: '12:00',
  }) };
  const service = new WeeklyReportCreateService(postgres,
    new BusinessScopeService(postgres), settings, view);
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Weekly Create Test','active') RETURNING id`,
    [`company-${suffix}`])).rows[0].id;
    const farmId = `farm-${suffix}`;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [farmId, company])).rows[0].id;
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    await client.query(`INSERT INTO user_farm_assignments
      (user_id,farm_id,assigned_at) VALUES ($1,$2,'2026-10-01T00:00:00Z')`,
    [user, farm]);
    const principal = { role: 'technical_manager', userId: user, companyId: company };
    const input = { farmId, weekStart: '2026-10-12' };
    await assert.rejects(() => service.create(principal, input), /Source unavailable/);
    assert.equal((await client.query(`SELECT count(*)::int AS count FROM reports
      WHERE farm_id=$1`, [farm])).rows[0].count, 0);
    available = true;
    const result = await service.create(principal, input);
    assert.equal(result.weekEnd, '2026-10-18');
    assert.equal(result.dueAt, '2026-10-20T05:00:00.000Z');
    const saved = (await client.query(`SELECT to_char(week_start,'YYYY-MM-DD') AS week_start,
      to_char(week_end,'YYYY-MM-DD') AS week_end,due_at FROM reports
      WHERE public_id=$1`, [result.id])).rows[0];
    assert.equal(saved.week_start, '2026-10-12');
    assert.equal(saved.week_end, '2026-10-18');
    assert.equal(saved.due_at.toISOString(), result.dueAt);
    await assert.rejects(() => service.create(principal, input),
      (error) => error.getStatus() === 409
        && error.getResponse().existingReportId === result.id);
    await assert.rejects(() => service.create(principal,
      { farmId, weekStart: '2026-10-13' }),
    (error) => error.getStatus() === 422);
    await assert.rejects(() => service.create({ ...principal,
      role: 'farms_manager' }, input), (error) => error.getStatus() === 403);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
