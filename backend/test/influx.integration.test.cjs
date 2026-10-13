const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { InfluxService } = require('../dist/infrastructure/influx.service');

test('three telemetry series remain queryable across a seven-day window', async () => {
  const url = process.env.INFLUXDB_URL
    ?? `http://127.0.0.1:${process.env.INFLUXDB_PORT ?? '8086'}`;
  const org = process.env.INFLUXDB_ORG ?? 'aquaguard';
  const token = process.env.INFLUXDB_ADMIN_TOKEN;
  assert.ok(token, 'INFLUXDB_ADMIN_TOKEN is required');
  const headers = { Authorization: `Token ${token}` };
  const orgResponse = await fetch(`${url}/api/v2/orgs?org=${encodeURIComponent(org)}`, { headers });
  assert.equal(orgResponse.status, 200);
  const organizations = await orgResponse.json();
  const orgId = organizations.orgs?.find((item) => item.name === org)?.id;
  assert.ok(orgId, `InfluxDB organization ${org} was not found`);

  const bucketName = `aquaguard_test_${randomUUID().replaceAll('-', '')}`;
  const created = await fetch(`${url}/api/v2/buckets`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: bucketName, orgID: orgId }),
  });
  assert.equal(created.status, 201);
  const bucket = await created.json();
  assert.equal(bucket.name, bucketName);
  assert.ok(bucket.id);

  const priorBucket = process.env.INFLUXDB_BUCKET;
  try {
    process.env.INFLUXDB_BUCKET = bucketName;
    const influx = new InfluxService();
    await influx.checkConnection();
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const common = {
      farmId: 'test-farm', pondId: 'test-pond', deviceId: 'test-device',
      receivedAt: sixDaysAgo,
    };

    await influx.writeSensorReadings([{
      ...common, parameter: 'do', value: 4.25,
      measuredAt: sixDaysAgo, validity: 'valid', eventId: 'test-event',
    }]);
    await influx.writeDeviceHeartbeats([{
      ...common, sentAt: sixDaysAgo, onlineHint: true,
    }]);
    await influx.writeActuatorFeedback([{
      ...common, occurredAt: sixDaysAgo, state: 'on', commandId: 'test-command',
    }]);

    const rows = await influx.client.getQueryApi(influx.org).collectRows(
      `from(bucket: ${JSON.stringify(bucketName)}) |> range(start: -7d)`,
    );
    const measurements = new Set(rows.map((row) => row._measurement));
    assert.deepEqual(measurements, new Set([
      'sensor_readings', 'device_heartbeats', 'actuator_feedback',
    ]));
    const sensorValue = rows.find((row) =>
      row._measurement === 'sensor_readings' && row._field === 'value');
    assert.equal(sensorValue?._value, 4.25);
  } finally {
    if (priorBucket === undefined) delete process.env.INFLUXDB_BUCKET;
    else process.env.INFLUXDB_BUCKET = priorBucket;
    const deleted = await fetch(`${url}/api/v2/buckets/${encodeURIComponent(bucket.id)}`, {
      method: 'DELETE', headers,
    });
    assert.equal(deleted.status, 204);
  }
});
