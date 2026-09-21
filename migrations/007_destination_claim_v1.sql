BEGIN;

-- Destination Claim v1:
-- a mission may be created before its destination wallet is known. The target
-- wallet remains private and is bound only after the destination signs a
-- mission-scoped CLAIM_DESTINATION challenge.

ALTER TABLE missions
  ALTER COLUMN target_wallet_ciphertext DROP NOT NULL,
  ALTER COLUMN target_wallet_hmac DROP NOT NULL;

ALTER TABLE missions
  DROP CONSTRAINT IF EXISTS missions_target_consent_confirmed_check;

ALTER TABLE missions
  ADD CONSTRAINT missions_target_binding_consistency CHECK (
    (
      target_wallet_ciphertext IS NULL
      AND target_wallet_hmac IS NULL
      AND target_consent_confirmed = false
    )
    OR
    (
      target_wallet_ciphertext IS NOT NULL
      AND target_wallet_hmac IS NOT NULL
      AND target_consent_confirmed = true
    )
  );

CREATE TABLE destination_claims (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  claim_token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','CLAIMED','EXPIRED','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  closed_at timestamptz,
  claimed_wallet_normalized text,
  CHECK (
    (status = 'CLAIMED' AND claimed_at IS NOT NULL AND claimed_wallet_normalized IS NOT NULL)
    OR status <> 'CLAIMED'
  )
);

CREATE UNIQUE INDEX one_pending_destination_claim_per_mission
  ON destination_claims (mission_id)
  WHERE status = 'PENDING';

CREATE INDEX destination_claims_mission_lookup
  ON destination_claims (mission_id, created_at DESC);

-- Direct claimed-destination delivery has no bridge invitation. Keep the
-- existing invitation FK for introduced routes, but permit NULL for direct
-- claim flows.
ALTER TABLE pass_intents
  ALTER COLUMN invitation_id DROP NOT NULL;

ALTER TABLE hops
  ALTER COLUMN invitation_id DROP NOT NULL;

COMMIT;
