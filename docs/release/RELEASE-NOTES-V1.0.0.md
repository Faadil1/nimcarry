# NimCarry v1.0.0 — Cycle II Preview

## Public Preview boundary

This is a Public Preview, not Public Early Access. It does not claim mainnet readiness, completed real TESTNET E2E proof, real FINAL, or real ARRIVED.

## Product premise

NimCarry routes a destination-bound idea through consenting human bridges. Exactly one 1 NIM baton marks each custody handoff; the baton is coordination state, not a reward or investment.

## Five-screen flow

1. Mission Home
2. Create Mission
3. Bridge Invitation and consent
4. Pass 1 NIM through Nimiq Pay
5. Route / Arrival with FINAL-only route evidence and a privacy-safe Route Receipt

## Safety laws

- Exactly `100000` Luna / 1 NIM per baton handoff, requested fee `0`.
- Invitation consent precedes payment.
- Only independently verified `FINAL` changes custody; a hash or wallet approval is not FINAL.
- Destination binding and opaque `co:v1:` recipient commitments protect mission privacy.

## Production stack

Cloudflare Worker + Container, Neon/Postgres, and Nimiq Pay. The production origin is https://nimcarry.faadil-casecraft.workers.dev.

## Security hardening

Capability-bound route views, signed holder actions, same-row invitation reissue, stale-intent renewal safeguards, idempotent mutations, encrypted destination storage, keyed matching, redacted views, and independent finality reconciliation are included.

## Current TESTNET limitation

Provider readiness is proven. Two controlled TESTNET sends reached native wallet approval and were independently verified NOT_BROADCAST. Nimiq Pay 2.19.1 TESTNET post-approval submission failure is classified as an external regression likely but not confirmed. No third send has been attempted.

## Deferred after V1

Resolve or receive platform confirmation for the TESTNET submission issue, complete real A→B→C FINAL/ARRIVED proof, run post-fix reliability checks, and reassess Public Early Access and mainnet gates.
