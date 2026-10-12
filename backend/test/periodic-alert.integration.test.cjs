const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { InfluxService } = require('../dist/infrastructure/influx.service');
const { SensorIngestionService } = require('../dist/infrastructure/sensor-ingestion.service');
const { CriticalEvaluationService } = require('../dist/infrastructure/critical-evaluation.service');
const { PeriodicAlertService } = require('../dist/infrastructure/periodic-alert.service');
const { AdminThresholdsService } = require('../dist/admin/admin-thresholds.service');

test('periodic scan creates attention and warning, closes recovery, and shares critical episode', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const influxUrl = process.env.INFLUXDB_URL
    ?? `http://127.0.0.1:${process.env.INFLUXDB_PORT ?? '8086'}`;
  const headers = { Authorization: `Token ${process.env.INFLUXDB_ADMIN_TOKEN}` };
  const priorBucket = process.env.INFLUXDB_BUCKET;
  let bucketId;
  let companyId;
  let farmId;
  let pondId;
  let deviceId;
  let userId;
  try {
    const org = process.env.INFLUXDB_ORG ?? 'aquaguard';
    const orgResponse = await fetch(`${influxUrl}/api/v2/orgs?org=${encodeURIComponent(org)}`,
      { headers });
    assert.equal(orgResponse.status, 200);
    const orgId = (await orgResponse.json()).orgs[0].id;
    const created = await fetch(`${influxUrl}/api/v2/buckets`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `aquaguard_periodic_${randomUUID().replaceAll('-', '')}`,
        orgID: orgId }),
    });
    assert.equal(created.status, 201);
    const bucket = await created.json();
    bucketId = bucket.id;
    process.env.INFLUXDB_BUCKET = bucket.name;

    companyId = (await pool.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Periodic Test','active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    farmId = (await pool.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','East Java','active') RETURNING id`,
    [`farm-${suffix}`, companyId])).rows[0].id;
    pondId = (await pool.query(`INSERT INTO ponds
      (public_id,farm_id,name,area_ha) VALUES ($1,$2,'Pond',0.8) RETURNING id`,
    [`pond-${suffix}`, farmId])).rows[0].id;
    deviceId = (await pool.query(`INSERT INTO devices (device_id,type,parameter)
      VALUES ($1,'sensor','do') RETURNING id`, [`device-${suffix}`])).rows[0].id;
    await pool.query(`INSERT INTO device_assignments (device_id,pond_id,assigned_at)
      VALUES ($1,$2,now()-interval '1 day')`, [deviceId, pondId]);
    userId = (await pool.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'Admin',$3,'test-hash','system_administrator','active') RETURNING id`,
    [`admin-${suffix}`, companyId, `admin-${suffix}@example.test`])).rows[0].id;
    await pool.query(`INSERT INTO operational_rule_versions
      (company_id,daily_report_due,weekly_report_due_weekday,weekly_report_due_time,
       sensor_delayed_after_minutes,sensor_offline_after_minutes,
       attention_to_alert_minutes,production_attention_pct,production_warning_pct,
       effective_from,updated_by)
      VALUES ($1,'18:00',1,'12:00',15,60,10,25,50,now()-interval '1 day',$2)`,
    [companyId, userId]);

    const influx = new InfluxService();
    const thresholds = new AdminThresholdsService({ pool });
    const critical = new CriticalEvaluationService({ pool }, influx, thresholds);
    const ingestion = new SensorIngestionService({ pool }, influx, critical);
    const periodic = new PeriodicAlertService({ pool }, influx, thresholds);
    const base = Math.floor((Date.now() - 22 * 60_000) / 1000) * 1000;
    const event = (name, value, minutes) => ({
      eventId: `${name}-${suffix}`, deviceId: `device-${suffix}`, parameter: 'do', value,
      measuredAt: new Date(base + minutes * 60_000).toISOString(),
    });
    for (const [name, value, minutes] of [
      ['attention-1', 4.8, 0], ['attention-2', 4.7, 5],
      ['attention-3', 4.9, 10], ['recovered-1', 5.4, 15],
      ['warning-1', 4.4, 19],
    ]) await ingestion.ingest(event(name, value, minutes));
    const first = await periodic.runOnce();
    assert.ok(first.points >= 5);
    let alerts = await pool.query(`SELECT id,severity,telemetry_to,episode_no
      FROM alerts WHERE pond_id=$1 ORDER BY occurred_at`, [pondId]);
    assert.deepEqual(alerts.rows.map((row) => row.severity), ['attention', 'warning']);
    assert.ok(alerts.rows[0].telemetry_to);
    assert.equal(alerts.rows[1].telemetry_to, null);
    assert.deepEqual(alerts.rows.map((row) => row.episode_no), ['1', '2']);
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM issues WHERE pond_id=$1',
      [pondId])).rows[0].n, 2);
    await periodic.runOnce();
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM alerts WHERE pond_id=$1',
      [pondId])).rows[0].n, 2);

    await ingestion.ingest(event('critical', 3.4, 20));
    await periodic.runOnce();
    alerts = await pool.query(`SELECT id,severity FROM alerts WHERE pond_id=$1
      ORDER BY occurred_at`, [pondId]);
    assert.equal(alerts.rows.length, 2);
    assert.equal(alerts.rows[1].severity, 'critical');
    assert.equal((await pool.query('SELECT severity FROM issues WHERE source_id=$1',
      [alerts.rows[1].id])).rows[0].severity, 'critical');
    assert.equal((await pool.query(`SELECT count(*)::integer AS n
      FROM alert_notification_outbox WHERE alert_id=$1`, [alerts.rows[1].id])).rows[0].n, 1);

    await ingestion.ingest(event('recovered-2', 5.5, 21));
    await periodic.runOnce();
    const closed = await pool.query('SELECT telemetry_to,state FROM alerts WHERE id=$1',
      [alerts.rows[1].id]);
    assert.ok(closed.rows[0].telemetry_to);
    assert.equal(closed.rows[0].state, 'unacknowledged');
    await ingestion.ingest(event('critical-new', 3.3, 21.5));
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM alerts WHERE pond_id=$1',
      [pondId])).rows[0].n, 3);
    const originalEvaluate = critical.evaluateReceipt.bind(critical);
    critical.evaluateReceipt = async () => { throw new Error('simulated retry'); };
    const pending = event('pending-recovery', 5.6, 21.7);
    await assert.rejects(ingestion.ingest(pending), /simulated retry/);
    critical.evaluateReceipt = originalEvaluate;
    await periodic.runOnce();
    let positions = await pool.query(`SELECT DISTINCT periodic_measured_through
      FROM alert_detection_states WHERE pond_id=$1`, [pondId]);
    assert.equal(positions.rows.length, 1);
    assert.equal(positions.rows[0].periodic_measured_through.toISOString(),
      event('critical-new', 3.3, 21.5).measuredAt);
    const pendingReceipt = await pool.query(
      'SELECT id FROM ingestion_receipts WHERE device_id=$1 AND event_id=$2',
      [deviceId, pending.eventId]);
    await critical.evaluateReceipt(pendingReceipt.rows[0].id);
    await periodic.runOnce();
    positions = await pool.query(`SELECT DISTINCT periodic_measured_through
      FROM alert_detection_states WHERE pond_id=$1`, [pondId]);
    assert.equal(positions.rows[0].periodic_measured_through.toISOString(), pending.measuredAt);
    const checkpoint = await pool.query(
      'SELECT last_success_at,processed_through FROM sensor_sync_checkpoints WHERE scope_key=$1',
      [`periodic:farm:${farmId}`]);
    assert.ok(checkpoint.rows[0].last_success_at);
    assert.ok(checkpoint.rows[0].processed_through);
  } finally {
    if (pondId) {
      await pool.query('UPDATE alert_detection_states SET current_alert_id=NULL WHERE pond_id=$1',
        [pondId]);
      await pool.query(`DELETE FROM alert_notification_outbox WHERE alert_id IN
        (SELECT id FROM alerts WHERE pond_id=$1)`, [pondId]);
      await pool.query('DELETE FROM issues WHERE pond_id=$1', [pondId]);
      await pool.query('DELETE FROM sensor_anomaly_intervals WHERE pond_id=$1', [pondId]);
      await pool.query('DELETE FROM alerts WHERE pond_id=$1', [pondId]);
      await pool.query('DELETE FROM alert_detection_states WHERE pond_id=$1', [pondId]);
    }
    if (deviceId) {
      await pool.query('DELETE FROM ingestion_receipts WHERE device_id=$1', [deviceId]);
      await pool.query('DELETE FROM device_assignments WHERE device_id=$1', [deviceId]);
      await pool.query('DELETE FROM devices WHERE id=$1', [deviceId]);
    }
    if (farmId) await pool.query('DELETE FROM sensor_sync_checkpoints WHERE scope_key=$1',
      [`periodic:farm:${farmId}`]);
    if (companyId) await pool.query('DELETE FROM operational_rule_versions WHERE company_id=$1',
      [companyId]);
    if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    if (pondId) await pool.query('DELETE FROM ponds WHERE id=$1', [pondId]);
    if (farmId) await pool.query('DELETE FROM farms WHERE id=$1', [farmId]);
    if (companyId) await pool.query('DELETE FROM companies WHERE id=$1', [companyId]);
    await pool.end();
    if (priorBucket === undefined) delete process.env.INFLUXDB_BUCKET;
    else process.env.INFLUXDB_BUCKET = priorBucket;
    if (bucketId) {
      const deleted = await fetch(`${influxUrl}/api/v2/buckets/${encodeURIComponent(bucketId)}`,
        { method: 'DELETE', headers });
      assert.equal(deleted.status, 204);
    }
  }
});
