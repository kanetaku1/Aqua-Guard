const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { BusinessScopeService } = require('../dist/business/business-scope.service');
const { WeeklyReportSubmitService } = require('../dist/business/weekly-report-submit.service');
const { ReportSubmitService } = require('../dist/business/report-submit.service');

test('Weekly submit requires summary and freezes body with status atomically', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  const postgres = { pool: {
    query: (...args) => client.query(...args),
    connect: async () => ({
      query: async (sql, ...args) => {
        if (sql === 'BEGIN') return client.query('SAVEPOINT weekly_submit');
        if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT weekly_submit');
        if (sql === 'ROLLBACK') {
          await client.query('ROLLBACK TO SAVEPOINT weekly_submit');
          return client.query('RELEASE SAVEPOINT weekly_submit');
        }
        return client.query(sql, ...args);
      }, release: () => {},
    }),
  } };
  let unavailable = false;
  const reportId = `weekly-${suffix}`;
  const view = { get: async () => {
    if (unavailable) throw new Error('Telemetry unavailable');
    return { id: reportId, type: 'weekly',
      farm: { id: `farm-${suffix}`, name: 'Farm' },
      weekStart: '2026-10-12', weekEnd: '2026-10-18',
      technicalManager: { id: `user-${suffix}`, name: 'TM' },
      status: 'draft', submittedAt: null, savedAt: null,
      dueAt: '2026-10-20T05:00:00.000Z',
      technicalSummary: 'Frozen summary', pondsThisWeek: [] };
  } };
  const scope = new BusinessScopeService(postgres);
  const weekly = new WeeklyReportSubmitService(postgres, scope, view);
  const submit = new ReportSubmitService(postgres, scope,
    { submit: () => { throw new Error('Wrong report type'); } }, weekly);
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Weekly Submit Test','active') RETURNING id`,
    [`company-${suffix}`])).rows[0].id;
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
      (public_id,farm_id,type,week_start,week_end,technical_manager_id,due_at)
      VALUES ($1,$2,'weekly','2026-10-12','2026-10-18',$3,
        '2026-10-20T05:00:00Z') RETURNING id`,
    [reportId, farm, user])).rows[0].id;
    const tm = { role: 'technical_manager', companyId: company, userId: user };
    await assert.rejects(() => submit.submit(tm, reportId),
      (error) => error.getStatus() === 422
        && error.getResponse().fieldErrors[0].field === 'technicalSummary');
    await client.query(`INSERT INTO weekly_report_inputs
      (report_id,technical_summary) VALUES ($1,'Summary')`, [report]);
    unavailable = true;
    await assert.rejects(() => submit.submit(tm, reportId), /Telemetry unavailable/);
    assert.equal((await client.query(`SELECT status FROM reports WHERE id=$1`,
      [report])).rows[0].status, 'draft');
    unavailable = false;
    const response = await submit.submit(tm, reportId);
    assert.equal(response.status, 'submitted');
    assert.equal(response.weekStart, '2026-10-12');
    assert.equal(response.savedAt, response.submittedAt);
    const stored = (await client.query(`SELECT r.status,r.submitted_at,
      s.payload,s.schema_version FROM reports r JOIN report_snapshots s
        ON s.report_id=r.id WHERE r.id=$1`, [report])).rows[0];
    assert.equal(stored.status, 'submitted');
    assert.equal(stored.schema_version, 'weekly-v1');
    assert.equal(stored.payload.technicalSummary, 'Frozen summary');
    assert.equal(stored.payload.submittedAt, stored.submitted_at.toISOString());
    await assert.rejects(() => submit.submit(tm, reportId),
      (error) => error.getStatus() === 409);
    await assert.rejects(() => submit.submit({ ...tm, role: 'farms_manager' },
      reportId), (error) => error.getStatus() === 403);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
