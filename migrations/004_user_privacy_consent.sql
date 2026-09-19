BEGIN;

ALTER TABLE users
  ADD COLUMN privacy_notice_version text,
  ADD COLUMN privacy_consent_at timestamptz;

ALTER TABLE users
  ADD CONSTRAINT users_privacy_consent_pair
  CHECK (
    (privacy_notice_version IS NULL AND privacy_consent_at IS NULL)
    OR
    (privacy_notice_version IS NOT NULL AND privacy_consent_at IS NOT NULL)
  );

COMMIT;
