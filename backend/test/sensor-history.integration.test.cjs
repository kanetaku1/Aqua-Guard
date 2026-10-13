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

test('history reads stored values, groups five-minute rows and enforces pond scope', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const influxUrl = process.env.INFLUXDB_URL
    ?? `http://127.0.0.1:${process.env.INFLUXDB_PORT ?? '8086'}`;
  const headers = { Authorization: `Token ${process.env.INFLUXDB_ADMIN_TOKEN}` };
  const priorBucket = process.env.INFLUXDB_BUCKET;
  let bucketId;
  let companyId;
  let userId;
  let managerId;
  let farmId;
  const pondIds = [];
  let app;
  try {
    const org = process.env.INFLUXDB_ORG ?? 'aquaguard';
    const orgResponse = await fetch(`${influxUrl}/api/v2/orgs?org=${encodeURIComponent(org)}`,
      { headers });
    assert.equal(orgResponse.status, 200);
    const orgId = (await orgResponse.json()).orgs[0].id;
    const created = await fetch(`${influxUrl}/api/v2/buckets`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `aquaguard_history_${randomUUID().replaceAll('-', '')}`,
        orgID: orgId }),
    });
    assert.equal(created.status, 201);
    const bucket = await created.json();
    bucketId = bucket.id;
    process.env.INFLUXDB_BUCKET = bucket.name;

    companyId = (await pool.query(`INSERT INTO companies (public_id, name, status)
      VALUES ($1, 'History Test', 'active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    farmId = (await pool.query(`INSERT INTO farms (public_id, company_id, name, location, status)
      VALUES ($1, $2, 'Farm', 'East Java', 'active') RETURNING id`,
    [`farm-${suffix}`, companyId])).rows[0].id;
    for (const letter of ['a', 'b']) pondIds.push((await pool.query(
      `INSERT INTO ponds (public_id, farm_id, name, area_ha)
       VALUES ($1, $2, $3, 0.8) RETURNING id`,
      [`pond-${letter}-${suffix}`, farmId, `Pond ${letter}`],
    )).rows[0].id);
    const email = `technical_manager-${suffix}@example.test`;
    userId = (await pool.query(
      `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status)
       VALUES ($1, $2, 'TM', $3, $4, 'technical_manager', 'active') RETURNING id`,
      [`technical_manager-${suffix}`, companyId, email, await hashPassword('SafePassword123')],
    )).rows[0].id;
    await pool.query(`INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at)
      VALUES ($1, $2, now())`, [userId, farmId]);
    const managerEmail = `farms_manager-${suffix}@example.test`;
    managerId = (await pool.query(
      `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status)
       VALUES ($1, $2, 'FM', $3, $4, 'farms_manager', 'active') RETURNING id`,
      [`farms_manager-${suffix}`, companyId, managerEmail,
        await hashPassword('SafePassword123')],
    )).rows[0].id;
    const influx = new InfluxService();
    const now = Math.floor((Date.now() - 600000) / 300000) * 300000;
    const at = (offset) => new Date(now + offset).toISOString();
    const reading = (parameter, value, offset, validity = 'valid', pond = 'a') => ({
      farmId: `farm-${suffix}`, pondId: `pond-${pond}-${suffix}`,
      deviceId: `device-${parameter}-${suffix}`, parameter, value,
      measuredAt: new Date(now + offset), receivedAt: new Date(now + offset + 1000),
      validity,
    });
    await influx.writeSensorReadings([
      reading('do', 4.49, 60000), reading('do', 5.1, 120000),
      reading('ph', 7.5, 90000), reading('do', 3.4, 300000),
      reading('ph', 6, 300000, 'invalid'), reading('do', 1, 300000, 'valid', 'b'),
    ]);
    app = await NestFactory.create(AppModule, { logger: false });
    app.enableCsrfProtection();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ] });
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'SafePassword123' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const managerLogin = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: managerEmail, password: 'SafePassword123' }),
    });
    assert.equal(managerLogin.status, 200);
    const managerCookie = managerLogin.headers.get('set-cookie').split(';')[0];
    const url = `${base}/ponds/pond-a-${suffix}/sensors/history`;
    const get = (path) => fetch(path, { headers: { Cookie: cookie } });
    const range = `from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(600000))}`;
    for (const suffixPath of ['history', 'current', 'series']) {
      const forbidden = await fetch(`${base}/ponds/pond-a-${suffix}/sensors/${suffixPath}?${range}`,
        { headers: { Cookie: managerCookie } });
      assert.equal(forbidden.status, 403);
    }
    const first = await get(`${url}?${range}&page=1&pageSize=1`);
    assert.equal(first.status, 200);
    const page1 = await first.json();
    assert.equal(page1.total, 2);
    assert.equal(page1.pageSize, 1);
    assert.equal(page1.items[0].measuredAt, at(300000));
    assert.equal(page1.items[0].values.do.value, 3.4);
    assert.equal(page1.items[0].values.do.severity, 'critical');
    assert.equal(page1.items[0].values.ph.value, null);
    const second = await get(`${url}?${range}&page=2&pageSize=1`);
    assert.equal(second.status, 200);
    const page2 = await second.json();
    assert.equal(page2.items[0].measuredAt, at(0));
    assert.equal(page2.items[0].values.do.value, 5.1);
    assert.equal(page2.items[0].values.do.severity, 'normal');
    assert.equal(page2.items[0].values.ph.value, 7.5);
    assert.equal((await get(`${url}?from=bad&to=${encodeURIComponent(at(600000))}`)).status, 422);
    assert.equal((await get(`${url}?${range}&pageSize=0`)).status, 422);
    assert.equal((await get(`${base}/ponds/unknown-${suffix}/sensors/history?${range}`)).status, 404);
  } finally {
    if (app) await app.close();
    if (userId) {
      await pool.query('DELETE FROM auth_sessions WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM user_farm_assignments WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    }
    if (managerId) {
      await pool.query('DELETE FROM auth_sessions WHERE user_id=$1', [managerId]);
      await pool.query('DELETE FROM users WHERE id=$1', [managerId]);
    }
    if (companyId) await pool.query('DELETE FROM auth_attempts WHERE email_key=ANY($1)',
      [[`technical_manager-${suffix}@example.test`, `farms_manager-${suffix}@example.test`]]);
    for (const pondId of pondIds) await pool.query('DELETE FROM ponds WHERE id=$1', [pondId]);
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
