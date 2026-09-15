# Nimiq Pay TESTNET provider diagnostic — 2026-09-15

## Purpose

This record narrows the unresolved real-device A→B failure after NimCarry's fail-closed submission hardening. It separates what NimCarry controls from what is now independently observable outside NimCarry.

## NimCarry evidence boundary

The controlled real TESTNET mission `bb654316-96c3-4c1e-9886-0c61771ecf22` reached the native Nimiq Pay approval sheet for the exact canonical baton transfer, but Nimiq Pay returned no provable transaction hash. NimCarry then:

- did not treat approval as broadcast;
- independently reconciled sender + recipient + `100000` Luna + the exact opaque `co:v1:` commitment;
- recovered no exact on-chain match before the intent expired;
- kept the verified route at `0 FINAL`;
- kept custody at A;
- blocked a blind duplicate send.

The live attempt is therefore classified operationally as `NOT_BROADCAST / INVALID`, meaning no exact matching broadcast was discovered and accepted by NimCarry before expiry. It does not claim privileged knowledge of Nimiq Pay internals.

## Official API contract check

Nimiq's current Developer Center documents `sendBasicTransactionWithData` with the same relevant contract NimCarry uses:

- one request object;
- `recipient: string`;
- `value` in Luna;
- `data: string`;
- optional `fee`;
- optional `validityStartHeight`;
- successful return value: transaction-hash `string`.

The Nimiq transaction guide also documents zero-fee basic transactions as valid for most transactions and recommends the current head height as a valid `validityStartHeight`.

NimCarry currently supplies exactly `100000` Luna, explicit fee `0`, an opaque ASCII `co:v1:` payload below the 64-byte data ceiling, and a current block height when the wallet request did not already include one.

References:

- https://www.nimiq.dev/mini-apps/api-reference/nimiq-provider
- https://nimiq.dev/web-client/guides/send-transactions

## Independent reproduction outside NimCarry

A separate Mini Apps Competition community report documents Nimiq Pay **2.19.1** on TESTNET failing a normal wallet-to-wallet transfer from Nimiq Pay's own send screen with `Failed to send payment transaction: Bad Request` after the native confirmation was approved.

Crucially, that reproduction explicitly states:

- no Mini App was involved in the plain-wallet reproduction;
- the confirmation sheet showed the expected recipient and amount;
- failure happened after approval;
- balance and amount were ruled out;
- TESTNET chain health was independently observed as advancing;
- the same environment also failed through `sendBasicTransactionWithData`.

Reference:

- https://www.skool.com/miniappscompetition/testnet-plain-wallet-to-wallet-transfer-fails-with-bad-request-nimiq-pay-2191

This is independent corroboration that the observed failure class is not unique to NimCarry's transaction payload or Mini App integration.

## Version context

The public App Store version history lists Nimiq Pay `2.19.1` as the current release in the relevant August 2026 window. Its release notes describe readiness for the latest Nimiq network upgrade but do not document a TESTNET send fix.

Reference:

- https://apps.apple.com/us/app/nimiq-pay/id6471844738

## Diagnostic conclusion

The strongest defensible classification is now:

`EXTERNALLY_CORROBORATED_NIMIQ_PAY_TESTNET_SUBMISSION_REGRESSION_NOT_OFFICIALLY_CONFIRMED`

Why this is stronger than the previous wording:

1. NimCarry's request shape matches the current documented Mini App provider contract.
2. NimCarry's own real-device failure occurs after approval and yields no recoverable exact-chain match.
3. An independent report reproduces a closely matching post-approval TESTNET submission failure in Nimiq Pay's own native wallet send path, without any Mini App involved.

What is still **not** proven:

- Nimiq has not officially confirmed the root cause;
- this evidence does not identify the exact internal component that rejects submission;
- it does not prove every Nimiq Pay 2.19.1 TESTNET installation fails;
- it does not justify claiming a real NimCarry FINAL or ARRIVED event.

## Operational gate

Do **not** spend another NimCarry A→B attempt simply to reproduce the same failure again.

The next real-payment retest should occur only after at least one of these changes:

1. a newer Nimiq Pay build is installed and its release notes or community evidence indicate TESTNET transaction submission changed;
2. the plain Nimiq Pay TESTNET wallet-to-wallet send succeeds again;
3. Nimiq/Nimiq Pay maintainers provide a concrete workaround or fix signal.

When that gate opens, first run **one plain TESTNET Nimiq Pay wallet-to-wallet transfer**. Only if that succeeds should NimCarry run one controlled A→B test. Preserve the existing rules: exactly 1 NIM, requested fee 0, no fallback sender, no blind retry, and only independent FINAL changes custody.
