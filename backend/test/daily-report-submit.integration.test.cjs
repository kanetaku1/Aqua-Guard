const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { BusinessScopeService } = require('../dist/business/business-scope.service');
const { DailyReportSubmitService } = require('../dist/business/daily-report-submit.service');

test('Daily Report submit requires inputs and freezes body with status atomically', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const postgres = { pool: {
    query: (...args) => {
      const result = pending.then(() => client.query(...args));
      pending = result.then(() => {}, () => {});
      return result;
    },
    connect: async () => ({
      query: async (sql, ...args) => {
        if (sql === 'BEGIN') return client.query('SAVEPOINT daily_submit');
        if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT daily_submit');
        if (sql === 'ROLLBACK') {
          await client.query('ROLLBACK TO SAVEPOINT daily_submit');
          return client.query('RELEASE SAVEPOINT daily_submit');
        }
        return client.query(sql, ...args);
      }, release: () => {},
    }),
  } };
  let unavailable = false;
  const view = { get: async () => {
    if (unavailable) throw new Error('Telemetry unavailable');
    return { id: `report-${suffix}`, type: 'daily',
      farm: { id: `farm-${suffix}`, name: 'Farm' }, date: '2026-10-12',
      technicalManager: { id: `user-${suffix}`, name: 'TM' },
      status: 'draft', submittedAt: null, savedAt: null,
      dueAt: '2026-10-12T11:00:00.000Z', summary: 'Frozen summary',
      ponds: [], alerts: [], actions: [], equipmentEvents: [] };
  } };
  const submit = new DailyReportSubmitService(postgres,
    new BusinessScopeService(postgres), view);
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Submit Test','active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [`farm-${suffix}`, company])).rows[0].id;
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    await client.query(`INSERT INTO user_farm_assignments (user_id,farm_id,assigned_at)
      VALUES ($1,$2,'2026-10-01T00:00:00Z')`, [user, farm]);
    const report = (await client.query(`INSERT INTO reports
      (public_id,farm_id,type,report_date,technical_manager_id,due_at)
      VALUES ($1,$2,'daily','2026-10-12',$3,'2026-10-12T11:00:00Z') RETURNING id`,
    [`report-${suffix}`, farm, user])).rows[0].id;
    const tm = { role: 'technical_manager', companyId: company, userId: user };
    await assert.rejects(() => submit.submit(tm, `report-${suffix}`),
      (error) => error.getStatus() === 422
        && error.getResponse().fieldErrors.length === 2);
    await client.query(`INSERT INTO daily_report_inputs
      (report_id,weather,summary) VALUES ($1,'rain','Summary')`, [report]);
    unavailable = true;
    await assert.rejects(() => submit.submit(tm, `report-${suffix}`),
      /Telemetry unavailable/);
    assert.equal((await client.query(`SELECT status FROM reports WHERE id=$1`,
      [report])).rows[0].status, 'draft');
    unavailable = false;
    const response = await submit.submit(tm, `report-${suffix}`);
    assert.equal(response.status, 'submitted');
    assert.equal(response.id, `report-${suffix}`);
    assert.equal(response.savedAt, response.submittedAt);
    const stored = (await client.query(`SELECT r.status,r.submitted_at,
      s.payload,s.schema_version FROM reports r JOIN report_snapshots s
        ON s.report_id=r.id WHERE r.id=$1`, [report])).rows[0];
    assert.equal(stored.status, 'submitted');
    assert.equal(stored.schema_version, 'daily-v1');
    assert.equal(stored.payload.summary, 'Frozen summary');
    assert.equal(stored.payload.status, 'submitted');
    assert.equal(stored.payload.submittedAt, stored.submitted_at.toISOString());
    await assert.rejects(() => submit.submit(tm, `report-${suffix}`),
      (error) => error.getStatus() === 409);
    await assert.rejects(() => submit.submit({ ...tm, role: 'farms_manager' },
      `report-${suffix}`), (error) => error.getStatus() === 403);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
