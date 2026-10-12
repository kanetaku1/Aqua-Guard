-- Editable Weekly Report fields. Derived values remain in their source stores
-- until submission freezes the response in report_snapshots.
CREATE TABLE weekly_report_inputs (
  report_id uuid PRIMARY KEY REFERENCES reports(id) ON DELETE RESTRICT,
  farm_condition text CHECK (farm_condition IN
    ('normal', 'attention', 'warning', 'critical')),
  water_quality_comment text,
  technical_summary text
);

CREATE TABLE weekly_report_alert_notes (
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE RESTRICT,
  cause text,
  action text,
  outcome text,
  PRIMARY KEY (report_id, alert_id)
);
CREATE INDEX weekly_report_alert_notes_alert_idx
  ON weekly_report_alert_notes (alert_id);

CREATE TABLE weekly_report_major_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
  action_date date NOT NULL,
  pond_id uuid REFERENCES ponds(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (length(btrim(action)) > 0),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  UNIQUE (report_id, sort_order)
);
CREATE INDEX weekly_report_major_actions_report_idx
  ON weekly_report_major_actions (report_id, sort_order);
