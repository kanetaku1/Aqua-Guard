-- One offline episode per assigned sensor and Pond. Alert lifecycle remains separate.
CREATE TABLE sensor_offline_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  current_alert_id uuid REFERENCES alerts(id) ON DELETE RESTRICT,
  episode_no bigint NOT NULL DEFAULT 0 CHECK (episode_no >= 0),
  offline_active boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  last_checked_at timestamptz,
  UNIQUE (pond_id, device_id),
  CHECK (NOT offline_active OR current_alert_id IS NOT NULL)
);
