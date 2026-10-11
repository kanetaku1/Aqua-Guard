const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { InfluxService } = require('../dist/infrastructure/influx.service');
const { SensorIngestionService } = require('../dist/infrastructure/sensor-ingestion.service');
const { CriticalEvaluationService } = require('../dist/infrastructure/critical-evaluation.service');
const { AdminThresholdsService } = require('../dist/admin/admin-thresholds.service');

test('critical evaluation creates one episode, deduplicates retries and recovers pending receipts', async () => {
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
  let adminId;
  let farmThresholdSetId;
  try {
    const org = process.env.INFLUXDB_ORG ?? 'aquaguard';
    const orgResponse = await fetch(`${influxUrl}/api/v2/orgs?org=${encodeURIComponent(org)}`,
      { headers });
    assert.equal(orgResponse.status, 200);
    const orgId = (await orgResponse.json()).orgs[0].id;
    const created = await fetch(`${influxUrl}/api/v2/buckets`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `aquaguard_critical_${randomUUID().replaceAll('-', '')}`,
        orgID: orgId }),
    });
    assert.equal(created.status, 201);
    const bucket = await created.json();
    bucketId = bucket.id;
    process.env.INFLUXDB_BUCKET = bucket.name;

    companyId = (await pool.query(`INSERT INTO companies (public_id, name, status)
      VALUES ($1, 'Critical Test', 'active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    farmId = (await pool.query(`INSERT INTO farms (public_id, company_id, name, location, status)
      VALUES ($1,$2,'Farm','East Java','active') RETURNING id`,
    [`farm-${suffix}`, companyId])).rows[0].id;
    pondId = (await pool.query(`INSERT INTO ponds (public_id, farm_id, name, area_ha)
      VALUES ($1,$2,'Pond',0.8) RETURNING id`, [`pond-${suffix}`, farmId])).rows[0].id;
    deviceId = (await pool.query(`INSERT INTO devices (device_id, type, parameter)
      VALUES ($1,'sensor','do') RETURNING id`, [`device-${suffix}`])).rows[0].id;
    await pool.query(`INSERT INTO device_assignments (device_id, pond_id, assigned_at)
      VALUES ($1,$2,now()-interval '1 day')`, [deviceId, pondId]);

    adminId = (await pool.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'Admin',$3,'test-hash','system_administrator','active') RETURNING id`,
    [`admin-${suffix}`, companyId, `admin-${suffix}@example.test`])).rows[0].id;
    const defaultSetId = (await pool.query(`INSERT INTO threshold_sets
      (company_id,effective_from,updated_by)
      VALUES ($1,now()-interval '1 day',$2) RETURNING id`,
    [companyId, adminId])).rows[0].id;
    farmThresholdSetId = (await pool.query(`INSERT INTO threshold_sets
      (company_id,farm_id,effective_from,updated_by)
      VALUES ($1,$2,now()-interval '1 day',$3) RETURNING id`,
    [companyId, farmId, adminId])).rows[0].id;
    for (const [setId, criticalLow] of [[defaultSetId, 4.0], [farmThresholdSetId, 3.5]]) {
      await pool.query(`INSERT INTO threshold_values
        (set_id,parameter,unit,critical_low,warning_low,attention_low)
        VALUES ($1,'do','mg/L',$2,4.5,5)`, [setId, criticalLow]);
    }

    const influx = new InfluxService();
    const critical = new CriticalEvaluationService({ pool }, influx,
      new AdminThresholdsService({ pool }));
    const ingestion = new SensorIngestionService({ pool }, influx, critical);
    const baseline = Math.floor((Date.now() - 240000) / 1000) * 1000;
    const event = (name, value, offset) => ({
      eventId: `${name}-${suffix}`, deviceId: `device-${suffix}`, parameter: 'do',
      value, measuredAt: new Date(baseline + offset).toISOString(),
    });
    const boundary = event('boundary', 3.5, 0);
    const savedBoundary = await ingestion.ingest(boundary);
    assert.equal(savedBoundary.stored, true);
    assert.equal((await pool.query('SELECT count(*)::integer AS count FROM alerts WHERE pond_id=$1',
      [pondId])).rows[0].count, 0);
    const first = event('first', 3.4, 60000);
    const originalEvaluate = critical.evaluateReceipt.bind(critical);
    critical.evaluateReceipt = async () => { throw new Error('simulated evaluation outage'); };
    await assert.rejects(ingestion.ingest(first), /simulated evaluation outage/);
    critical.evaluateReceipt = originalEvaluate;
    const interrupted = await pool.query(
      `SELECT status, critical_evaluation_status FROM ingestion_receipts
       WHERE device_id=$1 AND event_id=$2`, [deviceId, first.eventId],
    );
    assert.equal(interrupted.rows[0].status, 'stored');
    assert.equal(interrupted.rows[0].critical_evaluation_status, 'pending');
    const recovery = await critical.recoverUnevaluated();
    assert.equal(recovery.evaluated, 1);
    const receipt = await pool.query(
      `SELECT status, critical_evaluation_status, evaluation_metadata
       FROM ingestion_receipts WHERE device_id=$1 AND event_id=$2`,
      [deviceId, first.eventId],
    );
    assert.equal(receipt.rows[0].status, 'completed');
    assert.equal(receipt.rows[0].critical_evaluation_status, 'evaluated');
    assert.equal(receipt.rows[0].evaluation_metadata.outcome, 'critical');
    assert.equal((await pool.query(
      `SELECT critical_policy_version_id FROM ingestion_receipts
       WHERE device_id=$1 AND event_id=$2`, [deviceId, first.eventId],
    )).rows[0].critical_policy_version_id, farmThresholdSetId);
    assert.equal((await ingestion.ingest(first)).duplicate, true);
    const second = event('second', 3.1, 120000);
    await ingestion.ingest(second);
    const alerts = await pool.query(
      `SELECT id, public_id, severity, observed_value, episode_no
       FROM alerts WHERE pond_id=$1`, [pondId],
    );
    assert.equal(alerts.rows.length, 1);
    assert.equal(alerts.rows[0].severity, 'critical');
    assert.equal(alerts.rows[0].episode_no, '1');
    assert.equal(Number(alerts.rows[0].observed_value), 3.4);
    const intervals = await pool.query(
      `SELECT kind, severity, extreme_value, alert_id
       FROM sensor_anomaly_intervals WHERE pond_id=$1`, [pondId],
    );
    assert.equal(intervals.rows.length, 1);
    assert.equal(intervals.rows[0].kind, 'below_threshold');
    assert.equal(Number(intervals.rows[0].extreme_value), 3.1);
    assert.equal(intervals.rows[0].alert_id, alerts.rows[0].id);
    const outbox = await pool.query(
      `SELECT status FROM alert_notification_outbox WHERE alert_id=$1`, [alerts.rows[0].id],
    );
    assert.equal(outbox.rows.length, 1);
    assert.equal(outbox.rows[0].status, 'pending');
    const old = event('old', 3, -60000);
    await ingestion.ingest(old);
    const oldReceipt = await pool.query(
      `SELECT critical_evaluation_status, evaluation_metadata
       FROM ingestion_receipts WHERE device_id=$1 AND event_id=$2`,
      [deviceId, old.eventId],
    );
    assert.equal(oldReceipt.rows[0].critical_evaluation_status, 'skipped');
    assert.equal(oldReceipt.rows[0].evaluation_metadata.reason, 'out_of_order');
    const stale = event('stale', 2.5, -2 * 3600000);
    await ingestion.ingest(stale);
    const staleReceipt = await pool.query(
      `SELECT critical_evaluation_status, evaluation_metadata
       FROM ingestion_receipts WHERE device_id=$1 AND event_id=$2`,
      [deviceId, stale.eventId],
    );
    assert.equal(staleReceipt.rows[0].critical_evaluation_status, 'skipped');
    assert.equal(staleReceipt.rows[0].evaluation_metadata.reason, 'stale_input');
    await pool.query(`UPDATE alerts SET state='resolved', resolved_at=now() WHERE id=$1`,
      [alerts.rows[0].id]);
    const afterResolve = event('after-resolve', 3.2, 180000);
    await ingestion.ingest(afterResolve);
    const episodes = await pool.query(
      `SELECT episode_no FROM alerts WHERE pond_id=$1 ORDER BY episode_no`, [pondId],
    );
    assert.deepEqual(episodes.rows.map((row) => row.episode_no), ['1', '2']);
    assert.equal((await pool.query(
      `SELECT count(*)::integer AS count FROM alert_notification_outbox WHERE alert_id IN
       (SELECT id FROM alerts WHERE pond_id=$1)`, [pondId],
    )).rows[0].count, 2);
  } finally {
    if (pondId) {
      await pool.query(`UPDATE alert_detection_states SET current_alert_id=NULL
        WHERE pond_id=$1`, [pondId]);
      await pool.query(`DELETE FROM alert_notification_outbox WHERE alert_id IN
        (SELECT id FROM alerts WHERE pond_id=$1)`, [pondId]);
      await pool.query('DELETE FROM sensor_anomaly_intervals WHERE pond_id=$1', [pondId]);
      await pool.query('DELETE FROM alerts WHERE pond_id=$1', [pondId]);
      await pool.query('DELETE FROM alert_detection_states WHERE pond_id=$1', [pondId]);
    }
    if (deviceId) {
      await pool.query('DELETE FROM ingestion_receipts WHERE device_id=$1', [deviceId]);
      await pool.query('DELETE FROM device_assignments WHERE device_id=$1', [deviceId]);
      await pool.query('DELETE FROM devices WHERE id=$1', [deviceId]);
    }
    if (companyId) {
      await pool.query(`DELETE FROM threshold_values WHERE set_id IN
        (SELECT id FROM threshold_sets WHERE company_id=$1)`, [companyId]);
      await pool.query('DELETE FROM threshold_sets WHERE company_id=$1', [companyId]);
    }
    if (adminId) await pool.query('DELETE FROM users WHERE id=$1', [adminId]);
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
