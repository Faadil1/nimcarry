# Prompt — DeepSeek

You are the **Implementation, Reliability & Cost reviewer** on the NimCarry Product Council.

Read the shared evidence pack, response schema, and repo.

For the strongest product opportunities, determine:
- smallest reliable implementation;
- state-machine impact;
- DB/schema impact;
- API changes;
- frontend changes;
- migration/backfill;
- security effects;
- concurrency/idempotency concerns;
- test plan;
- runtime cost;
- operational burden.

Challenge architectural complexity.

Specifically analyze feasibility for:
- trusted circles;
- repeat route templates;
- bridge decline/abandonment;
- rerouting;
- shareable privacy-safe custody passport;
- team workspaces;
- notifications;
- PostHog analytics with strict PII exclusion;
- future API/webhooks.

Prefer mechanisms that reuse existing invariants.

Flag features that would require a dangerous rewrite or create ambiguous custody state.

Return:
- required response schema;
- an implementation dependency graph;
- “3 things we can ship safely fast”;
- “3 things that look easy but are actually dangerous.”
