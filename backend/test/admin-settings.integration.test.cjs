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
  } finally {
    if (app) await app.close();
    if (companyId) {
      await pool.query(`DELETE FROM growth_target_points WHERE set_id IN
        (SELECT id FROM growth_target_sets WHERE company_id = $1)`, [companyId]);
      await pool.query('DELETE FROM growth_target_sets WHERE company_id = $1', [companyId]);
      await pool.query('DELETE FROM operational_rule_versions WHERE company_id = $1', [companyId]);
    }
    if (userId) {
      await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await pool.query('DELETE FROM auth_attempts WHERE email_key = $1', [email]);
    if (companyId) await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
    await pool.end();
  }
});
