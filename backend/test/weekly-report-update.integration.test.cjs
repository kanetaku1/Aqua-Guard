const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { BusinessScopeService } = require('../dist/business/business-scope.service');
const { WeeklyReportUpdateService } = require('../dist/business/weekly-report-update.service');

test('Weekly PATCH preserves omitted fields and replaces collections atomically', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  const postgres = { pool: {
    query: (...args) => client.query(...args),
    connect: async () => ({
      query: async (sql, ...args) => {
        if (sql === 'BEGIN') return client.query('SAVEPOINT weekly_update');
        if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT weekly_update');
        if (sql === 'ROLLBACK') {
          await client.query('ROLLBACK TO SAVEPOINT weekly_update');
          return client.query('RELEASE SAVEPOINT weekly_update');
        }
        return client.query(sql, ...args);
      }, release: () => {},
    }),
  } };
  const view = { get: async (_principal, id) => ({ id, status: 'draft' }) };
  const update = new WeeklyReportUpdateService(postgres,
    new BusinessScopeService(postgres), view);
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Weekly Update Test','active') RETURNING id`,
    [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [`farm-${suffix}`, company])).rows[0].id;
    const pond = (await client.query(`INSERT INTO ponds
      (public_id,farm_id,name,area_ha) VALUES ($1,$2,'Pond',1) RETURNING id`,
    [`pond-${suffix}`, farm])).rows[0].id;
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    await client.query(`INSERT INTO user_farm_assignments (user_id,farm_id,assigned_at)
      VALUES ($1,$2,'2026-10-01T00:00:00Z')`, [user, farm]);
    const reportId = `weekly-${suffix}`;
    const report = (await client.query(`INSERT INTO reports
      (public_id,farm_id,type,week_start,week_end,technical_manager_id,due_at)
      VALUES ($1,$2,'weekly','2026-10-12','2026-10-18',$3,
        '2026-10-20T05:00:00Z') RETURNING id`,
    [reportId, farm, user])).rows[0].id;
    const alert = (await client.query(`INSERT INTO alerts
      (public_id,pond_id,parameter,severity,state,occurred_at)
      VALUES ($1,$2,'do','warning','unacknowledged','2026-10-12T01:00:00Z')
      RETURNING id`, [`alert-${suffix}`, pond])).rows[0].id;
    const tm = { role: 'technical_manager', companyId: company, userId: user };
    await update.update(tm, reportId, {
      farmCondition: 'warning', waterQualityComment: 'Rain',
      technicalSummary: 'Check aeration',
      alertNotes: [{ alertId: `alert-${suffix}`, cause: 'Low oxygen' }],
      majorActions: [{ date: '2026-10-13', action: 'Inspect',
        pondId: `pond-${suffix}` }],
    });
    await update.update(tm, reportId, {
      waterQualityComment: null, majorActions: [],
    });
    const saved = (await client.query(`SELECT * FROM weekly_report_inputs
      WHERE report_id=$1`, [report])).rows[0];
    assert.equal(saved.farm_condition, 'warning');
    assert.equal(saved.water_quality_comment, null);
    assert.equal(saved.technical_summary, 'Check aeration');
    assert.equal((await client.query(`SELECT count(*)::int AS n
      FROM weekly_report_major_actions WHERE report_id=$1`, [report])).rows[0].n, 0);
    assert.equal((await client.query(`SELECT alert_id,cause
      FROM weekly_report_alert_notes WHERE report_id=$1`, [report])).rows[0]
      .alert_id, alert);
    await assert.rejects(() => update.update(tm, reportId, {
      farmCondition: 'critical', majorActions: [{ date: '2026-10-19',
        action: 'Outside week' }],
    }), (error) => error.getStatus() === 422);
    assert.equal((await client.query(`SELECT farm_condition
      FROM weekly_report_inputs WHERE report_id=$1`, [report])).rows[0]
      .farm_condition, 'warning');
    await assert.rejects(() => update.update(tm, reportId, {
      alertNotes: [{ alertId: 'foreign-alert' }],
    }), (error) => error.getStatus() === 422);
    await assert.rejects(() => update.update({ ...tm, role: 'farms_manager' },
      reportId, {}), (error) => error.getStatus() === 403);
    await client.query(`UPDATE reports SET status='submitted',submitted_at=now(),
      submitted_by=$2 WHERE id=$1`, [report, user]);
    await assert.rejects(() => update.update(tm, reportId, {}),
      (error) => error.getStatus() === 409);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
