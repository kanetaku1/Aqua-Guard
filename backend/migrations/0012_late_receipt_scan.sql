-- Find newly completed receipts for bounded historical interval correction.
CREATE INDEX ingestion_receipts_completed_at_idx
  ON ingestion_receipts (processed_at, id)
  WHERE status = 'completed' AND processed_at IS NOT NULL;
