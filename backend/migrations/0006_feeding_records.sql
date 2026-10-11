-- One record represents one scheduled feeding round for a Pond and date.
CREATE TABLE feeding_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  cycle_id uuid REFERENCES production_cycles(id) ON DELETE RESTRICT,
  record_date date NOT NULL,
  round_no integer NOT NULL CHECK (round_no >= 1),
  feed_type text NOT NULL CHECK (length(btrim(feed_type)) > 0),
  amount_kg numeric(18, 6) NOT NULL CHECK (amount_kg > 0),
  tray_check text CHECK (tray_check IN (
    'empty_within_2h', 'leftover_under_5', 'leftover_10', 'leftover_over_20'
  )),
  note text,
  recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  UNIQUE (pond_id, record_date, round_no)
);
CREATE INDEX feeding_records_pond_date_idx
  ON feeding_records (pond_id, record_date DESC, round_no DESC);

CREATE TABLE feeding_record_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES feeding_records(id) ON DELETE RESTRICT,
  changed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now(),
  previous jsonb NOT NULL,
  current_value jsonb NOT NULL
);
CREATE INDEX feeding_record_audit_record_idx
  ON feeding_record_audit (record_id, changed_at DESC);
