-- FM-facing stable identity for an Alert, without copying sensor measurements.
CREATE TABLE issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  issue_type text NOT NULL CHECK (issue_type IN (
    'water_quality', 'mortality', 'equipment', 'sensor'
  )),
  parameter text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('attention', 'warning', 'critical')),
  trend text NOT NULL CHECK (trend IN ('increasing', 'decreasing', 'stable')),
  state text NOT NULL CHECK (state IN ('ongoing', 'resolved')),
  source_type text NOT NULL CHECK (source_type = 'alert'),
  source_id uuid NOT NULL REFERENCES alerts(id) ON DELETE RESTRICT,
  since timestamptz NOT NULL,
  resolved_at timestamptz,
  summary text,
  trend_description text,
  UNIQUE (source_type, source_id),
  CHECK (state <> 'resolved' OR resolved_at IS NOT NULL)
);
CREATE INDEX issues_farm_state_severity_idx ON issues (farm_id, state, severity, since);
CREATE INDEX issues_pond_idx ON issues (pond_id, since DESC);

-- Give Alerts created before this migration a stable Issue ID as well.
INSERT INTO issues (public_id, farm_id, pond_id, issue_type, parameter,
  severity, trend, state, source_type, source_id, since, resolved_at)
SELECT 'ISS-' || gen_random_uuid()::text, p.farm_id, a.pond_id,
  CASE WHEN a.parameter = 'sensor_offline' THEN 'sensor' ELSE 'water_quality' END,
  a.parameter, a.severity,
  CASE WHEN a.direction = 'below' THEN 'decreasing'
    WHEN a.direction = 'above' THEN 'increasing' ELSE 'stable' END,
  CASE WHEN a.state = 'resolved' THEN 'resolved' ELSE 'ongoing' END,
  'alert', a.id, a.occurred_at, a.resolved_at
FROM alerts a JOIN ponds p ON p.id = a.pond_id;
