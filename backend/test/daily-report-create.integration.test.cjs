const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { BusinessScopeService } = require('../dist/business/business-scope.service');
const { DailyReportCreateService } = require('../dist/business/daily-report-create.service');

test('Daily Report creation fixes local due time and returns existing ID on conflict', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const postgres = { pool: { query: (...args) => {
    const result = pending.then(() => client.query(...args));
    pending = result.then(() => {}, () => {});
    return result;
  } } };
  let previewFails = false;
  const view = { renderDraft: async (_principal, row) => {
    if (previewFails) throw new Error('Telemetry unavailable');
    return { id: row.public_id, type: 'daily', status: row.status,
      dueAt: row.due_at.toISOString(), farm: { id: row.farm_id, name: row.farm_name },
      date: row.date };
  } };
  const create = new DailyReportCreateService(postgres,
    new BusinessScopeService(postgres),
    { getRules: async () => ({ dailyReportDue: '18:00' }) }, view);
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Create Test','active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,time_zone,status)
      VALUES ($1,$2,'Farm','Papua','Asia/Jayapura','active') RETURNING id`,
    [`farm-${suffix}`, company])).rows[0].id;
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    await client.query(`INSERT INTO user_farm_assignments (user_id,farm_id,assigned_at)
      VALUES ($1,$2,'2026-10-01T00:00:00Z')`, [user, farm]);
    const tm = { role: 'technical_manager', companyId: company, userId: user };
    const body = { farmId: `farm-${suffix}`, date: '2026-10-12' };
    previewFails = true;
    await assert.rejects(() => create.create(tm, body), /Telemetry unavailable/);
    assert.equal((await client.query(`SELECT count(*)::int AS count FROM reports
      WHERE farm_id=$1`, [farm])).rows[0].count, 0);
    previewFails = false;
    const created = await create.create(tm, body);
    assert.match(created.id, /^daily-/);
    assert.equal(created.dueAt, '2026-10-12T09:00:00.000Z');
    assert.equal(created.farm.id, body.farmId);
    await assert.rejects(() => create.create(tm, body),
      (error) => error.getStatus() === 409
        && error.getResponse().existingReportId === created.id);
    await assert.rejects(() => create.create({ ...tm, role: 'farms_manager' }, body),
      (error) => error.getStatus() === 403);
    await assert.rejects(() => create.create(tm, { ...body, date: '2026-02-30' }),
      (error) => error.getStatus() === 422);
    await assert.rejects(() => create.create(tm, { ...body, farmId: 'other-farm' }),
      (error) => error.getStatus() === 404);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
