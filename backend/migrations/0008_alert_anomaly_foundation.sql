-- Durable alert and anomaly events. Raw measurements remain in InfluxDB.
CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  device_id uuid REFERENCES devices(id) ON DELETE RESTRICT,
  parameter text NOT NULL CHECK (parameter IN (
    'do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level', 'sensor_offline'
  )),
  severity text NOT NULL CHECK (severity IN ('attention', 'warning', 'critical')),
  state text NOT NULL DEFAULT 'unacknowledged' CHECK (state IN (
    'unacknowledged', 'acknowledged', 'in_progress', 'resolved'
  )),
  observed_value numeric,
  threshold_value numeric,
  unit text,
  direction text CHECK (direction IN ('below', 'above')),
  threshold_set_id uuid REFERENCES threshold_sets(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  resolve_note text,
  telemetry_from timestamptz,
  telemetry_to timestamptz,
  CHECK (telemetry_to IS NULL OR telemetry_from IS NOT NULL),
  CHECK (telemetry_to IS NULL OR telemetry_to >= telemetry_from),
  CHECK (state <> 'resolved' OR resolved_at IS NOT NULL),
  CHECK (parameter <> 'sensor_offline' OR direction IS NULL)
);
CREATE INDEX alerts_pond_occurred_idx ON alerts (pond_id, occurred_at DESC);
CREATE INDEX alerts_open_idx ON alerts (pond_id, severity, occurred_at DESC)
  WHERE state <> 'resolved';

CREATE TABLE alert_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE RESTRICT,
  performed_at timestamptz NOT NULL,
  type text NOT NULL CHECK (type IN (
    'increased_aeration', 'water_exchange', 'equipment_inspection',
    'water_treatment', 'other'
  )),
  note text CHECK (note IS NULL OR length(note) <= 1000),
  recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alert_actions_alert_idx ON alert_actions (alert_id, performed_at DESC);

CREATE TABLE alert_state_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE RESTRICT,
  from_state text CHECK (from_state IN (
    'unacknowledged', 'acknowledged', 'in_progress', 'resolved'
  )),
  to_state text NOT NULL CHECK (to_state IN (
    'unacknowledged', 'acknowledged', 'in_progress', 'resolved'
  )),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX alert_state_history_alert_idx ON alert_state_history (alert_id, changed_at DESC);

CREATE TABLE sensor_anomaly_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  device_id uuid REFERENCES devices(id) ON DELETE RESTRICT,
  parameter text NOT NULL CHECK (parameter IN (
    'do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level'
  )),
  kind text NOT NULL CHECK (kind IN (
    'below_threshold', 'above_threshold', 'increasing', 'decreasing'
  )),
  severity text NOT NULL CHECK (severity IN ('attention', 'warning', 'critical')),
  unit text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  extreme_value numeric,
  change_24h numeric,
  compared_with date,
  within_range boolean NOT NULL DEFAULT false,
  threshold_set_id uuid REFERENCES threshold_sets(id) ON DELETE RESTRICT,
  alert_id uuid REFERENCES alerts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (kind IN ('below_threshold', 'above_threshold')
    OR extreme_value IS NULL),
  CHECK (kind IN ('increasing', 'decreasing')
    OR (change_24h IS NULL AND compared_with IS NULL AND NOT within_range))
);
CREATE INDEX sensor_anomaly_intervals_pond_time_idx
  ON sensor_anomaly_intervals (pond_id, started_at DESC);
CREATE INDEX sensor_anomaly_intervals_open_idx
  ON sensor_anomaly_intervals (pond_id, parameter, kind)
  WHERE ended_at IS NULL;
