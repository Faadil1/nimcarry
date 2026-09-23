# NimCarry — Handover

Updated: 2026-09-23  
Repository: `Faadil1/nimcarry`

This file is intentionally operational. A new conversation should be able to read this file plus `CANONICAL-STATE.yaml` and continue without reconstructing prior chat history.

## 1. Current baseline

Current main baseline:

- Product/runtime/docs baseline: `943248664c4c66d628af4623bc2c6250886b74d0` (PR #125 on top of the live reconciliation / Destination Claim baseline and PR #123 motion polish).
- PR #114 **Move FINAL reconciliation into the background** is merged.
- PR #117 **Hand ambiguous Nimiq Pay submissions to background reconciliation** is merged as `bad96d463064e418ec47a949acd792224d8fde24`.
- PR #119 **Resume missions safely after a full app close** is merged as `50187e5e9387f47762a7ca011b9931ff91df769a`.
- PR #120 **Add non-custodial Destination Claim v1** is merged as `2bfb3730f06052e52456193a029400000d716732`.
- PR #121 **Keep direct Destination Claim pending UI truthful** is merged as `b35674c5ceea116e576e6f9eeedc6aee1415e6ef`.
- PR #122 **Repair stranded FINAL mission projections automatically** is merged as `724f0d88877e32b2048a4e6eb9f6254b51f0de97`.
- PR #123 **Add domain-native motion polish v1** is merged as `2d276aeb6d0a243d7b321e06badb2d34bd52d05f`; production Cloudflare/guided-flow validation passed.
- PR #125 **Document approval-before-finality integration pattern** is merged as `943248664c4c66d628af4623bc2c6250886b74d0`.
- PR #124 **Fix returning-user sign-in code recovery UX** remains OPEN with green automated checks and is not part of `main` yet.
- Migration `007_destination_claim_v1.sql` is applied to Neon production and validated against existing data.
- PR #120/#121 are green for Cloudflare, CI, smoke, and **Guided flow — mobile + tablet + desktop**. PR #122 production Cloudflare build, smoke, and CI are also **SUCCESS**.
- Vercel status is not the production gate for NimCarry.
- Product behavior: one-time human bridge; sender pays the target directly; long-running FINAL reconciliation is server-owned.
- The prior custody-chain model and manual-recheck happy path are obsolete.

Latest live test completed successfully:

- mission: `052bc4d3-a71c-43b8-8aba-be6d40b5651c`
- bridge: Grace
- destination: David
- tx: `a2d31d21c33dd4de01067a499333ae5f488fcc3ea54f09fd25147d2edde4e3f8`
- final state: `ARRIVED`
- hop state: `FINAL`
- finalized hop count: `1`
- arrival/finality timestamp: `2026-09-21T03:14:57.977Z`
- Grace completed the social bridge role and never received the payment.
- The sender remained authoritative until FINAL.
- Exactly one payment was required.
- Both Faadil (sender) and Grace (accepted bridge) correctly see mission-level `ARRIVED`.
- Their completion messaging is role-specific: the sender sees the delivered route/receipt; the bridge sees that its bridge step is complete.
- This run kept the sender client open until ARRIVED, so it does **not yet** prove the close-before-FINAL recovery gate.

## 1A. Close-before-FINAL live proof — backend PASS, resume UX defect found

A fresh real TESTNET run at approximately 23:19 local created mission `c31534d0-9ecd-45b9-bf8d-e9457141d391`.

Durable production state:

- target: David
- bridge: Grace
- creator: Faadil
- tx: `dcb5f139f12f65a10b51871275dd797ecdea98bc8af1e3b17b3ea0fbdfbe27e4`
- hop created/included: `2026-09-21T03:21:45.975Z`
- FINAL / ARRIVED: `2026-09-21T03:22:50.427Z`
- mission status: `ARRIVED`
- finalized hop count: `1`
- invitation: `COMPLETED`

Faadil closed the sender app before FINAL. Grace's still-open bridge screen later showed ARRIVED, and Neon independently confirms the same FINAL/ARRIVED state. No second payment and no manual recheck occurred.

**Conclusion: PR #114's server-owned close-before-FINAL reconciliation gate is passed.**

A separate UX defect was discovered when Faadil reopened A: NimCarry returned to the generic home/new-mission surface rather than offering the completed mission.

Root cause in the current frontend: home recovery discovers prior missions from `sessionStorage` keys named `carryone.view.<missionId>`. A full mini-app close can destroy this session-only locator. The durable mission is safe; the app simply loses discoverability of which mission to reopen.

Implemented in PR #119 and deployed to Cloudflare:

- recent non-secret mission UUID locators are persisted under `nimcarry.recentMissions.v1`, capped at five;
- the route-view bearer capability remains **sessionStorage-only** under `carryone.view.<missionId>`;
- home now shows **Resume recent mission** after a full app close;
- resume goes through signed `VIEW_ROUTE` recovery and mints fresh read-only access;
- recovery returns to the same mission/ARRIVED receipt;
- recovery has no create/invite/pass/send/custody mutation path;
- PR and production guided flow passed mobile + tablet + desktop.

Important migration detail: mission `c31534d0-9ecd-45b9-bf8d-e9457141d391` was created before PR #119, so A never wrote the new persistent locator. Use that existing ARRIVED mission once through signed route-access recovery to bootstrap the locator. **Do not create another payment.** After that one recovery, fully close/reopen A and verify the Resume action restores the same ARRIVED receipt.

## 1B. Destination Claim v1 — DEPLOYED, real TESTNET proof pending

PR #120 is now merged and deployed to the canonical Cloudflare runtime.

Production facts:

- merge SHA: `2bfb3730f06052e52456193a029400000d716732`
- Cloudflare Workers production build: **SUCCESS**
- build id: `a7f339dd-d0d5-4958-9deb-6ec0c202405f`
- CI: **SUCCESS**
- smoke: **SUCCESS**
- guided flow mobile + tablet + desktop: **SUCCESS**
- Neon migration `007_destination_claim_v1.sql`: **APPLIED**
- production schema validation found **0 inconsistent existing missions**

The deployed two-person path is:

`Sender creates mission without wallet -> private claim -> Destination signs CLAIM_DESTINATION -> destination wallet is bound privately -> Sender sends exactly 1 NIM directly to Destination -> independent FINAL -> ARRIVED`

Important product/security behavior:

- claim binding itself moves **no NIM**;
- only the destination-signed wallet can bind the unknown target;
- claim bearer secrets are stored server-side only as hashes;
- a lost unshared claim can be revoked and safely reissued after a fresh sender signature;
- direct claim delivery has `invitation_id = NULL` and must never manufacture a fake bridge;
- the optional introducer lane remains available when the real-world relationship requires one;
- introducers still never receive, hold, or redirect funds.

The first real Destination Claim run has now started.

Mission `d1ed137a-834a-4211-b12f-cf00dbde75cc`:

- created for David without entering David's wallet;
- David claimed the private delivery at `2026-09-21T07:59:43.907Z`;
- target wallet is privately bound;
- no invitation/bridge exists;
- A correctly reached **Send 1 NIM to David**;
- a direct sequence-1 intent was created at `2026-09-21T08:00:12.142Z`;
- `invitation_id = NULL`, proving direct provenance;
- Nimiq Pay returned no provable transaction hash;
- as of `2026-09-21T08:11:40.727Z`, the mission is still `ACTIVE`, tx hash is null, no hop exists, and finalized hop count is 0.

**Therefore the Claim/binding half is live-validated, but payment FINAL/ARRIVED is not. Do not resend the 1 NIM.**

The recordings exposed two presentation defects only: while the direct no-hash send waited, the UI fell back to **Invite / Accept** plus **Waiting for response**, and the ceremony said **The bridge never received the 1 NIM** despite there being no bridge.

PR #121 fixed those semantics without touching transaction/reconciliation logic:

- direct WAIT remains **Create → Claim → Authorize → Send → Arrive**;
- direct pending state shows **Checking existing send — no action needed**;
- direct no-bridge copy explicitly says no bridge is involved;
- Cloudflare production build, CI, smoke, and mobile/tablet/desktop guided flow are green.

Current proof gate: wait for this existing mission to either discover a matching transaction and reach FINAL/ARRIVED, or terminate fail-closed with no broadcast. **Do not create a replacement mission or second payment while the intent is unresolved.**

## 1C. Destination Claim recovered FINAL — mission projection repair

Mission `d1ed137a-834a-4211-b12f-cf00dbde75cc` later resolved the ambiguous no-hash send to a real on-chain payment:

- tx: `393e98c2cb9db0bf9bc5f40dca835f76f43262630d4bfc0a326aea02286b596e`
- INCLUDED: `2026-09-21T10:50:16.621Z`
- FINAL: `2026-09-21T10:51:02.963Z`
- `invitation_id = NULL`
- recipient: the exact wallet David bound through Destination Claim
- no bridge/invitation exists

This proves the original no-hash attempt really broadcast and was recovered without a resend.

A new durability gap was exposed immediately afterward: the relay hop is FINAL, but the mission row remained `ACTIVE`, sequence 0, 0 finalized hops. The app therefore displayed a FINAL route row while still offering **Send 1 NIM to David**.

PR #122 fixes this crash/race window:

- startup/background sweeps now include durable FINAL relay rows even after their active intent disappeared;
- the same idempotent coordinator reconcile path repairs the mission projection;
- failed projection remains retryable;
- settled historical FINAL missions are memoized in-process to avoid repeated 15-second reads;
- process restart intentionally resets that memo so startup rescans durable FINALs;
- mission view returns `WAIT` rather than another send/reroute while FINAL is ahead of the mission row.

PR #122 is merged and Cloudflare production build/smoke/CI are green.

**Current live gate:** wait for the replacement Cloudflare container to project this exact mission to `ARRIVED`. Until that happens, **do not press Send 1 NIM again**. No manual DB correction has been applied.

## 1D. User-requested test data cleanup

On 2026-09-21 the user explicitly requested deletion of their test data from Neon production.

Deleted:

- all **13** missions with `creator_display_label = Faadil`;
- all mission-linked `destination_claims`, `invitations`, `pass_intents`, `hops`, auth challenges, audit events, and participant rows through the existing mission CASCADE relationships.

Verified afterward:

- remaining Faadil missions: **0**
- remaining known test destination claims: **0**
- remaining known test invitations: **0**
- remaining known test pass intents: **0**
- remaining known test hops: **0**

The existing Faadil user account and linked identity/wallet/session records were deliberately **preserved** so testing can continue without re-registration.

Historical evidence files and Git history still describe prior test missions. Treat those as evidence only; **do not try to resume, reconcile, repair, or mutate the deleted mission ids**.

## 1E. Public integration pattern — Approval Is Not Final

On 2026-09-23, the live TESTNET reconciliation lessons were promoted into a reusable public engineering pattern:

- document: `docs/APPROVAL-IS-NOT-FINAL.md`
- PR: **#125**
- merge SHA: `943248664c4c66d628af4623bc2c6250886b74d0`
- external wallet investigation: `https://github.com/nimiq/wallet/issues/314`

Canonical rule:

`approval != broadcast != INCLUDED != FINAL`

The public write-up is intentionally broader than NimCarry's mission model. It documents:

- why wallet approval alone is not settlement evidence;
- why a no-hash return must remain **unknown**, not be classified automatically as success or failure;
- why users must not resend while an earlier payment could still exist;
- why finality reconciliation must survive browser close/restart;
- why durable FINAL must be able to repair a lagging product projection idempotently;
- a generic reference algorithm that other wallet-integrated apps can reuse.

The live evidence supporting the pattern contains both outcomes of the same client-visible ambiguity:

1. one no-hash approval was later independently rediscovered and reached INCLUDED -> FINAL without a resend;
2. another no-hash approval terminated fail-closed with no matching broadcast and no custody movement.

A separate close-before-FINAL run also proved that backend reconciliation can complete delivery after the sender client is closed.

Evidence boundary: **Nimiq has not confirmed a root cause.** Issue #314 is the canonical wallet-side investigation. NimCarry has screen recordings, app-side states/errors, timestamps, durable relay evidence, and later chain observations, but does not have the raw internal Nimiq Pay logs from the original failing approvals.

The README was refreshed in the same PR because it still contained stale pre-proof text claiming that no real FINAL/ARRIVED existed. It now reflects the later live TESTNET evidence without claiming a Nimiq-confirmed regression.

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

Status: **server-owned reconciliation is live-validated for both no-hash fail-closed recovery and hash-recorded close-before-FINAL arrival. PR #119 fixes the separate sender rediscovery defect and is deployed with all automated gates green.**

Real-device validation is now **complete**:

- A fully closed and reopened NimCarry.
- Home surfaced **Resume recent mission c31534d0…d391**.
- Fresh signed `VIEW_ROUTE` recovery restored mission `c31534d0-9ecd-45b9-bf8d-e9457141d391`.
- The mission remained **ARRIVED** with **1 FINAL** and the same verified Grace → David delivery proof.
- No new mission, re-invite, recheck, or second payment was required.

**Conclusion: PR #119 is live-validated. The reconciliation + close/reopen recovery workstream is complete.**

### Latest live attempt — terminal no-hash recovery

A fresh mobile run at approximately 18:52 local time created mission `d9ae9ec2-5eab-485e-b19a-31b8a96e700a` with Grace accepted and David as the direct destination.

The pass intent was durably created, but Nimiq Pay did **not** return a provable transaction hash. The foreground UI later surfaced:

`VERIFICATION_DELAYED: Load failed`

At 19:52:05 local, read-only PostgreSQL inspection still showed:

- mission: `ACTIVE`;
- Grace invitation: `ACCEPTED`;
- active intent sequence: `1`;
- hop row: **none**;
- recorded transaction hash: **none**;
- finalized hop count: `0`.

PR #117 was already live on the canonical Cloudflare production runtime by then. It had been deployed successfully by Cloudflare after merge and owns the server-side no-hash recovery path.

A new read-only PostgreSQL verification at **21:03:39 local** now shows:

- mission: `ACTIVE`;
- Grace invitation: `EXPIRED`;
- pass intent sequence: `1`;
- hop sequence: `1`;
- hop status: **`INVALID`**;
- transaction hash: **none**;
- finalized hop count: `0`;
- ARRIVED: **no**;
- custody change: **none**.

Therefore the ambiguous submission has now reached a **terminal fail-closed outcome**. No matching broadcast was discovered, no second 1 NIM payment was made, and custody never moved.

Important evidence caveat: the persisted `invalidated_at` value is written from the hop's original `createdAt` in the current PostgreSQL adapter, so it is **not a reliable timestamp for when the INVALID transition actually occurred**. We can prove the transition happened sometime after the 19:52:05 inspection and before the 21:03:39 inspection, but not its exact second from the current row alone.

This closes the no-hash validation gate for PR #117. The next real gate is specifically:

`hash recorded -> close NimCarry before FINAL -> server reconciliation -> ARRIVED -> reopen with no resend/recheck path`

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

1. **Destination Claim v1 — clean dataset for renewed user testing**
   - The previous Faadil test missions were deleted at the user's explicit request.
   - Keep the existing Faadil account; no re-registration is required.
   - New testers should create fresh missions from the deployed Destination Claim flow.
   - Keep the anti-resend rule: if a send is pending/checking, do not create a second payment.
   - Historical deleted mission ids remain evidence references only.

2. **Introduced Claim comparison — after the direct Claim path**
   - Add an optional one-time introducer only when the relationship requires it.
   - Compare completion, trust, comprehension, and friction against the two-person Claim flow.
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
