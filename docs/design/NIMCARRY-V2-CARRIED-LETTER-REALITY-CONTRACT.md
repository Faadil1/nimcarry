# NimCarry V2 — The Carried Letter reality contract

Status: **V2 direction approved / Gates 1–7 merged / judge-facing convergence gate in build**

The Carried Letter is a rendering and interaction model over the existing NimCarry state machine. It does not create new custody semantics.

## Canonical mapping

- Mission is created directly as `ACTIVE`; there is no persisted `CREATED` mission state.
- Mission statuses: `ACTIVE | ARRIVED | CANCELLED`.
- Invitation statuses: `INVITED | ACCEPTED | DECLINED | EXPIRED | WITHDRAWN | COMPLETED`.
- Invite TTL: 12 hours.
- Accepted-pass deadline: 1 hour.
- One open invitation per mission.
- One active pass intent per mission.
- Exactly 1 NIM = 100,000 Luna.
- Authorization != broadcast != FINAL.
- Custody changes only when an independently verified FINAL hop is projected into the mission.
- Arrival occurs only when the FINAL recipient HMAC matches the protected destination HMAC.
- Nimiq Pay may route payment through an HTLC whose on-chain sender differs from the authorized human identity. UI identity must therefore never be derived from transaction sender.

## Postal metaphor

- Letter = mission.
- Back of letter = verified route provenance.
- Gold seal = the 1 NIM custody baton.
- Warm wax = any pre-FINAL verification state; custody visibly remains with the last verified holder.
- Postmark = independently verified FINAL.
- Broken seal = ARRIVED.
- Demo = indigo + PRACTICE LETTER watermark + persistent practice banner.
- TESTNET = real authorized test transaction path and must never be visually confused with demo.

## Phase gates

1. Foundation: human-first landing, letter material system, demo/testnet visual separation, fail-closed error language. **No backend or transaction authority changes.**
2. Handoff ceremony: represent authorization, unproven broadcast, PENDING/INCLUDED, and FINAL distinctly inside the same warm-wax scene. **UI event phases must never carry wallet addresses, transaction hashes, or authority.**
3. Arrival: after authoritative `ARRIVED`, the route may use the server-derived `viewer_role`. Only `ARRIVED + TARGET` receives destination-specific language; all pre-FINAL invitations remain generic and other authorized viewers receive the generic ARRIVED framing.
4. Consent provenance: persist display label/signature presentation only after cryptographic ACCEPT succeeds. The visual signature is never the proof.
5. Carrier line + artifact: render verified route only from capability-scoped data; export must not widen visibility.

## Build law

When metaphor and truth conflict, truth wins. No V2 surface may claim a holder, handoff, destination arrival, or network result that the canonical state machine has not earned.


## Handoff phase vocabulary

The browser may emit presentation-only `nimcarry:handoff-phase` events so the V2 renderer can visualize truth without owning it:

- `authorization-requested` — wallet authorization is being requested; custody unchanged.
- `authorized` — canonical pass intent exists; custody unchanged.
- `wallet-approval-opened` — Nimiq Pay transfer approval surface opened; custody unchanged.
- `broadcast-unproven` — wallet call did not return provable broadcast evidence; custody unchanged.
- `provider-reference-returned` — Nimiq Pay returned a transaction reference; this is not independent chain proof and custody is unchanged.\n- `broadcast-claim-recorded` — NimCarry recorded the reference for independent verification; this is still not custody.
- `verification-pending` / `verification-status` — reconciliation is observing the chain; custody unchanged unless FINAL/CONFIRMED is returned.
- `verification-delayed` — fail-closed waiting state; custody unchanged.
- `final` — presentation ceremony after the canonical reconciliation path has earned FINAL/CONFIRMED/ARRIVED.
- `error` — no new custody claim.

These events are not state. Reloading the page derives truth again from the canonical mission and route APIs.


## Gate 3 — Arrival truth

- `viewer_role` is derived server-side from the authorized viewer and protected target HMAC.
- The browser receives that role only as presentation metadata on the already-authorized route view.
- `A letter has been carried to you` is permitted only when mission status is `ARRIVED` **and** viewer role is `TARGET`.
- The creator, earlier carriers, participants and scoped viewers see the generic `The letter arrived` outcome.
- The carried-letter receipt may restyle only data already present in the authorized Route Receipt. It must not add full addresses, hidden target data, or unverified hops.
- Demo receipts remain explicitly marked practice/off-chain.


## Gate 4 — Consent provenance

- A carrier may optionally choose a 1–60 character display label when accepting.
- The label is persisted atomically with the already-signed `ACCEPT_INVITATION` mutation.
- The label is presentation metadata only. The Nimiq signature remains the consent proof.
- The mark is visible only where the invitation already has full authorized context; redacted mission viewers receive `null`.
- Immediately after acceptance the back of the letter may show the mark while explicitly stating that custody has not moved.
- Acceptance recovery may retain the optional label only inside the same five-minute session-scoped proof used to finish the already-approved acceptance.
- Guided demo may prefill a practice mark, but must state that no wallet/network write occurred.
- Historical carrier-line propagation is a separate Gate 5 concern; Gate 4 does not widen route visibility or export scope.


## Gate 5 — Historical carrier provenance

- A carrier mark may enter historical route provenance only after the matching invitation is `COMPLETED` and the relay hop is independently `CONFIRMED` / FINAL.
- Pre-FINAL, pending, included-only, cancelled, invalid, expired, declined, withdrawn, or merely accepted invitations never contribute historical ink.
- Reissuing an invitation clears any prior accepted display mark before the new invite cycle begins.
- The finalized recipient's opted-in mark is retained in participant provenance with `display_name_opt_in=true`; absence of a mark remains an explicit non-opt-in.
- Route DTOs expose historical marks only inside an authorized named viewer context. Anonymous / `UNLISTED_VIEWER` views receive `null` labels even when route fingerprints are otherwise visible.
- Browser normalization may preserve a display label only if the server already emitted it; it must never infer a name from a candidate label, wallet, address, target label, or local state.
- The back of the letter and the Carried Letter Receipt may render the same server-authorized label as ink. They do not gain new visibility or authority from that presentation.
- Full wallet addresses and protected destination data remain excluded from the historical receipt.


## Gate 6 — Interruption and recovery grammar

Every interruption surface must answer three questions in this order:

1. Where is the letter?
2. Did custody change?
3. What supported action comes next?

Canonical meanings:

- `INVITED`: waiting for explicit human consent; no NIM has moved.
- `ACCEPTED`: consent exists, but the current verified holder still owns the 1 NIM seal until FINAL.
- `DECLINED`: consent was refused; the letter stays with the current verified holder.
- `EXPIRED`: the invitation or accepted-pass window closed; expiry never changes custody.
- `WITHDRAWN`: the invitation was closed before a verified handoff; custody is unchanged.
- `STALLED`: the route is quiet; silence is never inferred as progress.
- `CANCELLED`: the pristine mission was closed before a verified handoff; verified history is not rewritten.
- route-view capability failure: access is stale or missing, not the mission itself. Recovery is signed VIEW_ROUTE only and cannot send NIM.
- broadcast/in-flight ambiguity: do not duplicate the baton. Check the independently verified route before attempting another pass.

The presentation layer may humanize these states but cannot manufacture an action that the canonical state machine does not support. Raw technical causes remain available behind the recovery surface for diagnostics.


## Gate 7 — Compose and private invitation ritual

- Creation must lead with the human outcome: one intended person and the reason the letter should reach them.
- The private destination wallet remains required truth, but is visually framed as sealed delivery detail rather than the product's headline.
- Sealing a mission creates an `ACTIVE` mission only; it does not transfer 1 NIM or create a verified hop.
- A fresh zero-hop mission asks for one first carrier. The carrier must still explicitly accept before any handoff can begin.
- Invitation copy asks why this human was chosen and keeps the known Nimiq address optional where the backend allows it.
- The generated invitation link is a private artifact for one person. Presentation may make it look like a sealed letter but must not change the token, expiry, capability or acceptance semantics.
- The invitation recipient sees the human reason before protocol detail, with accept/decline remaining explicit.
- Demo invitation artifacts remain visibly PRACTICE and do not imply wallet/network writes.


## Gate 8 — Judge-facing truth and product convergence

The public package must tell the same human-first story as the running V2 while preserving the evidence boundary.

- Canonical short product sentence: **A private introduction, carried by people.**
- Primary outcome: **Get introduced to someone you cannot reach directly.**
- Browser title, install metadata, social card and README should converge on that language instead of legacy “opportunity forward” positioning.
- The deterministic judge URL is the explicit guided practice route: `?demo=1&tour=1&reset=1`.
- Practice/demo material must be described as simulated presentation evidence, never as real TESTNET FINAL.
- Current chain evidence may state that a native Nimiq Pay TESTNET transfer was independently observed and that the read-only network preflight passes.
- Current integration may state that Nimiq Pay can use an HTLC payment rail whose chain sender differs from the human/basic identity, and that NimCarry verifies the allowed sender relationship independently.
- Until a fresh corrected NimCarry route itself reaches real FINAL, the public package must say that fresh A→B→C TESTNET FINAL proof is pending and must not claim real NimCarry ARRIVED.
- The stale “likely external Nimiq Pay TESTNET submission regression” diagnosis is not canonical and must not appear as the current explanation.
- Evidence vocabulary is: **authorization → provider reference → independent verification → FINAL**.
