const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { hashPassword } = require('../dist/auth/password');
const { ProblemFilter } = require('../dist/http/problem');
const { createPostgresPool } = require('../dist/infrastructure/postgres');

test('feeding records honor frontend fields, TM scope, round uniqueness and daily totals', async () => {
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
       VALUES ($1, 'Feeding Test', 'active') RETURNING id`, [`company-${suffix}`],
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
    const url = `${base}/ponds/pond-a-${suffix}/feedings`;
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
    const input = { date: today, round: 1, feedType: 'Grower 2', amountKg: 12.5,
      trayCheck: 'empty_within_2h', note: 'morning' };
    const create = (cookie, body, destination = url) => fetch(destination, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal((await create(fm, input)).status, 403);
    assert.equal((await create(sa, input)).status, 403);
    assert.equal((await create(tm, input, `${base}/ponds/pond-b-${suffix}/feedings`)).status, 404);
    assert.equal((await create(tm, { ...input, round: 0 })).status, 422);
    assert.equal((await create(tm, { ...input, amountKg: 0 })).status, 422);
    assert.equal((await create(tm, { ...input, date: '2026-13-40' })).status, 422);
    const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    assert.equal((await create(tm, { ...input, date: future })).status, 422);

    const created = await create(tm, input);
    assert.equal(created.status, 201);
    const record = await created.json();
    assert.equal(record.pondId, `pond-a-${suffix}`);
    assert.equal(record.date, today);
    assert.equal(record.round, 1);
    assert.equal(record.amountKg, 12.5);
    assert.equal(record.trayCheck, 'empty_within_2h');
    assert.match(record.time, /^\d\d:\d\d$/);
    assert.equal(record.recordedBy.id, `technical_manager-${suffix}`);
    assert.equal((await create(tm, input)).status, 409);
    const second = await create(tm, { ...input, round: 2, amountKg: 8, trayCheck: null });
    assert.equal(second.status, 201);
    const secondRecord = await second.json();

    const list = await fetch(url, { headers: { Cookie: tm } });
    assert.equal(list.status, 200);
    const listed = await list.json();
    assert.equal(listed.total, 2);
    assert.deepEqual(listed.items.map((item) => item.round), [2, 1]);
    assert.equal(listed.dailyTotals.length, 2);
    assert.equal(listed.dailyTotals.find((item) => item.date === today).totalKg, 20.5);
    const paged = await fetch(`${url}?page=2&pageSize=1`, { headers: { Cookie: tm } });
    assert.equal((await paged.json()).items[0].id, record.id);
    assert.equal((await fetch(url, { headers: { Cookie: fm } })).status, 403);

    const patchUrl = `${base}/feedings/${secondRecord.id}`;
    const patch = (cookie, body) => fetch(patchUrl, {
      method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal((await patch(tm, { ...input, amountKg: 5 })).status, 409);
    const changedResponse = await patch(tm, { ...input, round: 2,
      amountKg: 9.25, trayCheck: 'leftover_under_5', note: null });
    assert.equal(changedResponse.status, 200);
    const changed = await changedResponse.json();
    assert.equal(changed.amountKg, 9.25);
    assert.equal(changed.note, null);
    assert.equal(changed.recordedBy.id, secondRecord.recordedBy.id);
    const updatedList = await fetch(url, { headers: { Cookie: tm } });
    assert.equal((await updatedList.json()).dailyTotals.find((item) => item.date === today).totalKg,
      21.75);
    const audit = await pool.query(
      `SELECT a.current_value FROM feeding_record_audit a
       JOIN feeding_records r ON r.id = a.record_id WHERE r.public_id = $1`, [secondRecord.id],
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].current_value.amountKg, 9.25);
    assert.equal((await patch(fm, input)).status, 403);
  } finally {
    if (app) await app.close();
    if (pondUuids.length) {
      await pool.query(`DELETE FROM feeding_record_audit WHERE record_id IN
        (SELECT id FROM feeding_records WHERE pond_id = ANY($1))`, [pondUuids]);
      await pool.query('DELETE FROM feeding_records WHERE pond_id = ANY($1)', [pondUuids]);
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
