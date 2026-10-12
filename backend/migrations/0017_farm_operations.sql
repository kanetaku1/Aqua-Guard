-- Internal sources for the fields required by OperationalStatus.
-- These records are maintained by backend operations; the frontend contract has no write API.
CREATE TABLE farm_generator_states (
  farm_id uuid PRIMARY KEY REFERENCES farms(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('standby', 'running', 'fault')),
  observed_at timestamptz NOT NULL,
  last_tested_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (last_tested_at IS NULL OR last_tested_at <= observed_at)
);

CREATE TABLE farm_sampling_schedule (
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
  scheduled_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (farm_id, scheduled_on)
);
