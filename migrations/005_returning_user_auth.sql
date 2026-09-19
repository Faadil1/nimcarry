BEGIN;

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS user_sessions_user_idx
  ON user_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_login_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS user_login_challenges_user_idx
  ON user_login_challenges(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_login_challenges_expiry_idx
  ON user_login_challenges(expires_at);

COMMIT;
