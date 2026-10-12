const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { hashPassword } = require('../dist/auth/password');
const { ProblemFilter } = require('../dist/http/problem');
const { createPostgresPool } = require('../dist/infrastructure/postgres');

test('alert API scopes TM access and persists handling transitions', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const farmIds = [];
  const pondIds = [];
  const userIds = [];
  const alertUuids = [];
  const issueIds = [];
  const emails = [];
  let companyId;
  let app;
  try {
    companyId = (await pool.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Alerts Test','active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    for (const letter of ['a', 'b']) {
      const farm = (await pool.query(`INSERT INTO farms
        (public_id,company_id,name,location,status)
        VALUES ($1,$2,$3,'East Java','active') RETURNING id`,
      [`farm-${letter}-${suffix}`, companyId, `Farm ${letter}`])).rows[0].id;
      farmIds.push(farm);
      pondIds.push((await pool.query(`INSERT INTO ponds (public_id,farm_id,name,area_ha)
        VALUES ($1,$2,$3,0.8) RETURNING id`,
      [`pond-${letter}-${suffix}`, farm, `Pond ${letter}`])).rows[0].id);
    }
    const hash = await hashPassword('SafePassword123');
    for (const role of ['technical_manager', 'farms_manager']) {
      const email = `${role}-${suffix}@example.test`;
      emails.push(email);
      const id = (await pool.query(`INSERT INTO users
        (public_id,company_id,name,email,password_hash,role,status)
        VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING id`,
      [`${role}-${suffix}`, companyId, role, email, hash, role])).rows[0].id;
      userIds.push(id);
      if (role === 'technical_manager') await pool.query(
        `INSERT INTO user_farm_assignments (user_id,farm_id,assigned_at)
         VALUES ($1,$2,now())`, [id, farmIds[0]]);
    }
    for (const index of [0, 1]) {
      alertUuids.push((await pool.query(`INSERT INTO alerts
        (public_id,pond_id,parameter,severity,observed_value,
         threshold_value,unit,direction,occurred_at)
        VALUES ($1,$2,'do','critical',4.1,4.5,'mg/L','below',now()) RETURNING id`,
      [`ALT-${index}-${suffix}`, pondIds[index]])).rows[0].id);
      issueIds.push((await pool.query(`INSERT INTO issues
        (public_id,farm_id,pond_id,issue_type,parameter,severity,trend,
         state,source_type,source_id,since)
        VALUES ($1,$2,$3,'water_quality','do','critical','decreasing',
          'ongoing','alert',$4,now()) RETURNING public_id`,
      [`ISS-${index}-${suffix}`, farmIds[index], pondIds[index], alertUuids[index]])).rows[0].public_id);
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
    async function login(index) {
      const response = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emails[index], password: 'SafePassword123' }),
      });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    }
    const tm = await login(0);
    const fm = await login(1);
    const call = (method, path, cookie, body) => fetch(`${base}${path}`, {
      method, headers: { Cookie: cookie, 'Content-Type': 'application/json',
        'Accept-Language': 'id' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal((await call('GET', '/alerts', fm)).status, 403);
    assert.equal((await call('GET', '/issues', tm)).status, 403);
    const fmIssues = await call('GET', '/issues', fm);
    assert.equal(fmIssues.status, 200);
    assert.equal((await fmIssues.json()).total, 2);
    const fmDetailResponse = await call('GET', `/issues/${issueIds[0]}`, fm);
    assert.equal(fmDetailResponse.status, 200);
    const fmDetail = await fmDetailResponse.json();
    assert.equal(fmDetail.issueType, 'water_quality');
    assert.equal(fmDetail.handling, 'unacknowledged');
    assert.ok(!JSON.stringify(fmDetail).includes('4.1'));
    assert.equal((await call('GET', '/issues?state=bad', fm)).status, 422);
    const list = await call('GET', '/alerts?state=open&pageSize=1', tm);
    assert.equal(list.status, 200);
    const page = await list.json();
    assert.equal(page.total, 1);
    assert.equal(page.items[0].id, `ALT-0-${suffix}`);
    assert.match(page.items[0].title, /di bawah ambang/);
    assert.equal((await call('GET', `/alerts/ALT-1-${suffix}`, tm)).status, 404);
    assert.equal((await call('POST', `/alerts/ALT-1-${suffix}/acknowledge`, tm)).status, 404);
    assert.equal((await call('GET', '/alerts?state=invalid', tm)).status, 422);
    const id = `ALT-0-${suffix}`;
    assert.equal((await call('POST', `/alerts/${id}/actions`, tm,
      { performedAt: 'bad', type: 'other' })).status, 422);
    let result = await call('POST', `/alerts/${id}/acknowledge`, tm);
    assert.equal(result.status, 200);
    let detail = await result.json();
    assert.equal(detail.state, 'acknowledged');
    assert.equal(detail.acknowledgedBy.id, `technical_manager-${suffix}`);
    assert.equal(detail.handledBy.id, `technical_manager-${suffix}`);
    assert.deepEqual(detail.actions, []);
    assert.equal(detail.sensor, null);
    assert.equal(detail.issueId, issueIds[0]);
    assert.equal((await call('POST', `/alerts/${id}/acknowledge`, tm)).status, 409);
    result = await call('POST', `/alerts/${id}/actions`, tm,
      { performedAt: new Date().toISOString(), type: 'increased_aeration', note: 'Aerator started' });
    assert.equal(result.status, 201);
    detail = await result.json();
    assert.equal(detail.state, 'in_progress');
    assert.equal(detail.actions.length, 1);
    assert.equal(detail.actions[0].source, 'alert_handling');
    assert.equal(detail.actions[0].recordedBy.id, `technical_manager-${suffix}`);
    result = await call('POST', `/alerts/${id}/resolve`, tm, { note: 'Recovered' });
    assert.equal(result.status, 200);
    detail = await result.json();
    assert.equal(detail.state, 'resolved');
    assert.ok(detail.resolvedAt);
    const resolvedIssues = await (await call('GET', '/issues?state=resolved', fm)).json();
    assert.equal(resolvedIssues.total, 1);
    assert.equal(resolvedIssues.items[0].id, issueIds[0]);
    assert.equal(resolvedIssues.items[0].handling, 'resolved');
    const resolvedDetail = await (await call('GET', `/issues/${issueIds[0]}`, fm)).json();
    assert.equal(resolvedDetail.actions.length, 1);
    assert.equal(resolvedDetail.actions[0].type, 'increased_aeration');
    assert.equal((await call('POST', `/alerts/${id}/resolve`, tm, {})).status, 409);
    assert.equal((await call('POST', `/alerts/${id}/actions`, tm,
      { performedAt: new Date().toISOString(), type: 'other' })).status, 409);
    const closed = await (await call('GET', '/alerts?state=open', tm)).json();
    assert.equal(closed.total, 0);
    const history = await pool.query(
      'SELECT from_state,to_state FROM alert_state_history WHERE alert_id=$1 ORDER BY changed_at,id',
      [alertUuids[0]]);
    assert.deepEqual(history.rows.map((row) => row.to_state),
      ['acknowledged', 'in_progress', 'resolved']);
  } finally {
    if (app) await app.close();
    if (alertUuids.length) {
      await pool.query('DELETE FROM alert_state_history WHERE alert_id=ANY($1)', [alertUuids]);
      await pool.query('DELETE FROM alert_actions WHERE alert_id=ANY($1)', [alertUuids]);
      await pool.query('DELETE FROM issues WHERE source_id=ANY($1)', [alertUuids]);
      await pool.query('DELETE FROM alerts WHERE id=ANY($1)', [alertUuids]);
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
