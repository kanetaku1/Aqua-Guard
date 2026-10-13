-- Freeze submitted report responses so later source records cannot rewrite history.
CREATE TABLE report_snapshots (
  report_id uuid PRIMARY KEY REFERENCES reports(id) ON DELETE RESTRICT,
  schema_version text NOT NULL,
  payload jsonb NOT NULL,
  source_cutoff_at timestamptz NOT NULL,
  influx_queried_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(payload) = 'object')
);
