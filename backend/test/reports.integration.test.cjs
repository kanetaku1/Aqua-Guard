const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { BusinessScopeService } = require('../dist/business/business-scope.service');
const { ReportsService } = require('../dist/business/reports.service');

async function rejected(client, sql, args, code) {
  await client.query('SAVEPOINT invalid_report_input');
  try {
    await assert.rejects(client.query(sql, args), (error) => error.code === code);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT invalid_report_input');
    await client.query('RELEASE SAVEPOINT invalid_report_input');
  }
}

test('report list follows frontend filters and hides drafts and unassigned farms', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const postgres = { pool: { query: (...args) => {
    const result = pending.then(() => client.query(...args));
    pending = result.then(() => {}, () => {});
    return result;
  } } };
  const reports = new ReportsService(postgres, new BusinessScopeService(postgres));
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Report List Test','active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    const farms = [];
    for (const letter of ['a', 'b']) {
      farms.push((await client.query(`INSERT INTO farms
        (public_id,company_id,name,location,status)
        VALUES ($1,$2,$3,'Java','active') RETURNING id`,
      [`farm-${letter}-${suffix}`, company, `Farm ${letter}`])).rows[0].id);
    }
    const pond = (await client.query(`INSERT INTO ponds
      (public_id,farm_id,name,area_ha) VALUES ($1,$2,'Pond',1) RETURNING id`,
    [`pond-${suffix}`, farms[0]])).rows[0].id;
    const users = [];
    for (const role of ['technical_manager', 'farms_manager']) {
      users.push((await client.query(`INSERT INTO users
        (public_id,company_id,name,email,password_hash,role,status)
        VALUES ($1,$2,$3,$4,'test-hash',$5,'active') RETURNING id`,
      [`${role}-${suffix}`, company, role, `${role}-${suffix}@example.invalid`, role])).rows[0].id);
    }
    await client.query(`INSERT INTO user_farm_assignments (user_id,farm_id,assigned_at)
      VALUES ($1,$2,'2026-10-01T00:00:00Z')`, [users[0], farms[0]]);
    const [tm, fm] = ['technical_manager', 'farms_manager'].map((role, i) =>
      ({ userId: users[i], companyId: company, role }));
    const inserted = await client.query(`INSERT INTO reports
      (public_id,farm_id,type,report_date,technical_manager_id,due_at)
      VALUES ($1,$2,'daily','2026-10-10',$3,'2026-10-10T11:00:00Z')
      RETURNING id`, [`draft-${suffix}`, farms[0], users[0]]);
    const draftId = inserted.rows[0].id;
    await client.query(`INSERT INTO reports
      (public_id,farm_id,type,report_date,technical_manager_id,due_at,
       status,submitted_at,submitted_by)
      VALUES ($1,$2,'daily','2026-10-09',$3,'2026-10-09T11:00:00Z',
        'submitted','2026-10-09T10:00:00Z',$3)`,
    [`submitted-${suffix}`, farms[0], users[0]]);
    await client.query(`INSERT INTO reports
      (public_id,farm_id,type,week_start,week_end,technical_manager_id,due_at)
      VALUES ($1,$2,'weekly','2026-10-05','2026-10-11',$3,
        '2026-10-06T05:00:00Z')`, [`weekly-${suffix}`, farms[1], users[0]]);
    const tmDaily = await reports.list(tm, { type: 'daily' });
    assert.equal(tmDaily.total, 2);
    assert.deepEqual(tmDaily.items.map((item) => item.id),
      [`draft-${suffix}`, `submitted-${suffix}`]);
    assert.equal(tmDaily.items[0].status, 'draft');
    assert.equal(tmDaily.items[0].submittedAt, null);
    assert.equal(tmDaily.items[0].technicalManager.id, `technical_manager-${suffix}`);
    assert.equal((await reports.list(tm, { type: 'weekly' })).total, 0);
    const fmDaily = await reports.list(fm, { type: 'daily' });
    assert.deepEqual(fmDaily.items.map((item) => item.id), [`submitted-${suffix}`]);
    assert.deepEqual(await reports.list(fm, { type: 'daily', status: 'draft' }),
      { page: 1, pageSize: 20, total: 0, items: [] });
    assert.equal((await reports.list(tm, { type: 'daily',
      from: '2026-10-10', to: '2026-10-10', pageSize: '1' })).total, 1);
    assert.equal((await reports.list(tm, { type: 'daily', page: '2', pageSize: '1' }))
      .items[0].id, `submitted-${suffix}`);
    assert.equal((await reports.list(tm, { type: 'daily',
      farmId: `farm-b-${suffix}` })).total, 0);
    await assert.rejects(reports.list(tm, { type: 'daily', from: '2026-02-30' }),
      (error) => error.getStatus() === 422);
    await assert.rejects(reports.list(tm, { type: 'daily',
      from: '2026-10-11', to: '2026-10-10' }),
    (error) => error.getStatus() === 422);
    await assert.rejects(reports.list({ ...tm, role: 'system_administrator' },
      { type: 'daily' }), (error) => error.getStatus() === 403);
    await client.query(`INSERT INTO daily_report_inputs (report_id,weather)
      VALUES ($1,'rain')`, [draftId]);
    await rejected(client, `UPDATE daily_report_inputs SET weather='storm'
      WHERE report_id=$1`, [draftId], '23514');
    await client.query(`INSERT INTO daily_report_pond_inputs
      (report_id,pond_id,appetite,tray,health,observations)
      VALUES ($1,$2,'good','clean','normal',ARRAY['other'])`, [draftId, pond]);
    await rejected(client, `UPDATE daily_report_pond_inputs
      SET observations=ARRAY['invented'] WHERE report_id=$1 AND pond_id=$2`,
    [draftId, pond], '23514');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
