BEGIN;

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  revoked_at timestamptz
);

INSERT INTO user_sessions (token_hash, user_id, created_at, last_seen_at)
SELECT profile_token_hash, id, created_at, last_seen_at
FROM users
ON CONFLICT (token_hash) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
  ON user_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_login_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_login_challenges_user
  ON user_login_challenges(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_login_challenges_expiry
  ON user_login_challenges(expires_at);

COMMIT;
