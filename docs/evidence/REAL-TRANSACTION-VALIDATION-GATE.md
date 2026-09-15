# Real transaction validation gate

## Purpose

This protocol prevents real-user transaction sessions from being counted as successful unless the complete Nimiq TESTNET path is independently proven end to end.

It also prevents recruiting real users into a known-broken wallet submission window.

## What “100% transactional validation” means

It does **not** mean NimCarry can guarantee 100% uptime or successful broadcasting from an external wallet provider.

It means:

> **100% of routes counted as transactionally validated must have every required hop independently verified FINAL and must end in ARRIVED.**

A route with one failed, ambiguous, unverified, pending, or expired hop counts as **0 successful transactional routes**, never as a partial success.

Keep these metrics separate:

1. **Real users reached/tested** — legitimate humans who open/test NimCarry with distinct Nimiq wallets and can contribute comprehension/usability evidence.
2. **Real verified routes completed** — only routes satisfying this entire protocol.

Wallet open, wallet approval, tx hash returned, INCLUDED, or Guided Demo ARRIVED are not substitutes for real FINAL/ARRIVED proof.

## Gate state after 2026-09-15 evidence

Current real-payment gate: **CLOSED**.

Reason: the controlled NimCarry A→B test and an independent Nimiq Pay 2.19.1 TESTNET plain-wallet reproduction both show a post-approval submission failure class. See:

- `docs/evidence/NIMIQ-PAY-LIVE-NO-HASH-2026-09-15.md`
- `docs/evidence/NIMIQ-PAY-TESTNET-PROVIDER-DIAGNOSTIC-2026-09-15.md`

Do not use recruited users to repeatedly reproduce the same known failure.

## Gate reopening conditions

The real-payment gate may reopen only when at least one provider-change signal exists, such as a newer Nimiq Pay build, maintainer workaround/fix signal, or evidence that TESTNET sending has recovered.

Then perform the following before any NimCarry real-user route:

### G0 — runtime and chain readiness

- production NimCarry commit is known and CI/smoke are green;
- Nimiq Pay is explicitly on TESTNET;
- TESTNET chain head is advancing;
- A, B, and C are three distinct intended roles/wallets;
- A and B are available in the correct Nimiq Pay sessions because both will be senders;
- C is the intended final destination;
- no stale/ambiguous NimCarry pass intent is active for the mission used for validation.

### G1 — sender-device canary for A

On the **same Nimiq Pay installation/device/version that A will use**, make one small plain TESTNET wallet-to-wallet transfer outside NimCarry.

Requirements:

- native Nimiq Pay send returns a canonical transaction hash;
- the exact sender, recipient, and amount are independently checked on-chain;
- the canary reaches independent `FINAL`;
- perform the NimCarry A→B attempt promptly after the canary, ideally within 10 minutes and without changing Nimiq Pay version/network/account context.

Verify with:

```bash
npm run verify:testnet-canary -- \
  --hash <64-hex-hash> \
  --sender '<sender NQ address>' \
  --recipient '<recipient NQ address>' \
  --luna <exact Luna amount>
```

A failing canary keeps the gate **CLOSED**. Do not spend a NimCarry baton attempt.

### G2 — A→B canonical NimCarry hop

Proceed only after G1 PASS.

- B has explicitly accepted the invitation;
- A authorizes exactly `100000` Luna / 1 NIM;
- requested fee remains `0`;
- the canonical opaque `co:v1:` commitment is present;
- approve only once;
- NimCarry must receive or independently recover the exact transaction;
- sender + recipient + 100000 Luna + exact commitment must match;
- the transaction must reach independent `FINAL`;
- only then may custody move from A to B.

If any condition fails or remains ambiguous, the route is not counted and B→C must not begin.

### G3 — sender-device canary for B

Before B forwards the baton, repeat the plain TESTNET canary on the **same Nimiq Pay installation/device/version that B will use to send B→C**.

This is mandatory even if A's canary passed. A healthy A sender path does not prove B's wallet installation/provider state is healthy.

The B canary must independently reach `FINAL` and should be followed by B→C promptly, ideally within 10 minutes.

### G4 — B→C canonical NimCarry hop

Proceed only after G3 PASS and after A→B is already independently FINAL.

- B is the verified current holder;
- C is the intended final destination;
- B sends exactly the received 1 NIM baton (`100000` Luna), requested fee `0`;
- approve only once;
- exact sender + recipient + amount + opaque commitment are independently verified;
- transaction reaches independent `FINAL`;
- only then may the mission transition to `ARRIVED` and issue the real Route Receipt.

## PASS definition

A real transaction validation session is **PASS** only when all of the following are true:

- A-device plain canary: FINAL;
- A→B NimCarry hop: FINAL;
- custody moved A→B only after FINAL;
- B-device plain canary: FINAL;
- B→C NimCarry hop: FINAL;
- custody moved B→C only after FINAL;
- mission state: ARRIVED;
- Route Receipt corresponds to the verified path;
- no duplicate send, manual override, fallback broadcaster, or synthetic state transition occurred.

That is the only state that increments **Real verified routes completed**.

## FAIL / STOP conditions

Stop immediately and do not continue the route if any of these occurs:

- plain canary produces no hash, `Bad Request`, or any provider error;
- chain head is not advancing;
- wrong wallet/account is active;
- transaction details differ from expected sender/recipient/value/data;
- more than one possible reconciliation match exists;
- wallet approval returns without provable broadcast;
- transaction is not found, expires, becomes INVALID, or never reaches FINAL;
- route-view/session state is lost and cannot be safely recovered;
- any participant is asked to blindly resend.

A stopped session is useful diagnostic evidence, but **never counts as a successful transactional validation**.

## Operational rule

For real-user UX/comprehension recruitment, continue testing even while this gate is closed.

For real transaction validation, do not recruit a user into the payment portion until both the provider environment and the relevant sender device have passed the required canary gate.

This preserves the strongest evidence boundary:

**approval ≠ broadcast ≠ FINAL; only two independently FINAL canonical hops may prove a real A→B→C ARRIVED route.**
