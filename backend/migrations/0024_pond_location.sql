-- Pond position for the TM Dashboard map. A point for now; a GeoJSON outline may follow.
-- Existing Ponds have no position, so both columns stay nullable but are set together.
ALTER TABLE ponds
  ADD COLUMN latitude numeric(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN longitude numeric(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT ponds_location_pair CHECK ((latitude IS NULL) = (longitude IS NULL));
