<p align="center">
  <img src="web/favicon.svg" alt="NimCarry logo" width="92" height="92" />
</p>

<h1 align="center">NimCarry</h1>

<p align="center"><strong>Get this to someone you cannot reach directly — one human bridge at a time.</strong></p>
<p align="center"><strong>One NIM. One bridge at a time.</strong></p>

<p align="center">
  <a href="https://nimcarry.faadil-casecraft.workers.dev"><strong>Live App</strong></a>
  ·
  <a href="#demo--evidence">Demo video / evidence</a>
  ·
  <a href="CANONICAL-STATE.yaml">Current state</a>
</p>

> **Naming decision — 2026-09-09:** the product formerly presented as **Carry One** is now **NimCarry**. The existing repository slug, deployment URL and internal `carryone.*` storage keys remain temporarily stable to avoid breaking the active Cycle II demo/integration work. Public-facing product identity is NimCarry.

> **Preview boundary:** the Live App is a Public Preview. It must not be read as completed real TESTNET proof, FINAL, ARRIVED, or mainnet readiness.

## v1.0.0 — Cycle II Preview

NimCarry is released as a **PUBLIC_PREVIEW**, not Public Early Access. Provider readiness is proven, but two controlled TESTNET sends reached wallet approval and were independently verified **NOT_BROADCAST**. The current Nimiq Pay 2.19.1 TESTNET post-approval submission issue remains external and unconfirmed.

- **Live App:** https://nimcarry.faadil-casecraft.workers.dev
- **Guided Demo:** use `?demo=1`; demo ARRIVED and Route Receipt are presentation-only.
- **Real TESTNET proof:** pending; never infer FINAL or ARRIVED from approval or a transaction hash.
- **Stack:** Cloudflare Worker + Container, Neon/Postgres, and Nimiq Pay.

NimCarry is a **destination-bound human routing Mini App** for the Nimiq Mini Apps Competition — Cycle II. One verified **1 NIM** baton moves through consenting human bridges until the defined destination becomes the finalized recipient. Each holder chooses the next person who can move the mission closer.

## Why NimCarry

**Warm introductions disappear after the first handoff.** You rarely know whether something was forwarded, where it stalled, or whether it actually reached the intended person.

NimCarry turns that invisible chain into a consented, verifiable path while keeping the core mechanic simple:

**Create → Invite → Accept → Pass 1 NIM → Arrive**

The differentiator is not “sending crypto.” **The 1 NIM is the baton, not the reward.** It is a state-bearing coordination primitive: the route advances only after the wallet-approved handoff is independently FINAL.

Without Nimiq, a bridge can only say “I forwarded it.” With NimCarry, the custody handoff has wallet approval and independent finality behind it.

## What the judge should understand in 60 seconds

1. **Destination:** the mission has one known, consenting destination.
2. **Human bridge:** the current holder chooses only the next person who can move it closer.
3. **Consent:** nobody becomes a bridge by surprise.
4. **1 NIM baton:** exactly 1 NIM marks the custody handoff; it is not a reward, stake, wager, prize or pooled fund.
5. **FINAL:** pending transactions never move custody.
6. **ARRIVED:** when the destination becomes the finalized recipient, the mission terminates.
7. **Route Receipt:** the completed route leaves a privacy-safe proof artifact rather than ending at “transaction sent.”

## Five-screen MVP

1. **Mission Home** — destination, purpose, current holder and verified path.
2. **Create Mission** — known/consenting destination + purpose.
3. **Bridge Invitation** — explicit consent before any payment.
4. **Pass 1 NIM** — wallet-approved exact-value handoff.
5. **Route / Arrival** — only independently verified FINAL hops appear; ARRIVED exposes the privacy-safe Route Receipt.

## Product laws

- **The baton is a verified 1-NIM handoff** — not an investment, wager, prize pool or unique-human proof.
- **Every mission has a destination.** Cycle-II missions use a known target wallet and require creator-attested target consent.
- **No one becomes a bridge by surprise.** Invitation acceptance happens before payment.
- **Only FINAL changes custody.** A reported tx hash, mempool observation or acceptance never advances the route.
- **The path is the product.** No XP, streaks, leaderboards, forwarding rewards or AI routing.
- **No clawback.** An inactive route may display STALLED, but the baton is never reassigned automatically.
- **No route loops.** A wallet already in the finalized path cannot re-enter the same mission.

## Security and Nimiq integration

- Nimiq wallet signatures authorize holder-sensitive actions.
- Target wallet is encrypted with AES-256-GCM and matched at arrival with a separate keyed HMAC-SHA256.
- Reach Mission transactions require an opaque `co:v1:<commitment>` recipient-data value rather than exposing mission/sequence identifiers in clear text.
- Recipient value is exactly **100,000 Luna = 1 NIM**; the Cycle-II client requests **fee 0** so a bridge holding exactly the received 1 NIM can attempt to forward it intact.
- Client preflights that the canonical holder wallet exists in the Nimiq Pay session; the backend still independently verifies the actual on-chain sender.
- Multiple read RPC endpoints can be configured; infrastructure outages surface as `VERIFICATION_DELAYED`, never as a false custody change.
- Public repo CI scans tracked files + reachable Git history for high-confidence credential material.

See [`SECURITY.md`](SECURITY.md) for vulnerability reporting and current release boundaries.

## Current build state

Already merged: frozen Reach Mission product law + UX/state/security contracts; foundation mission/invitation/auth/finality services; blind-spot hardening; five-screen frontend skeleton; PostgreSQL persistence; public Sip & Show clickable demo; demo navigation/favicon fixes; Cycle II hidden-spot audit; and the NimCarry public-facing naming transition.

Current gate: **V1 Public Preview packaging while real TESTNET proof remains blocked**.

Still intentionally unclaimed until real runtime proof: real Nimiq Pay multi-account behavior; exactly-1-NIM forwarding with requested fee 0; native invite deeplink on a real device; and full 3-wallet testnet `CREATE → INVITE → ACCEPT → AUTHORIZE → PASS → FINAL → ARRIVED`.

Public Early Access and mainnet remain blocked. The known Nimiq Pay TESTNET blocker is not resolved by this release.

## Demo & evidence

**Live App:** https://nimcarry.faadil-casecraft.workers.dev

**Guided Demo:** https://nimcarry.faadil-casecraft.workers.dev/?demo=1

The local demo may preview the ARRIVED / Route Receipt presentation, but it remains visibly labelled **DEMO MODE**. It is never represented as testnet evidence.

**Demo video:** to be added after the secure real-wallet/testnet vertical proof is recorded. We intentionally do not publish a simulated walkthrough as if it were runtime evidence.

The planned proof topology is three testnet wallets:

`A creator → B bridge → C destination → ARRIVED → Verified Route Receipt`

with screen recording, timestamps, transaction hashes, FINAL state and ARRIVED evidence captured during the run.

## Judge-window reliability

Cycle II apps can be evaluated after the submission deadline at an unknown time. NimCarry therefore treats runtime availability as part of the score-critical product surface.

```bash
npm run smoke:judge -- https://your-production-url.example
```

The smoke check verifies the served NimCarry shell, FINAL-only custody copy, and `/health.json`. A manual GitHub Action is included; scheduled production monitoring is intentionally gated until the secure real E2E runtime is green.

## Cycle II execution intelligence

The full seven-call Sip & Ship transcript pass has been converted into concrete controls in [`docs/CYCLE2-HIDDEN-SPOT-IMPLEMENTATION-PACK-2026-09-09.md`](docs/CYCLE2-HIDDEN-SPOT-IMPLEMENTATION-PACK-2026-09-09.md). It covers the first-five 60-second test gate, legitimate 4/11/25-user usage ladder, the two required promotion posts, deterministic demo law, Route Receipt contract and judge-window reliability.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Contributors should read [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) before opening material changes.

## Team

- **Faadil Boussari** — repo owner / product lead
- **Opeyemi (`opeblow`)** — collaborator / technical lead

Current collaboration alignment: joint Cycle II concept and team submission; prize split 50/50 while both contributors carry planned responsibilities through submission, revisited in writing if either party steps away.

## Source of truth

- [`CANONICAL-STATE.yaml`](CANONICAL-STATE.yaml)
- [`HANDOVER.md`](HANDOVER.md)
- [`docs/WEEKEND-FINALIZATION-PLAN.md`](docs/WEEKEND-FINALIZATION-PLAN.md)
- [`docs/REACH-MISSION-PRODUCT-LAW.md`](docs/REACH-MISSION-PRODUCT-LAW.md)
- [`docs/REACH-MISSION-UX-STATE-CONTRACT.md`](docs/REACH-MISSION-UX-STATE-CONTRACT.md)
- [`docs/REACH-MISSION-SECURITY-AUTH.md`](docs/REACH-MISSION-SECURITY-AUTH.md)
- [`docs/REACH-MISSION-API-CONTRACT.md`](docs/REACH-MISSION-API-CONTRACT.md)
- [`docs/REACH-MISSION-TEST-MATRIX.md`](docs/REACH-MISSION-TEST-MATRIX.md)
- [`docs/SIP-SHIP-7-CALL-WINNING-INTELLIGENCE-2026-09-09.md`](docs/SIP-SHIP-7-CALL-WINNING-INTELLIGENCE-2026-09-09.md)

## License

MIT — see [`LICENSE`](LICENSE).
