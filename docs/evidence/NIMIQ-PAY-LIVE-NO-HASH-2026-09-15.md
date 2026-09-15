# Nimiq Pay live no-hash evidence — 2026-09-15

## Scope

This record captures the controlled real TESTNET A→B attempt performed after the ambiguous-submission hardening in PR #41 (`43caef75b6d86daa9ae9b575017c3e5ca01f7dc8`). It records only privacy-safe operational evidence. Full wallet addresses are intentionally omitted.

Mission: `bb654316-96c3-4c1e-9886-0c61771ecf22`

Roles:
- A — creator / current holder
- B — accepted bridge
- C — private destination

## Observed sequence

1. The real NimCarry Mini App was opened inside Nimiq Pay on TESTNET.
2. A created the mission with C as the private destination.
3. B accepted the private invitation through the normal signed acceptance flow.
4. A authorized the pass and Nimiq Pay displayed the native transaction confirmation for exactly **1 NIM** to B with the expected opaque `co:v1:` commitment.
5. The wallet approval returned without a provable transaction hash.
6. NimCarry correctly entered `NIMIQ_PAY_SUBMISSION_UNPROVEN`, warned against a second send, and kept the verified route at zero handoffs.
7. Reconciliation was triggered through `Refresh verified route`; the route remained at **0 verified handoffs / No FINAL handoff yet**.
8. The same mission was later recovered through the creator-session recovery path after the page had been lost.
9. A final `Refresh verified route` was performed at approximately **11:32 ET**, well beyond the canonical TESTNET intent-validity window for the original attempt (7,200 blocks at ~1 second plus a 5-minute safety buffer = ~125 minutes). The verified route still showed zero FINAL handoffs.

## Canonical classification

**No exact on-chain A→B broadcast was recovered by NimCarry before the intent became stale.**

Operational state for this attempt:
- transaction hash returned by Nimiq Pay: **none**
- exact independent chain match recovered by NimCarry: **none observed**
- verified FINAL handoffs: **0**
- custody advancement: **none**
- B→C: **not attempted**
- duplicate A→B send: **not attempted**
- stale no-match path: **INVALID / closed fail-safe by reconciliation semantics**

For shorthand this attempt may be described as **NOT_BROADCAST / INVALID**, but that wording means “no exact matching broadcast was discovered and accepted by NimCarry before expiry.” It does **not** claim privileged knowledge of Nimiq Pay internals beyond the observed no-hash result and independent reconciliation outcome.

## What this proves

The PR #41 safety behavior worked under the real failure mode:
- wallet approval without a hash was not treated as success;
- custody did not move without FINAL proof;
- the product prevented a blind duplicate send;
- independent exact-match reconciliation ran instead of trusting wallet UI state;
- after expiry, the unresolved attempt could fail closed rather than becoming a phantom handoff.

## What remains unresolved

This does **not** prove that the underlying Nimiq Pay provider bug is fixed. The live attempt still failed to produce a recoverable TESTNET transaction hash or an exact chain match.

Until a future controlled test yields an independently verified FINAL transaction, keep the provider issue classified as unresolved.

## UI defect discovered during the same live test

Repeated route refresh/re-render cycles produced duplicate `Only FINAL handoffs count.` cards on the zero-hop route. Root cause: when `.route` did not exist, `winning-intelligence.js` used `routeCard.after(note)`, placing the note outside `.route-card`; the next enhancer pass could not find it and added another.

The companion fix in this branch keeps the note inside the current route card, removes detached stale copies, and removes the pending-only note when a route becomes ARRIVED.
