# Current Product Hypotheses

Status vocabulary: **EXPLORE / TEST / PROMOTE / HOLD / KILL**.

The 2026-09-20 live test and blind six-model product review invalidated the old assumption that a useful NimCarry mission should normally require sender + bridge + destination.

| Hypothesis | Status | Why it matters | Smallest useful test | Primary signal |
|---|---|---|---|---|
| H1. A new sender can get first value without coordinating two additional NimCarry users | PROMOTE | Three-person activation is a structural barrier | Keep Direct and live-validate deployed Destination Claim so one sender can start alone | successful mission starts from one existing user |
| H2. “Human known, wallet unknown” is a real job worth solving | TEST | This may be the strongest two-person wedge | Run the deployed private-claim flow with a real contact whose wallet is not entered by the sender | claim open → destination self-bind → one direct payment → FINAL/ARRIVED |
| H3. Optional human introduction adds measurable value beyond Claim alone | TEST | This decides whether social-route proof is core or a trust layer | Compare Claim vs Introduced Claim on similar real missions | completion, trust, comprehension, repeat use |
| H4. Bridge consent should be one action and never imply custody | PROMOTE | Live testing validated the corrected social/financial separation | Keep one-tap acceptance and direct sender → destination payment | bridge completion without duplicate steps/payments |
| H5. Automatic durable reconciliation is required for a trustworthy product | PROMOTE | Manual Recheck exposed backend state as user work and risks resend confusion | Background reconcile attached tx through FINAL across app close/reopen | zero manual recheck; zero duplicate payment |
| H6. Recipient onboarding is part of the product, not an external prerequisite | TEST | Claim fails if David must understand wallets before receiving | Prototype recipient-first bind with minimal crypto terminology | time-to-bind, abandonment, support need |
| H7. A sealed receipt / social-route proof creates value users can actually perceive | TEST | This is the strongest remaining differentiation candidate versus ordinary payment links | Show Direct vs Introduced receipts after real missions | recall, trust, reason-for-use, repeat intent |
| H8. Public bridge discovery creates more abuse than value at current scale | KILL | Spam, fake bridges, privacy leakage, and sybil incentives dominate before demand is proven | Do not build public discovery; observe whether users organically ask for it | unsolicited demand evidence only |
| H9. Recipient-controlled reachability could become a future network primitive | EXPLORE | A private consent-gated reachability layer may be stronger than outbound routing | Research-only until Claim and Introduced Claim produce repeat behavior | repeat destinations + repeated trusted introducers |
| H10. Repeat use will come from meaningful recurring delivery contexts, not gamification | EXPLORE | One successful demo is not retention | Observe genuine second mission creation without prompts/rewards | second mission within 30 days |
| H11. Human acknowledgement and financial FINAL are distinct product states | TEST | “ARRIVED” may overclaim what the system knows | Prototype receipt language: Delivered to wallet vs Acknowledged by recipient | comprehension of what has actually been proven |
| H12. Every interaction model must work as a first-class desktop experience as well as mobile | PROMOTE | NimCarry must not become a mobile-only layout stretched onto desktop | Run responsive acceptance at mobile/tablet/desktop on every UI PR | zero responsive regressions at required viewports |

## Current working architecture

**Human-Resolved Delivery** is the leading architecture under test:

1. user states who the value is for and what is being sent;
2. NimCarry resolves the destination through the minimum necessary mechanism;
3. an optional bridge may consent once when a human introduction is genuinely needed;
4. the sender pays the resolved destination directly;
5. NimCarry independently verifies FINAL in the background;
6. the product preserves a human-readable receipt of what was authorized and what was actually proven.

This is a testable architecture, not a claim that the final market positioning has been decided.

Implementation status as of 2026-09-21: Destination Claim v1 is merged and deployed on the canonical Cloudflare runtime, migration 007 is applied to Neon production, and automated CI/smoke/responsive gates are green. H2 remains **TEST** until a real TESTNET claim → self-bind → direct 1 NIM → FINAL/ARRIVED mission is completed.

## Current product boundaries

Promoted out of the current scope unless explicitly reopened:

- bridge custody;
- bridge wallet binding or payment redirection;
- mandatory three-person activation;
- client-only/manual reconciliation as the happy path;
- public bridge marketplaces;
- browsable trust graphs;
- multi-hop requirements;
- bridge reputation leaderboards;
- on-chain escrow as a dependency for the first Destination Claim experiment;
- in-app chat as a prerequisite to delivery.
