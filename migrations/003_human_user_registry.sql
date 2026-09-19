BEGIN;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email_normalized text NOT NULL UNIQUE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  profile_token_hash text NOT NULL UNIQUE,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email_normalized = lower(email_normalized)),
  CHECK (position('@' in email_normalized) > 1)
);

CREATE TABLE user_wallets (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_normalized text NOT NULL UNIQUE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, wallet_normalized)
);

CREATE TABLE user_wallet_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_normalized text NOT NULL,
  nonce_hash text NOT NULL UNIQUE,
  canonical_message text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_wallets_user_id_idx ON user_wallets (user_id);
CREATE INDEX user_wallet_challenges_user_idx ON user_wallet_challenges (user_id, expires_at);
CREATE INDEX users_created_at_idx ON users (created_at);

CREATE VIEW participant_users AS
SELECT
  p.mission_id,
  p.wallet_normalized,
  p.display_label,
  p.display_name_opt_in,
  p.first_final_sequence,
  p.joined_at,
  uw.user_id
FROM participants p
LEFT JOIN user_wallets uw ON uw.wallet_normalized = p.wallet_normalized;

COMMIT;
