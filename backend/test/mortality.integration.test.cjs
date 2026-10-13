const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { hashPassword } = require('../dist/auth/password');
const { ProblemFilter } = require('../dist/http/problem');
const { createPostgresPool } = require('../dist/infrastructure/postgres');

test('mortality records follow frontend fields, TM scope and correction audit', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const password = 'SafePassword123';
  const farmUuids = [];
  const pondUuids = [];
  const userUuids = [];
  const emails = [];
  let companyId;
  let app;
  try {
    companyId = (await pool.query(
      `INSERT INTO companies (public_id, name, status)
       VALUES ($1, 'Mortality Test', 'active') RETURNING id`, [`company-${suffix}`],
    )).rows[0].id;
    for (const letter of ['a', 'b']) {
      const farmId = (await pool.query(
        `INSERT INTO farms (public_id, company_id, name, location, status)
         VALUES ($1, $2, $3, 'East Java', 'active') RETURNING id`,
        [`farm-${letter}-${suffix}`, companyId, `Farm ${letter}`],
      )).rows[0].id;
      farmUuids.push(farmId);
      pondUuids.push((await pool.query(
        `INSERT INTO ponds (public_id, farm_id, name, area_ha)
         VALUES ($1, $2, $3, 0.8) RETURNING id`,
        [`pond-${letter}-${suffix}`, farmId, `Pond ${letter}`],
      )).rows[0].id);
    }
    const hash = await hashPassword(password);
    for (const role of ['technical_manager', 'farms_manager', 'system_administrator']) {
      const email = `${role}-${suffix}@example.test`;
      emails.push(email);
      const userId = (await pool.query(
        `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`,
        [`${role}-${suffix}`, companyId, role, email, hash, role],
      )).rows[0].id;
      userUuids.push(userId);
      if (role === 'technical_manager') await pool.query(
        `INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at)
         VALUES ($1, $2, now())`, [userId, farmUuids[0]],
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
    const login = async (index) => {
      const response = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emails[index], password }),
      });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const tm = await login(0);
    const fm = await login(1);
    const sa = await login(2);
    const url = `${base}/ponds/pond-a-${suffix}/mortalities`;
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
    const input = { date: today, count: 12, weightKg: 0.75,
      observation: 'routine_check', note: 'morning check' };
    const create = (cookie, body, destination = url) => fetch(destination, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal((await create(fm, input)).status, 403);
    assert.equal((await create(sa, input)).status, 403);
    assert.equal((await create(tm, input, `${base}/ponds/pond-b-${suffix}/mortalities`)).status, 404);
    assert.equal((await create(tm, { ...input, count: -1 })).status, 422);
    assert.equal((await create(tm, { ...input, date: '2026-13-40' })).status, 422);
    const created = await create(tm, input);
    assert.equal(created.status, 201);
    const record = await created.json();
    assert.equal(record.pondId, `pond-a-${suffix}`);
    assert.equal(record.date, today);
    assert.equal(record.count, 12);
    assert.equal(record.weightKg, 0.75);
    assert.equal(record.recordedBy.id, `technical_manager-${suffix}`);
    assert.ok(Date.parse(record.updatedAt));

    const list = await fetch(url, { headers: { Cookie: tm } });
    assert.equal(list.status, 200);
    const listed = await list.json();
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0].id, record.id);
    assert.deepEqual(listed.last7Days, { count: 12, weightKg: 0.75 });
    assert.equal((await fetch(url, { headers: { Cookie: fm } })).status, 403);
    const filtered = await fetch(`${url}?from=2020-01-01&to=2020-01-02`,
      { headers: { Cookie: tm } });
    assert.equal((await filtered.json()).total, 0);
    const patch = await fetch(`${base}/mortalities/${record.id}`, {
      method: 'PATCH', headers: { Cookie: tm, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, count: 15, weightKg: 1.25,
        observation: 'low_do', note: null }),
    });
    assert.equal(patch.status, 200);
    const changed = await patch.json();
    assert.equal(changed.count, 15);
    assert.equal(changed.weightKg, 1.25);
    assert.equal(changed.observation, 'low_do');
    assert.equal(changed.recordedBy.id, record.recordedBy.id);
    const audit = await pool.query(
      `SELECT a.previous, a.current_value FROM mortality_record_audit a
       JOIN mortality_records r ON r.id = a.record_id WHERE r.public_id = $1`, [record.id],
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].current_value.count, 15);
    assert.equal((await fetch(`${base}/mortalities/${record.id}`, {
      method: 'PATCH', headers: { Cookie: fm, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })).status, 403);
    assert.equal((await fetch(`${base}/mortalities/unknown-${suffix}`, {
      method: 'PATCH', headers: { Cookie: tm, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })).status, 404);
  } finally {
    if (app) await app.close();
    if (pondUuids.length) {
      await pool.query(`DELETE FROM mortality_record_audit WHERE record_id IN
        (SELECT id FROM mortality_records WHERE pond_id = ANY($1))`, [pondUuids]);
      await pool.query('DELETE FROM mortality_records WHERE pond_id = ANY($1)', [pondUuids]);
    }
    for (const userId of userUuids) {
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
  }
});
