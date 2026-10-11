const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { hashPassword } = require('../dist/auth/password');
const { ProblemFilter } = require('../dist/http/problem');
const { InfluxService } = require('../dist/infrastructure/influx.service');
const { createPostgresPool } = require('../dist/infrastructure/postgres');

test('sync status uses FM/TM scope and reports no data, offline, delayed and live', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const password = 'SafePassword123';
  const influxUrl = process.env.INFLUXDB_URL
    ?? `http://127.0.0.1:${process.env.INFLUXDB_PORT ?? '8086'}`;
  const influxHeaders = { Authorization: `Token ${process.env.INFLUXDB_ADMIN_TOKEN}` };
  const priorBucket = process.env.INFLUXDB_BUCKET;
  let bucketId;
  let companyId;
  const farmUuids = [];
  const userUuids = [];
  const emails = [];
  let app;
  try {
    const orgResponse = await fetch(
      `${influxUrl}/api/v2/orgs?org=${encodeURIComponent(process.env.INFLUXDB_ORG ?? 'aquaguard')}`,
      { headers: influxHeaders },
    );
    assert.equal(orgResponse.status, 200);
    const orgId = (await orgResponse.json()).orgs[0].id;
    const bucketName = `aquaguard_sync_test_${randomUUID().replaceAll('-', '')}`;
    const bucketResponse = await fetch(`${influxUrl}/api/v2/buckets`, {
      method: 'POST',
      headers: { ...influxHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: bucketName, orgID: orgId }),
    });
    assert.equal(bucketResponse.status, 201);
    bucketId = (await bucketResponse.json()).id;
    process.env.INFLUXDB_BUCKET = bucketName;

    companyId = (await pool.query(
      `INSERT INTO companies (public_id, name, status)
       VALUES ($1, 'Sync Test', 'active') RETURNING id`, [`company-${suffix}`],
    )).rows[0].id;
    for (const letter of ['a', 'b']) {
      const farm = (await pool.query(
        `INSERT INTO farms (public_id, company_id, name, location, status)
         VALUES ($1, $2, $3, 'East Java', 'active') RETURNING id`,
        [`farm-${letter}-${suffix}`, companyId, `Farm ${letter.toUpperCase()}`],
      )).rows[0].id;
      farmUuids.push(farm);
    }
    const hash = await hashPassword(password);
    for (const role of ['farms_manager', 'technical_manager', 'system_administrator']) {
      const email = `${role}-${suffix}@example.test`;
      emails.push(email);
      const user = (await pool.query(
        `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`,
        [`${role}-${suffix}`, companyId, role, email, hash, role],
      )).rows[0].id;
      userUuids.push(user);
      if (role === 'technical_manager') await pool.query(
        `INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at)
         VALUES ($1, $2, now())`, [user, farmUuids[0]],
      );
    }

    app = await NestFactory.create(AppModule, { logger: false });
    app.enableCsrfProtection();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ] });
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
    const cookieFor = async (index) => {
      const login = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emails[index], password }),
      });
      assert.equal(login.status, 200);
      return login.headers.get('set-cookie').split(';')[0];
    };
    const fmCookie = await cookieFor(0);
    const tmCookie = await cookieFor(1);
    const saCookie = await cookieFor(2);
    const get = (cookie) => fetch(`${base}/sync-status`, { headers: { Cookie: cookie } });
    assert.equal((await get(saCookie)).status, 403);
    const empty = await get(tmCookie);
    assert.equal(empty.status, 200);
    const noData = await empty.json();
    assert.equal(noData.quality, 'no_data');
    assert.ok(Date.parse(noData.syncedAt));
    assert.ok(Date.parse(noData.nextSyncAt));

    const influx = app.get(InfluxService);
    const write = async (farmId, minutesAgo, value) => influx.writeSensorReadings([{
      farmId, pondId: `pond-${suffix}`, deviceId: `sensor-${suffix}`, parameter: 'do', value,
      measuredAt: new Date(Date.now() - minutesAgo * 60 * 1000), receivedAt: new Date(),
      validity: 'valid',
    }]);
    await write(`farm-b-${suffix}`, 0, 5.2);
    assert.equal((await (await get(fmCookie)).json()).quality, 'live');
    assert.equal((await (await get(tmCookie)).json()).quality, 'no_data');
    await write(`farm-a-${suffix}`, 70, 4.1);
    assert.equal((await (await get(tmCookie)).json()).quality, 'offline');
    await write(`farm-a-${suffix}`, 30, 4.4);
    assert.equal((await (await get(tmCookie)).json()).quality, 'delayed');
    await write(`farm-a-${suffix}`, 0, 5.1);
    assert.equal((await (await get(tmCookie)).json()).quality, 'live');
    const checkpoint = await pool.query(
      'SELECT last_success_at, processed_through FROM sensor_sync_checkpoints WHERE scope_key = $1',
      [`header:user:${userUuids[1]}`],
    );
    assert.ok(checkpoint.rows[0].last_success_at);
    assert.ok(checkpoint.rows[0].processed_through);
  } finally {
    if (app) await app.close();
    for (const userId of userUuids) {
      await pool.query('DELETE FROM sensor_sync_checkpoints WHERE scope_key = $1',
        [`header:user:${userId}`]);
      await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM user_farm_assignments WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    if (emails.length) await pool.query('DELETE FROM auth_attempts WHERE email_key = ANY($1)',
      [emails]);
    for (const farmId of farmUuids) await pool.query('DELETE FROM farms WHERE id = $1', [farmId]);
    if (companyId) await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
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
