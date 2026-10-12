const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { WeeklyReportActivityService } = require('../dist/business/weekly-report-activity.service');

test('weekly activity includes overlapping alerts and editable notes', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const service = new WeeklyReportActivityService({ pool: { query: (...args) => {
    const result = pending.then(() => client.query(...args));
    pending = result.then(() => {}, () => {});
    return result;
  } } });
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Weekly Activity Test','active') RETURNING id`,
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
    const report = (await client.query(`INSERT INTO reports
      (public_id,farm_id,type,week_start,week_end,technical_manager_id,due_at)
      VALUES ($1,$2,'weekly','2026-10-12','2026-10-18',$3,'2026-10-19T05:00:00Z')
      RETURNING id`, [`weekly-${suffix}`, farm, user])).rows[0].id;
    const alert = (await client.query(`INSERT INTO alerts
      (public_id,pond_id,parameter,severity,state,occurred_at,resolved_at)
      VALUES ($1,$2,'do','warning','resolved','2026-10-11T16:00:00Z',
        '2026-10-11T18:00:00Z') RETURNING id`,
    [`alert-${suffix}`, pond])).rows[0].id;
    await client.query(`INSERT INTO weekly_report_alert_notes
      (report_id,alert_id,cause,action,outcome)
      VALUES ($1,$2,'Low aeration','Checked aerator','Recovered')`,
    [report, alert]);
    await client.query(`INSERT INTO weekly_report_major_actions
      (public_id,report_id,action_date,pond_id,action,sort_order)
      VALUES ($1,$2,'2026-10-12',$3,'Inspected aerator',0)`,
    [`action-${suffix}`, report, pond]);
    const bounds = (await client.query(`SELECT
      (('2026-10-12'::date + time '00:00') AT TIME ZONE 'Asia/Jakarta') AS start_at,
      (('2026-10-19'::date + time '00:00') AT TIME ZONE 'Asia/Jakarta') AS end_at`)).rows[0];
    assert.equal(bounds.start_at.toISOString(), '2026-10-11T17:00:00.000Z');
    assert.equal((await client.query(`SELECT count(*)::int AS count FROM alerts
      WHERE pond_id=$1 AND occurred_at<$3 AND resolved_at>=$2`,
    [pond, bounds.start_at, bounds.end_at])).rows[0].count, 1);
    const result = await service.snapshot(report, farm, '2026-10-12',
      'Asia/Jakarta', new Date('2026-10-13T00:00:00Z'));
    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].id, `alert-${suffix}`);
    assert.equal(result.alerts[0].durationMinutes, 120);
    assert.equal(result.alerts[0].cause, 'Low aeration');
    assert.equal(result.alerts[0].outcome, 'Recovered');
    assert.deepEqual(result.majorActions, [{ id: `action-${suffix}`,
      date: '2026-10-12', pond: { id: `pond-${suffix}`, name: 'Pond' },
      action: 'Inspected aerator' }]);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
