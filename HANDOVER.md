# NimCarry — Handover

Updated: 2026-09-20  
Repository: `Faadil1/nimcarry`

This file is intentionally operational. A new conversation should be able to read this file plus `CANONICAL-STATE.yaml` and continue without reconstructing prior chat history.

## 1. Current baseline

Current main baseline:

- SHA: `bad96d463064e418ec47a949acd792224d8fde24`
- PR #114 **Move FINAL reconciliation into the background** is merged.
- PR #117 **Hand ambiguous Nimiq Pay submissions to background reconciliation** is merged as `bad96d463064e418ec47a949acd792224d8fde24`.
- PR #117 gates: CI #1575 **SUCCESS**, Judge Full Flow #220 **SUCCESS**; guided-flow coverage exercised mobile + desktop.
- Product behavior: one-time human bridge; sender pays the target directly; long-running FINAL reconciliation is server-owned.
- The prior custody-chain model and manual-recheck happy path are obsolete.

Latest live test completed successfully:

- mission: `6f7ced41-5971-4c92-904a-ab01c485a3b3`
- bridge: Grace
- destination: David
- tx: `066651d2a0e8bd791b7d7809f10f9dfc014294a21c02cf0e970fce88d5f825ad`
- final state: `ARRIVED`
- hop state: `FINAL`
- finalized hop count: `1`
- Grace completed the social bridge role and never received the payment.
- The sender remained authoritative until FINAL.
- Exactly one payment was required.

## 2. Automatic reconciliation workstream

The live test exposed a client-owned finality defect:

- the client waited up to 90 seconds;
- it emitted `VERIFICATION_STILL_PENDING`;
- the user had to return to Mission Home and press `Recheck existing handoff`;
- the same original transaction later reached FINAL/ARRIVED without a second payment.

The current workstream changes that architecture.

Implemented in the code branch for this handover:

- the canonical relay service exposes unresolved active intents for reconciliation;
- `ReachMissionCoordinator.reconcilePending()` advances each mission through the same canonical reconciliation path used by HTTP;
- the server maintenance loop runs reconciliation in the background, independent of the browser;
- the 90-second foreground polling loop is removed;
- after broadcast, the user is told the payment is finalizing in the background and may safely close the page;
- Mission Home no longer exposes `Recheck existing handoff`;
- while open, Mission Home watches the sender's accepted/pending state and reflects ARRIVED when the backend advances;
- retries remain read/reconcile operations only and never authorize or send a second payment.

Status: **merged with CI/Judge gates green; live validation continues. The latest run was blocked by an ambiguous no-hash Nimiq Pay submission before the intended close/reopen proof could be completed.**

Required live validation:

1. create a fresh real TESTNET mission;
2. broadcast the one payment;
3. close the client while the hop is still pending/included;
4. wait without pressing any manual recheck;
5. reopen and confirm the mission reached ARRIVED automatically;
6. verify no second payment control is offered at any point;
7. repeat the UI verification on desktop as well as mobile.


### Latest live attempt — ambiguous Nimiq Pay submission

A fresh mobile run at approximately 18:52 local time created mission `d9ae9ec2-5eab-485e-b19a-31b8a96e700a` with Grace accepted and David as the direct destination.

The pass intent was durably created, but Nimiq Pay did **not** return a provable transaction hash. The browser guard attempted one of its legacy foreground recovery loops and then surfaced:

`VERIFICATION_DELAYED: Load failed`

Read-only PostgreSQL inspection at 18:57 showed:

- mission: `ACTIVE`;
- Grace invitation: `ACCEPTED`;
- active intent sequence: `1`;
- intent recipient: David's wallet;
- hop row: **none**;
- recorded transaction hash: **none**;
- finalized hop count: `0`.

Therefore this run is **inconclusive about whether Nimiq Pay actually broadcast a transaction**. It does not justify a resend. The canonical no-hash recovery path may still discover an exact committed transaction independently.

It also exposed a concrete UX truthfulness defect: the recovery card said **“The transaction is already claimed”** even though durable state had no recorded hop/hash.

PR #117 is now merged. It removes the hidden 90-second ambiguous-submission polling loop, performs at most one opportunistic foreground reconciliation, hands continued recovery to the server background reconciler, keeps the local no-resend safety hold, and uses evidence-safe copy that does not claim a broadcast before a transaction hash/hop is proven.

A second read-only database check at about 19:07 local still showed the mission ACTIVE with the same accepted invitation and active intent, but **no hop and no recorded transaction hash**. Therefore the current mission remains unresolved; do not resend it unless canonical reconciliation eventually proves the old attempt terminal INVALID.

## 3. Product Council result

A blind six-model product review was completed with Grok, Claude, Kimi, Perplexity, DeepSeek, and Gemini.

The reviews disagreed on the long-term center of gravity, which is useful:

- Grok: claim/delivery is likely the core; bridges carry social cost.
- Claude: signed human authorization / social-route proof may be the unique product mechanism.
- Kimi: the deeper territory may be consent-gated human reachability rather than outbound sending.
- Perplexity: claim links and walletless onboarding are not novel by themselves; non-financial introducer consent appears more differentiated but demand remains unproven.
- DeepSeek: keep the financial path simple and non-custodial; destination claim does not require escrow in v1.
- Gemini: users should never choose routing topology up front; the product must infer the path from what they know.

The working architecture that best survived all six reviews is currently named:

**Human-Resolved Delivery**

Working thesis:

> Deliver value to a specific human even when their payment endpoint is not yet known, using only as much human consent as the situation requires, and leave verifiable evidence of how the delivery was authorized and finalized.

This is a **TEST direction**, not a permanently frozen marketing statement.

## 4. Product invariants now promoted

These should be treated as product laws unless explicitly reopened:

1. Bridge never receives, holds, or controls mission funds.
2. Bridge never binds, changes, or redirects the destination wallet.
3. If the destination wallet is unknown, the destination binds it through an authorized claim flow.
4. Bridge consent is attached to a specific mission/destination; the destination cannot be silently changed underneath accepted consent.
5. One mission must never produce more than one successful payment outcome.
6. Only independently verified Nimiq FINAL completes financial delivery.
7. Reconciliation must be automatic, durable, and idempotent.
8. Retry/reopen/reconcile must never create a duplicate-payment path.
9. Sender / Bridge / Destination are roles, not three mandatory NimCarry accounts.
10. No public/browsable relationship graph or public bridge marketplace in current scope.
11. v1 may have at most one optional introducer; multi-hop is deliberately not required.

## 5. Candidate flows

### Direct

Known destination wallet.

`Sender -> Destination -> FINAL -> receipt`

Keep as a primitive / activation path. Do not assume it is the differentiated product.

### Destination Claim — next major experiment

Sender knows the human but not the wallet.

`Sender creates intent -> private claim -> Destination binds own wallet -> Sender pays Destination -> FINAL -> receipt`

Important:

- no escrow is required for the first experiment;
- no funds move before the destination wallet is bound;
- claim must be single-use and expiring;
- a bearer-link-only claim is not strong identity proof; stronger assurance can be layered later if evidence requires it.

### Introduced

Sender needs a mutual human connection.

`Sender -> Grace consents once -> Destination resolved directly or by claim -> Sender pays Destination -> FINAL -> receipt`

Grace is finished after the consent action.

### Find a Connection

Public discovery / marketplace is **out of scope**.

Do not add public destination requests, bridge search, bounty routing, reputation leaderboards, or browsable trust graphs until the two-person and optional-introduction loops produce real evidence.

## 6. Immediate next implementation sequence

1. **Automatic reconciliation + ambiguous-submission recovery — merged, awaiting decisive live validation**
   - PR #114 merged as `5d31d5bf3234f267a55aee5e3f5435165b9478aa`.
   - PR #117 merged as `bad96d463064e418ec47a949acd792224d8fde24`.
   - PR #117 CI and mobile+desktop guided-flow smoke are green.
   - Server-side maintenance reconciles unresolved active intents, including no-hash intents that may be discovered from the exact opaque commitment.
   - Browser no longer owns long-running FINAL or ambiguous-submission recovery loops.
   - Manual recheck is removed from the happy path.
   - Current mission `d9ae9ec2-5eab-485e-b19a-31b8a96e700a` remains unresolved with no recorded hop/hash; do not resend.
   - Next proof gate is a fresh real hash-recorded close/reopen TESTNET run plus live mobile/tablet/desktop acceptance.

2. **Destination Claim experiment — next implementation workstream**
   - No on-chain escrow dependency.
   - Sender can create a mission before knowing destination wallet.
   - Destination alone can bind the destination wallet.
   - Payment becomes possible only after the binding is valid.
   - Claim expiry ends with no payment moved.

3. **Product UX simplification**
   - Do not ask Direct / Claim / Introduced as a first-step topology choice.
   - Start with the user's intent: who is this for, what are you sending?
   - Reveal the minimum additional human step only when required.
   - Remove custody language such as “Pass” where it implies the bridge handles the asset.
   - Keep payment FINAL distinct from human acknowledgement.

4. **Evidence experiment**
   - Compare a two-person Claim flow against an Introduced Claim flow.
   - Measure whether the bridge produces any material improvement in trust, completion, comprehension, or repeat behavior.
   - Do not canonize “bridge is the product” or “claim is the product” until this evidence exists.

## 7. Responsive requirement — hard gate

**Every UI change must be responsive on mobile, tablet, and desktop.**

Desktop must never be treated as a stretched mobile afterthought.

Minimum acceptance viewports for every relevant UI change:

- mobile: `390x844`
- tablet: `768x1024`
- desktop: `1440x900`

Check at minimum:

- no horizontal overflow;
- no clipped primary action;
- long Nimiq addresses/status text wrap or truncate safely;
- route/receipt hierarchy remains legible at wide widths;
- mobile touch targets remain usable;
- desktop keyboard/pointer interactions remain usable;
- no layout that only makes sense in a narrow viewport;
- motion respects reduced-motion behavior.

If a change is only verified on mobile, the step is **not complete**.

## 8. Operational safety

- Never mark a mission FINAL manually to make a test pass.
- Never infer transaction failure from a client polling timeout.
- Never resend while an existing payment may still finalize.
- Never link a technical Nimiq Pay HTLC rail account to a human profile.
- Database deletion remains destructive: only delete a mission when the user explicitly asks for that deletion in the current task.

## 9. Continuous recording rule

At every material step — accepted product decision, implementation merge, live-device test, discovered failure, or changed invariant — update:

- `CANONICAL-STATE.yaml`
- `HANDOVER.md`

before the workstream is considered complete.

When a product hypothesis changes materially, also update:

- `product-intelligence/CURRENT-HYPOTHESES.md`
- relevant evidence / experiment file under `product-intelligence/`

The goal is that repository state, not chat memory, remains the durable handoff mechanism.
