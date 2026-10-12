-- Device heartbeat and actuator feedback delivery ledger.
CREATE TABLE device_telemetry_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('heartbeat', 'feedback')),
  event_id text NOT NULL,
  payload_hash text NOT NULL CHECK (length(payload_hash) = 64),
  observed_at timestamptz NOT NULL,
  farm_public_id text NOT NULL,
  pond_public_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'stored', 'quarantined')),
  received_at timestamptz NOT NULL DEFAULT now(),
  stored_at timestamptz,
  UNIQUE (device_id, kind, event_id)
);
CREATE INDEX device_telemetry_receipts_pending_idx
  ON device_telemetry_receipts (received_at) WHERE status = 'pending';
