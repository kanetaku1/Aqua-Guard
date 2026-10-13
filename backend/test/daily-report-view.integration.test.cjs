const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { DailyReportViewService } = require('../dist/business/daily-report-view.service');
const { BusinessScopeService } = require('../dist/business/business-scope.service');

test('Daily Report GET composes draft, scopes access and returns frozen submitted content', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const postgres = { pool: { query: (...args) => {
    const result = pending.then(() => client.query(...args));
    pending = result.then(() => {}, () => {});
    return result;
  } } };
  const scope = new BusinessScopeService(postgres);
  const ponds = { snapshot: async () => ({ ponds: [{ pond: { id: `pond-${suffix}`, name: 'Pond' },
    aerators: { on: 1, total: 1 } }], totals: { feedKg: 2, mortalityPcs: 0,
    mortalityKg: 0, reducedAppetitePonds: 0, leftoverTrayPonds: 0, healthNotedPonds: 0 } }) };
  const activity = { snapshot: async () => ({
    equipmentEvents: [], alerts: [], actions: [],
  }) };
  const water = { snapshot: async () => ({ items: [{ status: 'warning' }] }) };
  const service = new DailyReportViewService(postgres, scope, ponds, activity, water);
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'View Test','active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [`farm-${suffix}`, company])).rows[0].id;
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    await client.query(`INSERT INTO user_farm_assignments (user_id,farm_id,assigned_at)
      VALUES ($1,$2,'2026-10-01T00:00:00Z')`, [user, farm]);
    const report = (await client.query(`INSERT INTO reports
      (public_id,farm_id,type,report_date,technical_manager_id,due_at)
      VALUES ($1,$2,'daily','2026-10-12',$3,'2026-10-12T11:00:00Z') RETURNING id`,
    [`report-${suffix}`, farm, user])).rows[0].id;
    await client.query(`INSERT INTO reports
      (public_id,farm_id,type,report_date,technical_manager_id,due_at,
       status,submitted_at,submitted_by)
      VALUES ($1,$2,'daily','2026-10-11',$3,'2026-10-11T11:00:00Z',
        'submitted','2026-10-11T10:00:00Z',$3)`, [`previous-${suffix}`, farm, user]);
    await client.query(`INSERT INTO reports
      (public_id,farm_id,type,report_date,technical_manager_id,due_at)
      VALUES ($1,$2,'daily','2026-10-13',$3,'2026-10-13T11:00:00Z')`,
    [`next-${suffix}`, farm, user]);
    await client.query(`INSERT INTO daily_report_inputs
      (report_id,weather,rainfall_mm,events,summary)
      VALUES ($1,'rain',1.5,'Heavy rain','Inspect Pond')`, [report]);
    const tm = { role: 'technical_manager', companyId: company, userId: user };
    const fm = { role: 'farms_manager', companyId: company, userId: user };
    const draft = await service.get(tm, `report-${suffix}`);
    assert.equal(draft.status, 'draft');
    assert.equal(draft.farmStatus, 'warning');
    assert.deepEqual(draft.environment, {
      weather: 'rain', rainfallMm: 1.5, events: 'Heavy rain',
    });
    assert.equal(draft.summary, 'Inspect Pond');
    assert.equal(draft.previousReportId, `previous-${suffix}`);
    assert.equal(draft.nextReportId, `next-${suffix}`);
    await assert.rejects(() => service.get(fm, `report-${suffix}`),
      (error) => error.getStatus() === 404);
    await client.query(`UPDATE reports SET status='submitted',submitted_at=now(),
      submitted_by=$2 WHERE id=$1`, [report, user]);
    await client.query(`INSERT INTO report_snapshots
      (report_id,schema_version,payload,source_cutoff_at)
      VALUES ($1,'daily-v1',$2::jsonb,now())`,
    [report, JSON.stringify({ ...draft, status: 'submitted',
      submittedAt: '2026-10-12T10:00:00.000Z', summary: 'Frozen summary' })]);
    const frozen = await service.get(fm, `report-${suffix}`);
    assert.equal(frozen.status, 'submitted');
    assert.equal(frozen.summary, 'Frozen summary');
    assert.equal(frozen.farmStatus, 'warning');
    assert.equal(frozen.previousReportId, `previous-${suffix}`);
    assert.equal(frozen.nextReportId, null);
    await assert.rejects(() => service.get({ ...fm, companyId: randomUUID() },
      `report-${suffix}`), (error) => error.getStatus() === 404);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
