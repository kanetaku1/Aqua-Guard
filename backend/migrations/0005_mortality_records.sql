-- Production-cycle identity and the first field record. The public API follows the frontend
-- MortalityInput/RecordMeta names; cycle assignment can be added when stocking is available.
CREATE TABLE production_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  started_on date NOT NULL,
  ended_on date,
  status text NOT NULL CHECK (status IN ('active', 'closed')),
  CHECK (ended_on IS NULL OR ended_on >= started_on),
  CHECK ((status = 'active') = (ended_on IS NULL))
);
CREATE UNIQUE INDEX production_cycles_one_active_idx
  ON production_cycles (pond_id) WHERE status = 'active';
CREATE INDEX production_cycles_pond_date_idx
  ON production_cycles (pond_id, started_on DESC);

CREATE TABLE mortality_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  cycle_id uuid REFERENCES production_cycles(id) ON DELETE RESTRICT,
  record_date date NOT NULL,
  count integer NOT NULL CHECK (count >= 0),
  weight_kg numeric(18, 6) NOT NULL CHECK (weight_kg >= 0),
  observation text CHECK (observation IN (
    'routine_check', 'low_do', 'disease_signs', 'molting', 'other'
  )),
  note text,
  recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0)
);
CREATE INDEX mortality_records_pond_date_idx
  ON mortality_records (pond_id, record_date DESC, created_at DESC);

CREATE TABLE mortality_record_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES mortality_records(id) ON DELETE RESTRICT,
  changed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now(),
  previous jsonb NOT NULL,
  current_value jsonb NOT NULL
);
CREATE INDEX mortality_record_audit_record_idx
  ON mortality_record_audit (record_id, changed_at DESC);
