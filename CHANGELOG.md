## 2026-09-25 — Payment-link positioning

- Reposition NimCarry around one job: send NIM to someone even without their wallet address, via a private link (Destination Claim). Introductions become an optional path.
- Rewrite the home, create, recipient-link and send screens in plain language; remove protocol vocabulary (custody, baton, bind, FINAL) from the main path.
- Fix the create screen contradicting the payment link: it no longer says a known Nimiq destination is required, and the address confirmation is hidden when no address is entered.
- Default the step indicator to Create → Share link → They open it → Send → Arrived; the introduction steps appear only when an introduction is used.
- Update page metadata, web manifest and social card to the new positioning.
- Rewrite the README user-first with the real usage numbers up front.
- Move team working notes (handover, canonical state, product intelligence, submission, usage sprint) to `docs/internal/`.

## 2026-09-20 — Journey health contract

- Add a canonical regression contract for the full 1→5 user journey: create → invite → accept → pass → FINAL/arrive.
- Gate the guided smoke on single-presence after the first FINAL: one verified bridge row, one current-holder marker, no duplicate holder card, and no duplicate holder→destination diagram.
- Lock bridge acceptance to one signed interaction for consent + read continuity; explicit `VIEW_ROUTE` remains recovery-only.
- Lock timeout behavior so an expired pass cannot expose a second payment path.
- Document restart/profile recovery as fallback behavior rather than part of the normal bridge journey.

## 2026-09-20 — One-pass bridge continuation

- Make bridge acceptance a single wallet-approval moment: the signed `ACCEPT_INVITATION` response now includes the read-only mission capability for that same verified wallet, eliminating the follow-up `VIEW_ROUTE` signature.
- After acceptance, the bridge is moved directly into the mission and the client watches the handoff read-only while the previous holder submits 1 NIM.
- When independent FINAL transfers custody, the same screen automatically changes from “Accepted — waiting for FINAL” to the new-holder workflow and surfaces “Choose next bridge”.
- Reopening the invitation, restoring mission access, or manually refreshing the verified route is no longer part of the normal bridge journey.
- Custody authority is unchanged: acceptance grants read continuity only; mutation authority still follows canonical holder state after FINAL.

## 2026-09-20 — Accepted-invite replay + profile-backed mission reads

- Reopening an already accepted private invitation no longer renders the accept ceremony or throws `INVITATION_NOT_INVITED`; the same bridge sees a clear “already accepted” state instead.
- Repeating the signed acceptance from the same wallet is idempotent and returns the existing accepted invitation.
- Logged-in NimCarry profiles with a verified wallet participating in a mission can recover read-only mission access when a process-local route-view token disappears after a runtime restart.
- Profile-backed read recovery prioritizes the current-holder wallet, then the creator wallet, then other linked participant wallets; it does not grant mutation or custody authority and does not accept unrelated profiles.
- Cross-mission bearer-token mismatches still fail closed and do not fall back to profile access.

## 2026-09-20 — Expired pass-window UX hardening

- Treat an already accepted invitation whose pass deadline elapsed as `PASS_DEADLINE_EXPIRED` instead of the misleading generic `INVITATION_NOT_ACCEPTED`.
- Never render the “Accepted bridge” + “Authorize + Pass 1 NIM” ceremony when the invitation is no longer ACCEPTED or its pass window has expired.
- Replace stale pass controls with a safe return-to-mission / verified-route state; custody remains unchanged and no second payment path is offered.
- Route legacy `INVITATION_NOT_ACCEPTED` pass errors through the same expiry/recovery guidance.

## 2026-09-20 — Provider result-shape diagnostic

- Preserve a privacy-safe provider diagnostic when Nimiq Pay approval returns no canonical transaction hash.
- The ambiguous-submission recovery UI may now show only the coarse JavaScript result shape (for example `undefined`, `object`, or `array`), never raw provider payloads, wallet secrets, or transaction data.
- Chain recovery, duplicate-send protection, and FINAL-only custody remain unchanged.

## 2026-09-20 — Durable unproven-submission recovery

- Harden Postgres relay durability so a failed snapshot write cannot be forgotten by a later `AUTHORIZE_PASS`; serialized flushes retry the latest snapshot and never acknowledge a process-local-only pass intent.
- Ignore orphaned relay rows from administratively deleted missions when persisting a long-lived container snapshot, preventing an old mission from rolling back a new mission's `pass_intents` write.
- Normalize Nimiq Pay transaction-hash return shapes conservatively: direct strings and known wrapper fields are accepted only when they contain one unambiguous 64-hex hash.
- Keep ambiguous/no-hash approvals fail-closed and chain-recoverable; no second 1 NIM send is opened merely because the wallet UI returned an unexpected result shape.

## 2026-09-20 — Single-presence bridge UX

- Stop repeating a finalized bridge as both the standalone current-holder summary and the verified-path entry.
- Before the first FINAL handoff, the standalone current-holder surface remains because no verified route row exists yet.
- After a FINAL handoff, the latest verified route row carries a compact “Current holder” marker and becomes the only place that person is shown in the mission summary.
- The final human-craft layer no longer adds a second current-holder → destination diagram once the verified path exists.
- Protocol state, custody, invitations, and route history are unchanged; this is presentation-only deduplication for long routes.

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
