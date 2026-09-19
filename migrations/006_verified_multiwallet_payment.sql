BEGIN;

ALTER TABLE pass_intents
  ADD COLUMN authorized_payment_wallets text[];

UPDATE pass_intents
SET authorized_payment_wallets = ARRAY[current_holder_wallet_normalized]
WHERE authorized_payment_wallets IS NULL;

ALTER TABLE pass_intents
  ALTER COLUMN authorized_payment_wallets SET NOT NULL;

ALTER TABLE pass_intents
  ADD CONSTRAINT pass_intents_payment_wallets_nonempty
  CHECK (cardinality(authorized_payment_wallets) >= 1);

ALTER TABLE pass_intents
  ADD CONSTRAINT pass_intents_holder_in_payment_wallets
  CHECK (current_holder_wallet_normalized = ANY(authorized_payment_wallets));

COMMIT;
