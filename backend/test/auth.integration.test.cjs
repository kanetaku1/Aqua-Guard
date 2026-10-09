const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { hashPassword } = require('../dist/auth/password');
const { ProblemFilter } = require('../dist/http/problem');
const { createPostgresPool } = require('../dist/infrastructure/postgres');

test('session API follows the frontend cookie and Me contract', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const email = `auth-${suffix}@example.test`;
  const companyId = `company-${suffix}`;
  const farmId = `farm-${suffix}`;
  const userId = `user-${suffix}`;
  const password = 'SafePassword123';
  let companyUuid;
  let farmUuid;
  let userUuid;
  let app;
  try {
    companyUuid = (await pool.query(
      `INSERT INTO companies (public_id, name, status)
       VALUES ($1, 'Test Company', 'active') RETURNING id`, [companyId],
    )).rows[0].id;
    farmUuid = (await pool.query(
      `INSERT INTO farms (public_id, company_id, name, location, status)
       VALUES ($1, $2, 'Test Farm', 'East Java', 'active') RETURNING id`,
      [farmId, companyUuid],
    )).rows[0].id;
    userUuid = (await pool.query(
      `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status)
       VALUES ($1, $2, 'Sari Wijaya', $3, $4, 'technical_manager', 'active') RETURNING id`,
      [userId, companyUuid, email, await hashPassword(password)],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at)
       VALUES ($1, $2, now())`, [userUuid, farmUuid],
    );

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
    const anonymous = await fetch(`${base}/auth/me`);
    assert.equal(anonymous.status, 401);
    assert.match(anonymous.headers.get('content-type'), /application\/problem\+json/);

    const csrf = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(csrf.status, 403);

    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    const me = await login.json();
    assert.deepEqual(me, {
      id: userId, name: 'Sari Wijaya', initials: 'SW', email,
      role: 'technical_manager', language: 'en', company: 'Test Company',
      scopeLabel: 'Test Farm · East Java', farm: { id: farmId, name: 'Test Farm' },
    });
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /aquaguard_session=[0-9a-f]{64}/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    const sessionCookie = cookie.split(';')[0];
    const authorized = await fetch(`${base}/auth/me`, { headers: { Cookie: sessionCookie } });
    assert.equal(authorized.status, 200);
    assert.equal((await authorized.json()).id, userId);

    const change = await fetch(`${base}/auth/me`, {
      method: 'PATCH',
      headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'id' }),
    });
    assert.equal(change.status, 200);
    assert.equal((await change.json()).language, 'id');

    const logout = await fetch(`${base}/auth/logout`, {
      method: 'POST', headers: { Cookie: sessionCookie },
    });
    assert.equal(logout.status, 204);
    assert.equal((await fetch(`${base}/auth/me`, { headers: { Cookie: sessionCookie } })).status, 401);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const failed = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'wrong-password' }),
      });
      assert.equal(failed.status, attempt === 5 ? 423 : 401);
      const problem = await failed.json();
      assert.equal(problem.code, attempt === 5 ? 'account_locked' : 'invalid_credentials');
      if (attempt < 5) assert.equal(problem.remainingAttempts, 5 - attempt);
      else assert.ok(problem.lockedUntil);
    }
    await pool.query(
      "UPDATE users SET locked_until = now() - interval '1 second' WHERE id = $1",
      [userUuid],
    );
    const afterLock = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong-password' }),
    });
    assert.equal(afterLock.status, 401);
    assert.equal((await afterLock.json()).remainingAttempts, 4);
  } finally {
    if (app) await app.close();
    if (userUuid) {
      await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [userUuid]);
      await pool.query('DELETE FROM user_farm_assignments WHERE user_id = $1', [userUuid]);
      await pool.query('DELETE FROM password_tokens WHERE user_id = $1', [userUuid]);
      await pool.query('DELETE FROM users WHERE id = $1', [userUuid]);
    }
    await pool.query('DELETE FROM auth_attempts WHERE email_key = $1', [email]);
    if (farmUuid) await pool.query('DELETE FROM farms WHERE id = $1', [farmUuid]);
    if (companyUuid) await pool.query('DELETE FROM companies WHERE id = $1', [companyUuid]);
    await pool.end();
  }
});
