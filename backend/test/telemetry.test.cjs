const assert = require('node:assert/strict');
const { test } = require('node:test');
const { toSensorPoint } = require('../dist/infrastructure/sensor-reading');
const { severityFor } = require('../dist/business/sensor-current.service');
const {
  toHeartbeatPoint,
  toActuatorFeedbackPoint,
} = require('../dist/infrastructure/device-telemetry');

const measuredAt = new Date('2026-10-01T02:03:04.000Z');
const receivedAt = new Date('2026-10-01T02:03:05.000Z');
const ids = { farmId: 'farm-a', pondId: 'pond-01', deviceId: 'sensor-01' };

test('sensor point preserves measurement time and stores event ID as a field', () => {
  const line = toSensorPoint({
    ...ids,
    parameter: 'do',
    value: 4.25,
    measuredAt,
    receivedAt,
    validity: 'valid',
    eventId: 'event-1',
  }).toLineProtocol();
  const [measurementAndTags] = line.split(' ');

  assert.match(measurementAndTags, /^sensor_readings,/);
  assert.match(measurementAndTags, /parameter=do/);
  assert.doesNotMatch(measurementAndTags, /event_id/);
  assert.match(line, /event_id="event-1"/);
  assert.match(line, /received_at_ns=1790820185000000000i/);
  assert.match(line, / 1790820184000000000$/);
});

test('heartbeat and actuator feedback use separate measurements', () => {
  const heartbeat = toHeartbeatPoint({
    ...ids, sentAt: measuredAt, receivedAt, onlineHint: true,
  }).toLineProtocol();
  const feedback = toActuatorFeedbackPoint({
    ...ids, occurredAt: measuredAt, receivedAt,
    state: 'on', commandId: 'command-1',
  }).toLineProtocol();

  assert.match(heartbeat, /^device_heartbeats,/);
  assert.match(heartbeat, /online_hint=T/);
  assert.match(feedback, /^actuator_feedback,/);
  assert.match(feedback, /command_id="command-1"/);
  assert.doesNotMatch(feedback.split(' ')[0], /command_id/);
});

test('invalid sensor input is rejected before writing', () => {
  assert.throws(() => toSensorPoint({
    ...ids, parameter: 'tan', value: 1, measuredAt, receivedAt, validity: 'valid',
  }), /Unsupported sensor parameter/);
  assert.throws(() => toSensorPoint({
    ...ids, parameter: 'do', value: Number.NaN, measuredAt, receivedAt, validity: 'valid',
  }), /Sensor value must be finite/);
});

test('severity uses frontend boundary rules for low, high and Vibrio values', () => {
  const doThreshold = { parameter: 'do', criticalLow: 3.5, warningLow: 4.5,
    attentionLow: 5, attentionHigh: null, warningHigh: null, criticalHigh: null };
  const tanThreshold = { parameter: 'tan', criticalLow: null, warningLow: null,
    attentionLow: null, attentionHigh: 1, warningHigh: 2, criticalHigh: null };
  const vibrioThreshold = { ...tanThreshold, parameter: 'vibrio',
    attentionHigh: 5, warningHigh: 10 };
  assert.equal(severityFor(5, doThreshold), 'normal');
  assert.equal(severityFor(4.5, doThreshold), 'attention');
  assert.equal(severityFor(3.5, doThreshold), 'warning');
  assert.equal(severityFor(3.49, doThreshold), 'critical');
  assert.equal(severityFor(1, tanThreshold), 'normal');
  assert.equal(severityFor(2, tanThreshold), 'attention');
  assert.equal(severityFor(5, vibrioThreshold), 'attention');
  assert.equal(severityFor(10, vibrioThreshold), 'warning');
});
