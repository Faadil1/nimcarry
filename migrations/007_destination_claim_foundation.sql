BEGIN;

-- Destination Claim foundation:
-- missions may be created before the human destination has bound a Nimiq wallet.
ALTER TABLE missions
  ALTER COLUMN target_wallet_ciphertext DROP NOT NULL,
  ALTER COLUMN target_wallet_hmac DROP NOT NULL;

ALTER TABLE missions
  DROP CONSTRAINT IF EXISTS missions_target_consent_confirmed_check;

CREATE TABLE destination_claims (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL UNIQUE REFERENCES missions(id) ON DELETE CASCADE,
  claim_token_hash text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('PENDING','BOUND','EXPIRED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  bound_wallet_normalized text,
  bound_at timestamptz,
  CHECK (
    (status = 'BOUND' AND bound_wallet_normalized IS NOT NULL AND bound_at IS NOT NULL)
    OR status <> 'BOUND'
  )
);

CREATE INDEX destination_claim_status_expiry
  ON destination_claims (status, expires_at);

ALTER TABLE pass_intents
  ALTER COLUMN invitation_id DROP NOT NULL;

ALTER TABLE hops
  ALTER COLUMN invitation_id DROP NOT NULL;

COMMIT;
