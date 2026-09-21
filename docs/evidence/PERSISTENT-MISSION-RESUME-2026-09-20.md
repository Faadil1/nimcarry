# Persistent mission resume after full app close — 2026-09-20

## Trigger

Real TESTNET mission `c31534d0-9ecd-45b9-bf8d-e9457141d391` proved that server-owned reconciliation continued after Faadil closed the sender app before FINAL:

- tx: `dcb5f139f12f65a10b51871275dd797ecdea98bc8af1e3b17b3ea0fbdfbe27e4`
- included: `2026-09-21T03:21:45.975Z`
- FINAL / ARRIVED: `2026-09-21T03:22:50.427Z`
- finalized hop count: `1`
- no second payment
- no manual recheck

When the sender reopened NimCarry, the durable mission was safe and ARRIVED, but the home screen could not rediscover which mission to reopen.

## Root cause

Route-view bearer capabilities are intentionally kept in `sessionStorage` under `carryone.view.<missionId>`.

That is correct for capability security, but the old home recovery logic also used those session-only keys as the only mission locator. A full mini-app close could therefore erase discoverability even though the mission remained durable in PostgreSQL.

## Fix — PR #119

PR #119, **Resume missions safely after a full app close**, merged as:

`50187e5e9387f47762a7ca011b9931ff91df769a`

The fix separates **locator** from **authorization**:

- recent mission IDs are stored under `nimcarry.recentMissions.v1` in `localStorage`;
- only opaque UUID mission locators are persisted, capped at five;
- route-view bearer capabilities remain in `sessionStorage` only;
- no bearer token is written to `localStorage`;
- the home screen surfaces **Resume recent mission** after a full close;
- resume routes through `route-access-recovery.html`;
- the participant signs a fresh read-only `VIEW_ROUTE` challenge;
- successful recovery mints a new short-lived route-view capability and returns to the same mission;
- resume never creates a mission, recreates an invitation, authorizes a pass, sends NIM, or reconciles custody.

## Automated gates

PR branch gates:

- CI: SUCCESS
- guided full flow: SUCCESS
- persistent-resume panel exercised with `sessionStorage.clear()`
- responsive viewports:
  - mobile 375×812
  - tablet 768×1024
  - desktop 1280×900

Production merge gates:

- Cloudflare Workers build: SUCCESS
- Judge Window smoke: SUCCESS
- CI: SUCCESS
- Guided flow — mobile + tablet + desktop: SUCCESS

## Remaining real-device proof

The mission that exposed the defect was created before PR #119, so that device never had a chance to write the new persistent locator.

Do **not** create another payment.

Use the existing ARRIVED mission once through signed route-access recovery to bootstrap the locator. After that:

1. return to the mission;
2. close NimCarry completely;
3. reopen NimCarry at home;
4. confirm **Resume recent mission** appears;
5. sign fresh `VIEW_ROUTE`;
6. confirm the same ARRIVED receipt opens;
7. confirm no send/recheck/payment control appears.

Only this real-device re-entry proof remains before moving the workstream to Destination Claim.
