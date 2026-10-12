const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { DailyReportActivityService } = require('../dist/business/daily-report-activity.service');

test('daily activity includes spanning alerts, exclusions and actions on the farm day', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const activity = new DailyReportActivityService({ pool: {
    query: (...args) => {
      const result = pending.then(() => client.query(...args));
      pending = result.then(() => {}, () => {});
      return result;
    },
  } });
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Activity Test','active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,time_zone,status)
      VALUES ($1,$2,'Farm','Papua','Asia/Jayapura','active') RETURNING id`,
    [`farm-${suffix}`, company])).rows[0].id;
    const pond = (await client.query(`INSERT INTO ponds
      (public_id,farm_id,name,area_ha) VALUES ($1,$2,'Pond',1) RETURNING id`,
    [`pond-${suffix}`, farm])).rows[0].id;
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    const report = (await client.query(`INSERT INTO reports
      (public_id,farm_id,type,report_date,technical_manager_id,due_at)
      VALUES ($1,$2,'daily','2026-10-12',$3,'2026-10-12T09:00:00Z')
      RETURNING id`, [`report-${suffix}`, farm, user])).rows[0].id;
    const oldAlert = (await client.query(`INSERT INTO alerts
      (public_id,pond_id,parameter,severity,state,observed_value,
       threshold_value,unit,direction,occurred_at,resolved_at)
      VALUES ($1,$2,'do','warning','resolved',4.2,4.5,'mg/L','below',
        '2026-10-11T14:00:00Z','2026-10-11T17:00:00Z') RETURNING id`,
    [`alert-old-${suffix}`, pond])).rows[0].id;
    await client.query(`INSERT INTO alerts
      (public_id,pond_id,parameter,severity,state,occurred_at)
      VALUES ($1,$2,'temperature','attention','unacknowledged',
        '2026-10-12T01:00:00Z'),
             ($3,$2,'ph','warning','unacknowledged',
        '2026-10-12T16:00:00Z')`,
    [`alert-today-${suffix}`, pond, `alert-next-${suffix}`]);
    await client.query(`INSERT INTO report_excluded_alerts (report_id,alert_id)
      VALUES ($1,$2)`, [report, oldAlert]);
    await client.query(`INSERT INTO alert_actions
      (public_id,alert_id,performed_at,type,note,recorded_by)
      VALUES ($1,$2,'2026-10-11T16:00:00Z','increased_aeration','Extra aeration',$3),
             ($4,$2,'2026-10-11T14:30:00Z','other',NULL,$3)`,
    [`action-day-${suffix}`, oldAlert, user, `action-previous-${suffix}`]);
    await client.query(`INSERT INTO report_manual_actions
      (public_id,report_id,pond_id,at,action,outcome,sort_order)
      VALUES ($1,$2,$3,'2026-10-12T02:00:00Z','Inspect pump','Repaired',1)`,
    [`manual-${suffix}`, report, pond]);
    await client.query(`INSERT INTO report_manual_equipment_events
      (public_id,report_id,pond_id,equipment,failure,occurred_at,action,status)
      VALUES ($1,$2,$3,'Pump','Leak','2026-10-12T03:00:00Z',
        'Replacement planned','in_progress')`, [`event-${suffix}`, report, pond]);
    const result = await activity.snapshot(report, farm, '2026-10-12',
      'Asia/Jayapura', new Date('2026-10-12T06:00:00Z'));
    assert.deepEqual(result.alerts.map((item) => item.id),
      [`alert-old-${suffix}`, `alert-today-${suffix}`]);
    assert.equal(result.alerts[0].excluded, true);
    assert.equal(result.alerts[0].durationMinutes, 180);
    assert.equal(result.alerts[0].title, 'DO below threshold (4.2 mg/L < 4.5 mg/L)');
    assert.equal(result.alerts[1].excluded, false);
    assert.equal(result.alerts[1].durationMinutes, 300);
    assert.deepEqual(result.actions.map((item) => item.id),
      [`action-day-${suffix}`, `manual-${suffix}`]);
    assert.equal(result.actions[0].source, 'alert_handling');
    assert.equal(result.actions[0].action, 'Increased aeration — Extra aeration');
    assert.equal(result.actions[1].outcome, 'Repaired');
    assert.deepEqual(result.equipmentEvents, [{
      id: `event-${suffix}`, source: 'manual', equipment: 'Pump',
      pond: { id: `pond-${suffix}`, name: 'Pond' }, failure: 'Leak',
      occurredAt: '2026-10-12T03:00:00.000Z', action: 'Replacement planned',
      status: 'in_progress',
    }]);
    const otherFarm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Other','Java','active') RETURNING id`,
    [`other-farm-${suffix}`, company])).rows[0].id;
    const otherPond = (await client.query(`INSERT INTO ponds
      (public_id,farm_id,name,area_ha) VALUES ($1,$2,'Other pond',1) RETURNING id`,
    [`other-pond-${suffix}`, otherFarm])).rows[0].id;
    await client.query(`INSERT INTO report_manual_actions
      (public_id,report_id,pond_id,at,action,sort_order)
      VALUES ($1,$2,$3,'2026-10-12T02:30:00Z','Invalid reference',2)`,
    [`foreign-${suffix}`, report, otherPond]);
    await assert.rejects(activity.snapshot(report, farm, '2026-10-12',
      'Asia/Jayapura', new Date('2026-10-12T06:00:00Z')),
    /another Farm/);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
