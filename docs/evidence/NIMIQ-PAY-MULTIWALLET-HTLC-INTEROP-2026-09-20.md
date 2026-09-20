# Nimiq Pay multi-wallet / HTLC interoperability correction — 2026-09-20

## Live finding

A real Nimiq Pay TESTNET run exposed both a user-controlled Basic Account and a Hashed Timelock Contract through the same provider session. Independent TESTNET.WATCH inspection confirmed that the second address was an HTLC and that its declared sender was the Basic Account.

The previous browser preflight treated every address returned by `listAccounts()` as a human wallet identity. That produced a false `PAYMENT_SOURCE_UNVERIFIED` rejection even though the extra address was the verified wallet's technical HTLC payment rail.

Full test-wallet addresses are intentionally omitted from this repository evidence record.

## Security-preserving correction

The correction does not trust every exposed HTLC.

Before a 1 NIM write request, NimCarry now independently classifies every exposed address through the TESTNET RPC:

- Basic Account: must be present in the pass's frozen verified-wallet snapshot.
- HTLC: may be treated as a technical payment rail only when its on-chain declared sender is in that same frozen verified-wallet snapshot.
- Unknown/non-basic/non-HTLC account: fail closed.
- HTLC with no verified declared sender: fail closed.

Server-side FINAL reconciliation remains stricter: the canonical relay independently verifies the HTLC account type, declared sender, original funding relationship, exact recipient, exact 1 NIM value, opaque `co:v1:` commitment, and macro-block finality before custody changes.

## UX corrections from the same run

The live run also exposed two independent UX defects:

1. Route recovery rewrote “Back to NimCarry” to the mission return path, which could trap the user away from Mission Home. The explicit Mission Home action now always targets `/`; successful VIEW_ROUTE recovery still returns to the same mission.
2. Async profile refreshes could race with the MutationObserver and append duplicate profile cards. Refresh rendering is now serialized and re-deduped immediately before render.

Wallet-link and recovery pickers also filter out HTLC payment rails so technical accounts cannot be mistaken for human identities.

## Regression contract

Production smoke now checks:

- account-classification endpoint presence and read-only failure behavior;
- browser account-type helper wiring;
- verified HTLC rail handling in the payment guard;
- basic-wallet-only profile linking and recovery;
- serialized single-profile rendering;
- explicit Mission Home recovery exit.

