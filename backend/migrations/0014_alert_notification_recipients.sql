-- Durable per-user notification records. Materialized means persisted, not delivered.
CREATE TABLE alert_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES alert_notification_outbox(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  read_at timestamptz,
  UNIQUE (outbox_id, user_id),
  CHECK (read_at IS NULL OR received_at IS NOT NULL)
);
CREATE INDEX alert_notifications_user_created_idx
  ON alert_notifications (user_id, created_at DESC);
