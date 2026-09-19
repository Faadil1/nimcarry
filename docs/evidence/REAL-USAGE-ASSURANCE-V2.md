# Real Usage Assurance v2

NimCarry separates **acquisition** from **verified product use** so low-cost events cannot be presented as stronger traction than they are.

## Assurance ladder

| Signal | Public field | What must be true | Assurance |
|---|---|---|---|
| Registered | `registered_users` | Voluntary profile with name + email | Acquisition only |
| Consented | `consented_users` | Current Privacy Notice version + consent timestamp | Privacy/accountability |
| Nimiq verified | `nimiq_verified_users` | A valid Nimiq signature proves control of a linked wallet | Cryptographic wallet control |
| Activated | `activated_users` | Nimiq-verified wallet performs a mission create, invite accept, or FINAL participation **after wallet verification** | Meaningful post-verification product use |
| Finalized | `finalized_users` | Nimiq-verified wallet is involved in an independently verified FINAL hop **after wallet verification** | Strongest protocol-use evidence |

`wallet_linked_users` remains as a compatibility alias for `nimiq_verified_users`.
`protocol_participants` remains as a compatibility alias for the post-verification activation count; legacy participant rows are not allowed to inflate it.

## Activation rule

A registered user is activated only if at least one verified wallet linked to that user satisfies one of these conditions after `user_wallets.verified_at`:

1. it creates a mission whose `missions.created_at >= verified_at`;
2. it accepts an invitation whose `invitations.accepted_at >= verified_at`; or
3. it participates as sender or recipient in a FINAL hop whose `hops.finalized_at >= verified_at`.

This ordering is intentional. A user cannot link an old wallet after the fact and convert historical development/test activity into current real-user traction.

## Finalized rule

A user is finalized only when a verified linked wallet is the sender or recipient of a hop with:

- `status = 'FINAL'`;
- non-null `finalized_at`;
- `finalized_at >= user_wallets.verified_at`.

This preserves NimCarry's protocol law:

**approval ≠ broadcast ≠ FINAL**

## What NimCarry does not count as strong real usage

The following may still be useful operational signals, but they are not promoted as high-assurance traction:

- raw profile registrations;
- raw email count;
- IP-address count or rate-limit passes;
- screenshots containing user records;
- raw wallet count without proof of control;
- pre-registry or pre-verification protocol activity;
- controlled development/test missions;
- wallet approval without independent finality as a finalized transaction.

Rate limiting remains an abuse-control mechanism, not a proof-of-humanity mechanism.

## Privacy boundary

The judge-facing evidence surface is aggregate only. It does not publish:

- names;
- email addresses;
- full wallet lists;
- invite tokens;
- target wallets;
- profile tokens.

The public endpoints expose counts and assurance definitions, while individual profile and protocol records remain protected according to their existing access rules.

## Why this policy exists

A useful ecosystem lesson came from the public Stakes postmortem, **“I Asked the Internet to Hack My Nimiq Mini App. It Took Three Hours.”** It describes an automated farming attempt using hundreds of wallets and explicitly rejects those wallets as real usage. NimCarry applies the same underlying principle independently: **a metric that is cheap to manufacture should not be the metric carrying the strongest traction claim.**

Reference: https://blog.surfstyk.com/i-asked-the-internet-to-hack-my-nimiq-mini-app/

## Snapshot

The first v2 production snapshot was captured at **2026-09-19T12:26:44.760Z**:

- registered: 27
- consented: 27
- Nimiq verified: 0
- activated: 0
- finalized: 0

That is intentionally conservative. The 27 registrations remain useful acquisition evidence, but they are not relabeled as Nimiq-native activation until stronger evidence exists.
