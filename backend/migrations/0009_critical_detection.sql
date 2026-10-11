-- Shared episode identity for immediate Critical and later periodic processing.
CREATE TABLE alert_detection_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  parameter text NOT NULL CHECK (parameter IN (
    'do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level'
  )),
  direction text NOT NULL CHECK (direction IN ('low', 'high')),
  episode_no bigint NOT NULL DEFAULT 0 CHECK (episode_no >= 0),
  current_alert_id uuid REFERENCES alerts(id) ON DELETE RESTRICT,
  live_measured_through timestamptz,
  live_event_id text,
  critical_active boolean NOT NULL DEFAULT false,
  periodic_measured_through timestamptz,
  periodic_severity text CHECK (periodic_severity IN (
    'normal', 'attention', 'warning', 'critical'
  )),
  periodic_anomaly_started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pond_id, device_id, parameter, direction)
);
CREATE INDEX alert_detection_states_device_idx ON alert_detection_states (device_id);

ALTER TABLE alerts ADD COLUMN detection_state_id uuid
  REFERENCES alert_detection_states(id) ON DELETE RESTRICT;
ALTER TABLE alerts ADD COLUMN episode_no bigint CHECK (episode_no > 0);
ALTER TABLE alerts ADD COLUMN detection_source text
  CHECK (detection_source IN ('ingestion', 'periodic'));
ALTER TABLE alerts ADD COLUMN critical_detected_at timestamptz;
CREATE UNIQUE INDEX alerts_episode_unique
  ON alerts (detection_state_id, episode_no)
  WHERE detection_state_id IS NOT NULL AND episode_no IS NOT NULL;

CREATE TABLE alert_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE RESTRICT,
  event_kind text NOT NULL CHECK (event_kind IN ('critical_detected')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'materialized', 'failed', 'no_recipient'
  )),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,
  materialized_at timestamptz,
  last_error text,
  UNIQUE (alert_id, event_kind)
);
CREATE INDEX alert_notification_outbox_pending_idx
  ON alert_notification_outbox (next_attempt_at, detected_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE ingestion_receipts ADD CONSTRAINT ingestion_receipts_policy_fk
  FOREIGN KEY (critical_policy_version_id) REFERENCES threshold_sets(id) ON DELETE RESTRICT;
