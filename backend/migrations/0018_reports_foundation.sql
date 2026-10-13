-- Report identity and lifecycle, shared by Daily and Weekly reports.
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('daily', 'weekly')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  report_date date,
  week_start date,
  week_end date,
  technical_manager_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  due_at timestamptz NOT NULL,
  saved_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK ((type = 'daily' AND report_date IS NOT NULL
      AND week_start IS NULL AND week_end IS NULL)
    OR (type = 'weekly' AND report_date IS NULL
      AND week_start IS NOT NULL AND week_end IS NOT NULL AND week_end = week_start + 6
      AND extract(isodow FROM week_start) = 1)),
  CHECK ((status = 'draft' AND submitted_at IS NULL AND submitted_by IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND submitted_by IS NOT NULL))
);
CREATE UNIQUE INDEX reports_farm_daily_unique ON reports (farm_id, report_date)
  WHERE type = 'daily';
CREATE UNIQUE INDEX reports_farm_weekly_unique ON reports (farm_id, week_start)
  WHERE type = 'weekly';
CREATE INDEX reports_farm_submitted_idx ON reports (farm_id, submitted_at DESC)
  WHERE status = 'submitted';
