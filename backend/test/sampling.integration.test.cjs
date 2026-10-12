const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { hashPassword } = require('../dist/auth/password');
const { ProblemFilter } = require('../dist/http/problem');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { FarmGrowthStatusService } = require('../dist/business/farm-growth-status.service');

test('sampling contract, growth calculation, lab severity and atomic batch upsert', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const password = 'SafePassword123';
  const farmIds = [];
  const pondIds = [];
  const userIds = [];
  const emails = [];
  let companyId;
  let app;
  try {
    companyId = (await pool.query(
      `INSERT INTO companies (public_id, name, status)
       VALUES ($1, 'Sampling Test', 'active') RETURNING id`, [`company-${suffix}`],
    )).rows[0].id;
    for (const letter of ['a', 'b']) {
      const farmId = (await pool.query(
        `INSERT INTO farms (public_id, company_id, name, location, status)
         VALUES ($1, $2, $3, 'East Java', 'active') RETURNING id`,
        [`farm-${letter}-${suffix}`, companyId, `Farm ${letter}`],
      )).rows[0].id;
      farmIds.push(farmId);
      for (const pondLetter of letter === 'a' ? ['a', 'c'] : ['b']) {
        pondIds.push((await pool.query(
          `INSERT INTO ponds (public_id, farm_id, name, area_ha)
           VALUES ($1, $2, $3, 0.8) RETURNING id`,
          [`pond-${pondLetter}-${suffix}`, farmId, `Pond ${pondLetter}`],
        )).rows[0].id);
      }
    }
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
    const day = (offset) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000)
      .toISOString().slice(0, 10);
    for (const pondId of pondIds.slice(0, 1)) await pool.query(
      `INSERT INTO production_cycles (pond_id, started_on, status)
       VALUES ($1, $2, 'active')`, [pondId, day(-34)],
    );
    const hash = await hashPassword(password);
    for (const role of ['technical_manager', 'farms_manager']) {
      const email = `${role}-${suffix}@example.test`;
      emails.push(email);
      const userId = (await pool.query(
        `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`,
        [`${role}-${suffix}`, companyId, role, email, hash, role],
      )).rows[0].id;
      userIds.push(userId);
      if (role === 'technical_manager') await pool.query(
        `INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at)
         VALUES ($1, $2, now())`, [userId, farmIds[0]],
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
    const request = (method, path, cookie, body) => fetch(`${base}${path}`, {
      method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const pondPath = `/ponds/pond-a-${suffix}/samplings`;
    const farmPath = `/farms/farm-a-${suffix}/samplings`;
    assert.equal((await request('POST', pondPath, fm, { date: today })).status, 403);
    assert.equal((await request('POST', `/ponds/pond-b-${suffix}/samplings`, tm,
      { date: today })).status, 404);
    assert.equal((await request('POST', pondPath, tm,
      { date: today, sampleCount: 10 })).status, 422);
    assert.equal((await request('POST', pondPath, tm,
      { date: day(1) })).status, 422);
    const first = await request('POST', pondPath, tm,
      { date: day(-7), sampleCount: 10, sampleWeightG: 53 });
    assert.equal(first.status, 201);
    const firstRecord = await first.json();
    assert.equal(firstRecord.doc, 27);
    assert.equal(firstRecord.abwG, 5.3);
    assert.equal(firstRecord.adgGPerDay, null);
    assert.equal(firstRecord.targetAbwG, 5.3);
    assert.equal(firstRecord.growth, 'on_track');
    assert.equal(firstRecord.labPending, true);
    assert.equal((await request('POST', pondPath, tm,
      { date: day(-7) })).status, 409);
    const second = await request('POST', pondPath, tm,
      { date: today, sampleCount: 10, sampleWeightG: 74, tan: 2.5 });
    assert.equal(second.status, 201);
    const secondRecord = await second.json();
    assert.equal(secondRecord.doc, 34);
    assert.equal(secondRecord.abwG, 7.4);
    assert.ok(Math.abs(secondRecord.adgGPerDay - 0.3) < 1e-10);
    assert.equal(secondRecord.labSeverity.tan, 'warning');
    assert.equal(secondRecord.labSeverity.no2, null);
    const pondList = await request('GET', pondPath, tm);
    assert.equal(pondList.status, 200);
    const listed = await pondList.json();
    assert.deepEqual(listed.items.map((item) => item.id), [secondRecord.id, firstRecord.id]);
    assert.equal(listed.growthCurve[0].doc, 27);
    const batchPath = `${farmPath}/batch`;
    const badBatch = await request('POST', batchPath, tm, { date: today, entries: [
      { pondId: `pond-a-${suffix}`, sampleCount: 10, sampleWeightG: 90 },
      { pondId: `pond-b-${suffix}`, sampleCount: 10, sampleWeightG: 90 },
    ] });
    assert.equal(badBatch.status, 404);
    const unchanged = await request('GET', `${farmPath}?date=${today}`, tm);
    assert.equal((await unchanged.json()).items[0].sampleWeightG, 74);
    const noCycle = await request('POST', batchPath, tm, { date: today, entries: [
      { pondId: `pond-a-${suffix}`, sampleCount: 10, sampleWeightG: 90 },
      { pondId: `pond-c-${suffix}`, sampleCount: 10, sampleWeightG: 80 },
    ] });
    assert.equal(noCycle.status, 422);
    const rolledBack = await request('GET', `${farmPath}?date=${today}`, tm);
    assert.equal((await rolledBack.json()).items[0].sampleWeightG, 74);
    await pool.query(`INSERT INTO production_cycles (pond_id, started_on, status)
      VALUES ($1, $2, 'active')`, [pondIds[1], day(-34)]);
    const farmGrowth = app.get(FarmGrowthStatusService);
    const incompleteGrowth = await farmGrowth.snapshot(companyId, userIds[0], farmIds[0]);
    assert.equal(incompleteGrowth.eligible, 2);
    assert.equal(incompleteGrowth.evaluated, 1);
    assert.equal(incompleteGrowth.sampleBasedStatus, null);
    const batch = await request('POST', batchPath, tm, { date: today, entries: [
      { pondId: `pond-a-${suffix}`, sampleCount: 10, sampleWeightG: 90, no2: 1.2 },
      { pondId: `pond-c-${suffix}`, sampleCount: 10, sampleWeightG: 80 },
    ] });
    assert.equal(batch.status, 200);
    const batchItems = (await batch.json()).items;
    assert.equal(batchItems[0].id, secondRecord.id);
    assert.equal(batchItems[0].recordedBy.id, secondRecord.recordedBy.id);
    assert.equal(batchItems[0].growth, 'ahead');
    assert.equal(batchItems[0].labSeverity.no2, 'warning');
    assert.equal(batchItems[1].pondId, `pond-c-${suffix}`);
    const farmList = await request('GET', `${farmPath}?date=${today}`, tm);
    assert.equal(farmList.status, 200);
    const farmRecords = await farmList.json();
    assert.equal(farmRecords.items.length, 2);
    assert.equal(farmRecords.onTrackBandPct, 5);
    const growthBefore = await farmGrowth.snapshot(companyId, userIds[0], farmIds[0]);
    assert.equal(growthBefore.sampleBasedStatus, 'normal');
    assert.equal(growthBefore.evaluated, 2);
    assert.equal((await request('POST', batchPath, tm, { date: today, entries: [
      { pondId: `pond-a-${suffix}` }, { pondId: `pond-a-${suffix}` },
    ] })).status, 422);
    const patch = await request('PATCH', `/samplings/${firstRecord.id}`, tm,
      { date: day(-7), sampleCount: 10, sampleWeightG: 54, note: 'corrected' });
    assert.equal(patch.status, 200);
    assert.equal((await patch.json()).note, 'corrected');
    const audit = await pool.query(
      `SELECT count(*)::integer AS total FROM sampling_record_audit a
       JOIN sampling_records r ON r.id = a.record_id WHERE r.public_id = $1`, [secondRecord.id],
    );
    assert.equal(audit.rows[0].total, 1);
    assert.equal((await request('POST', `/ponds/pond-c-${suffix}/samplings`, tm,
      { date: day(-40) })).status, 422);
    assert.equal((await request('PATCH', `/samplings/${batchItems[1].id}`, tm,
      { date: today, sampleCount: 10, sampleWeightG: 50 })).status, 200);
    const growthAfter = await farmGrowth.snapshot(companyId, userIds[0], farmIds[0]);
    assert.equal(growthAfter.behind, 1);
    assert.equal(growthAfter.sampleBasedStatus, 'warning');
    assert.deepEqual(growthAfter.behindPonds.map((pond) => pond.id), [`pond-c-${suffix}`]);
  } finally {
    if (app) await app.close();
    if (pondIds.length) {
      await pool.query(`DELETE FROM sampling_record_audit WHERE record_id IN
        (SELECT id FROM sampling_records WHERE pond_id = ANY($1))`, [pondIds]);
      await pool.query('DELETE FROM sampling_records WHERE pond_id = ANY($1)', [pondIds]);
      await pool.query('DELETE FROM production_cycles WHERE pond_id = ANY($1)', [pondIds]);
    }
    await pool.query(`DELETE FROM growth_target_points WHERE set_id IN
      (SELECT id FROM growth_target_sets WHERE company_id=$1)`, [companyId]);
    await pool.query('DELETE FROM growth_target_sets WHERE company_id=$1', [companyId]);
    for (const userId of userIds) {
      await pool.query('DELETE FROM auth_sessions WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM user_farm_assignments WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    }
    if (emails.length) await pool.query('DELETE FROM auth_attempts WHERE email_key = ANY($1)', [emails]);
    for (const pondId of pondIds) await pool.query('DELETE FROM ponds WHERE id=$1', [pondId]);
    for (const farmId of farmIds) await pool.query('DELETE FROM farms WHERE id=$1', [farmId]);
    if (companyId) await pool.query('DELETE FROM companies WHERE id=$1', [companyId]);
    await pool.end();
  }
});
