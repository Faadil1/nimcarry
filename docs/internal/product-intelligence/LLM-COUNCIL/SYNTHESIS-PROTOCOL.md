# Council Synthesis Protocol

## Goal

Use disagreement between models as signal. Do not average six opinions into generic consensus.

## Process

### 1. Blind first pass
Each model receives the same shared evidence pack plus its role prompt. It should not see other models' conclusions.

### 2. Normalize
Map every proposal into:
- user job;
- mechanism;
- evidence;
- metric;
- risk;
- cost;
- model source.

### 3. Collision pass
Look for:
- repeated opportunity found independently;
- direct contradiction;
- one model spotting a risk others missed;
- winner-to-winner or mechanism collisions;
- hidden jobs with no current feature.

### 4. Evidence gate
Classify each item:
- **E0** intuition only;
- **E1** anecdotal/community evidence;
- **E2** repeated external evidence or current user feedback;
- **E3** product analytics/behavior;
- **E4** successful controlled experiment.

No E0 idea ships merely because several LLMs liked it.

### 5. Product gate
Before build:
- Does it solve a real user job?
- Does it strengthen repeat use?
- Does it make Nimiq more essential rather than decorative?
- Does it preserve custody/security laws?
- Can we test it smaller first?

### 6. Decision
- PROMOTE — ready for implementation.
- TEST — run experiment first.
- EXPLORE — research needed.
- HOLD — potentially valuable but premature.
- KILL — actively reject for now.

## Output

Update:
- `CURRENT-HYPOTHESES.md`
- `HIDDEN-SPOTS.md`
- the relevant experiment file;
- monetization/visual/security notes only when evidence changed.

Raw LLM prose is not canonical.
