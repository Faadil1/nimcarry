# Nimiq Pay TESTNET payment-identity hypothesis — 2026-09-16

## Status

Classification: `PAYMENT_IDENTITY_MAPPING_HYPOTHESIS_NOT_YET_CONFIRMED`

The real-payment gate remains **CLOSED**. This document does not change custody rules and does not authorize another NimCarry baton send.

## New evidence

A Mini Apps Competition community thread about Nimiq Pay TESTNET reports the following behavior:

- faucet funds sent to a Nimiq Pay deposit/basic account can be swept into an HTLC used by Nimiq Pay's outgoing payment rails;
- the thread distinguishes a deposit/local basic address from an HTLC/payment address used for outgoing payments;
- participants report that this is intended Nimiq Pay behavior rather than a faucet failure.

This is community evidence, not an official API contract. It is therefore a hypothesis input, not proof of NimCarry's exact failure mode.

Thread supplied during validation:

- `https://www.skool.com/miniappscompetition/testalbatross-testnet-htlc-issue?p=41cfa32f`

## Why it matters to NimCarry

NimCarry currently treats the mission holder address as the exact sender that must appear on-chain. `validateTransactionAgainstIntent()` rejects any transaction whose `tx.from` differs from `intent.currentHolder`.

That is the strongest fail-closed model when the wallet identity and the on-chain sender are the same address. If Nimiq Pay's outgoing rail can legitimately originate from a distinct payment/HTLC address, that equality may be too strong for Nimiq Pay even while the user remains the same authorized human wallet holder.

A second related difference was identified during reference comparison:

- the official Nimiq Provider API documents `fee` and `validityStartHeight` as optional for `sendBasicTransactionWithData()` and says the method returns a transaction-hash string;
- NimCarry currently requests an explicit `fee: 0` and its browser wrapper fills a current `validityStartHeight` when absent;
- the public Nimble competition project uses `sendBasicTransactionWithData({ recipient, value, data })` without explicitly supplying `fee` or `validityStartHeight`.

None of these observations alone proves the root cause of the 2026-09-15 no-hash attempt.

References:

- Official provider contract: `https://nimiq.dev/mini-apps/api-reference/nimiq-provider`
- Public reference implementation: `https://github.com/gallareton/nimble/blob/main/apps/web/src/wallet/miniAppProvider.ts`

## What remains proven from the failed NimCarry mission

The prior controlled mission still has the same evidence boundary:

- Nimiq Pay showed the native approval UI for the canonical 1 NIM request and opaque commitment;
- no canonical transaction hash was returned to NimCarry;
- exact-match reconciliation did not establish a valid FINAL A→B transaction before the intent expired;
- custody therefore remained with A;
- verified route remained at 0 FINAL handoffs;
- B→C was not attempted.

Do not rewrite that historical result as a successful broadcast.

## Diagnostic question

We now need to answer one narrow question before changing sender semantics:

> For a normal FINAL TESTNET transfer initiated by the same Nimiq Pay user, is the actual on-chain `from` address one of the addresses returned by Mini App `listAccounts()`, or is it a distinct Nimiq Pay payment/HTLC address?

Possible outcomes:

1. `MATCHES_LISTED_ACCOUNT`
   - the current sender-equality assumption survives this diagnostic;
   - investigate provider request shape / Nimiq Pay submission behavior next.
2. `DIFFERS_FROM_LISTED_ACCOUNTS`
   - do **not** simply remove sender verification;
   - establish a cryptographically or wallet-authoritatively bound mapping from holder identity to authorized payment address before changing canonical custody validation.
3. No FINAL native transfer / no hash
   - the provider environment remains unhealthy;
   - keep the real-payment gate closed and do not spend a NimCarry baton attempt.

## Tooling added

Run the new read-only chain diagnostic after a plain native Nimiq Pay TESTNET transfer has a transaction hash:

```bash
npm run diagnose:testnet-payment-identity -- \
  --hash <64-hex-hash> \
  --listed-account '<address returned by listAccounts()>' \
  --recipient '<known recipient NQ address>' \
  --luna <known amount>
```

Repeat `--listed-account` if Nimiq Pay returns more than one account.

The tool:

- verifies TESTNET head advancement;
- reads the transaction from the chain;
- optionally enforces expected recipient/value/data;
- waits for independent macro-block FINAL;
- reports only shortened addresses;
- classifies the observed sender relative to the supplied `listAccounts()` identities;
- **does not** treat a sender mismatch as permission to advance custody.

## Next controlled test

Do **not** use the existing NimCarry mission for this diagnostic.

Use one plain native Nimiq Pay TESTNET transfer to a regular TESTNET basic account, outside NimCarry. Capture:

- Nimiq Pay app/version;
- TESTNET confirmation;
- exact `listAccounts()` result from the same Nimiq Pay session;
- recipient and amount;
- returned/copied transaction hash;
- independent FINAL chain result.

Only after that control is classified should we decide whether the next patch concerns:

- payment-address identity mapping;
- provider request-shape compatibility (`fee` / `validityStartHeight`);
- or an unresolved external provider failure.

## Security boundary

The required fix, if a distinct payment address is confirmed, is **not** “accept any sender.”

The target model would be:

`authorized human holder identity -> wallet-proven outgoing payment address -> exact FINAL transaction`

The route must still enforce exact recipient, exact 1 NIM value, exact opaque hop commitment, unique match, independent FINAL, and no blind retry.
