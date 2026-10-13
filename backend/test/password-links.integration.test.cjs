const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { hashPassword } = require('../dist/auth/password');
const { ProblemFilter } = require('../dist/http/problem');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { hashToken } = require('../dist/auth/token');

test('invitation and reset links are mailed, single-use and expire', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const adminEmail = `mail-admin-${suffix}@example.test`;
  const invitedEmail = `mail-invite-${suffix}@example.test`;
  const secondEmail = `mail-second-${suffix}@example.test`;
  const unknownEmail = `mail-unknown-${suffix}@example.test`;
  const mailUrl = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? '8025'}`;
  let companyUuid;
  let farmUuid;
  let adminUuid;
  let app;
  const createdUserUuids = [];
  const capturedIds = new Set();
  async function json(response) { return response.json(); }
  async function messagesFor(address) {
    const response = await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
    assert.equal(response.status, 200);
    return (await json(response)).messages ?? [];
  }
  async function latestToken(address) {
    const messages = await messagesFor(address);
    assert.ok(messages.length > 0, `No message sent to ${address}`);
    const messageId = messages[0].ID;
    capturedIds.add(messageId);
    const response = await fetch(`${mailUrl}/api/v1/message/${encodeURIComponent(messageId)}`);
    assert.equal(response.status, 200);
    const message = await json(response);
    const match = /\/set-password\?token=([0-9a-f]{64})/.exec(message.Text);
    assert.ok(match, 'Mail message has a set-password link');
    return match[1];
  }
  try {
    companyUuid = (await pool.query(
      `INSERT INTO companies (public_id, name, status)
       VALUES ($1, 'Mail Test Company', 'active') RETURNING id`, [`mail-company-${suffix}`],
    )).rows[0].id;
    farmUuid = (await pool.query(
      `INSERT INTO farms (public_id, company_id, name, location, status)
       VALUES ($1, $2, 'Mail Farm', 'East Java', 'active') RETURNING id`,
      [`mail-farm-${suffix}`, companyUuid],
    )).rows[0].id;
    adminUuid = (await pool.query(
      `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status,
         activated_at)
       VALUES ($1, $2, 'Mail Admin', $3, $4, 'system_administrator', 'active', now()) RETURNING id`,
      [`mail-admin-${suffix}`, companyUuid, adminEmail, await hashPassword('AdminPassword123')],
    )).rows[0].id;
    createdUserUuids.push(adminUuid);

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
    const request = (path, method, body, cookie) => fetch(`${base}${path}`, {
      method, headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const login = await request('/auth/login', 'POST', {
      email: adminEmail, password: 'AdminPassword123',
    });
    assert.equal(login.status, 200);
    const adminCookie = login.headers.get('set-cookie').split(';')[0];

    const invite = await request('/admin/users', 'POST', {
      name: 'Invited TM', email: invitedEmail, role: 'technical_manager',
      farmId: `mail-farm-${suffix}`,
    }, adminCookie);
    assert.equal(invite.status, 201);
    const invited = await json(invite);
    assert.equal(invited.status, 'invited');
    assert.deepEqual(invited.farm, { id: `mail-farm-${suffix}`, name: 'Mail Farm' });
    assert.ok(invited.invitationExpiresAt);
    const invitedUuid = (await pool.query('SELECT id FROM users WHERE public_id = $1',
      [invited.id])).rows[0].id;
    createdUserUuids.push(invitedUuid);
    const inviteToken = await latestToken(invitedEmail);
    const tokenCheck = await request(`/auth/password/tokens/${inviteToken}`, 'GET');
    assert.equal(tokenCheck.status, 200);
    assert.equal((await json(tokenCheck)).mode, 'invite');
    const set = await request('/auth/password/set', 'POST', {
      token: inviteToken, password: 'InvitedPassword123',
    });
    assert.equal(set.status, 200);
    assert.equal((await json(set)).id, invited.id);
    assert.match(set.headers.get('set-cookie'), /aquaguard_session=[0-9a-f]{64}/);
    assert.equal((await request(`/auth/password/tokens/${inviteToken}`, 'GET')).status, 410);

    const knownForgot = await request('/auth/password/forgot', 'POST', { email: invitedEmail });
    const unknownForgot = await request('/auth/password/forgot', 'POST', { email: unknownEmail });
    assert.equal(knownForgot.status, 202);
    assert.equal(unknownForgot.status, 202);
    assert.equal((await messagesFor(unknownEmail)).length, 0);
    const resetToken = await latestToken(invitedEmail);
    assert.notEqual(resetToken, inviteToken);
    const resetInfo = await request(`/auth/password/tokens/${resetToken}`, 'GET');
    assert.equal((await json(resetInfo)).mode, 'reset');
    const oldCookie = set.headers.get('set-cookie').split(';')[0];
    const reset = await request('/auth/password/set', 'POST', {
      token: resetToken, password: 'UpdatedPassword123',
    });
    assert.equal(reset.status, 200);
    assert.equal((await json(reset)).id, invited.id);
    assert.equal((await request('/auth/me', 'GET', undefined, oldCookie)).status, 401);
    assert.equal((await request(`/auth/password/tokens/${resetToken}`, 'GET')).status, 410);
    const newLogin = await request('/auth/login', 'POST', {
      email: invitedEmail, password: 'UpdatedPassword123',
    });
    assert.equal(newLogin.status, 200);

    const secondInvite = await request('/admin/users', 'POST', {
      name: 'Second User', email: secondEmail, role: 'farms_manager',
    }, adminCookie);
    assert.equal(secondInvite.status, 201);
    const second = await json(secondInvite);
    createdUserUuids.push((await pool.query('SELECT id FROM users WHERE public_id = $1',
      [second.id])).rows[0].id);
    const firstToken = await latestToken(secondEmail);
    const resend = await request(`/admin/users/${second.id}/resend-invitation`, 'POST', undefined,
      adminCookie);
    assert.equal(resend.status, 202);
    const secondToken = await latestToken(secondEmail);
    assert.notEqual(firstToken, secondToken);
    assert.equal((await request(`/auth/password/tokens/${firstToken}`, 'GET')).status, 410);
    assert.equal((await request(`/auth/password/tokens/${secondToken}`, 'GET')).status, 200);
    await pool.query(
      `UPDATE password_tokens SET created_at = now() - interval '73 hours',
        expires_at = now() - interval '1 second' WHERE token_hash = $1`,
      [hashToken(secondToken)],
    );
    assert.equal((await request(`/auth/password/tokens/${secondToken}`, 'GET')).status, 410);

    const adminReset = await request(`/admin/users/${invited.id}/send-password-reset`,
      'POST', undefined, adminCookie);
    assert.equal(adminReset.status, 202);
    assert.ok(await latestToken(invitedEmail));
  } finally {
    if (app) await app.close();
    for (const userUuid of createdUserUuids) {
      await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [userUuid]);
      await pool.query('DELETE FROM password_tokens WHERE user_id = $1', [userUuid]);
    }
    if (createdUserUuids.length) {
      await pool.query('DELETE FROM user_farm_assignments WHERE user_id = ANY($1)',
        [createdUserUuids]);
      await pool.query('UPDATE users SET invited_by_user_id = NULL WHERE id = ANY($1)',
        [createdUserUuids]);
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [createdUserUuids]);
    }
    await pool.query('DELETE FROM auth_attempts WHERE email_key LIKE $1', [`%-${suffix}@example.test`]);
    if (farmUuid) await pool.query('DELETE FROM farms WHERE id = $1', [farmUuid]);
    if (companyUuid) await pool.query('DELETE FROM companies WHERE id = $1', [companyUuid]);
    await pool.end();
    for (const address of [invitedEmail, secondEmail]) {
      for (const message of await messagesFor(address)) capturedIds.add(message.ID);
    }
    if (capturedIds.size) {
      const response = await fetch(`${mailUrl}/api/v1/messages`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDs: [...capturedIds] }),
      });
      assert.equal(response.status, 200);
    }
  }
});
