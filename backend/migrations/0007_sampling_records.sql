CREATE TABLE sampling_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  cycle_id uuid NOT NULL REFERENCES production_cycles(id) ON DELETE RESTRICT,
  sample_date date NOT NULL,
  sample_count integer CHECK (sample_count >= 1),
  sample_weight_g numeric(18, 6) CHECK (sample_weight_g >= 0),
  tan numeric(18, 6) CHECK (tan >= 0),
  no2 numeric(18, 6) CHECK (no2 >= 0),
  vibrio numeric(18, 6) CHECK (vibrio >= 0),
  alkalinity numeric(18, 6) CHECK (alkalinity >= 0),
  note text,
  recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK ((sample_count IS NULL) = (sample_weight_g IS NULL)),
  UNIQUE (pond_id, sample_date)
);
CREATE INDEX sampling_records_cycle_date_idx ON sampling_records (cycle_id, sample_date DESC);

CREATE TABLE sampling_record_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES sampling_records(id) ON DELETE RESTRICT,
  changed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now(),
  previous jsonb NOT NULL,
  current_value jsonb NOT NULL
);
CREATE INDEX sampling_record_audit_record_idx ON sampling_record_audit (record_id, changed_at DESC);
