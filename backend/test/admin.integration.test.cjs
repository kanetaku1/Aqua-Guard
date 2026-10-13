const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { hashPassword } = require('../dist/auth/password');
const { ProblemFilter } = require('../dist/http/problem');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { InfluxService } = require('../dist/infrastructure/influx.service');

test('SA manages company farms and ponds with frontend response fields', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const adminEmail = `admin-${suffix}@example.test`;
  const tmEmail = `tm-${suffix}@example.test`;
  const password = 'SafePassword123';
  let companyUuid;
  let adminUuid;
  let tmUuid;
  let farmUuid;
  let pondUuid;
  let secondPondUuid;
  let deviceUuid;
  let createdDeviceUuid;
  let bucketId;
  const priorBucket = process.env.INFLUXDB_BUCKET;
  const influxUrl = process.env.INFLUXDB_URL
    ?? `http://127.0.0.1:${process.env.INFLUXDB_PORT ?? '8086'}`;
  const influxHeaders = { Authorization: `Token ${process.env.INFLUXDB_ADMIN_TOKEN}` };
  let app;
  try {
    companyUuid = (await pool.query(
      `INSERT INTO companies (public_id, name, status)
       VALUES ($1, 'Admin Test Company', 'active') RETURNING id`, [`company-${suffix}`],
    )).rows[0].id;
    const passwordHash = await hashPassword(password);
    adminUuid = (await pool.query(
      `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status)
       VALUES ($1, $2, 'Yusuf Rahman', $3, $4, 'system_administrator', 'active') RETURNING id`,
      [`admin-${suffix}`, companyUuid, adminEmail, passwordHash],
    )).rows[0].id;
    tmUuid = (await pool.query(
      `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status)
       VALUES ($1, $2, 'Sari Wijaya', $3, $4, 'technical_manager', 'active') RETURNING id`,
      [`tm-${suffix}`, companyUuid, tmEmail, passwordHash],
    )).rows[0].id;

    const orgResponse = await fetch(
      `${influxUrl}/api/v2/orgs?org=${encodeURIComponent(process.env.INFLUXDB_ORG ?? 'aquaguard')}`,
      { headers: influxHeaders },
    );
    assert.equal(orgResponse.status, 200);
    const orgId = (await orgResponse.json()).orgs[0].id;
    const bucketName = `aquaguard_admin_test_${randomUUID().replaceAll('-', '')}`;
    const bucketResponse = await fetch(`${influxUrl}/api/v2/buckets`, {
      method: 'POST',
      headers: { ...influxHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: bucketName, orgID: orgId }),
    });
    assert.equal(bucketResponse.status, 201);
    bucketId = (await bucketResponse.json()).id;
    process.env.INFLUXDB_BUCKET = bucketName;

    app = await NestFactory.create(AppModule, { logger: false });
    app.enableCsrfProtection();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/ready', method: RequestMethod.GET },
      ],
    });
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const created = await fetch(`${base}/admin/farms`, {
      method: 'POST', headers,
      body: JSON.stringify({ name: 'Farm A', location: 'East Java', timeZone: 'Asia/Jakarta' }),
    });
    assert.equal(created.status, 201);
    const farm = await created.json();
    assert.equal(farm.status, 'inactive');
    assert.equal(farm.pondCount, 0);
    assert.equal(farm.devicesTotal, 0);
    assert.deepEqual(farm.technicalManagers, []);
    assert.deepEqual(farm.updatedBy, { id: `admin-${suffix}`, name: 'Yusuf Rahman' });
    assert.ok(Date.parse(farm.updatedAt));
    farmUuid = (await pool.query('SELECT id FROM farms WHERE public_id = $1', [farm.id])).rows[0].id;

    const duplicate = await fetch(`${base}/admin/farms`, {
      method: 'POST', headers,
      body: JSON.stringify({ name: 'farm a', location: 'East Java' }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).code, 'farm_name_taken');

    const createdPond = await fetch(`${base}/admin/farms/${farm.id}/ponds`, {
      method: 'POST', headers,
      body: JSON.stringify({ name: 'Pond 01', areaHa: 0.8 }),
    });
    assert.equal(createdPond.status, 201);
    const pond = await createdPond.json();
    assert.deepEqual(pond, {
      id: pond.id, name: 'Pond 01', areaHa: 0.8,
      status: 'in_operation', sensorCount: 0, actuatorCount: 0,
    });
    pondUuid = (await pool.query('SELECT id FROM ponds WHERE public_id = $1', [pond.id])).rows[0].id;
    const deviceId = `sensor-${suffix}`;
    deviceUuid = (await pool.query(
      `INSERT INTO devices (device_id, type, parameter)
       VALUES ($1, 'sensor', 'do') RETURNING id`, [deviceId],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO device_assignments (device_id, pond_id, assigned_at)
       VALUES ($1, $2, now())`, [deviceUuid, pondUuid],
    );
    const seventyMinutesAgo = new Date(Date.now() - 70 * 60 * 1000);
    await app.get(InfluxService).writeDeviceHeartbeats([{
      farmId: farm.id, pondId: pond.id, deviceId,
      sentAt: seventyMinutesAgo, receivedAt: new Date(), onlineHint: true,
    }]);
    await pool.query(
      'INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at) VALUES ($1, $2, now())',
      [tmUuid, farmUuid],
    );
    const beforeRule = await fetch(`${base}/admin/farms/${farm.id}/devices`, {
      headers: { Cookie: cookie },
    });
    assert.equal(beforeRule.status, 200);
    assert.equal((await beforeRule.json()).items[0].connection, 'offline');
    const defaultsResponse = await fetch(`${base}/admin/settings/rules`, {
      headers: { Cookie: cookie },
    });
    assert.equal(defaultsResponse.status, 200);
    const defaults = await defaultsResponse.json();
    const extendedRule = await fetch(`${base}/admin/settings/rules`, {
      method: 'PUT', headers,
      body: JSON.stringify({ ...defaults, sensorOfflineAfterMinutes: 90 }),
    });
    assert.equal(extendedRule.status, 200);
    const listed = await fetch(`${base}/admin/farms`, { headers: { Cookie: cookie } });
    assert.equal(listed.status, 200);
    const items = (await listed.json()).items;
    assert.equal(items.length, 1);
    assert.equal(items[0].pondCount, 1);
    assert.equal(items[0].devicesTotal, 1);
    assert.equal(items[0].devicesOnline, 1);
    assert.deepEqual(items[0].technicalManagers, [
      { id: `tm-${suffix}`, name: 'Sari Wijaya', status: 'active' },
    ]);

    const changed = await fetch(`${base}/admin/farms/${farm.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ name: 'Farm A', location: 'East Java', status: 'active' }),
    });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).status, 'active');
    const preserve = await fetch(`${base}/admin/farms/${farm.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ name: 'Farm A', location: 'East Java' }),
    });
    assert.equal(preserve.status, 200);
    assert.equal((await preserve.json()).status, 'active');

    const ponds = await fetch(`${base}/admin/farms/${farm.id}/ponds`, { headers: { Cookie: cookie } });
    assert.equal(ponds.status, 200);
    const listedPond = (await ponds.json()).items[0];
    assert.equal(listedPond.id, pond.id);
    assert.equal(listedPond.sensorCount, 1);
    const devicesBefore = await fetch(`${base}/admin/farms/${farm.id}/devices`, {
      headers: { Cookie: cookie },
    });
    assert.equal(devicesBefore.status, 200);
    const before = await devicesBefore.json();
    assert.equal(before.total, 1);
    assert.deepEqual(before.counts, { total: 1, sensors: 1, actuators: 0, offline: 0 });
    assert.equal(before.items[0].deviceId, deviceId);
    assert.equal(before.items[0].connection, 'online');
    assert.ok(Date.parse(before.items[0].lastSeenAt));

    const newDeviceId = `aerator-${suffix}`.toUpperCase();
    const createDevice = () => fetch(`${base}/admin/farms/${farm.id}/devices`, {
      method: 'POST', headers,
      body: JSON.stringify({ deviceId: newDeviceId.toLowerCase(), type: 'aerator',
        pondId: pond.id, spec: 'Paddlewheel 2 HP' }),
    });
    const deviceCreated = await createDevice();
    assert.equal(deviceCreated.status, 201);
    const device = await deviceCreated.json();
    assert.deepEqual(device, {
      deviceId: newDeviceId, type: 'aerator', pondId: pond.id,
      parameter: null, spec: 'Paddlewheel 2 HP',
      pond: { id: pond.id, name: 'Pond 01' }, connection: 'offline', lastSeenAt: null,
    });
    createdDeviceUuid = (await pool.query('SELECT id FROM devices WHERE device_id = $1',
      [newDeviceId])).rows[0].id;
    const deviceDuplicate = await createDevice();
    assert.equal(deviceDuplicate.status, 409);
    assert.equal((await deviceDuplicate.json()).code, 'device_id_taken');

    const deviceList = await fetch(`${base}/admin/farms/${farm.id}/devices?page=1&pageSize=1`, {
      headers: { Cookie: cookie },
    });
    assert.equal(deviceList.status, 200);
    const page = await deviceList.json();
    assert.equal(page.total, 2);
    assert.equal(page.items.length, 1);
    assert.deepEqual(page.counts, { total: 2, sensors: 1, actuators: 1, offline: 0 });
    const offlineList = await fetch(`${base}/admin/farms/${farm.id}/devices?connection=offline`, {
      headers: { Cookie: cookie },
    });
    assert.equal(offlineList.status, 200);
    assert.deepEqual((await offlineList.json()).items.map((d) => d.deviceId), [newDeviceId]);

    const invalidDevice = await fetch(`${base}/admin/devices/${newDeviceId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ type: 'sensor' }),
    });
    assert.equal(invalidDevice.status, 422);
    const deviceUpdated = await fetch(`${base}/admin/devices/${newDeviceId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ type: 'sensor', parameter: 'temperature', spec: null }),
    });
    assert.equal(deviceUpdated.status, 200);
    assert.equal((await deviceUpdated.json()).parameter, 'temperature');
    const configs = await pool.query(
      `SELECT type, parameter, effective_to FROM device_config_versions
       WHERE device_id = $1 ORDER BY effective_from`, [createdDeviceUuid],
    );
    assert.equal(configs.rows.length, 2);
    assert.ok(configs.rows[0].effective_to);
    assert.equal(configs.rows[1].type, 'sensor');
    assert.equal(configs.rows[1].parameter, 'temperature');
    assert.equal(configs.rows[1].effective_to, null);
    const secondPondCreated = await fetch(`${base}/admin/farms/${farm.id}/ponds`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'Pond 02', areaHa: 1.2 }),
    });
    assert.equal(secondPondCreated.status, 201);
    const secondPond = await secondPondCreated.json();
    secondPondUuid = (await pool.query('SELECT id FROM ponds WHERE public_id = $1',
      [secondPond.id])).rows[0].id;
    const reassigned = await fetch(`${base}/admin/devices/${newDeviceId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ pondId: secondPond.id }),
    });
    assert.equal(reassigned.status, 200);
    assert.equal((await reassigned.json()).pondId, secondPond.id);
    const assignments = await pool.query(
      `SELECT pond_id, unassigned_at FROM device_assignments
       WHERE device_id = $1 ORDER BY assigned_at`, [createdDeviceUuid],
    );
    assert.equal(assignments.rows.length, 2);
    assert.ok(assignments.rows[0].unassigned_at);
    assert.equal(assignments.rows[1].pond_id, secondPondUuid);
    assert.equal(assignments.rows[1].unassigned_at, null);
    const tmLogin = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: tmEmail, password }),
    });
    assert.equal(tmLogin.status, 200);
    const tmCookie = tmLogin.headers.get('set-cookie').split(';')[0];
    const forbidden = await fetch(`${base}/admin/farms`, { headers: { Cookie: tmCookie } });
    assert.equal(forbidden.status, 403);
    const deviceForbidden = await fetch(`${base}/admin/farms/${farm.id}/devices`, {
      headers: { Cookie: tmCookie },
    });
    assert.equal(deviceForbidden.status, 403);
    const absent = await fetch(`${base}/admin/farms/nonexistent`, { headers: { Cookie: cookie } });
    assert.equal(absent.status, 404);
  } finally {
    if (app) await app.close();
    if (deviceUuid) {
      await pool.query('DELETE FROM device_assignments WHERE device_id = $1', [deviceUuid]);
      await pool.query('DELETE FROM devices WHERE id = $1', [deviceUuid]);
    }
    if (createdDeviceUuid) {
      await pool.query('DELETE FROM device_config_versions WHERE device_id = $1', [createdDeviceUuid]);
      await pool.query('DELETE FROM device_assignments WHERE device_id = $1', [createdDeviceUuid]);
      await pool.query('DELETE FROM devices WHERE id = $1', [createdDeviceUuid]);
    }
    if (pondUuid) await pool.query('DELETE FROM ponds WHERE id = $1', [pondUuid]);
    if (secondPondUuid) await pool.query('DELETE FROM ponds WHERE id = $1', [secondPondUuid]);
    if (tmUuid) await pool.query('DELETE FROM user_farm_assignments WHERE user_id = $1', [tmUuid]);
    if (companyUuid) await pool.query('DELETE FROM operational_rule_versions WHERE company_id = $1', [companyUuid]);
    if (farmUuid) await pool.query('DELETE FROM farms WHERE id = $1', [farmUuid]);
    for (const userUuid of [adminUuid, tmUuid]) {
      if (userUuid) {
        await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [userUuid]);
        await pool.query('DELETE FROM users WHERE id = $1', [userUuid]);
      }
    }
    await pool.query('DELETE FROM auth_attempts WHERE email_key = ANY($1)', [[adminEmail, tmEmail]]);
    if (companyUuid) await pool.query('DELETE FROM companies WHERE id = $1', [companyUuid]);
    await pool.end();
    if (priorBucket === undefined) delete process.env.INFLUXDB_BUCKET;
    else process.env.INFLUXDB_BUCKET = priorBucket;
    if (bucketId) {
      const removed = await fetch(`${influxUrl}/api/v2/buckets/${bucketId}`, {
        method: 'DELETE', headers: influxHeaders,
      });
      assert.equal(removed.status, 204);
    }
  }
});
