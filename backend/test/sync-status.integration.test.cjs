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
  const pondUuids = [];
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
      const pond = (await pool.query(
        `INSERT INTO ponds (public_id, farm_id, name, area_ha, status)
         VALUES ($1, $2, $3, 0.8, 'in_operation') RETURNING id`,
        [`pond-${letter}-${suffix}`, farm, `Pond ${letter.toUpperCase()}`],
      )).rows[0].id;
      pondUuids.push(pond);
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
    const write = async (letter, minutesAgo, value) => influx.writeSensorReadings([{
      farmId: `farm-${letter}-${suffix}`, pondId: `pond-${letter}-${suffix}`,
      deviceId: `sensor-${suffix}`, parameter: 'do', value,
      measuredAt: new Date(Date.now() - minutesAgo * 60 * 1000), receivedAt: new Date(),
      validity: 'valid',
    }]);
    await write('b', 0, 5.2);
    assert.equal((await (await get(fmCookie)).json()).quality, 'live');
    assert.equal((await (await get(tmCookie)).json()).quality, 'no_data');
    await write('a', 70, 4.1);
    assert.equal((await (await get(tmCookie)).json()).quality, 'offline');
    await write('a', 30, 4.4);
    assert.equal((await (await get(tmCookie)).json()).quality, 'delayed');
    await write('a', 0, 5.1);
    assert.equal((await (await get(tmCookie)).json()).quality, 'live');
    const range = new URLSearchParams({ parameter: 'do',
      from: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      to: new Date(Date.now() + 2 * 60 * 1000).toISOString(), interval: '5m' });
    const seriesUrl = `${base}/ponds/pond-a-${suffix}/sensors/series?${range}`;
    const seriesResponse = await fetch(seriesUrl, { headers: { Cookie: tmCookie } });
    assert.equal(seriesResponse.status, 200);
    const series = await seriesResponse.json();
    assert.equal(series.parameter, 'do');
    assert.equal(series.unit, 'mg/L');
    assert.equal(series.interval, '5m');
    assert.equal(series.threshold.warningLow, 4.5);
    assert.ok(series.points.some((point) => point.avg === 4.1));
    assert.ok(series.points.some((point) => point.avg === null));
    assert.ok(!series.points.some((point) => point.avg === 5.2));
    const deniedPond = await fetch(
      `${base}/ponds/pond-b-${suffix}/sensors/series?${range}`,
      { headers: { Cookie: tmCookie } },
    );
    assert.equal(deniedPond.status, 404);
    assert.equal((await fetch(seriesUrl, { headers: { Cookie: saCookie } })).status, 403);
    const badRange = new URLSearchParams(range);
    badRange.set('interval', 'toString');
    assert.equal((await fetch(
      `${base}/ponds/pond-a-${suffix}/sensors/series?${badRange}`,
      { headers: { Cookie: tmCookie } },
    )).status, 422);

    const thresholdUrl = `${base}/admin/settings/thresholds?farmId=farm-a-${suffix}`;
    const thresholdBefore = await fetch(thresholdUrl, { headers: { Cookie: saCookie } });
    assert.equal(thresholdBefore.status, 200);
    const doThreshold = (await thresholdBefore.json()).items[0];
    const thresholdSaved = await fetch(thresholdUrl, {
      method: 'PUT', headers: { Cookie: saCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ ...doThreshold, warningLow: 4, attentionLow: 4.5 }] }),
    });
    assert.equal(thresholdSaved.status, 200);
    const seriesWithOverride = await fetch(seriesUrl, { headers: { Cookie: tmCookie } });
    assert.equal(seriesWithOverride.status, 200);
    assert.equal((await seriesWithOverride.json()).threshold.warningLow, 4);
    const checkpoint = await pool.query(
      'SELECT last_success_at, processed_through FROM sensor_sync_checkpoints WHERE scope_key = $1',
      [`header:user:${userUuids[1]}`],
    );
    assert.ok(checkpoint.rows[0].last_success_at);
    assert.ok(checkpoint.rows[0].processed_through);
  } finally {
    if (app) await app.close();
    if (companyId) {
      await pool.query(`DELETE FROM threshold_values WHERE set_id IN
        (SELECT id FROM threshold_sets WHERE company_id = $1)`, [companyId]);
      await pool.query('DELETE FROM threshold_sets WHERE company_id = $1', [companyId]);
    }
    for (const userId of userUuids) {
      await pool.query('DELETE FROM sensor_sync_checkpoints WHERE scope_key = $1',
        [`header:user:${userId}`]);
      await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM user_farm_assignments WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    if (emails.length) await pool.query('DELETE FROM auth_attempts WHERE email_key = ANY($1)',
      [emails]);
    for (const pondId of pondUuids) await pool.query('DELETE FROM ponds WHERE id = $1', [pondId]);
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
