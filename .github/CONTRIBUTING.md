# Contributing to NimCarry

Thanks for helping improve NimCarry.

NimCarry is being built for the Nimiq Mini Apps Competition — Cycle II. The current product laws and state machine are intentionally narrow so the team can prove one reliable vertical flow before expanding scope.

## Before you change code

1. Read `CANONICAL-STATE.yaml` and `HANDOVER.md` first. They are the source of truth for the current gate and blockers.
2. Read the relevant product/security contracts in `docs/`.
3. Do not change frozen product laws, custody/finality rules, privacy boundaries, or the 1-NIM baton semantics without explicit product approval.

## Development workflow

- Branch from current `main`.
- Keep one coherent concern per PR where practical.
- Preserve existing migrations and canonical evidence.
- Do not force-push shared collaborator branches.
- Run before requesting review:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

## Security and privacy

Never commit private keys, seed phrases, API keys, database credentials, encryption keys, HMAC keys, invite bearer tokens, or real private target-wallet material. Use environment/local secret storage only. See `SECURITY.md`.

## Scope discipline

Before the real vertical proof is green, avoid expanding into gamification, prizes/wagers, pooled funds, forwarding rewards, AI routing/spend, marketplaces, public target discovery, or unique-human claims.

## Pull requests

A PR should explain:

- what problem it solves;
- which canonical gate it advances;
- security/privacy impact;
- tests added or changed;
- whether real-device/testnet proof is still required.

After a meaningful merged milestone, update both `CANONICAL-STATE.yaml` and `HANDOVER.md` so another conversation or contributor can immediately take the lead.
