# NimCarry — Legitimate 25-Wallet Real-Usage Sprint

Status: **P0 / execution-ready**

Goal: reach **25+ distinct legitimate Nimiq wallets opening the real NimCarry Mini App** without gaming identity, manufacturing traffic, or asking one person to open from multiple wallets.

## Why this sprint exists

Current Cycle II scoring gives a material Real Usage bucket. This sprint treats usage as product evidence, not vanity traffic. The desired outcome is a small set of real Nimiq Pay users who can understand NimCarry, open it, and give enough feedback to expose friction before judging.

## Legitimacy rules

Do:
- recruit real people;
- prefer people who already use Nimiq Pay;
- let one human participate once for the usage target;
- ask for honest feedback, including confusion and failure;
- keep destination and wallet information private;
- record only privacy-safe tester aliases / channels / timestamps unless a tester explicitly volunteers more.

Do not:
- ask one person to rotate through multiple wallets;
- create wallets solely to inflate the metric;
- script or bot opens;
- buy low-quality traffic;
- claim a unique wallet equals a unique human without evidence;
- claim a real FINAL/ARRIVED route unless independently verified.

## Target ladder

- Floor: 4 legitimate users
- Useful checkpoint: 11 legitimate users
- Full target: 25+ legitimate users
- Internal stretch: 30 legitimate users to absorb attribution/eligibility uncertainty

## Priority audiences

1. Nimiq Mini Apps Competition builders / Skool community.
2. Existing Nimiq Pay users in the broader Nimiq community.
3. Collaborators, friends, and professional contacts willing to install/open Nimiq Pay legitimately.
4. Warm networks where referrals/intros/opportunities are already a normal behavior.

The product should not be pitched as generic crypto. Lead with the human job:

> **NimCarry turns a warm introduction into a destination-bound human route you can actually follow until it arrives.**

Then explain:

> Exactly 1 NIM is the custody baton. Accepting moves no funds. Only independently verified FINAL changes custody.

## Tester flow — 3 minutes max

### Step 1 — Fresh open
Open the live Mini App in Nimiq Pay:

`https://nimcarry.faadil-casecraft.workers.dev`

Do not coach the tester before the first-view question.

### Step 2 — 5-second comprehension check
After ~5 seconds, ask only:

> What do you think this app helps you do?

Record the answer verbatim or near-verbatim.

PASS signal: mentions a person/destination + introduction/referral/opportunity + other people helping it get there.

FAIL signal: describes it mainly as sending money, a crypto chain, a game, or cannot say what it does.

### Step 3 — 60-second first-use check
Ask:

> If you needed a warm introduction to one person you cannot reach directly, show me what you would do first.

Do not help unless they become blocked. Record:
- first tap;
- whether Create is found;
- where confusion starts;
- whether they understand the destination field;
- whether they understand that Accept ≠ payment;
- whether they understand that 1 NIM is the baton rather than the reward.

### Step 4 — one-question usefulness signal
Ask:

> Can you name a real situation where you would use this?

High-signal answers include:
- warm intro to a hiring manager / founder / investor / collaborator;
- community access;
- referral;
- opportunity handoff;
- reaching a person through trusted intermediaries.

## Privacy-safe tracker

Use one row per real participant:

| # | Alias | Channel | Nimiq Pay user already? | Open confirmed | 5s result | 60s result | Real use case named? | Friction | Follow-up |
|---|---|---|---|---|---|---|---|---|---|
| 01 | T01 | Skool | Y/N | Y/N | PASS/FAIL | PASS/FAIL | Y/N | — | — |

Do **not** store full wallet addresses in this tracker.

## Recruitment messages

### Skool / builder exchange

> We just shipped a major NimCarry UX update and I’m looking for a few real Nimiq Pay users to do a 2–3 minute fresh-user test. I won’t explain the app first — I want to see whether the first view is actually clear. Happy to test your Mini App in return. If you’re up for it, open NimCarry in Nimiq Pay and send me what you think it does after the first few seconds.

### WhatsApp / personal network

> Quick favor — I’m testing a Nimiq Pay Mini App before judging. It takes about 2 minutes. I specifically need fresh eyes, so I don’t want to explain it before you open it. Afterward I’ll ask what you think it does and whether you can imagine a real use for it.

### X / public builder post

> Fresh eyes wanted: I’m testing NimCarry with real Nimiq Pay users before final judging. 2–3 minutes, no walkthrough first. The test is simple: can the product explain itself, and can you reach the main point in under a minute? Builders: happy to return the test on your Mini App.

## Conversion loop

Every legitimate tester can produce up to four useful outcomes:
1. real usage/open;
2. 5-second comprehension evidence;
3. 60-second UX evidence;
4. product feedback / distribution referral.

After a test, ask only if natural:

> Is there one Nimiq Pay user you think would immediately understand or use this? If yes, feel free to send them the link.

Do not incentivize multiple-wallet opens.

## Daily operating rhythm until deadline

### Morning
- recruit 5–8 fresh testers;
- prioritize competition builders and existing Nimiq Pay users.

### Midday
- run 5s / 60s tests;
- cluster friction into product issue vs platform issue vs explanation issue.

### Evening
- ship only high-confidence fixes that improve several users;
- rerun smoke/CI;
- post one truthful builder update if meaningful progress exists.

## Stop conditions

Stop changing core UI if:
- 5-second comprehension is consistently strong;
- first action is consistently found;
- remaining friction is Nimiq Pay/platform-level rather than NimCarry-level;
- new changes would jeopardize runtime reliability near the deadline.

## Evidence boundary

A wallet open can support Real Usage evidence. It does **not** prove:
- a unique human unless independently known;
- a successful handoff;
- FINAL;
- ARRIVED;
- repeated value.

Keep those claims separate.
