## 2026-09-20 — FINAL verification retry / reconcile contract hotfix

- Return the independently reconciled hop in `POST /missions/:id/reconcile`, so browser polling can observe `INCLUDED → FINAL` even when the mission itself remains `ACTIVE` after a non-terminal bridge handoff.
- Keep FINAL polling alive across transient mobile/WebView fetch errors such as Safari/Nimiq Pay `Load failed` instead of surfacing them as a failed payment.
- Distinguish verification-connection interruption from submission uncertainty in the recovery UX.
- Preserve the duplicate-send guard: once a transaction claim is recorded, transient verification failures never open a second 1 NIM send path.

## 2026-09-20 — Payment wallet key normalization hotfix

- Fix the browser payment guard's wallet-key normalizer so it removes Nimiq address whitespace instead of looking for a literal backslash-s sequence.
- This specifically fixes verified Basic-account ↔ HTLC-sender comparisons: profile/pass snapshots use spaced user-friendly addresses, while independently classified HTLC senders are compact NQ addresses.
- Security posture is unchanged: unverified Basic accounts and HTLCs whose normalized sender is outside the frozen verified-wallet snapshot still fail closed before payment.

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
