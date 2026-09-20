## 2026-09-20 — HTLC sender-linkage normalization

- Harden Nimiq RPC account parsing for public-node response variants where HTLC metadata is nested.
- Resolve `sender`, `recipient`, and `totalAmount` recursively through bounded account metadata layers.
- Apply the same normalization in the Cloudflare payment preflight and backend FINAL verifier.
- Keep the payment guard fail-closed; unresolved or non-authorized HTLC senders are still rejected before the 1 NIM request.
- Surface only a short sender fingerprint in the technical error path to distinguish “unresolved sender” from “sender not in snapshot”.

## 2026-09-20 — Nimiq Pay HTLC + recovery/profile UX hardening

- Classify Nimiq Pay-exposed TESTNET accounts independently before payment.
- Treat HTLCs whose declared sender is in the frozen verified-wallet snapshot as technical payment rails, not extra human wallets.
- Keep unknown/unverified basic accounts and unbound HTLCs fail-closed before the 1 NIM request.
- Hide HTLC rails from wallet-link and route-recovery identity pickers.
- Fix route recovery so “Mission Home” always exits to `/` while successful recovery returns to the mission.
- Serialize/dedupe profile rendering to prevent repeated “Your NimCarry profile” cards.

# Changelog

## 1.0.0 — Cycle II Preview

- First NimCarry Public Preview release.
- Production Cloudflare Worker, Container, Neon/Postgres persistence, Nimiq Pay integration, five-screen flow, consent gates, FINAL-only custody, and privacy-safe Route Receipt.
- Real TESTNET A→B→C proof remains pending because two approved TESTNET sends were independently verified NOT_BROADCAST.
- The Nimiq Pay 2.19.1 post-approval submission issue remains external and unconfirmed.
