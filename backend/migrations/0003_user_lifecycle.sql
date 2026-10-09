-- AdminUser audit fields required by the frontend contract.
ALTER TABLE users ADD COLUMN invited_at timestamptz;
ALTER TABLE users ADD COLUMN invited_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE users ADD COLUMN activated_at timestamptz;

-- Existing active accounts, including a bootstrapped administrator, already have a password.
UPDATE users SET activated_at = created_at
WHERE status IN ('active', 'deactivated') AND password_hash IS NOT NULL;

CREATE INDEX users_invited_by_idx ON users (invited_by_user_id)
WHERE invited_by_user_id IS NOT NULL;
