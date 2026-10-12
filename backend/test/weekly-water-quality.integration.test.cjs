const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { WeeklyWaterQualityService } = require('../dist/business/weekly-water-quality.service');

test('weekly water quality uses WIB boundaries and distinct out-of-range days', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const postgres = { pool: { query: (...args) => {
    const result = pending.then(() => client.query(...args));
    pending = result.then(() => {}, () => {});
    return result;
  } } };
  let pondId;
  let points = [];
  const influx = { org: 'test', bucket: 'test', client: {
    getQueryApi: () => ({ collectRows: async (flux) => {
      assert.match(flux, /2026-10-11T17:00:00\.000Z/);
      assert.match(flux, /2026-10-18T17:00:00\.000Z/);
      return points;
    } }),
  } };
  const thresholds = { effectiveThreshold: async (_company, _farm, parameter) => {
    const values = {
      do: [3.5, 4.5, 5, null, null, null],
      ph: [7, 7.3, 7.5, 8.5, 8.7, 9],
      temperature: [24, 26, 26.5, 30.5, 31, 33],
    }[parameter];
    return { parameter, criticalLow: values[0], warningLow: values[1],
      attentionLow: values[2], attentionHigh: values[3],
      warningHigh: values[4], criticalHigh: values[5] };
  } };
  const service = new WeeklyWaterQualityService(postgres, influx, thresholds);
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Weekly Water Test','active') RETURNING id`,
    [`company-${suffix}`])).rows[0].id;
    const farmId = `farm-${suffix}`;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [farmId, company])).rows[0].id;
    pondId = `pond-${suffix}`;
    const pond = (await client.query(`INSERT INTO ponds
      (public_id,farm_id,name,area_ha) VALUES ($1,$2,'Pond',1) RETURNING id`,
    [pondId, farm])).rows[0].id;
    await client.query(`INSERT INTO alerts
      (public_id,pond_id,parameter,severity,occurred_at)
      VALUES ($1,$2,'do','warning','2026-10-12T00:00:00Z')`,
    [`alert-${suffix}`, pond]);
    const reading = (day, parameter, value) => ({ pond_id: pondId, parameter,
      value, _time: day });
    points = [
      reading('2026-10-12T00:00:00Z', 'do', 5.5),
      reading('2026-10-12T00:00:00Z', 'ph', 7.8),
      reading('2026-10-12T00:00:00Z', 'temperature', 29),
      reading('2026-10-13T00:00:00Z', 'do', 4.3),
      reading('2026-10-13T00:00:00Z', 'ph', 8.1),
      reading('2026-10-13T00:00:00Z', 'temperature', 30.6),
    ];
    const rows = await service.snapshot(company, farm, farmId,
      'Asia/Jakarta', '2026-10-12');
    assert.equal(rows.length, 1);
    const water = rows[0].waterQuality;
    assert.equal(water.doMin, 4.3);
    assert.equal(water.phMin, 7.8);
    assert.equal(water.phMax, 8.1);
    assert.equal(water.temperatureMax, 30.6);
    assert.equal(water.outOfRangeDays, 1);
    assert.equal(water.alertCount, 1);
    assert.equal(water.severity.doMin, 'warning');
    assert.equal(water.severity.temperatureMax, 'attention');
    assert.equal(water.trend, 'increasing');
    assert.equal(water.trendParameter, 'temperature');
    points = points.filter((point) => point.parameter !== 'do');
    await assert.rejects(() => service.snapshot(company, farm, farmId,
      'Asia/Jakarta', '2026-10-12'), (error) => error.getStatus() === 503);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
