const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { BusinessScopeService } = require('../dist/business/business-scope.service');
const { DailyReportUpdateService } = require('../dist/business/daily-report-update.service');

test('Daily Report PATCH preserves omitted fields and replaces supplied collections atomically', async () => {
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
        if (sql === 'BEGIN') return client.query('SAVEPOINT daily_update');
        if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT daily_update');
        if (sql === 'ROLLBACK') {
          await client.query('ROLLBACK TO SAVEPOINT daily_update');
          return client.query('RELEASE SAVEPOINT daily_update');
        }
        return client.query(sql, ...args);
      }, release: () => {},
    }),
  } };
  const view = { get: async (_principal, id) => ({ id, status: 'draft' }) };
  const update = new DailyReportUpdateService(postgres,
    new BusinessScopeService(postgres), view);
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Update Test','active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
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
    const report = (await client.query(`INSERT INTO reports
      (public_id,farm_id,type,report_date,technical_manager_id,due_at)
      VALUES ($1,$2,'daily','2026-10-12',$3,'2026-10-12T11:00:00Z') RETURNING id`,
    [`report-${suffix}`, farm, user])).rows[0].id;
    const alert = (await client.query(`INSERT INTO alerts
      (public_id,pond_id,parameter,severity,state,occurred_at)
      VALUES ($1,$2,'do','warning','unacknowledged','2026-10-12T01:00:00Z') RETURNING id`,
    [`alert-${suffix}`, pond])).rows[0].id;
    const tm = { role: 'technical_manager', companyId: company, userId: user };
    const reportId = `report-${suffix}`;
    await update.update(tm, reportId, {
      ponds: [{ pondId: `pond-${suffix}`, appetite: 'reduced',
        observations: ['reduced_appetite'] }],
      environment: { weather: 'rain', rainfallMm: 1.25 },
      excludedAlertIds: [`alert-${suffix}`],
      manualActions: [{ action: 'Inspect', at: '2026-10-12T02:00:00Z',
        pondId: `pond-${suffix}` }],
      manualEquipmentEvents: [{ equipment: 'Pump', failure: 'Leak',
        occurredAt: '2026-10-12T03:00:00Z', status: 'in_progress' }],
      summary: 'First summary',
    });
    await update.update(tm, reportId, {
      ponds: [{ pondId: `pond-${suffix}`, tray: 'leftover' }],
      environment: { events: 'Rain stopped' },
      manualActions: [],
    });
    const saved = (await client.query(`SELECT i.weather,i.rainfall_mm,i.events,i.summary,
      p.appetite,p.tray,p.observations
      FROM daily_report_inputs i JOIN daily_report_pond_inputs p
        ON p.report_id=i.report_id WHERE i.report_id=$1`, [report])).rows[0];
    assert.equal(saved.weather, 'rain');
    assert.equal(Number(saved.rainfall_mm), 1.25);
    assert.equal(saved.events, 'Rain stopped');
    assert.equal(saved.summary, 'First summary');
    assert.equal(saved.appetite, 'reduced');
    assert.equal(saved.tray, 'leftover');
    assert.deepEqual(saved.observations, ['reduced_appetite']);
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM report_manual_actions
      WHERE report_id=$1`, [report])).rows[0].n, 0);
    assert.equal((await client.query(`SELECT count(*)::int AS n
      FROM report_manual_equipment_events WHERE report_id=$1`, [report])).rows[0].n, 1);
    assert.equal((await client.query(`SELECT alert_id FROM report_excluded_alerts
      WHERE report_id=$1`, [report])).rows[0].alert_id, alert);
    await assert.rejects(() => update.update(tm, reportId, {
      environment: { weather: 'sunny' },
      manualActions: [{ action: 'Wrong Pond', at: '2026-10-12T04:00:00Z',
        pondId: 'foreign-pond' }],
    }), (error) => error.getStatus() === 422);
    assert.equal((await client.query(`SELECT weather FROM daily_report_inputs
      WHERE report_id=$1`, [report])).rows[0].weather, 'rain');
    await assert.rejects(() => update.update(tm, reportId, {
      ponds: [{ pondId: `pond-${suffix}`, health: 'invalid' }],
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
