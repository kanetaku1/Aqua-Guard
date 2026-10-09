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
  let deviceUuid;
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
    await app.get(InfluxService).writeDeviceHeartbeats([{
      farmId: farm.id, pondId: pond.id, deviceId,
      sentAt: new Date(), receivedAt: new Date(), onlineHint: true,
    }]);
    await pool.query(
      'INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at) VALUES ($1, $2, now())',
      [tmUuid, farmUuid],
    );
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
    const tmLogin = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: tmEmail, password }),
    });
    assert.equal(tmLogin.status, 200);
    const tmCookie = tmLogin.headers.get('set-cookie').split(';')[0];
    const forbidden = await fetch(`${base}/admin/farms`, { headers: { Cookie: tmCookie } });
    assert.equal(forbidden.status, 403);
    const absent = await fetch(`${base}/admin/farms/nonexistent`, { headers: { Cookie: cookie } });
    assert.equal(absent.status, 404);
  } finally {
    if (app) await app.close();
    if (deviceUuid) {
      await pool.query('DELETE FROM device_assignments WHERE device_id = $1', [deviceUuid]);
      await pool.query('DELETE FROM devices WHERE id = $1', [deviceUuid]);
    }
    if (pondUuid) await pool.query('DELETE FROM ponds WHERE id = $1', [pondUuid]);
    if (tmUuid) await pool.query('DELETE FROM user_farm_assignments WHERE user_id = $1', [tmUuid]);
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
