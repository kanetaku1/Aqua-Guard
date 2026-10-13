const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { BusinessScopeService } = require('../dist/business/business-scope.service');
const { ActuatorsService } = require('../dist/business/actuators.service');
const { InfluxService } = require('../dist/infrastructure/influx.service');

test('Actuator view uses observed state and commands remain safety blocked', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  const deviceId = `aerator-${suffix}`;
  const pondId = `pond-${suffix}`;
  const farmId = `farm-${suffix}`;
  let pending = Promise.resolve();
  const postgres = { pool: {
    query: (...args) => {
      const result = pending.then(() => client.query(...args));
      pending = result.then(() => {}, () => {});
      return result;
    },
    connect: async () => ({
      query: async (sql, ...args) => {
        if (sql === 'BEGIN') return client.query('SAVEPOINT actuator_command');
        if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT actuator_command');
        if (sql === 'ROLLBACK') {
          await client.query('ROLLBACK TO SAVEPOINT actuator_command');
          return client.query('RELEASE SAVEPOINT actuator_command');
        }
        return client.query(sql, ...args);
      }, release: () => {},
    }),
  } };
  const influx = { bucket: 'test', org: 'test', client: {
    getQueryApi: () => ({ collectRows: async (flux) =>
      flux.includes('actuator_feedback')
        ? [{ device_id: deviceId, pond_id: pondId,
          _time: '2026-10-12T08:00:00.000Z', state: 'off', mode: 'manual' }]
        : [{ device_id: deviceId, pond_id: pondId,
          _time: '2026-10-12T08:01:00.000Z', _value: true }] }),
  } };
  const service = new ActuatorsService(postgres, influx,
    new BusinessScopeService(postgres));
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Actuator Test','active') RETURNING id`,
    [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [farmId, company])).rows[0].id;
    const pond = (await client.query(`INSERT INTO ponds
      (public_id,farm_id,name,area_ha) VALUES ($1,$2,'Pond',1) RETURNING id`,
    [pondId, farm])).rows[0].id;
    const device = (await client.query(`INSERT INTO devices
      (device_id,type,spec) VALUES ($1,'aerator','2 HP') RETURNING id`,
    [deviceId])).rows[0].id;
    await client.query(`INSERT INTO device_assignments
      (device_id,pond_id,assigned_at)
      VALUES ($1,$2,'2026-10-01T00:00:00Z')`, [device, pond]);
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    await client.query(`INSERT INTO user_farm_assignments (user_id,farm_id,assigned_at)
      VALUES ($1,$2,'2026-10-01T00:00:00Z')`, [user, farm]);
    const tm = { role: 'technical_manager', companyId: company, userId: user };
    const view = await service.list(tm, pondId,
      new Date('2026-10-12T08:02:00Z'));
    assert.equal(view.items[0].state, 'off');
    assert.equal(view.items[0].connection, 'online');
    assert.equal(view.items[0].mode, 'manual');
    assert.equal(view.items[0].blockedCommands.length, 4);
    assert.equal(view.autoControl.status, 'stopped');
    const realInflux = new InfluxService();
    const observed = new Date();
    await realInflux.writeActuatorFeedback([{
      farmId, pondId, deviceId, receivedAt: observed, occurredAt: observed,
      state: 'on', mode: 'auto',
    }]);
    await realInflux.writeDeviceHeartbeats([{
      farmId, pondId, deviceId, receivedAt: observed, sentAt: observed,
      onlineHint: true,
    }]);
    const observedView = await new ActuatorsService(postgres, realInflux,
      new BusinessScopeService(postgres)).list(tm, pondId,
      new Date(observed.getTime() + 1_000));
    assert.equal(observedView.items[0].state, 'on');
    assert.equal(observedView.items[0].mode, 'auto');
    await assert.rejects(() => service.command(tm, deviceId,
      { command: 'turn_on' }), (error) => error.getStatus() === 409
        && error.getResponse().code === 'safety_blocked');
    assert.equal((await client.query(`SELECT count(*)::int AS n
      FROM actuator_commands WHERE device_id=$1 AND status='blocked'`,
    [device])).rows[0].n, 1);
    await assert.rejects(() => service.command(tm, deviceId,
      { command: 'invalid' }), (error) => error.getStatus() === 422);
    await client.query(`INSERT INTO actuator_logs
      (public_id,device_id,pond_id,at,command,actor_id,mode,result)
      VALUES ($1,$2,$3,current_timestamp + interval '1 second',
        'turn_off',$4,'manual','succeeded')`,
    [`log-${suffix}`, device, pond, user]);
    const logs = await service.logs(tm, pondId, { page: '1', pageSize: '10' });
    assert.equal(logs.total, 2);
    assert.equal(logs.items[0].actuatorId, deviceId);
    assert.equal(logs.items[0].actuatorName, 'Aerator 1');
    assert.equal(logs.items[0].result, 'succeeded');
    await assert.rejects(() => service.list({ ...tm, role: 'farms_manager' },
      pondId), (error) => error.getStatus() === 403);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
