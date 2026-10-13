-- Permanent MQTT payload failures are acknowledged after they are recorded.
CREATE TABLE mqtt_rejected_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  payload_sha256 text NOT NULL CHECK (length(payload_sha256) = 64),
  payload_bytes integer NOT NULL CHECK (payload_bytes >= 0),
  reason_code text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  rejected_count integer NOT NULL DEFAULT 1 CHECK (rejected_count > 0),
  UNIQUE (topic, payload_sha256)
);
