-- Company-scoped configuration versions. Past versions remain available for later alert/KPI audits.
CREATE TABLE threshold_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  farm_id uuid REFERENCES farms(id) ON DELETE RESTRICT,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE UNIQUE INDEX threshold_default_current_unique ON threshold_sets (company_id)
  WHERE farm_id IS NULL AND effective_to IS NULL;
CREATE UNIQUE INDEX threshold_farm_current_unique ON threshold_sets (farm_id)
  WHERE farm_id IS NOT NULL AND effective_to IS NULL;
CREATE INDEX threshold_sets_history_idx ON threshold_sets (company_id, farm_id, effective_from DESC);

CREATE TABLE threshold_values (
  set_id uuid NOT NULL REFERENCES threshold_sets(id) ON DELETE RESTRICT,
  parameter text NOT NULL CHECK (parameter IN (
    'do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level',
    'tan', 'no2', 'vibrio', 'alkalinity'
  )),
  unit text NOT NULL,
  critical_low numeric,
  warning_low numeric,
  attention_low numeric,
  attention_high numeric,
  warning_high numeric,
  critical_high numeric,
  PRIMARY KEY (set_id, parameter)
);

CREATE TABLE growth_target_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  on_track_band_pct numeric NOT NULL CHECK (on_track_band_pct BETWEEN 1 AND 50),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE UNIQUE INDEX growth_target_current_unique ON growth_target_sets (company_id)
  WHERE effective_to IS NULL;
CREATE INDEX growth_target_history_idx ON growth_target_sets (company_id, effective_from DESC);
CREATE TABLE growth_target_points (
  set_id uuid NOT NULL REFERENCES growth_target_sets(id) ON DELETE RESTRICT,
  doc integer NOT NULL CHECK (doc >= 0),
  target_abw_g numeric NOT NULL CHECK (target_abw_g > 0),
  PRIMARY KEY (set_id, doc)
);

CREATE TABLE operational_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  daily_report_due time NOT NULL,
  weekly_report_due_weekday smallint NOT NULL CHECK (weekly_report_due_weekday BETWEEN 1 AND 7),
  weekly_report_due_time time NOT NULL,
  sensor_delayed_after_minutes integer NOT NULL CHECK (sensor_delayed_after_minutes > 0),
  sensor_offline_after_minutes integer NOT NULL CHECK (sensor_offline_after_minutes > sensor_delayed_after_minutes),
  attention_to_alert_minutes integer NOT NULL CHECK (attention_to_alert_minutes > 0),
  production_attention_pct numeric NOT NULL CHECK (production_attention_pct >= 0),
  production_warning_pct numeric NOT NULL CHECK (production_warning_pct > production_attention_pct),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE UNIQUE INDEX operational_rules_current_unique ON operational_rule_versions (company_id)
  WHERE effective_to IS NULL;
CREATE INDEX operational_rules_history_idx ON operational_rule_versions (company_id, effective_from DESC);
