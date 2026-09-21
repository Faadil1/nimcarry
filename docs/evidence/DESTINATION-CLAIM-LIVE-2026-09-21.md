# Destination Claim v1 — first real TESTNET run — 2026-09-21

## Mission

- mission: `d1ed137a-834a-4211-b12f-cf00dbde75cc`
- creator: Faadil
- destination label: David
- created: `2026-09-21T07:57:57.495Z`
- introducer/invitation: **none**
- route model: **two-person Destination Claim**

## What is live-validated

The first half of the deployed Destination Claim flow worked on a real device:

1. Faadil created the mission without entering David's Nimiq wallet.
2. NimCarry created a private destination claim.
3. David accepted the claim.
4. David's wallet became privately bound to the mission.
5. The claim reached `CLAIMED` at `2026-09-21T07:59:43.907Z`.
6. No bridge/invitation was created.
7. Faadil's mission updated to **Send 1 NIM to David**.
8. The direct-delivery surface correctly stated that David bound the destination wallet through the private claim.

This validates:

- unknown-wallet mission creation;
- destination-controlled wallet binding;
- zero-NIM claim acceptance;
- the two-person path without a fabricated bridge;
- direct payment authorization becoming available only after destination binding.

## Payment attempt status

At `2026-09-21T08:00:12.142Z`, NimCarry created the direct pass intent:

- sequence: `1`
- `invitation_id = NULL`
- recipient: privately bound destination
- transaction hash: **none**

The Nimiq Pay submission returned no provable transaction hash. The client correctly surfaced:

> SEND_STATUS_PENDING: Nimiq Pay did not return a provable transaction hash. NimCarry will verify this existing send attempt in the background. Do not resend 1 NIM.

Read-only Neon verification at `2026-09-21T08:11:40.727Z` still showed:

- mission: `ACTIVE`
- current sequence: `0`
- finalized hop count: `0`
- pass intent: present
- pass intent tx hash: `NULL`
- hop: none
- ARRIVED: no

Therefore **no payment success is claimed**. The direct Destination Claim flow has not yet completed the real FINAL/ARRIVED proof.

## Safety rule for this mission

**Do not resend 1 NIM and do not create a replacement mission while this intent can still reconcile.**

The canonical background reconciler owns transaction discovery/finality. If no matching broadcast exists, the existing fail-closed stale-intent path must eventually terminate without custody movement.

## Live UX regressions discovered

The videos exposed two presentation bugs after the no-hash direct send became `WAIT`:

1. Mission Home fell back from the direct grammar
   `Create → Claim → Authorize → Send → Arrive`
   to the old
   `Create → Invite → Accept → Send → Arrive`
   even though the mission had no invitation.

2. The handoff ceremony said:
   `The bridge never received the 1 NIM`
   even though no bridge existed.

These were UI truth/provenance bugs only; durable mission/payment state remained safe.

## Fix

PR #121 **Keep direct Destination Claim pending UI truthful** was merged as:

`b35674c5ceea116e576e6f9eeedc6aee1415e6ef`

The fix:

- keeps claimed/no-invitation missions on the direct Claim progress grammar while `WAIT`;
- shows **Checking existing send — no action needed** instead of **Waiting for response**;
- distinguishes direct sender→destination copy from introduced-delivery copy;
- changes no-bridge error copy to **No bridge is involved and no arrival is claimed**;
- does not change transaction, reconciliation, persistence, or custody logic.

Production gates for #121:

- Cloudflare Workers build: **SUCCESS**
- CI: **SUCCESS**
- smoke: **SUCCESS**
- guided flow mobile + tablet + desktop: **SUCCESS**

## Remaining proof gate

Wait for mission `d1ed137a-834a-4211-b12f-cf00dbde75cc` to resolve.

Possible evidence-valid outcomes:

- matching transaction independently discovered → INCLUDED → FINAL → ARRIVED; or
- no matching broadcast discovered before stale expiry → terminal fail-closed INVALID/no custody movement.

Until one of those occurs, Destination Claim v1 is **partially live-validated**, not end-to-end validated.
