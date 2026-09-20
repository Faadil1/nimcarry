# Automatic FINAL Reconciliation — 2026-09-20

Status: **implemented, awaiting live TESTNET validation**

## Why this change exists

A real mobile test proved that a valid NimCarry payment can remain INCLUDED longer than the browser's former 90-second polling window. The transaction later reached FINAL and the mission reached ARRIVED, but the user had to return to Mission Home and press **Recheck existing handoff**.

That behavior leaked reconciliation internals into the user journey and created unnecessary doubt about whether a second payment was required.

## Canonical behavior after this change

Once a transaction hash is attached to a mission:

1. the original payment remains the only candidate payment;
2. the server owns long-running reconciliation;
3. reconciliation uses the same canonical independent Nimiq verification path as the HTTP endpoint;
4. PENDING / INCLUDED stays non-final;
5. only independently verified FINAL can project the mission to ARRIVED;
6. closing or reopening the browser does not create a resend path;
7. manual recheck is removed from the normal Mission Home journey.

## Implementation

### Relay discovery

`CanonicalRelayService.getPendingReconciliationBatonIds()` enumerates active intents whose hop is:

- not yet recorded;
- `PENDING`; or
- `INCLUDED`.

Invalid observations are deliberately excluded from endless background retry.

### Coordinator sweep

`ReachMissionCoordinator.reconcilePending()` iterates unresolved missions and calls the existing canonical `reconcile(missionId)` path.

The sweep:

- never signs;
- never authorizes a pass;
- never broadcasts;
- never requests another payment;
- isolates per-mission errors so one RPC failure does not block other pending missions.

### Server maintenance

The application maintenance loop runs background reconciliation on a configurable interval:

`CARRY_ONE_RECONCILE_INTERVAL_MS`

Default: 15 seconds.

An initial sweep is scheduled shortly after process startup so a restarted container can resume work from durable Postgres relay state.

### Browser behavior

After the provider returns a transaction hash and the broadcast claim is durably recorded:

- NimCarry performs only an opportunistic immediate reconciliation check;
- if FINAL is already available, the existing success path remains;
- otherwise the user returns to Mission Home with **Payment sent — finalizing**;
- the UI explicitly says the page may be closed and **Do not send again**;
- Mission Home watches both bridge and sender pending states for backend advancement;
- **Recheck existing handoff** is removed.

## Responsive acceptance

This UI change does not add a new layout primitive. It reuses existing responsive button rows and mission cards.

Contract checks cover:

- responsive app-shell width;
- wrapping button rows;
- wide-layout media rule;
- reduced-motion support.

Hard acceptance still requires live review at:

- 390×844 mobile;
- 768×1024 tablet;
- 1440×900 desktop.

## Safety invariants preserved

- Bridge never receives funds.
- Sender remains the payment authority.
- One mission cannot advance on PENDING/INCLUDED alone.
- FINAL remains independently verified.
- Reconciliation is idempotent.
- Existing broadcast evidence blocks a fresh payment path.
- No database state is manually promoted to FINAL.

## Required live proof before promotion

Run a fresh TESTNET mission and:

1. broadcast the single direct-to-destination payment;
2. close the client before FINAL;
3. do not manually reconcile;
4. wait for server reconciliation;
5. reopen the mission;
6. confirm ARRIVED / FINAL;
7. confirm exactly one transaction and one finalized hop;
8. confirm no second payment action was ever offered;
9. verify the pending and completed surfaces on mobile and desktop.

Until that proof is captured, this change is **implemented but not yet live-validated**.
