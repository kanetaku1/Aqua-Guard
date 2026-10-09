-- Initial business identities, assignments, authentication storage and IoT checkpoints.
-- Raw sensor values and device feedback belong in InfluxDB, never in these tables.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0)
);

CREATE TABLE farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name text NOT NULL,
  location text NOT NULL,
  time_zone text NOT NULL DEFAULT 'Asia/Jakarta'
    CHECK (time_zone IN ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
  status text NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0)
);
CREATE INDEX farms_company_id_idx ON farms (company_id);

CREATE TABLE ponds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
  name text NOT NULL,
  area_ha numeric(18, 6) NOT NULL CHECK (area_ha > 0),
  status text NOT NULL DEFAULT 'in_operation'
    CHECK (status IN ('in_operation', 'fallow')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0)
);
CREATE INDEX ponds_farm_id_idx ON ponds (farm_id);
CREATE UNIQUE INDEX ponds_farm_name_unique ON ponds (farm_id, lower(name));

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name text NOT NULL,
  email text NOT NULL,
  password_hash text,
  role text NOT NULL CHECK (role IN (
    'farms_manager', 'technical_manager', 'system_administrator'
  )),
  status text NOT NULL CHECK (status IN ('invited', 'active', 'deactivated')),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'id')),
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CONSTRAINT active_user_has_password CHECK (status <> 'active' OR password_hash IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
CREATE INDEX users_company_role_status_idx ON users (company_id, role, status);

CREATE TABLE user_farm_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL,
  unassigned_at timestamptz,
  CHECK (unassigned_at IS NULL OR unassigned_at > assigned_at)
);
CREATE UNIQUE INDEX user_farm_one_current_idx
  ON user_farm_assignments (user_id) WHERE unassigned_at IS NULL;
ALTER TABLE user_farm_assignments ADD CONSTRAINT user_farm_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(assigned_at, coalesce(unassigned_at, 'infinity'::timestamptz), '[)') WITH &&
  );
CREATE INDEX user_farm_assignments_farm_idx ON user_farm_assignments (farm_id);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE password_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('invite', 'reset')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX password_tokens_user_idx ON password_tokens (user_id, purpose, expires_at);

CREATE TABLE auth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_key text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL CHECK (result IN ('succeeded', 'failed', 'locked'))
);
CREATE INDEX auth_attempts_email_time_idx ON auth_attempts (email_key, attempted_at DESC);

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('sensor', 'aerator', 'pump')),
  parameter text,
  spec text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CONSTRAINT device_parameter_matches_type CHECK (
    (type = 'sensor' AND parameter IN ('do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level') AND spec IS NULL)
    OR (type IN ('aerator', 'pump') AND parameter IS NULL)
  )
);

CREATE TABLE device_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL,
  unassigned_at timestamptz,
  CHECK (unassigned_at IS NULL OR unassigned_at > assigned_at)
);
ALTER TABLE device_assignments ADD CONSTRAINT device_assignment_no_overlap
  EXCLUDE USING gist (
    device_id WITH =,
    tstzrange(assigned_at, coalesce(unassigned_at, 'infinity'::timestamptz), '[)') WITH &&
  );
CREATE INDEX device_assignments_pond_idx ON device_assignments (pond_id);

CREATE TABLE device_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('sensor', 'aerator', 'pump')),
  parameter text,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT config_parameter_matches_type CHECK (
    (type = 'sensor' AND parameter IN ('do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level'))
    OR (type IN ('aerator', 'pump') AND parameter IS NULL)
  )
);
ALTER TABLE device_config_versions ADD CONSTRAINT device_config_no_overlap
  EXCLUDE USING gist (
    device_id WITH =,
    tstzrange(effective_from, coalesce(effective_to, 'infinity'::timestamptz), '[)') WITH &&
  );

CREATE TABLE ingestion_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  event_id text NOT NULL,
  payload_hash text NOT NULL,
  observation_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  received_at timestamptz NOT NULL,
  stored_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'stored', 'completed', 'quarantined')),
  critical_evaluation_status text NOT NULL DEFAULT 'pending'
    CHECK (critical_evaluation_status IN ('pending', 'evaluated', 'skipped', 'failed')),
  critical_evaluated_at timestamptz,
  critical_policy_version_id uuid,
  evaluation_metadata jsonb,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_retry_at timestamptz,
  processed_at timestamptz,
  UNIQUE (device_id, event_id),
  CHECK (jsonb_typeof(observation_refs) = 'array')
);
-- Add the FK for critical_policy_version_id with threshold version tables in a later migration.
CREATE INDEX ingestion_receipts_pending_idx
  ON ingestion_receipts (critical_evaluation_status, next_retry_at)
  WHERE status NOT IN ('completed', 'quarantined');

CREATE TABLE sensor_sync_checkpoints (
  scope_key text PRIMARY KEY,
  last_success_at timestamptz,
  processed_through timestamptz,
  next_sync_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
