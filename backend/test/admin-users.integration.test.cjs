const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { hashPassword } = require('../dist/auth/password');
const { ProblemFilter } = require('../dist/http/problem');
const { createPostgresPool } = require('../dist/infrastructure/postgres');

test('AdminUser list and mutations enforce company, Role and session boundaries', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    company: `company-users-${suffix}`, farm: `farm-users-${suffix}`,
    admin: `admin-users-${suffix}`, tm: `tm-users-${suffix}`,
    invited: `invited-users-${suffix}`, other: `other-users-${suffix}`,
  };
  const email = (name) => `${name}-${suffix}@example.test`;
  const password = 'SafePassword123';
  let companyUuid;
  let otherCompanyUuid;
  let farmUuid;
  let app;
  const userUuids = [];
  try {
    companyUuid = (await pool.query(
      `INSERT INTO companies (public_id, name, status)
       VALUES ($1, 'User Test Company', 'active') RETURNING id`, [ids.company],
    )).rows[0].id;
    otherCompanyUuid = (await pool.query(
      `INSERT INTO companies (public_id, name, status)
       VALUES ($1, 'Other Company', 'active') RETURNING id`, [`other-company-${suffix}`],
    )).rows[0].id;
    farmUuid = (await pool.query(
      `INSERT INTO farms (public_id, company_id, name, location, status)
       VALUES ($1, $2, 'Farm A', 'East Java', 'active') RETURNING id`,
      [ids.farm, companyUuid],
    )).rows[0].id;
    const passwordHash = await hashPassword(password);
    async function addUser(publicId, companyId, name, role, status, userEmail) {
      const result = await pool.query(
        `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status,
          activated_at, invited_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
           CASE WHEN $7 = 'active' THEN now() ELSE NULL END,
           CASE WHEN $7 = 'invited' THEN now() ELSE NULL END) RETURNING id`,
        [publicId, companyId, name, userEmail, status === 'invited' ? null : passwordHash,
          role, status],
      );
      userUuids.push(result.rows[0].id);
      return result.rows[0].id;
    }
    const adminUuid = await addUser(ids.admin, companyUuid, 'Yusuf Rahman',
      'system_administrator', 'active', email('admin'));
    const tmUuid = await addUser(ids.tm, companyUuid, 'Sari Wijaya',
      'technical_manager', 'active', email('tm'));
    const invitedUuid = await addUser(ids.invited, companyUuid, 'Fajar Nugroho',
      'technical_manager', 'invited', email('invited'));
    await addUser(ids.other, otherCompanyUuid, 'Other Admin',
      'system_administrator', 'active', email('other'));
    await pool.query(
      'UPDATE users SET invited_by_user_id = $2 WHERE id = $1', [invitedUuid, adminUuid],
    );
    await pool.query(
      `INSERT INTO password_tokens (user_id, token_hash, purpose, expires_at)
       VALUES ($1, $2, 'invite', now() + interval '72 hours')`,
      [invitedUuid, randomUUID().replaceAll('-', '')],
    );
    await pool.query(
      `INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at)
       VALUES ($1, $3, now()), ($2, $3, now())`, [tmUuid, invitedUuid, farmUuid],
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
    async function login(userEmail) {
      const response = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, password }),
      });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    }
    const adminCookie = await login(email('admin'));
    const tmCookie = await login(email('tm'));
    const adminHeaders = { Cookie: adminCookie, 'Content-Type': 'application/json' };

    const list = await fetch(`${base}/admin/users`, { headers: { Cookie: adminCookie } });
    assert.equal(list.status, 200);
    const data = await list.json();
    assert.deepEqual(data.counts, { total: 3, active: 2, invited: 1, deactivated: 0 });
    assert.equal(data.total, 3);
    assert.equal(data.items[0].id, ids.admin);
    assert.equal(data.items[0].canChangeRole, false);
    assert.equal(data.items[0].canDeactivate, false);
    const tm = data.items.find((item) => item.id === ids.tm);
    assert.deepEqual(tm.farm, { id: ids.farm, name: 'Farm A' });
    assert.deepEqual(tm.onlyActiveTechnicalManagerOf, { id: ids.farm, name: 'Farm A' });
    const invited = data.items.find((item) => item.id === ids.invited);
    assert.deepEqual(invited.invitedBy, { id: ids.admin, name: 'Yusuf Rahman' });
    assert.ok(invited.invitedAt && invited.invitationExpiresAt);
    assert.equal(invited.activatedAt, null);

    const filtered = await fetch(
      `${base}/admin/users?status=invited&page=1&pageSize=1`,
      { headers: { Cookie: adminCookie } },
    );
    assert.equal(filtered.status, 200);
    assert.equal((await filtered.json()).total, 1);
    const wrongCompany = await fetch(`${base}/admin/users/${ids.other}`,
      { headers: { Cookie: adminCookie } });
    assert.equal(wrongCompany.status, 404);
    const forbidden = await fetch(`${base}/admin/users`, { headers: { Cookie: tmCookie } });
    assert.equal(forbidden.status, 403);

    const selfRole = await fetch(`${base}/admin/users/${ids.admin}`, {
      method: 'PATCH', headers: adminHeaders,
      body: JSON.stringify({ role: 'farms_manager' }),
    });
    assert.equal(selfRole.status, 409);
    assert.equal((await selfRole.json()).code, 'self_change');
    const selfDeactivate = await fetch(`${base}/admin/users/${ids.admin}/deactivate`, {
      method: 'POST', headers: adminHeaders,
    });
    assert.equal(selfDeactivate.status, 409);

    const move = await fetch(`${base}/admin/users/${ids.tm}`, {
      method: 'PATCH', headers: adminHeaders,
      body: JSON.stringify({ role: 'farms_manager', language: 'id' }),
    });
    assert.equal(move.status, 200);
    const moved = await move.json();
    assert.equal(moved.role, 'farms_manager');
    assert.equal(moved.language, 'id');
    assert.equal(moved.farm, null);
    const noAssignment = await pool.query(
      'SELECT count(*) FROM user_farm_assignments WHERE user_id = $1 AND unassigned_at IS NULL',
      [tmUuid],
    );
    assert.equal(Number(noAssignment.rows[0].count), 0);

    const deactivated = await fetch(`${base}/admin/users/${ids.tm}/deactivate`, {
      method: 'POST', headers: adminHeaders,
    });
    assert.equal(deactivated.status, 200);
    assert.equal((await deactivated.json()).status, 'deactivated');
    const oldSession = await fetch(`${base}/auth/me`, { headers: { Cookie: tmCookie } });
    assert.equal(oldSession.status, 401);
    const reactivated = await fetch(`${base}/admin/users/${ids.tm}/reactivate`, {
      method: 'POST', headers: adminHeaders,
    });
    assert.equal(reactivated.status, 200);
    assert.equal((await reactivated.json()).status, 'active');
    const invitedDeactivate = await fetch(`${base}/admin/users/${ids.invited}/deactivate`, {
      method: 'POST', headers: adminHeaders,
    });
    assert.equal(invitedDeactivate.status, 200);
    const invitedReactivate = await fetch(`${base}/admin/users/${ids.invited}/reactivate`, {
      method: 'POST', headers: adminHeaders,
    });
    assert.equal(invitedReactivate.status, 200);
    assert.equal((await invitedReactivate.json()).status, 'invited');
  } finally {
    if (app) await app.close();
    for (const userUuid of userUuids) {
      await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [userUuid]);
      await pool.query('DELETE FROM password_tokens WHERE user_id = $1', [userUuid]);
    }
    if (userUuids.length) {
      await pool.query('DELETE FROM user_farm_assignments WHERE user_id = ANY($1)', [userUuids]);
      await pool.query('UPDATE users SET invited_by_user_id = NULL WHERE id = ANY($1)', [userUuids]);
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [userUuids]);
    }
    await pool.query('DELETE FROM auth_attempts WHERE email_key LIKE $1', [`%-${suffix}@example.test`]);
    if (farmUuid) await pool.query('DELETE FROM farms WHERE id = $1', [farmUuid]);
    if (companyUuid) await pool.query('DELETE FROM companies WHERE id = $1', [companyUuid]);
    if (otherCompanyUuid) await pool.query('DELETE FROM companies WHERE id = $1', [otherCompanyUuid]);
    await pool.end();
  }
});
