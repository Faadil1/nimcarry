# NimCarry LLM Council Synthesis — 2026-09-20

Status: **decision support complete; implementation direction under test**

This document records the blind six-model product review completed after the successful live Faadil → via Grace → David test.

## Inputs

Independent reviews were produced by:

- Grok — adversarial adoption / social-cost critique
- Claude — product architecture / JTBD / social-route proof
- Kimi — cross-industry collisions / reachability models
- Perplexity — market / evidence / competitor-gap review
- DeepSeek — mechanism design / abuse / state invariants
- Gemini — mobile UX / information architecture / comprehension

No model saw the other models' output before producing its own review.

## Independent consensus

The following conclusions converged strongly enough to promote:

- Mandatory sender + bridge + destination activation must be removed.
- Bridge custody is obsolete and must remain removed.
- A bridge must never bind or redirect the destination wallet.
- A bridge should require at most one consent action in v1.
- Direct sender → destination payment remains the financial path.
- Only independently verified FINAL completes financial delivery.
- Client/manual recheck must not remain the happy path.
- Sender / Bridge / Destination are roles, not three mandatory accounts.
- Destination Claim deserves a real product experiment.
- Public bridge discovery / public relationship graphs should not be built now.
- The first screen should capture user intent, not ask users to classify routing topology.
- Every future UI change must remain first-class responsive on desktop as well as mobile/tablet.

## Important disagreements

### Is the bridge the product?

**Grok:** likely no; claim/delivery is the stronger behavior and bridges carry social cost.

**Claude:** bridge consent / social-route proof may be the only truly differentiated mechanism.

**Kimi:** bridge may become a premium trust/reachability layer rather than the default route.

**Perplexity:** claim links and walletless onboarding are commoditized mechanisms; non-financial introducer consent appears more differentiated, but demand is not proven.

**DeepSeek:** optional bridge is safe if its authority is narrowly scoped and it never controls money or binding.

**Gemini:** bridge should be invisible unless the sender actually needs an introduction.

Decision: **do not resolve by opinion. Test Claim vs Introduced Claim.**

### Is Destination Claim the product?

Grok/Kimi lean strongly toward it as the activation/core opportunity.

Claude/Perplexity warn that claim links alone are not sufficiently differentiated.

DeepSeek/Gemini treat Claim as a strong activation mechanism but not proof of product-market differentiation.

Decision: **build Claim as an experiment, not as the final positioning.**

### Should Find a Connection exist?

One review left room for a controlled test, but the dominant independent evidence identified high abuse, privacy, spam, and sybil risk.

Decision: **public Find a Connection is out of scope.**

## Strongest surviving architecture

Working name: **Human-Resolved Delivery**

Working thesis:

> Deliver value to a specific human even when their payment endpoint is not yet known, using only as much human consent as the situation requires, and preserve verifiable evidence of how delivery was authorized and finalized.

The architecture separates four concerns:

1. **Intent** — who is this for and what is being sent?
2. **Resolution** — is the destination wallet already known, or must the destination bind one?
3. **Optional human trust** — is a trusted introducer actually needed?
4. **Execution + evidence** — sender pays destination directly; NimCarry verifies FINAL and preserves a receipt.

## Candidate flows

### Direct

Known wallet.

`Sender → Destination → FINAL → receipt`

Useful as an activation primitive. Not assumed to be the differentiated product.

### Destination Claim

Human known, wallet unknown.

`Sender intent → private claim → Destination binds own wallet → Sender pays → FINAL → receipt`

Important council decision:

**The first version does not require escrow.**

No funds move before a valid destination wallet is bound.

### Introduced Claim / Introduced Delivery

Human introduction actually required.

`Sender → Bridge consents once → Destination resolved directly or by claim → Sender pays Destination → FINAL → receipt`

The bridge contributes social authorization/context, not custody.

## New product grammar

Do not expose internal routing modes as the first user decision.

Start from:

- **Who is this for?**
- **What are you sending?**

Then reveal only the missing step.

The old universal grammar:

`Create → Invite → Accept → Pass → Arrive`

is no longer correct because “Pass” implies custody transfer.

Candidate conceptual grammar:

`Promise → Permission → Delivered`

This is a UX hypothesis, not frozen copy.

## Critical experiments

### Experiment A — Two-person Destination Claim

Question:

> Can one existing NimCarry user successfully initiate a mission to a person whose wallet is not known?

Observe:

- claim open;
- destination comprehension;
- wallet binding;
- sender payment completion;
- finality;
- abandonment reason;
- preference for simply asking for the wallet;
- second-use behavior.

Do not borrow arbitrary external percentage thresholds as product truth. Establish NimCarry's own baseline.

### Experiment B — Does Grace add material value?

Compare similar missions:

**Claim**
`Sender → Destination`

versus:

**Introduced Claim**
`Sender → Bridge consent → Destination`

Measure:

- completion;
- time;
- trust;
- comprehension;
- bridge refusal;
- destination abandonment;
- repeat behavior;
- user's stated reason for choosing NimCarry.

This experiment decides whether social-route proof is:

- core product,
- a trust upgrade,
- or mostly decorative friction.

## Constitutional product invariants

See `CANONICAL-STATE.yaml` for the authoritative machine-readable list.

The essential principle is:

> Relationship semantics may change; financial authority must remain narrow, direct, and independently verifiable.

## Responsive implementation gate

All future UI work must be verified at minimum on:

- 390x844 mobile
- 768x1024 tablet
- 1440x900 desktop

Desktop is not optional and is not considered complete if the implementation was validated only on mobile.

## Deferred mechanisms

Do not make these dependencies of the next product experiment:

- on-chain escrow/refund;
- staking/slashing;
- public bridge discovery;
- public trust graph;
- bridge reputation leaderboard;
- multi-hop;
- standing delegation;
- bridge rewards;
- in-app chat;
- AI matching.

They remain divergent research material only until simpler loops fail or real use creates evidence for them.
