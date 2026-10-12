-- Editable Daily Report fields. Derived records are read from their source tables.
CREATE TABLE daily_report_inputs (
  report_id uuid PRIMARY KEY REFERENCES reports(id) ON DELETE RESTRICT,
  weather text CHECK (weather IN ('sunny', 'cloudy', 'rain', 'heavy_rain')),
  rainfall_mm numeric(18, 6) CHECK (rainfall_mm >= 0),
  events text,
  summary text
);

CREATE TABLE daily_report_pond_inputs (
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  appetite text CHECK (appetite IN ('good', 'reduced', 'poor')),
  tray text CHECK (tray IN ('clean', 'leftover', 'much_leftover')),
  mortality_note text,
  health text CHECK (health IN ('normal', 'attention', 'warning', 'critical')),
  observations text[] NOT NULL DEFAULT '{}',
  health_note text,
  PRIMARY KEY (report_id, pond_id),
  CHECK (observations <@ ARRAY['reduced_appetite', 'abnormal_swimming',
    'gill_discoloration', 'shell_condition', 'other']::text[]
    AND array_position(observations, NULL) IS NULL)
);

CREATE TABLE report_excluded_alerts (
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE RESTRICT,
  PRIMARY KEY (report_id, alert_id)
);

CREATE TABLE report_manual_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
  pond_id uuid REFERENCES ponds(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL,
  action text NOT NULL CHECK (length(btrim(action)) > 0),
  outcome text,
  sort_order integer NOT NULL CHECK (sort_order >= 0)
);
CREATE INDEX report_manual_actions_report_idx
  ON report_manual_actions (report_id, sort_order);

CREATE TABLE report_manual_equipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
  pond_id uuid REFERENCES ponds(id) ON DELETE RESTRICT,
  equipment text NOT NULL CHECK (length(btrim(equipment)) > 0),
  failure text NOT NULL CHECK (length(btrim(failure)) > 0),
  occurred_at timestamptz NOT NULL,
  action text,
  status text NOT NULL CHECK (status IN ('in_progress', 'resolved'))
);
CREATE INDEX report_manual_equipment_events_report_idx
  ON report_manual_equipment_events (report_id, occurred_at);
