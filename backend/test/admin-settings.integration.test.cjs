const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { hashPassword } = require('../dist/auth/password');
const { ProblemFilter } = require('../dist/http/problem');
const { createPostgresPool } = require('../dist/infrastructure/postgres');

test('SA settings persist by company with validation and version history', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const password = 'SafePassword123';
  const email = `settings-${suffix}@example.test`;
  let companyId;
  let userId;
  let farmId;
  let app;
  try {
    companyId = (await pool.query(
      `INSERT INTO companies (public_id, name, status)
       VALUES ($1, 'Settings Test', 'active') RETURNING id`, [`company-${suffix}`],
    )).rows[0].id;
    userId = (await pool.query(
      `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status)
       VALUES ($1, $2, 'Settings Admin', $3, $4, 'system_administrator', 'active') RETURNING id`,
      [`user-${suffix}`, companyId, email, await hashPassword(password)],
    )).rows[0].id;
    farmId = (await pool.query(
      `INSERT INTO farms (public_id, company_id, name, location, status)
       VALUES ($1, $2, 'Settings Farm', 'East Java', 'active') RETURNING id`,
      [`farm-${suffix}`, companyId],
    )).rows[0].id;
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
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    const headers = { Cookie: login.headers.get('set-cookie').split(';')[0],
      'Content-Type': 'application/json' };

    const initialGrowthResponse = await fetch(`${base}/admin/settings/growth-targets`, { headers });
    assert.equal(initialGrowthResponse.status, 200);
    const initialGrowth = await initialGrowthResponse.json();
    assert.equal(initialGrowth.onTrackBandPct, 5);
    assert.equal(initialGrowth.points.length, 8);
    assert.deepEqual(initialGrowth.updatedBy, { id: `user-${suffix}`, name: 'Settings Admin' });
    const badGrowth = await fetch(`${base}/admin/settings/growth-targets`, {
      method: 'PUT', headers,
      body: JSON.stringify({ points: [
        { doc: 30, targetAbwG: 5 }, { doc: 20, targetAbwG: 4 },
      ], onTrackBandPct: 0 }),
    });
    assert.equal(badGrowth.status, 422);
    assert.ok((await badGrowth.json()).fieldErrors.some((e) => e.field === 'points/1/doc'));
    const growthSaved = await fetch(`${base}/admin/settings/growth-targets`, {
      method: 'PUT', headers,
      body: JSON.stringify({ points: [
        { doc: 20, targetAbwG: 4 }, { doc: 30, targetAbwG: 8 },
      ], onTrackBandPct: 7 }),
    });
    assert.equal(growthSaved.status, 200);
    assert.equal((await growthSaved.json()).onTrackBandPct, 7);
    const growthVersions = await pool.query(
      `SELECT effective_to FROM growth_target_sets WHERE company_id = $1 ORDER BY effective_from`,
      [companyId],
    );
    assert.equal(growthVersions.rows.length, 2);
    assert.ok(growthVersions.rows[0].effective_to);
    assert.equal(growthVersions.rows[1].effective_to, null);

    const initialRulesResponse = await fetch(`${base}/admin/settings/rules`, { headers });
    assert.equal(initialRulesResponse.status, 200);
    const initialRules = await initialRulesResponse.json();
    assert.equal(initialRules.sensorDelayedAfterMinutes, 15);
    assert.equal(initialRules.sensorOfflineAfterMinutes, 60);
    assert.equal(initialRules.weeklyReportDueTime, '12:00');
    const badRules = await fetch(`${base}/admin/settings/rules`, {
      method: 'PUT', headers,
      body: JSON.stringify({ ...initialRules, sensorOfflineAfterMinutes: 10 }),
    });
    assert.equal(badRules.status, 422);
    assert.ok((await badRules.json()).fieldErrors.some(
      (e) => e.field === 'sensorOfflineAfterMinutes'));
    const rulesSaved = await fetch(`${base}/admin/settings/rules`, {
      method: 'PUT', headers,
      body: JSON.stringify({ ...initialRules, sensorOfflineAfterMinutes: 90,
        productionWarningPct: 55 }),
    });
    assert.equal(rulesSaved.status, 200);
    assert.equal((await rulesSaved.json()).sensorOfflineAfterMinutes, 90);
    const ruleVersions = await pool.query(
      `SELECT effective_to FROM operational_rule_versions
       WHERE company_id = $1 ORDER BY effective_from`, [companyId],
    );
    assert.equal(ruleVersions.rows.length, 2);
    assert.ok(ruleVersions.rows[0].effective_to);
    assert.equal(ruleVersions.rows[1].effective_to, null);

    const initialThresholdsResponse = await fetch(`${base}/admin/settings/thresholds`, { headers });
    assert.equal(initialThresholdsResponse.status, 200);
    const initialThresholds = await initialThresholdsResponse.json();
    assert.equal(initialThresholds.items.length, 10);
    assert.deepEqual(initialThresholds.items.map((item) => item.parameter), [
      'do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level',
      'tan', 'no2', 'vibrio', 'alkalinity',
    ]);
    assert.equal(initialThresholds.items[0].warningLow, 4.5);
    assert.deepEqual(initialThresholds.farms, [
      { farm: { id: `farm-${suffix}`, name: 'Settings Farm' }, parameters: [] },
    ]);
    const badThreshold = await fetch(`${base}/admin/settings/thresholds`, {
      method: 'PUT', headers,
      body: JSON.stringify({ items: [{ ...initialThresholds.items[0], warningLow: 3 }] }),
    });
    assert.equal(badThreshold.status, 422);
    assert.ok((await badThreshold.json()).fieldErrors.some((e) => e.field === 'do/warningLow'));
    const farmEndpoint = `${base}/admin/settings/thresholds?farmId=farm-${suffix}`;
    const farmBefore = await fetch(farmEndpoint, { headers });
    assert.equal(farmBefore.status, 200);
    assert.equal((await farmBefore.json()).items[0].inherited, true);
    const override = { ...initialThresholds.items[0], warningLow: 4, attentionLow: 4.5 };
    const farmSaved = await fetch(farmEndpoint, {
      method: 'PUT', headers, body: JSON.stringify({ items: [override] }),
    });
    assert.equal(farmSaved.status, 200);
    const farmData = await farmSaved.json();
    assert.equal(farmData.items[0].warningLow, 4);
    assert.equal(farmData.items[0].inherited, false);
    assert.equal(farmData.items[1].inherited, true);
    assert.deepEqual(farmData.farms[0].parameters, ['do']);
    const defaultSaved = await fetch(`${base}/admin/settings/thresholds`, {
      method: 'PUT', headers,
      body: JSON.stringify({ items: [
        { ...initialThresholds.items[1], attentionLow: 7.6 },
      ] }),
    });
    assert.equal(defaultSaved.status, 200);
    assert.equal((await defaultSaved.json()).items[1].attentionLow, 7.6);
    const farmAfterDefault = await fetch(farmEndpoint, { headers });
    assert.equal(farmAfterDefault.status, 200);
    const inherited = await farmAfterDefault.json();
    assert.equal(inherited.items[0].warningLow, 4);
    assert.equal(inherited.items[1].attentionLow, 7.6);
    assert.equal(inherited.items[1].inherited, true);
    const farmReset = await fetch(farmEndpoint, {
      method: 'PUT', headers, body: JSON.stringify({ items: [] }),
    });
    assert.equal(farmReset.status, 200);
    assert.equal((await farmReset.json()).items[0].inherited, true);
    const history = await pool.query(
      `SELECT count(*)::int AS n FROM threshold_sets WHERE company_id = $1`, [companyId],
    );
    assert.equal(history.rows[0].n, 3);
  } finally {
    if (app) await app.close();
    if (companyId) {
      await pool.query(`DELETE FROM threshold_values WHERE set_id IN
        (SELECT id FROM threshold_sets WHERE company_id = $1)`, [companyId]);
      await pool.query('DELETE FROM threshold_sets WHERE company_id = $1', [companyId]);
      await pool.query(`DELETE FROM growth_target_points WHERE set_id IN
        (SELECT id FROM growth_target_sets WHERE company_id = $1)`, [companyId]);
      await pool.query('DELETE FROM growth_target_sets WHERE company_id = $1', [companyId]);
      await pool.query('DELETE FROM operational_rule_versions WHERE company_id = $1', [companyId]);
    }
    if (farmId) await pool.query('DELETE FROM farms WHERE id = $1', [farmId]);
    if (userId) {
      await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await pool.query('DELETE FROM auth_attempts WHERE email_key = $1', [email]);
    if (companyId) await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
    await pool.end();
  }
});
