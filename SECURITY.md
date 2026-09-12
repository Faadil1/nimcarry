# Security Policy

NimCarry moves testnet/mainnet transaction intents and stores privacy-sensitive mission metadata, so security issues should be treated as high priority.

## Supported surface

Security fixes currently target the latest `main` branch and the active Cycle II vertical slice.

## Reporting a vulnerability

Please do **not** publish an exploitable vulnerability, secret, private key, seed phrase, bearer token, target wallet, or credential in a public GitHub issue.

Contact the repository owner privately through the existing team communication channel and include:

- affected component or route;
- reproduction steps;
- expected vs observed behavior;
- impact;
- suggested mitigation if known.

If a public issue is useful, disclose only after the sensitive details are removed or the fix is available.

## High-risk areas

Please prioritize reports involving:

- wallet signature/authentication bypass;
- forged route-view or invitation capabilities;
- transaction-hash claim/broadcast authorization;
- custody changes before independent `FINAL` verification;
- route replay or wallet re-entry;
- target-wallet disclosure;
- leaked encryption/HMAC/database/API credentials;
- idempotency or concurrency failures that could duplicate state transitions;
- legacy mutation routes bypassing Reach Mission authorization.

## Secret handling

Never commit:

- Nimiq seed phrases or private keys;
- API keys/tokens;
- database passwords/URLs containing credentials;
- target-wallet encryption keys;
- HMAC keys;
- invitation or route-follow bearer capabilities;
- private production/test participant data.

The public repository CI includes a high-confidence scan of tracked files and reachable Git history, but that scan is a backstop, not a guarantee.

## Current release boundary

NimCarry v1.0.0 is a **PUBLIC_PREVIEW** release. Real-value production use and mainnet funds remain blocked. Real TESTNET E2E proof remains pending: two controlled TESTNET sends reached native wallet approval and were independently verified NOT_BROADCAST.

The current Nimiq Pay 2.19.1 TESTNET post-approval submission issue is external and unconfirmed. V1 does not claim that this blocker is resolved. Demo `ARRIVED` and Route Receipt states are demo-only presentation and are not real custody or finality evidence.

Do not interpret V1 as Public Early Access, mainnet readiness, completed A→B→C proof, real FINAL, or real ARRIVED.
