# NimCarry V2 — The Carried Letter reality contract

Status: **V2 direction approved / foundation gate in build**

The Carried Letter is a rendering and interaction model over the existing NimCarry state machine. It does not create new custody semantics.

## Canonical mapping

- Mission is created directly as `ACTIVE`; there is no persisted `CREATED` mission state.
- Mission statuses: `ACTIVE | ARRIVED | CANCELLED`.
- Invitation statuses: `INVITED | ACCEPTED | DECLINED | EXPIRED | WITHDRAWN | COMPLETED`.
- Invite TTL: 12 hours.
- Accepted-pass deadline: 1 hour.
- One open invitation per mission.
- One active pass intent per mission.
- Exactly 1 NIM = 100,000 Luna.
- Authorization != broadcast != FINAL.
- Custody changes only when an independently verified FINAL hop is projected into the mission.
- Arrival occurs only when the FINAL recipient HMAC matches the protected destination HMAC.
- Nimiq Pay may route payment through an HTLC whose on-chain sender differs from the authorized human identity. UI identity must therefore never be derived from transaction sender.

## Postal metaphor

- Letter = mission.
- Back of letter = verified route provenance.
- Gold seal = the 1 NIM custody baton.
- Warm wax = any pre-FINAL verification state; custody visibly remains with the last verified holder.
- Postmark = independently verified FINAL.
- Broken seal = ARRIVED.
- Demo = indigo + PRACTICE LETTER watermark + persistent practice banner.
- TESTNET = real authorized test transaction path and must never be visually confused with demo.

## Phase gates

1. Foundation: human-first landing, letter material system, demo/testnet visual separation, fail-closed error language. **No backend or transaction authority changes.**
2. Handoff ceremony: represent authorization, unproven broadcast, PENDING/INCLUDED, and FINAL distinctly inside the same warm-wax scene.
3. Arrival: destination-specific climax only when server truth can support it; otherwise generic invite until FINAL.
4. Consent provenance: persist display label/signature presentation only after cryptographic ACCEPT succeeds. The visual signature is never the proof.
5. Carrier line + artifact: render verified route only from capability-scoped data; export must not widen visibility.

## Build law

When metaphor and truth conflict, truth wins. No V2 surface may claim a holder, handoff, destination arrival, or network result that the canonical state machine has not earned.
