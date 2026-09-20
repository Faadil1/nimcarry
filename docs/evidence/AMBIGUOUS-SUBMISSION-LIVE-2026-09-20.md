# Ambiguous Nimiq Pay Submission — Live Evidence — 2026-09-20

Status: **route-safe, broadcast unproven, follow-up patch in progress**

## Scenario

Fresh real TESTNET mission:

- mission: `d9ae9ec2-5eab-485e-b19a-31b8a96e700a`
- sender/current holder: Faadil
- bridge: Grace
- destination: David
- bridge invitation: accepted once
- intended financial route: sender -> David

## Client observation

The real-device recording shows:

1. Mission Home offered the direct-to-destination pass after Grace had accepted.
2. The sender selected the verified NQ46 basic identity.
3. The pass intent became authorized.
4. Nimiq Pay did not return a provable transaction hash.
5. The browser entered ambiguous-submission recovery.
6. A subsequent reconciliation request surfaced `VERIFICATION_DELAYED: Load failed`.

The recovery card then stated:

> The transaction is already claimed. Do not resend it.

That sentence is stronger than the durable evidence.

## Durable state observed read-only

At `2026-09-20T22:57:20.852Z`:

- mission status: `ACTIVE`
- current sequence: `0`
- finalized hop count: `0`
- invitation status: `ACCEPTED`
- active pass intent sequence: `1`
- intent created: `2026-09-20T22:52:05.388Z`
- intent recipient: `NQ67 MXN0 0TFY AUHD L11M E8JQ N4ME 70M6 7S1U`
- hop row: absent
- transaction hash: absent
- included_at: absent
- finalized_at: absent

No database mutation was performed during inspection.

## What this proves

- An authorized intent exists.
- Grace remains only the social bridge.
- The intended recipient remains David.
- No durable broadcast claim has been recorded yet.
- No FINAL proof exists.
- A second payment must not be requested while the ambiguous send attempt remains unresolved.

## What this does NOT prove

- It does not prove that Nimiq Pay broadcast a transaction.
- It does not prove that no transaction was broadcast.
- It does not prove automatic server reconciliation is broken.
- It does not justify manually marking the mission FINAL.

The canonical relay already supports no-hash discovery by scanning the recipient's chain history for the exact opaque commitment and independently validating sender/payment rail, recipient, value, commitment, and FINAL.

## Product defect exposed

Two legacy client behaviors survived the first automatic-reconciliation patch:

1. the ambiguous-submission guard still owned a hidden foreground polling loop;
2. the recovery copy claimed a transaction was “already claimed” before durable broadcast evidence existed.

Both contradict the server-owned reconciliation model.

## Patch direction

- perform at most one opportunistic foreground reconcile;
- hand continued reconciliation to the server maintenance loop;
- return the user to Mission Home rather than making them babysit recovery;
- keep the local safety hold so another send is blocked;
- use evidence-safe copy:
  - authorized intent exists;
  - transaction hash is not yet proven;
  - background reconciliation continues;
  - do not resend;
- keep FINAL as the only completion signal.

## Responsive acceptance

No new layout primitive is introduced. Existing cards/button rows remain the surface.

The patch still requires responsive verification at:

- 390x844 mobile;
- 768x1024 tablet;
- 1440x900 desktop.

Desktop remains a hard gate.
