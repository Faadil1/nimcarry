# HANDOVER — NimCarry

Date: 2026-09-12  
Canonical version: **0.8.37**
State: `PROVIDER_PREFLIGHT_DEPLOYED_PRODUCTION_READY`

## Read first

`CANONICAL-STATE.yaml` is the source of truth and overrides chat memory. Update both `CANONICAL-STATE.yaml` and `HANDOVER.md` after every meaningful milestone so a new conversation can take lead without chat history.

## Product law — FROZEN

**NimCarry** — *One NIM. One bridge at a time.* Exactly `1 NIM = 100000 Luna` is the semantic custody baton, not a reward/stake/wager/prize. Every mission has a destination, every bridge consents, and only independently verified `FINAL` changes custody. Destination as finalized recipient = `ARRIVED`.

Judge line: **NimCarry uses 1 NIM to make warm introductions verifiable.**

## Secure stack already complete

PR #24 — secure vertical — merged at `449f1d3b942b8593596ea2e637033444f41f0bc9`; post-merge CI `34598905774` PASS.

PR #25 — Cloudflare runtime scaffold — merged at `aed163d0335b5fc68317ec4cb325a56739cf54b8`; post-merge CI `34601571626` PASS. The stack is:
- Cloudflare Worker Static Assets from `web/`;
- canonical Node backend inside Cloudflare Container;
- stable container identity `nimcarry-primary`;
- `max_instances: 1` for the proof gate;
- same-origin SPA/API routing;
- production mode + Postgres repository + legacy `/relay` mutations disabled.

No real Nimiq testnet `FINAL` or `ARRIVED` has yet been claimed.

## Database — NEON READY

Dedicated Neon PostgreSQL project:
- project `nimcarry`
- project id `late-credit-21248077`
- branch `main`
- database `nimcarry`
- region `aws-us-east-1`
- PostgreSQL 18

Applied on production main:
- `migrations/001_reach_mission_foundation.sql`
- `migrations/002_postgres_concurrency_guards.sql`

Verified: **7 canonical tables + 3 concurrency triggers PASS**.

The Neon connection string is installed only as Cloudflare runtime secret `CARRY_ONE_DATABASE_URL`. Never expose it in chat, Git, issues, screenshots, logs, or evidence.

## Cloudflare production runtime — DEEP SMOKE PASS

Production origin:
`https://nimcarry.faadil-casecraft.workers.dev`

Account/runtime status:
- Workers Paid enabled;
- production `workers.dev` enabled;
- preview disabled;
- Worker + Container deployed;
- runtime secrets installed;
- Observability enabled;
- `CARRY_ONE_CANONICAL_ORIGIN` is now a Wrangler var so it cannot silently disappear on deploy;
- the three sensitive runtime names are declared via `secrets.required`.

Hardening commits:
- Observability config: `48679a3cc4b6681a6f6dca923dc06006e1cee788`
- runtime config source-of-truth hardening: `1189cc6096b96c21827be9350ae90a814e85e45f` — CI `34646840377` PASS
- deterministic deep runtime smoke: `0ff137d5287fec484cb2fa7e132e1c88758e6e0b` — CI `34649046241` PASS

Observed production proof:
- `GET /health` = `200 {"status":"ok"}`
- static same-origin asset check `/nimcarry-mark.svg` = `304`, outcome OK
- `GET /health?deep=1` = **PASS** with:
  - `backend_http_status: 200`
  - `repository_mode: postgres`
  - `mission_http_bindings: enabled`
  - `canonical_origin: https://nimcarry.faadil-casecraft.workers.dev`
  - `container_identity: nimcarry-primary`
  - `max_instances_for_proof_gate: 1`
  - `legacy_relay_gate.pass: true`
  - `legacy_relay_gate.status: 403`
  - `legacy_relay_gate.error: LEGACY_RELAY_DISABLED`

This deterministic endpoint supersedes the need to manually hunt startup console lines for the runtime gate. Runtime smoke is now considered **PASS**.

Cloudflare Builds housekeeping is complete. Production trigger `b060a3f1-7490-46ef-9ea7-8f997d8f7884` for Worker tag `79cd9d3ec2814fc8a565a2b1c75dc6c3` now includes only deploy-relevant paths (`cloudflare/**`, `Dockerfile.cloudflare`, `.dockerignore`, root package manifests, `src/**`, `migrations/**`, and `web/**`) and excludes `docs/**`, `CANONICAL-STATE.yaml`, `HANDOVER.md`, and repository-only documentation. Documentation-only commits therefore do not deploy production.

The Build-scoped variable list is empty after removing all four duplicate runtime-config copies. Worker runtime secrets were preserved under their original names: `CARRY_ONE_DATABASE_URL`, `CARRY_ONE_TARGET_ENCRYPTION_KEY_B64URL`, and `CARRY_ONE_TARGET_HMAC_KEY_B64URL`. Reverification returned `GET /health?deep=1` = `200`, `status: ok`, Postgres mode, and `LEGACY_RELAY_DISABLED` at `403`.

Why singleton routing matters: route-view and broadcast capabilities remain process-local. If the Container restarts during an active proof, fail closed and restart the proof. Never manufacture recovery evidence.

## CURRENT GATE — REAL NIMIQ PAY TESTNET E2E

Current status:
`RUNTIME_SMOKE_PASS_NIMIQ_PAY_PROVIDER_THEN_REAL_PROOF`

Next exact actions:
1. open the production Mini App in Nimiq Pay and confirm the injected provider is available;
2. execute the real A-to-B-to-C Nimiq Pay testnet proof;
3. open the production Mini App in Nimiq Pay and confirm the injected provider is available;
4. execute the real A → B → C Nimiq Pay testnet proof;
5. after each real `FINAL`, query Neon and capture durable state evidence before advancing custody.

Target topology:
- A = creator / initial holder
- B = bridge
- C = consented destination
- 3 testnet wallets, preferably 2 physical devices

Target proof:
`CREATE → INVITE → ACCEPT → AUTHORIZE → A sends exactly 1 NIM to B → FINAL → B holder → INVITE C → ACCEPT → AUTHORIZE → B sends exactly 1 NIM to C → FINAL → ARRIVED → Verified Route Receipt`

Required checks:
- exactly `100000 Luna` each hop;
- requested fee `0` plus actual wallet/network behavior;
- independent FINAL before custody movement;
- durable Neon state after each FINAL;
- multi-account wallet selection;
- native invitation deep link;
- iOS cold/warm/background-resume;
- real Route Receipt matches finalized route.

**Never claim real testnet `FINAL` or `ARRIVED` before observed evidence exists.**

## Tooling boundary

GitHub and Neon are directly manageable from this chat. Cloudflare dashboard/account settings still require the authenticated user session unless moved to ChatGPT Work/Cloud Browser or a local Codex/CLI flow with Cloudflare auth. Do not expose the database credential or encryption/HMAC keys.

## Post-E2E order

1. verify real Route Receipt;
2. first 5 observed cold-start tests under 60s;
3. genuine Skool + public social posts for 5/5 promotion;
4. reach 4+, 11+, then 25+ legitimate unique wallet opens;
5. submit once genuinely usable;
6. Sep 16 Sip & Show only if runtime remains green;
7. judge-window monitoring/rollback + final TRACE/demo packaging.


## Milestone — provider preflight + operator readiness (2026-09-11)

- Live production frontend pass flow now checks the server-authorized `expected_sender` against the explicitly selected Nimiq Pay account before invoking `sendBasicTransactionWithData`.
- Canonical guards remain enforced: exactly `100000` Luna, fee `0`, and `co:v1:` opaque commitment; demo mode remains isolated.
- Verification: full suite **156/156 PASS** across 24 files; TypeScript build **PASS**.
- Operator checklist: `docs/REAL-TESTNET-OPERATOR-CHECKLIST-2026-09-11.md`.
- Cloudflare Workers Builds watch-path and Build-variable secret cleanup are complete via the official API; no Worker runtime secrets were changed.
- Next stop: open the production origin inside Nimiq Pay, confirm `listAccounts()` and account selection. Stop before any send until the user explicitly approves each wallet transaction.


## Cloudflare Builds Gate A milestone (2026-09-11)

- `npx wrangler whoami` now succeeds for the authenticated account.
- Official Workers Builds API inspection and update succeeded with the active API token.
- Trigger path filters now exclude documentation-only commits; Build-scoped variables are empty.
- Worker runtime secret names remain present and production deep runtime smoke remains PASS.

## Gate B provider-preflight deployment verification (2026-09-12)

- Commit `3a40c8593d4e99f85339b720c407dedca3dfef2b` pushed to `main`.
- Full suite: **156/156 PASS** across 24 files; TypeScript `--noEmit`: **PASS**.
- GitHub CI: run `34676115077`, **PASS**.
- Workers Build: `bd31e1e8-def9-48aa-bbf8-8a9554c2af5c`, **PASS**.
- Production `/health`: **200**, `status: ok`.
- Production `/health?deep=1`: **200**, Postgres mode, backend HTTP 200, and legacy relay disabled with 403.
- Production SPA and deployed `/app.js`: **PASS**; bundle contains the `expected_sender` account guard and `WRONG_WALLET_SELECTION` fail-closed path before `sendBasicTransactionWithData`.
- Provider readiness is limited to deployed production code verification. A live Nimiq Pay session check has **not** been run; no wallet send was initiated; real `FINAL` / `ARRIVED` remain unobserved.

## SDK provider acquisition fix + read-only diagnostic (2026-09-12)

- Root cause: the live frontend was polling `window.nimiq` directly instead of acquiring the injected provider through the official Mini App SDK initializer.
- `web/app.js`, `web/http-compat.js`, and the hidden `?provider-check=1` route now share SDK `init()` provider acquisition; the diagnostic calls only `listAccounts()` and renders short account fingerprints.
- Route-view signing now uses the same initialized provider. Real-flow guards remain intact: expected sender, exactly `100000` Luna, fee `0`, `co:v1:` commitment, and explicit wallet approval before send.
- Directly related tests/docs updated. Full suite: **158/158 PASS** across 24 files; TypeScript `--noEmit`: **PASS**.
- Production `/health`: **200**, `/health?deep=1`: **200**, Postgres mode and legacy relay fail-closed gate verified. Production SPA and bundle expose the SDK provider path, read-only diagnostic, and transaction guards.
- Deployed Worker version: `5d0830da-1a6d-4bf8-b090-eec865b32fb8`; static/frontend deployment used `--containers-rollout=none`, leaving the existing backend container unchanged.
- Exact partial state: SDK provider fix is deployed and production-code verified; live Nimiq Pay phone test is **PENDING**. Do not claim provider PASS, account listing PASS, wallet fingerprint, or any real proof until that phone test succeeds. No wallet send, signature, mission creation, or Neon mutation was initiated by this work.

## Live provider readiness closed (2026-09-12)

- User-provided TESTNET screen recording confirms the production Mini App provider session is ready: `live_nimiq_pay_session_check: PASS` and `listAccounts: PASS_1_ACCOUNT`.
- A short public A-wallet fingerprint is intentionally not transcribed into this continuity update because it was not provided as text; no full wallet address is recorded here.
- Provider-readiness gate: **CLOSED / PASS**. Next exact gate: execute the real Nimiq testnet `A → B → C` proof.
- `wallet_send_initiated: false`; `real_FINAL_observed: false`; `real_ARRIVED_observed: false`.
- No wallet send was initiated by this continuity-only update.

## Operator boundary before real proof (2026-09-12)

- Canonical version: `0.8.38`.
- Provider readiness remains **PASS**; real proof is **NOT STARTED**.
- The only blocker is that live A/B/C testnet wallet-role mapping is not yet established in the operator environment.
- Exact state: no mission, invitation, wallet signature, send, `FINAL`, or `ARRIVED` occurred.
- `wallet_send_initiated: false`; `real_FINAL_observed: false`; `real_ARRIVED_observed: false`.
- Next exact action: `ESTABLISH_A_B_C_TESTNET_WALLET_MAPPING`.
- This milestone changes continuity only; runtime code and wallet state were not touched.

## A/B/C mapping and funding readiness (2026-09-12)

- Canonical version: `0.8.39`.
- Verified TESTNET role mapping using short fingerprints only: A `NQ46 EB… CLQL`, B `NQ48 HR… E1QT`, C `NQ67 MX… 7S1U`.
- Device plan: A and C are distinct TESTNET accounts on phone 1; B is on phone 2.
- Funding readiness: A funded with observed balance `110000 NIM`; B funded with observed balance `110000 NIM`; C funding not required before proof.
- `ESTABLISH_A_B_C_TESTNET_WALLET_MAPPING`: **COMPLETE**. Operator and funding blockers: **CLEARED**.
- Exact execution state remains: no mission, no invitation, no wallet signature, no NimCarry send, no `FINAL`, no `ARRIVED`.
- Next exact action: `START_REAL_PROOF_CREATE_MISSION_WITH_A`.
- This is a continuity-only milestone; runtime code and wallet state were not touched.

## Real-proof partial milestone: invitation pending (2026-09-12)

- Canonical version: `0.8.40`.
- Real TESTNET mission was created by A targeting C; a private invitation for B was created. No private invitation token or link is recorded here.
- B acceptance is **NOT YET observed**. Current holder remains A/Faadil; observed UI state is **Waiting for response**; finalized hops: `0`.
- No `AUTHORIZE_PASS`, NimCarry send, `FINAL`, or `ARRIVED` occurred.
- Next exact action: `B_OPEN_PRIVATE_INVITE_AND_ACCEPT`.
- This is a continuity-only milestone; no wallet send was initiated.

## Creator-session recovery path deployed (2026-09-12)

- Canonical version: `0.8.41`.
- Added and deployed a narrow recovery path for the existing mission: SDK provider → require A by short fingerprint → signed `VIEW_ROUTE` challenge → `POST /missions/:id/view` → store `carryone.view.<missionId>` → navigate to the mission.
- Production `/health` and `/health?deep=1`: **200**; deployed bundle contains the recovery path and wrong-wallet fail-closed guard. Frontend-only deployment version: `11f1f888-3c8b-4ab1-a749-77d443815e61`.
- Live recovery was **not observed** because the existing mission ID and active phone-A Nimiq Pay session were unavailable in the operator environment. A has not been claimed to see the mission.
- No new mission, invitation, `AUTHORIZE_PASS`, send, `FINAL`, `ARRIVED`, or custody change occurred.
- Next exact action: `CREATOR_RECOVER_EXISTING_MISSION_WITH_A`.

## Live creator-session recovery PASS (2026-09-12)

- Canonical version: `0.8.42`.
- Existing real TESTNET mission was successfully restored on phone A; the UI visibly shows **Pass 1 NIM**.
- B invitation status is **ACCEPTED**.
- Neon confirms: mission `ACTIVE`, `finalized_hop_count=0`, `current_sequence=0`, no `pass_intent`, no hop, no `FINAL`, and no `ARRIVED`.
- `wallet_send_initiated: false`.
- Next exact action: `OPEN_PASS_SCREEN_WITHOUT_AUTHORIZING_SEND`.
- Continuity-only update; runtime code was not changed and no send was authorized.

## Real TESTNET pre-send screen milestone (2026-09-12)

- Canonical version: `0.8.43`.
- Phone A reached **Screen 4 / 5 · Pass 1 NIM** with accepted bridge B visible.
- Displayed value: `1 NIM = 100000 Luna`; requested fee: `0`; custody remains **FINAL-only**.
- **Authorize + Pass 1 NIM was not pressed.**
- Read-only Neon observation: mission `ACTIVE`, invitation `ACCEPTED`, `finalized_hop_count=0`, `current_sequence=0`, no `pass_intent`, and no hop.
- `wallet_send_initiated: false`; `real_FINAL_observed: false`; `real_ARRIVED_observed: false`.
- Next exact action: `USER_APPROVE_FIRST_A_TO_B_TESTNET_SEND`.
- Continuity-only update; runtime code was not changed.

## Failed first A→B send attempt (2026-09-12)

- Canonical version: `0.8.44`.
- `AUTHORIZE_PASS` succeeded and pass-intent sequence `1` exists. Nimiq Pay displayed the native `1 NIM` approval screen, then returned a sync error.
- Independent TESTNET.WATCH check on B: balance remains `110000 NIM`; no A→B transaction observed.
- Neon: `tx_hash: null`, no hop, `finalized_hop_count=0`, mission `ACTIVE`, invitation `ACCEPTED`.
- Chain broadcast: **NOT OBSERVED / NO BROADCAST EVIDENCE**. No transaction hash is recorded or inferred.
- `real_FINAL_observed: false`; `real_ARRIVED_observed: false`; `wallet_send_initiated: true`.
- Next exact action: `RETRY_A_TO_B_AFTER_NIMIQ_PAY_SYNC_HEALTH_CHECK`.
- Continuity-only update; runtime code was not modified.

## Truth correction: wallet approval flow initiated (2026-09-12)

- Canonical version: `0.8.45`.
- Correction: `authorize_and_pass_button_pressed: true`. A wallet send attempt was initiated because Nimiq Pay opened the native approval flow, which then returned a sync error.
- This does **not** establish chain broadcast: `chain_broadcast: NOT_OBSERVED_NO_BROADCAST_EVIDENCE`, `tx_hash: null`, no hop, `real_FINAL_observed: false`, and `real_ARRIVED_observed: false` remain unchanged.
- Next exact action remains `RETRY_A_TO_B_AFTER_NIMIQ_PAY_SYNC_HEALTH_CHECK`.
- Continuity-only update; runtime code was not modified.

## Retry preflight: provider healthy, prior invitation expired (2026-09-12)

- Canonical version: `0.8.46`.
- Phone A provider health check on the production origin: **PASS**. `listAccounts()` succeeded with exactly one account: A `NQ46 EB… CLQL`.
- No signing or send occurred during this diagnostic.
- Read-only Neon: the previous B invitation is **EXPIRED** because its accepted-pass deadline elapsed; mission remains `ACTIVE`, `current_sequence=0`, `finalized_hop_count=0`.
- Pass-intent sequence `1` still exists with `tx_hash: null`; no hop, `FINAL`, or `ARRIVED`.
- Existing failed-attempt history and `chain_broadcast: NOT_OBSERVED_NO_BROADCAST_EVIDENCE` remain unchanged.
- Next exact action: `CREATE_FRESH_B_INVITATION_FOR_EXISTING_MISSION`.
- Continuity-only update; runtime code was not changed.

## Duplicate-key recovery blocker (2026-09-12)

- Canonical version: `0.8.47`.
- Exact proof truth preserved: mission `ACTIVE`, `current_sequence=0`, previous B invitation `EXPIRED`, existing pass intent sequence `1` with `tx_hash: null`, no hop, `0` FINAL, no ARRIVED, and no chain broadcast.
- Blocker: the one-invitation-per-mission-sequence uniqueness constraint currently prevents reissuing the expired invitation through the normal create-invitation path.
- Required fix: same-row invitation reissue with a fresh token/hash, old-token invalidation, active-holder authorization, and no second pass intent.
- Next exact action: `IMPLEMENT_SAME_ROW_INVITATION_REISSUE_FOR_EXPIRED_SEQUENCE`.
- No NIM was sent and no custody state changed.

## Invitation reissue implementation and deployment boundary (2026-09-12)

- Canonical version: `0.8.48`.
- Implemented same-row invitation reissue for the exact expired-sequence gap across file and PostgreSQL repositories, service/HTTP, audit evidence, and deterministic tests. The unique `one_invitation_sequence_per_mission` invariant remains intact; no new mission or invitation row is created.
- Reissue resets the old row to `INVITED` with a fresh token/hash and refreshed expiry, invalidates the old token, clears acceptance/terminal timestamps, requires ACTIVE/current-holder authorization, and requires an active pass-intent recipient match when one exists.
- Full suite: **163/163 PASS**; TypeScript `--noEmit`: **PASS**. Production `/health` and `/health?deep=1`: **200**; SPA verification: **PASS**.
- Runtime container deployment was attempted but blocked because Docker CLI is unavailable. Worker deployment without container rollout succeeded (`18da0227-d990-4bd7-8d6a-77b4057fc5ff`); the invitation-reissue runtime fix is tested but **not claimed live in production**.
- Exact proof truth remains unchanged: mission `ACTIVE`, `current_sequence=0`, previous B invitation `EXPIRED`, pass intent sequence `1` with `tx_hash: null`, no hop, `0` FINAL, no ARRIVED, and no chain broadcast.
- Next exact action: `DEPLOY_INVITATION_REISSUE_CONTAINER_AFTER_DOCKER_AVAILABLE`.
- No NIM was sent and runtime code was not changed after the deployment attempt.

## Invitation reissue production container deployment verified (2026-09-12)

- Canonical version: `0.8.49`.
- Cloudflare authentication: **PASS** via the official Workers Builds API.
- Worker tag: `79cd9d3ec2814fc8a565a2b1c75dc6c3`; production trigger: `b060a3f1-7490-46ef-9ea7-8f997d8f7884`.
- Build `7e613390-017d-45a5-8a6c-ec8e329cd7c8` for commit `77248b73434acad6a15a69fd3ebc532908407450` on `main`: **SUCCESS**; no duplicate build was triggered.
- Official build logs show image digest `sha256:188de79dbbe87c819c1a1f51ab3cc77f48fba87ba9478a14a5b15fc433388660` deployed to `nimcarry-api`, with Worker version `850ad13e-a594-4d12-94ce-dc78eddb6fef`.
- Production `/health`: **200**, `status: ok`. `/health?deep=1`: **200**, Postgres, backend HTTP 200, `container_identity: nimcarry-primary`, `max_instances_for_proof_gate: 1`, and legacy relay gate PASS/403.
- The invitation-reissue backend is therefore confirmed deployed in the production container. No wallet action occurred; no broadcast evidence, `FINAL`, or `ARRIVED` is claimed.
- Next exact action remains: `RETRY_A_TO_B_AFTER_NIMIQ_PAY_SYNC_HEALTH_CHECK`.

## Frontend invitation-reissue wiring deployed (2026-09-12)

- Canonical version: `0.8.50`.
- Choose-next-bridge now detects only an `EXPIRED` invitation whose sequence equals the mission's next canonical sequence. That recovery path reuses the existing invitation ID and calls `POST /missions/:id/invitations/:invitationId/reissue`.
- Genuinely new sequences retain `POST /missions/:id/invitations`; the normal create path remains unchanged. The reissue request preserves candidate wallet B through the existing `candidate_wallet` binding and signs the existing `CREATE_INVITATION` action with the invitation ID; no second pass intent is created.
- Deterministic frontend/static verification: **18/18 PASS**. Production frontend-only deployment: Worker version `1064263d-1b14-4fce-a878-6f7fb943ec4b`; container rollout disabled.
- Production SPA: **200/PASS**; deployed `/app.js` contains the expired-current-sequence `/reissue` branch. `/health`: **200**. `/health?deep=1`: **200**, Postgres, backend HTTP 200, `nimcarry-primary`, `max_instances_for_proof_gate: 1`, legacy relay PASS/403.
- Exact proof truth remains unchanged: no wallet send, no chain broadcast evidence, no `FINAL`, and no `ARRIVED`.
- Next exact action: `REISSUE_B_INVITATION_FROM_A_UI`.

## Expired invitation recovery-read fix deployed (2026-09-12)

- Canonical version: `0.8.51`.
- Root cause fixed: MissionView previously read only `getOpenInvitation()`, so the expired sequence-1 row was absent from A's view and the frontend fell back to normal creation.
- Added `getInvitationForSequence(missionId, currentSequence + 1)` to both repositories. `getOpenInvitation()` semantics are unchanged. Mission views fetch the terminal next-sequence row only for an authorized creator/current-holder recovery view; unrelated viewers receive no invitation object/private candidate data.
- Deterministic verification: full suite **165/165 PASS** across 24 files; TypeScript `--noEmit`: **PASS**. Service/HTTP coverage proves A sees the expired existing invitation ID/sequence/status and an unrelated target sees no recovery invitation; frontend static coverage proves expired recovery selects `/reissue` while fresh sequences retain `/invitations`.
- Official Workers Build for `48d0bb516e01314ce802d92b94e5644e129e0f90`: `65acbda8-2519-422f-9e80-24f2a3ba0439`, **SUCCESS**; container image digest `sha256:21dea74e564c32df560ae8fa10889704d492600879a0970953620e4a4018b778`; Worker version `5d87dfc4-18f3-4d36-840c-3bbb587b8d20`.
- Production `/health`: **200**. `/health?deep=1`: **200**, Postgres, backend HTTP 200, `nimcarry-primary`, `max_instances_for_proof_gate: 1`, legacy relay PASS/403. SPA and deployed bundle: **PASS**, including the expired-recovery `/reissue` branch. CI for implementation commit: **PASS** (`34698464068`).
- This milestone did not retry the wallet/UI flow. No broadcast, `FINAL`, or `ARRIVED` is claimed. Next exact action remains `REISSUE_B_INVITATION_FROM_A_UI`; stop before executing it.

## Live A recovery checkpoint: expired invitation is visible but non-actionable (2026-09-12)

- Canonical version: `0.8.52`.
- A successfully recovered the existing mission after `0.8.51`; the expired sequence-1 invitation is visible in A's authorized mission view.
- The UI currently renders disabled **Waiting for response**, so no reissue occurred. Blocker: `FIX_EXPIRED_INVITATION_PRIMARY_ACTION_FOR_REISSUE`.
- Neon truth remains unchanged: mission `ACTIVE`, `current_sequence=0`, `finalized_hop_count=0`, invitation sequence `1` `EXPIRED`, pass intent sequence `1` with `tx_hash=null`, no hop, no `FINAL`, and no `ARRIVED`.
- No wallet/send action occurred. This is a continuity-only checkpoint; runtime code was not changed.
- Next exact action: `FIX_EXPIRED_INVITATION_PRIMARY_ACTION_FOR_REISSUE`.

## Expired invitation recovery made actionable (2026-09-12)

- Canonical version: `0.8.53`.
- For an authorized current holder/creator, an `EXPIRED` invitation at `currentSequence + 1` now exposes `CREATE_INVITATION`, which opens the existing Choose-next-bridge dialog and lets the deployed frontend select the same-row `/reissue` route.
- `INVITED` remains `WAIT`; `ACCEPTED` pass behavior is unchanged. Unauthorized viewers cannot trigger recovery and remain redacted. No new invitation row or pass intent is created.
- Full verification: **166/166 PASS** across 24 files; TypeScript `--noEmit`: **PASS**. Deterministic mission-view/HTTP/frontend tests cover expired actionable recovery, `INVITED` wait, accepted semantics, and unauthorized access.
- Official Workers Build `50d71142-83ab-410f-b3a3-5f014e5a5a77` for commit `cc94007a9ad188fea31eb0a581f4c7d92ce9f755`: **SUCCESS**; container image digest `sha256:fa55b6ac75efff935bce9f0ce47d71d1e1fba16096283a607c302af8b79e62aa`; Worker version `4958f6ab-d8cf-4281-b2a4-051746835dac`.
- Production `/health`: **200**. `/health?deep=1`: **200**, Postgres, backend HTTP 200, `nimcarry-primary`, `max_instances_for_proof_gate: 1`, legacy relay PASS/403. SPA and deployed bundle: **PASS**, including the primary-action-compatible `/reissue` path. CI: **PASS** (`34699901846`).
- No wallet/send action occurred during implementation or verification. No broadcast, `FINAL`, or `ARRIVED` is claimed.
- Next exact action: `REISSUE_B_INVITATION_FROM_A_UI`. Stop before executing the retry.

## Live same-row B invitation reissue and acceptance milestone (2026-09-12)

- Canonical version: `0.8.54`.
- Baseline was canonical `0.8.53`. A successfully reissued the expired B invitation through the same-row `/reissue` path; no `DUPLICATE_KEY` occurred and a new private invite was generated.
- B opened the new invite in Nimiq Pay TESTNET and accepted it.
- Neon confirms: mission `ACTIVE`, `current_sequence=0`, `finalized_hop_count=0`, invitation sequence `1` is `ACCEPTED`, existing pass intent sequence `1` remains present with `tx_hash=null`, and `hop_count=0`.
- No chain broadcast, `FINAL`, or `ARRIVED` occurred. This is a continuity-only update; no runtime changes and no wallet send occurred.
- Next exact action: `PREPARE_CONTROLLED_A_TO_B_RETRY`.

## Controlled A-to-B retry preflight blocker: stale unbroadcast pass intent (2026-09-12)

- Canonical version: `0.8.55`.
- Baseline was canonical `0.8.54`. Mission remains `ACTIVE`, `current_sequence=0`, `finalized_hop_count=0`; invitation sequence `1` is `ACCEPTED` and its `pass_deadline_at` remains valid.
- Existing pass intent sequence `1` has `tx_hash=null`, was created at `2026-09-12T08:16:17.654Z`, and its 125-minute validity window is stale/expired.
- No hop, chain broadcast, `FINAL`, or `ARRIVED` exists. Do not retry the wallet send yet.
- Blocker/next exact action: `RENEW_STALE_UNBROADCAST_A_TO_B_PASS_INTENT`.
- This is a continuity-only update; runtime code and wallet state were not changed.

## Stale unbroadcast pass-intent renewal deployed (2026-09-12)

- Canonical version: `0.8.56`.
- Matching active pass intents that are still valid continue to be reused. A matching stale intent is renewed only when no broadcast/transaction hash exists: the old intent is cancelled and a fresh opaque-commitment intent is created for the same mission, sequence, current holder, and recipient.
- Any stale intent with broadcast evidence is refused; wrong-recipient or other conflicting active intents fail closed. Accepted invitation binding and pass-deadline validation remain enforced.
- Deterministic verification: full suite **169/169 PASS** across 24 files; TypeScript `--noEmit`: **PASS**. Tests cover valid reuse, stale-unbroadcast renewal, stale-broadcast refusal, wrong-recipient conflict, and durable relay restart behavior.
- Official Workers Build `2f656021-d04e-4a6c-92b2-e3655bc7aa20` for commit `e0de513d196afd707525b7b85cf0b7ef4abc6c13`: **SUCCESS**; container image digest `sha256:124cbbd0df04922fcdf05b0ade6aa3baa5bcbe5413b80aaf9e156907a41a726f`; Worker version `c744a29b-630a-4174-bd06-0626a8efdc49`.
- Production `/health`: **200**. `/health?deep=1`: **200**, Postgres, backend HTTP 200, `nimcarry-primary`, `max_instances_for_proof_gate: 1`, legacy relay PASS/403. CI: **PASS** (`34702440284`).
- No wallet retry occurred. No broadcast, `FINAL`, or `ARRIVED` is claimed.
- Next exact action: `PREPARE_CONTROLLED_A_TO_B_RETRY`. Stop before executing the wallet retry.

## Live pre-send route-view capability checkpoint (2026-09-12)

- Canonical version: `0.8.57`.
- A opened Screen 4 / Pass 1 NIM on production, but the page displayed `ROUTE_VIEW_CAPABILITY_REQUIRED`; direct `/pass` navigation lacked a current Bearer route-view capability.
- The UI rendered fallback “Accepted bridge” text, so this was **not** a valid send-ready state. No `Authorize + Pass 1 NIM` click occurred.
- Neon remains: mission `ACTIVE`, `current_sequence=0`, `finalized_hop_count=0`, invitation sequence `1` `ACCEPTED`, `tx_hash=null`, and `hop_count=0`.
- No broadcast, `FINAL`, or `ARRIVED` occurred. This is a continuity-only update; no runtime change and no wallet send occurred.
- Next exact action: `RECOVER_A_ROUTE_VIEW_THEN_REOPEN_PASS`.

## Live reissued-B acceptance milestone (2026-09-12)

- Canonical version: `0.8.58`.
- The previous invitation expired and was successfully reissued; B accepted the newly reissued TESTNET invitation.
- Mission remains `ACTIVE`, `current_sequence=0`, `finalized_hop_count=0`; invitation sequence `1` is `ACCEPTED`.
- `accepted_at`: `2026-09-12T16:09:23.851Z`; fresh `pass_deadline_at`: `2026-09-12T17:09:23.851Z`.
- Existing pass intent sequence `1` remains stale with `tx_hash=null`; `hop_count=0`.
- No chain broadcast, `FINAL`, or `ARRIVED` occurred. This is a continuity-only update; no runtime change and no wallet send occurred.
- Next exact action: `RECOVER_A_ROUTE_VIEW_AND_OPEN_VALID_PASS_SCREEN`.

## Failed send-ready checkpoint: stale accepted pass remains non-actionable (2026-09-12)

- Canonical version: `0.8.59`.
- A recovered and reopened Screen 4, but `ROUTE_VIEW_CAPABILITY_REQUIRED` still appeared. Screen 4 rendered fallback “Accepted bridge”, so it was not a valid send-ready state.
- No `Authorize + Pass 1 NIM` click occurred.
- Neon remains: mission `ACTIVE`, `current_sequence=0`, `finalized_hop_count=0`, invitation sequence `1` `ACCEPTED`, `tx_hash=null`, and `hop_count=0`.
- No broadcast, `FINAL`, or `ARRIVED` occurred. This is a continuity-only update; no runtime change and no wallet send occurred.
- Blocker/next exact action: `MAKE_STALE_UNBROADCAST_ACCEPTED_STATE_PASS_ACTIONABLE_ON_HOME`.

## Stale accepted pass made actionable on Mission Home (2026-09-12)

- Canonical version: `0.8.60`.
- Mission Home now exposes `PASS_1_NIM` when the authorized current holder has an `ACCEPTED` invitation and the matching active pass intent is stale but unbroadcast. The read path does not mutate or create intents.
- Valid active intents remain `WAIT`; stale intents with broadcast evidence remain blocked/fail closed. Unauthorized viewers cannot trigger recovery.
- Home-to-pass navigation preserves the stored route-view capability; deployed bundle verification confirms capability loading on Screen 4.
- Full verification: **173/173 PASS** across 25 files; TypeScript `--noEmit`: **PASS**. Production `/health`: **200**; `/health?deep=1`: **200**, Postgres, `nimcarry-primary`, `max_instances_for_proof_gate: 1`, legacy relay PASS/403; SPA/bundle: **PASS**.
- Official Workers Build `38494d3b-bc1a-489a-bbd4-9bcdcc0669de` for commit `8c9a54c9365758d6362a4e75c56fc02eef99b060`: **SUCCESS**; container image digest `sha256:9307d17b4f0924226329ef3420e28651a71bcaab30bb0350a7431a53d4d1626d`; Worker version `3a48ede5-5f95-4434-a99e-bef6b794e650`; CI **PASS** (`34706278368`).
- No wallet send, broadcast, `FINAL`, or `ARRIVED` occurred.
- Next exact action: `RECOVER_A_ROUTE_VIEW_AND_OPEN_VALID_PASS_SCREEN`. Stop before wallet send.

## Final live send-ready checkpoint (2026-09-12)

- Canonical version: `0.8.61`.
- A recovered through Mission Home and navigated internally to Screen 4. No `ROUTE_VIEW_CAPABILITY_REQUIRED` banner is present; accepted bridge B is correctly loaded.
- Displayed value is exactly `1 NIM / 100000 Luna`; requested fee is `0`; custody remains **FINAL-only**.
- `Authorize + Pass 1 NIM` is visible but has **not** been clicked.
- Neon remains: mission `ACTIVE`, `current_sequence=0`, `finalized_hop_count=0`, invitation sequence `1` `ACCEPTED`, `pass_deadline_at=2026-09-12T17:09:23.851Z`, existing pass intent sequence `1` with `tx_hash=null`, and `hop_count=0`.
- No broadcast, `FINAL`, or `ARRIVED` occurred. This is a continuity-only update; no runtime change and no wallet send occurred.
- Next exact action: `USER_APPROVE_CONTROLLED_A_TO_B_TESTNET_SEND`.

## Second controlled A-to-B wallet sync failure (2026-09-12)

- Canonical version: `0.8.62`.
- A clicked `Authorize + Pass 1 NIM`; `AUTHORIZE_PASS` successfully renewed the stale unbroadcast pass intent.
- Fresh pass intent sequence `1` was created at `2026-09-12T17:08:14.331Z`. Nimiq Pay then failed with “Something went wrong syncing your account.”
- Backend `tx_hash=null`; `hop_count=0`; mission remains `ACTIVE`, `current_sequence=0`, `finalized_hop_count=0`. Invitation sequence `1` expired at `2026-09-12T17:09:23.851Z`.
- No backend broadcast record, `FINAL`, or `ARRIVED` exists. Chain broadcast remains `UNKNOWN_PENDING_INDEPENDENT_CHAIN_CHECK` until B is checked externally; do not infer either outcome.
- This is a continuity-only update. No runtime change and no further wallet action occurred.
- Next exact action: `INDEPENDENT_CHAIN_CHECK_B_AFTER_SECOND_SYNC_FAILURE`.

## Independent verification: second A-to-B attempt not broadcast (2026-09-12)

- Canonical version: `0.8.63`.
- Independent TESTNET.WATCH check on B `…E1QT` was performed after the second sync failure. B balance remains exactly `110000.00 NIM`; transaction history contains only the original faucet receipt `+110000 NIM`.
- No `+1 NIM` A-to-B transaction exists from the `13:08 EDT` attempt. The second A-to-B attempt is therefore **NOT_BROADCAST**.
- Neon independently remains: mission `ACTIVE`, `current_sequence=0`, `finalized_hop_count=0`, invitation sequence `1` `EXPIRED`, fresh pass intent sequence `1` created at `2026-09-12T17:08:14.331Z`, backend `tx_hash=null`, and `hop_count=0`.
- No `FINAL` or `ARRIVED` occurred. Proof status is explicitly `NOT_BROADCAST_INDEPENDENTLY_VERIFIED`.
- This is a continuity-only update. No wallet action and no send retry occurred.
- Next exact action: `DIAGNOSE_RECURRING_NIMIQ_PAY_SYNC_FAILURE_BEFORE_RETRY`.

## Safe provider diagnostics deployed (2026-09-12)

- Canonical version: `0.8.64`.
- After CI passed for the no-broadcast checkpoint, the frontend now traces the pass sequence through provider initialization, account sync, pass-intent receipt, wallet approval opening, `sendBasicTransactionWithData` return, and failure classification.
- Diagnostics emit only fixed phases, booleans, counts, and the expected `100000` Luna / `0` fee. They never log private keys, seeds, full addresses, recipient data, raw errors, or transaction hashes.
- No wallet send was invoked during diagnosis. The independent chain result remains **NOT_BROADCAST**; no `FINAL` or `ARRIVED` occurred.
- Full suite: **174/174 PASS** across 25 files; TypeScript `--noEmit`: **PASS**. Frontend-only production deployment uploaded `/app.js` with the diagnostic markers; `/health`: **200**, `/health?deep=1`: **200** with Postgres, `nimcarry-primary`, `max_instances_for_proof_gate: 1`; SPA fallback: **200**.
- The trace distinguishes account-sync failure from pass-intent/transaction-contract failure and provider transport-or-sync failure by phase. The next real send remains blocked until the observed failure phase is isolated.
- Next exact action: `DIAGNOSE_RECURRING_NIMIQ_PAY_SYNC_FAILURE_BEFORE_RETRY`.
