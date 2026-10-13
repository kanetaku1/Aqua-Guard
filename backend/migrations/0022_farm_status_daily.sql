-- Preserve the worst observed Farm status for each local calendar day.
-- Missing days are deliberately not filled with a fabricated normal state.
CREATE TABLE farm_status_daily (
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
  status_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('normal','attention','warning','critical')),
  water_quality text NOT NULL CHECK (water_quality IN
    ('normal','attention','warning','critical')),
  growth text NOT NULL CHECK (growth IN ('normal','attention','warning','critical')),
  operations text NOT NULL CHECK (operations IN
    ('normal','attention','warning','critical')),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (farm_id,status_date)
);
