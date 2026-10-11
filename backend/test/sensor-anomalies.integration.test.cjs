const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { hashPassword } = require('../dist/auth/password');
const { ProblemFilter } = require('../dist/http/problem');
const { createPostgresPool } = require('../dist/infrastructure/postgres');

test('anomaly API projects stored intervals, alert links and TM farm scope', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const farmIds = [];
  const pondIds = [];
  const userIds = [];
  const emails = [];
  let companyId;
  let app;
  try {
    companyId = (await pool.query(`INSERT INTO companies (public_id, name, status)
      VALUES ($1, 'Anomalies Test', 'active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    for (const letter of ['a', 'b']) {
      const farmId = (await pool.query(`INSERT INTO farms
        (public_id, company_id, name, location, status)
        VALUES ($1,$2,$3,'East Java','active') RETURNING id`,
      [`farm-${letter}-${suffix}`, companyId, `Farm ${letter}`])).rows[0].id;
      farmIds.push(farmId);
      pondIds.push((await pool.query(`INSERT INTO ponds (public_id,farm_id,name,area_ha)
        VALUES ($1,$2,$3,0.8) RETURNING id`,
      [`pond-${letter}-${suffix}`, farmId, `Pond ${letter}`])).rows[0].id);
    }
    const hash = await hashPassword('SafePassword123');
    for (const role of ['technical_manager', 'farms_manager']) {
      const email = `${role}-${suffix}@example.test`;
      emails.push(email);
      const userId = (await pool.query(`INSERT INTO users
        (public_id,company_id,name,email,password_hash,role,status)
        VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING id`,
      [`${role}-${suffix}`, companyId, role, email, hash, role])).rows[0].id;
      userIds.push(userId);
      if (role === 'technical_manager') await pool.query(
        `INSERT INTO user_farm_assignments (user_id,farm_id,assigned_at)
         VALUES ($1,$2,now())`, [userId, farmIds[0]],
      );
    }
    const now = Date.now();
    const at = (hours) => new Date(now + hours * 3600000).toISOString();
    const alertId = `ALT-${suffix}`;
    const alertUuid = (await pool.query(`INSERT INTO alerts
      (public_id, pond_id, parameter, severity, observed_value,
       threshold_value, unit, direction, occurred_at)
      VALUES ($1,$2,'do','warning',4.1,4.5,'mg/L','below',$3) RETURNING id`,
    [alertId, pondIds[0], at(-2)])).rows[0].id;
    await pool.query(`INSERT INTO sensor_anomaly_intervals
      (pond_id, parameter, kind, severity, unit, started_at,
       extreme_value, alert_id)
      VALUES ($1,'do','below_threshold','warning','mg/L',$2,4.1,$3)`,
    [pondIds[0], at(-2), alertUuid]);
    await pool.query(`INSERT INTO sensor_anomaly_intervals
      (pond_id, parameter, kind, severity, unit, started_at, ended_at,
       change_24h, compared_with, within_range)
      VALUES ($1,'temperature','increasing','attention','°C',$2,$3,0.6,
        '2026-09-27',true)`, [pondIds[0], at(-5), at(-3)]);
    await pool.query(`INSERT INTO sensor_anomaly_intervals
      (pond_id, parameter, kind, severity, unit, started_at, ended_at,
       extreme_value)
      VALUES ($1,'ph','above_threshold','warning','',$2,$3,9.2)`,
    [pondIds[0], at(-48), at(-36)]);
    await pool.query(`INSERT INTO sensor_anomaly_intervals
      (pond_id, parameter, kind, severity, unit, started_at, extreme_value)
      VALUES ($1,'do','below_threshold','critical','mg/L',$2,3.1)`,
    [pondIds[1], at(-1)]);

    app = await NestFactory.create(AppModule, { logger: false });
    app.enableCsrfProtection();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ] });
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
    const login = async (index) => {
      const response = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emails[index], password: 'SafePassword123' }),
      });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const tm = await login(0);
    const fm = await login(1);
    const url = `${base}/ponds/pond-a-${suffix}/sensors/anomalies`;
    const get = (path, cookie) => fetch(path, { headers: { Cookie: cookie } });
    assert.equal((await get(url, fm)).status, 403);
    assert.equal((await get(`${base}/ponds/pond-b-${suffix}/sensors/anomalies`, tm)).status, 404);
    assert.equal((await get(`${url}?from=bad`, tm)).status, 422);
    const from = encodeURIComponent(at(-6));
    const to = encodeURIComponent(at(1));
    const response = await get(`${url}?from=${from}&to=${to}`, tm);
    assert.equal(response.status, 200);
    const { items } = await response.json();
    assert.equal(items.length, 2);
    assert.equal(items[0].kind, 'below_threshold');
    assert.equal(items[0].parameter, 'do');
    assert.equal(items[0].alertId, alertId);
    assert.equal(items[0].extremeValue, 4.1);
    assert.equal(items[0].endedAt, null);
    assert.equal(items[0].change24h, null);
    assert.equal(items[1].kind, 'increasing');
    assert.equal(items[1].extremeValue, null);
    assert.equal(items[1].change24h, 0.6);
    assert.equal(items[1].comparedWith, '2026-09-27');
    assert.equal(items[1].withinRange, true);
    const past = await get(`${url}?from=${encodeURIComponent(at(-40))}&to=${encodeURIComponent(at(-35))}`, tm);
    assert.equal((await past.json()).items[0].kind, 'above_threshold');
  } finally {
    if (app) await app.close();
    if (pondIds.length) {
      await pool.query('DELETE FROM sensor_anomaly_intervals WHERE pond_id=ANY($1)', [pondIds]);
      await pool.query('DELETE FROM alerts WHERE pond_id=ANY($1)', [pondIds]);
    }
    for (const userId of userIds) {
      await pool.query('DELETE FROM auth_sessions WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM user_farm_assignments WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    }
    if (emails.length) await pool.query('DELETE FROM auth_attempts WHERE email_key=ANY($1)', [emails]);
    for (const pondId of pondIds) await pool.query('DELETE FROM ponds WHERE id=$1', [pondId]);
    for (const farmId of farmIds) await pool.query('DELETE FROM farms WHERE id=$1', [farmId]);
    if (companyId) await pool.query('DELETE FROM companies WHERE id=$1', [companyId]);
    await pool.end();
  }
});
