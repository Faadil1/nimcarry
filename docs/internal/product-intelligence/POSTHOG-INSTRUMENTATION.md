# PostHog Instrumentation Plan

Status: **PLAN ONLY — do not emit production events until a dedicated NimCarry PostHog project is connected and privacy configuration is reviewed.**

The currently connected ChatGPT PostHog workspace is not NimCarry and must not receive NimCarry data.

## Principles

- Never send names, emails, wallet addresses, invite tokens, target wallets, mission secrets, or free-text notes.
- Prefer anonymous/stable internal IDs where necessary.
- Treat Nimiq wallet verification as a boolean/state transition, not a wallet identifier.
- Disable or mask replay on sensitive custody/profile surfaces unless explicitly reviewed.
- Analytics must not become a second source of custody truth.

## Canonical product events

| Event | Fires when | Key safe properties |
|---|---|---|
| `profile_registration_started` | profile form begins | source, device_class |
| `profile_registered` | backend registration succeeds | source |
| `privacy_consent_recorded` | current notice accepted | notice_version |
| `wallet_link_started` | user asks to connect | runtime_context |
| `wallet_provider_unavailable` | browser lacks Nimiq provider | runtime_context |
| `wallet_signature_requested` | challenge is presented | none |
| `wallet_verified` | signature verification succeeds | none |
| `mission_create_started` | create flow begins | source |
| `mission_created` | backend mission exists | route_type if later defined |
| `invitation_created` | invite exists | expiry_bucket |
| `invitation_opened` | candidate opens invite | none |
| `invitation_accepted` | consent succeeds | none |
| `pass_started` | custody transfer begins | none |
| `pass_approved` | wallet approval returned | network |
| `pass_broadcast_observed` | chain evidence exists | network |
| `hop_finalized` | backend independently confirms FINAL | network |
| `mission_arrived` | final destination is confirmed | hop_count_bucket |
| `route_recovery_started` | user invokes recovery | reason_code |
| `route_recovered` | recovery succeeds | recovery_type |
| `repeat_mission_created` | same user creates later mission | days_since_prior_bucket |

## Required funnels

### Activation
`profile_registered → wallet_link_started → wallet_verified → mission_created OR invitation_accepted`

### Protocol proof
`wallet_verified → pass_started → pass_approved → pass_broadcast_observed → hop_finalized`

### Retention
`activated → second meaningful mission within 7 / 30 days`

### Recovery
`route_recovery_started → route_recovered`

## First dashboards

- Acquisition → verification → activation funnel.
- Pass/finality funnel with exact failure stage.
- 7-day / 30-day repeat usage.
- Browser context breakdown for provider unavailable.
- Mission recovery rate.
- Top drop-off stage by device/context.

## Session replay boundary

Default recommendation:
- no replay on profile registration;
- no replay on invitation tokens/capability-bearing URLs;
- mask all text inputs;
- exclude wallet/address surfaces;
- only enable broader replay after a dedicated privacy review.

## Rollout gate

Instrumentation is ready to implement only when:
1. a NimCarry-owned PostHog project exists;
2. project key/host are provisioned through secrets/config;
3. privacy notice is updated if necessary;
4. event taxonomy is reviewed against actual code paths;
5. replay is disabled or safely masked by default.
