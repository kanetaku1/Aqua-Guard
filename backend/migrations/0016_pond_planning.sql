-- Sources for existing PondDetail fields; no new public write API is implied.
ALTER TABLE production_cycles ADD CONSTRAINT production_cycles_identity_date_unique
  UNIQUE (id, pond_id, started_on);

CREATE TABLE stocking_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  cycle_id uuid NOT NULL UNIQUE,
  pond_id uuid NOT NULL,
  stocked_on date NOT NULL,
  stocked_pl integer NOT NULL CHECK (stocked_pl > 0),
  initial_biomass_kg numeric(18, 6) CHECK (initial_biomass_kg >= 0),
  recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (cycle_id, pond_id, stocked_on)
    REFERENCES production_cycles(id, pond_id, started_on) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX stocking_records_pond_date_idx ON stocking_records (pond_id, stocked_on DESC);

CREATE TABLE feeding_plan_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  plan_date date NOT NULL,
  round_no integer NOT NULL CHECK (round_no > 0),
  scheduled_at time NOT NULL,
  feed_type text NOT NULL CHECK (length(btrim(feed_type)) > 0),
  amount_kg numeric(18, 6) NOT NULL CHECK (amount_kg > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pond_id, plan_date, round_no),
  UNIQUE (pond_id, plan_date, scheduled_at)
);
CREATE INDEX feeding_plan_rounds_pond_date_idx
  ON feeding_plan_rounds (pond_id, plan_date, round_no);
