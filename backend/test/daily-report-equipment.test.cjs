const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DailyReportEquipmentService } = require('../dist/business/daily-report-equipment.service');

const now = new Date('2026-10-12T08:00:00Z');
const assignedAt = new Date('2026-10-12T06:00:00Z');

function setup({ state = 'on', stateAt = '2026-10-12T07:59:00Z',
  heartbeat = true, heartbeatAt = '2026-10-12T07:59:30Z',
  assigned = assignedAt, failInflux = false } = {}) {
  const postgres = { pool: { query: async (sql) => sql.includes('FROM farms f')
    ? { rows: [{ public_id: 'farm-1', sensor_offline_after_minutes: 30 }] }
    : { rows: [{ device_id: 'aerator-1', pond_id: 'pond-1', assigned_at: assigned }] } } };
  const influx = { org: 'test', bucket: 'test', client: { getQueryApi: () => ({
    collectRows: async (flux) => {
      if (failInflux) throw new Error('Influx unavailable');
      if (flux.includes('actuator_feedback')) return [{
        pond_id: 'pond-1', device_id: 'aerator-1', _time: stateAt, _value: state,
      }];
      return [{ pond_id: 'pond-1', device_id: 'aerator-1',
        _time: heartbeatAt, _value: heartbeat }];
    },
  }) } };
  return new DailyReportEquipmentService(postgres, influx);
}

test('Daily Report counts only confirmed current aerator state', async () => {
  assert.deepEqual([...await setup().aerators('farm-uuid', now)],
    [['pond-1', { on: 1, total: 1 }]]);
  assert.deepEqual([...await setup({ state: 'fault' }).aerators('farm-uuid', now)],
    [['pond-1', { on: 0, total: 1 }]]);
});

test('Daily Report rejects disconnected, stale and previous-assignment feedback', async () => {
  for (const options of [
    { stateAt: '2026-10-12T07:59:00Z', heartbeat: false },
    { stateAt: '2026-10-12T07:00:00Z', heartbeatAt: '2026-10-12T07:00:30Z' },
    { assigned: new Date('2026-10-12T08:00:00Z') },
  ]) {
    await assert.rejects(() => setup(options).aerators('farm-uuid', now),
      (error) => error.getStatus() === 503
        && error.getResponse().code === 'telemetry_not_ready');
  }
});

test('Daily Report reports Influx failure as service unavailable', async () => {
  await assert.rejects(() => setup({ failInflux: true }).aerators('farm-uuid', now),
    (error) => error.getStatus() === 503
      && error.getResponse().code === 'storage_unavailable');
});
