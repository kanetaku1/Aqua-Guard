const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { InfluxService } = require('../dist/infrastructure/influx.service');
const { SensorIngestionService } = require('../dist/infrastructure/sensor-ingestion.service');
const { CriticalEvaluationService } = require('../dist/infrastructure/critical-evaluation.service');
const { AdminThresholdsService } = require('../dist/admin/admin-thresholds.service');

test('sensor storage validates assignment, deduplicates retries and quarantines collisions', async () => {
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
  try {
    const org = process.env.INFLUXDB_ORG ?? 'aquaguard';
    const orgResponse = await fetch(`${influxUrl}/api/v2/orgs?org=${encodeURIComponent(org)}`,
      { headers });
    assert.equal(orgResponse.status, 200);
    const orgId = (await orgResponse.json()).orgs[0].id;
    const bucketName = `aquaguard_ingestion_${randomUUID().replaceAll('-', '')}`;
    const created = await fetch(`${influxUrl}/api/v2/buckets`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: bucketName, orgID: orgId }),
    });
    assert.equal(created.status, 201);
    bucketId = (await created.json()).id;
    process.env.INFLUXDB_BUCKET = bucketName;
    const influx = new InfluxService();
    const critical = new CriticalEvaluationService({ pool }, influx,
      new AdminThresholdsService({ pool }));
    const ingestion = new SensorIngestionService({ pool }, influx, critical);

    companyId = (await pool.query(
      `INSERT INTO companies (public_id, name, status)
       VALUES ($1, 'Ingestion Test', 'active') RETURNING id`, [`company-${suffix}`],
    )).rows[0].id;
    farmId = (await pool.query(
      `INSERT INTO farms (public_id, company_id, name, location, status)
       VALUES ($1, $2, 'Farm', 'East Java', 'active') RETURNING id`,
      [`farm-${suffix}`, companyId],
    )).rows[0].id;
    pondId = (await pool.query(
      `INSERT INTO ponds (public_id, farm_id, name, area_ha)
       VALUES ($1, $2, 'Pond', 0.8) RETURNING id`, [`pond-${suffix}`, farmId],
    )).rows[0].id;
    deviceId = (await pool.query(
      `INSERT INTO devices (device_id, type, parameter)
       VALUES ($1, 'sensor', 'do') RETURNING id`, [`device-${suffix}`],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO device_assignments (device_id, pond_id, assigned_at)
       VALUES ($1, $2, now() - interval '1 day')`, [deviceId, pondId],
    );
    const event = { eventId: `event-${suffix}`, deviceId: `device-${suffix}`,
      parameter: 'do', value: 4.25, measuredAt: new Date(Date.now() - 60000).toISOString() };
    await assert.rejects(ingestion.ingest({ ...event, parameter: 'ph' }),
      (error) => error.getStatus() === 422);
    await assert.rejects(ingestion.ingest({ ...event, deviceId: 'unknown-device' }),
      (error) => error.getStatus() === 422);

    const first = await ingestion.ingest(event);
    assert.equal(first.stored, true);
    assert.equal(first.duplicate, false);
    const receipt = await pool.query(
      `SELECT status, critical_evaluation_status, observation_refs
       FROM ingestion_receipts WHERE id = $1`, [first.receiptId],
    );
    assert.equal(receipt.rows[0].status, 'completed');
    assert.equal(receipt.rows[0].critical_evaluation_status, 'evaluated');
    assert.equal(receipt.rows[0].observation_refs[0].pondId, `pond-${suffix}`);
    const again = await ingestion.ingest(event);
    assert.equal(again.receiptId, first.receiptId);
    assert.equal(again.duplicate, true);
    await assert.rejects(ingestion.ingest({ ...event, value: 4.5 }),
      (error) => error.getStatus() === 409 && error.getResponse().code === 'event_id_conflict');
    await assert.rejects(ingestion.ingest({ ...event, eventId: `collision-${suffix}`, value: 4.5 }),
      (error) => error.getStatus() === 409 && error.getResponse().code === 'observation_conflict');
    const collision = await pool.query(
      'SELECT status FROM ingestion_receipts WHERE device_id = $1 AND event_id = $2',
      [deviceId, `collision-${suffix}`],
    );
    assert.equal(collision.rows[0].status, 'quarantined');

    await pool.query(`UPDATE ingestion_receipts SET status = 'pending', stored_at = NULL
      WHERE id = $1`, [first.receiptId]);
    await pool.query(
      `INSERT INTO ingestion_receipts
         (device_id, event_id, payload_hash, observation_refs, received_at)
       VALUES ($1, $2, $3, $4, now())`,
      [deviceId, `missing-${suffix}`, 'missing-point', JSON.stringify([{
        farmId: `farm-${suffix}`, pondId: `pond-${suffix}`,
        deviceId: `device-${suffix}`, parameter: 'do',
        measuredAt: new Date(Date.now() - 15000).toISOString(),
      }])],
    );
    const recovery = await ingestion.recoverPendingFromStorage();
    assert.equal(recovery.recovered, 1);
    assert.equal(recovery.missing, 1);
    assert.equal(recovery.quarantined, 0);
    const recovered = await ingestion.ingest(event);
    assert.equal(recovered.duplicate, true);
    const points = await influx.client.getQueryApi(influx.org).collectRows(
      `from(bucket: ${JSON.stringify(bucketName)}) |> range(start: -1h)
       |> filter(fn: (r) => r._measurement == "sensor_readings" and r._field == "value")`,
    );
    assert.equal(points.length, 1);
    assert.equal(points[0]._value, 4.25);
    const concurrentEvent = { ...event, eventId: `concurrent-${suffix}`,
      measuredAt: new Date(Date.now() - 30000).toISOString(), value: 4.75 };
    const concurrent = await Promise.all([
      ingestion.ingest(concurrentEvent), ingestion.ingest(concurrentEvent),
    ]);
    assert.equal(concurrent[0].receiptId, concurrent[1].receiptId);
    assert.deepEqual(concurrent.map((result) => result.duplicate).sort(), [false, true]);
  } finally {
    if (deviceId) {
      await pool.query('DELETE FROM alert_detection_states WHERE device_id = $1', [deviceId]);
      await pool.query('DELETE FROM ingestion_receipts WHERE device_id = $1', [deviceId]);
      await pool.query('DELETE FROM device_assignments WHERE device_id = $1', [deviceId]);
      await pool.query('DELETE FROM devices WHERE id = $1', [deviceId]);
    }
    if (pondId) await pool.query('DELETE FROM ponds WHERE id = $1', [pondId]);
    if (farmId) await pool.query('DELETE FROM farms WHERE id = $1', [farmId]);
    if (companyId) await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
    await pool.end();
    if (priorBucket === undefined) delete process.env.INFLUXDB_BUCKET;
    else process.env.INFLUXDB_BUCKET = priorBucket;
    if (bucketId) {
      const removed = await fetch(`${influxUrl}/api/v2/buckets/${bucketId}`, {
        method: 'DELETE', headers,
      });
      assert.equal(removed.status, 204);
    }
  }
});
