# LLM Product Council — Runbook

## Round 1 objective

Find what NimCarry must become to earn repeat use outside the hackathon.

This round focuses on:
- hidden user jobs;
- repeat-use mechanisms;
- Nimiq-native utility;
- monetization;
- visual memorability;
- safety/abuse;
- implementation leverage already present in the repo.

## How to run each model

For each LLM, provide in this order:

1. `SHARED-EVIDENCE-PACK.md`
2. `RESPONSE-SCHEMA.md`
3. that model's role prompt from `prompts/`
4. the repo URL: https://github.com/Faadil1/nimcarry
5. the live app: https://nimcarry.faadil-casecraft.workers.dev
6. the live evidence page: https://nimcarry.faadil-casecraft.workers.dev/real-usage

Ask the model to return one complete response following the response schema.

## Do not cross-contaminate the first pass

Do not show Claude's answer to Grok, Grok's answer to Gemini, etc. Independent convergence is valuable evidence.

## Suggested output filenames

```
rounds/001/claude.md
rounds/001/grok.md
rounds/001/kimi.md
rounds/001/perplexity.md
rounds/001/gemini.md
rounds/001/deepseek.md
rounds/001/synthesis.md
```

Raw outputs should be reviewed for secrets/PII before committing publicly.

## Synthesis

After all six responses exist:

1. Normalize proposals by user job and mechanism.
2. Mark independent convergence.
3. Preserve contradictions instead of averaging them away.
4. Apply the evidence ladder from `SYNTHESIS-PROTOCOL.md`.
5. Move surviving ideas into:
   - `CURRENT-HYPOTHESES.md`;
   - `HIDDEN-SPOTS.md`;
   - `EXPERIMENTS/`.
6. Explicitly kill ideas that fail the product/safety/evidence gates.

## Round 1 questions to settle

- What is the smallest repeatable use case?
- What makes someone return for a second route?
- Is a custody passport the right product primitive?
- Which existing flow is the largest activation bottleneck?
- Who has the clearest willingness to pay?
- Which Nimiq mechanism is essential rather than decorative?
- Which visual change would create strongest recall?
- What should NimCarry refuse to become?
