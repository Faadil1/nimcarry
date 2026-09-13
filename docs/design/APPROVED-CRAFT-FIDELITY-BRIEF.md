# NimCarry — Approved Craft Fidelity Implementation Brief

Status: **HUMAN-APPROVED VISUAL DIRECTION — IMPLEMENTATION CONTRACT**  
Branch: `experiment/approved-craft-fidelity`  
Base: `experiment/mature-nimiq-pay-positioning`  
Do not merge to `main` until TRACE fidelity/QA gates pass.

## 1. Source of truth

The visual source of truth is the human-approved NimCarry board supplied on 2026-09-13 with these defining characteristics:

- tactile paper / collage materiality;
- warm, optimistic, human tone;
- colorful but mature rather than childish;
- people and handoff relationships as the visual subject;
- one destination, one finite route, one 1 NIM custody baton;
- visible craft: torn-paper edges, pinned notes, stitched/patch-like details, cut-paper illustration, imperfect but deliberate layering;
- route, bridge, baton and destination as recurring narrative motifs;
- mobile-first composition with a true tablet/desktop adaptation;
- mature use cases: warm introductions, referrals, opportunities and community access.

This is not a moodboard to approximate. The implementation must be recognizably the same design direction when seen without explanation.

## 2. Non-negotiable product truth

Visual changes must never weaken these contracts:

1. Every mission has **one private destination**.
2. A bridge participates only after explicit consent.
3. Exactly **1 NIM** is the custody baton; it is not a reward, stake, wager, prize or pooled fund.
4. Accepting an invitation does **not** move NIM or custody.
5. Approval and broadcast are not custody proof.
6. Only independently verified **FINAL** changes custody and extends the route.
7. ARRIVED is only shown as real when the verified destination becomes the holder.
8. Demo/simulated states remain visibly labeled and cannot be mistaken for real testnet proof.
9. Full participant wallet data and the private destination remain protected.

## 3. Fidelity target

A successful implementation should trigger the reaction:

> “This is the approved NimCarry craft/collage direction made into a real product.”

It must **not** trigger:

> “This is a clean app inspired by that board.”

The target is fidelity of visual language and product character, not pixel-copying a static image.

## 4. Visual grammar

### 4.1 Materials

Required:
- warm off-white / recycled-paper base;
- paper cards with subtle fiber/grain;
- torn or irregular edge moments used selectively;
- layered notes, tags and labels with physical overlap;
- soft physical shadows that imply stacked paper, not floating SaaS cards;
- occasional stitched/patch/stamp/tape cues where they have a semantic job;
- illustrated people, hands, routes and destination scenes rather than abstract crypto graphics.

Avoid:
- glossy glassmorphism as the main language;
- generic neon crypto gradients;
- dark navy fintech dashboard defaults;
- floating-card overload;
- excessive blur;
- synthetic 3D coins/orbs as product identity;
- a sterile white SaaS surface with craft added only as decoration.

### 4.2 Palette roles

The approved direction uses a warm craft palette. Exact implementation values may be tuned for contrast, but role separation is fixed:

- **Paper / canvas:** warm cream / natural stock.
- **Primary action / trust:** deep forest green.
- **Baton / opportunity:** warm yellow / ochre.
- **Human variation:** coral, teal, blue, aubergine accents.
- **Destination / important endpoint:** red/coral marker accent.
- **Success / verified FINAL:** green distinct from primary-action green where necessary for status clarity.
- **Ink:** very dark brown/charcoal rather than pure digital black when possible.

Color must communicate state before decoration. Status colors must remain distinguishable without relying on hue alone.

### 4.3 Typography

Typography is information architecture.

Required role separation:
- **Display:** warm, characterful, editorial/human voice for the emotional statement or screen title.
- **Interface:** highly legible sans for forms, controls, route details and mobile UI.
- **Annotation:** handwritten or handwritten-like treatment only for short notes, labels or emotional marginalia; never for evidence-critical text.
- **Evidence/status:** sober, compact, high-contrast treatment for FINAL, custody, transaction and receipt details.

Rules:
- no decorative microtype for judge-critical information;
- body text should remain comfortably readable at 320px;
- labels must not be all-caps by default unless they are true metadata/stamps;
- headings should feel editorial, not startup-grotesk generic;
- handwriting must stay sparse enough to preserve maturity.

## 5. Component system

Build the direction as real reusable components, not screenshot slices.

Required conceptual components:

- `CraftCanvas` — global paper/material surface.
- `PaperPanel` — primary content surface with material hierarchy.
- `TornNote` — short contextual annotation only.
- `MissionTag` — compact mission/status label.
- `HumanAvatar` / `BridgePortrait` — person-first representation.
- `RouteNode` — verified/pending/destination human node.
- `HumanRoute` — finite destination-bound route visualization.
- `NimBaton` — single recognizable custody object/motif.
- `DestinationMarker` — strong endpoint cue.
- `ConsentCard` — invitation context + accept/decline semantics.
- `ProofStamp` — FINAL/ARRIVED evidence treatment.
- `RouteReceipt` — durable privacy-safe arrival proof object.
- `UseCaseStrip` — warm introductions / referrals / opportunities / community access.
- `ResponsiveActionRail` — mobile sticky action or desktop side action without covering content.

Each component must have a defined product job. Do not add craft decoration with no job.

## 6. Screen-by-screen fidelity contract

### Home
Must communicate in the first viewport:
- this is about people carrying a meaningful introduction/opportunity;
- there is one destination;
- the route happens through real human bridges;
- 1 NIM is the baton, not the value proposition itself.

Visual signature:
- human route/path illustration;
- craft composition with a strong editorial message;
- one dominant CTA;
- compact use-case framing for mature Nimiq Pay users.

### Create Mission
Must feel like preparing a meaningful introduction, not filling out a crypto transaction.

Required hierarchy:
- Who/where is the destination?
- What are you trying to get to them?
- Why does it matter?
- Preview of the mission as a human route.

Desktop: form + live mission preview.  
Mobile: action-first single column.

### Invitation
This is the strongest human-consent screen.

Must answer before the Accept CTA:
- Who invited me?
- What is this mission trying to reach?
- Why was I chosen?
- What does accepting mean?
- What does accepting **not** do?

The visual treatment should feel personal and trustworthy, not transactional.

### Pass
Must feel like a deliberate human handoff ritual.

Required visible facts:
- exactly 1 NIM;
- accepted next bridge;
- approval/broadcast/FINAL separation;
- only FINAL changes custody;
- no financial upside for the bridge.

Use the baton motif strongly, but never imply a physical transfer mechanism that the product does not actually perform.

### Arrived
This is the emotional and proof payoff.

Must communicate:
- the introduction/opportunity arrived at its intended destination;
- real people made the route possible;
- the result is not “a token moved”; the result is “the human route completed”;
- share/view proof actions are available without exposing private data.

### Route Details
Must feel like a documented human journey, not an activity log.

Required:
- finite route from origin to one destination;
- people as nodes;
- verified vs pending distinction;
- current holder/frontier when active;
- dates/status/proof in a restrained evidence layer;
- ARRIVED route receipt when terminal.

Desktop may use 2–3 zones: route timeline, visual journey/context, proof/details.

## 7. Responsive contract

### Mobile: 320 / 375 / 390px
- one dominant task per viewport;
- primary CTA reachable by thumb;
- no horizontal scroll;
- no clipped paper layers that obscure content;
- craft detail may simplify, but identity must remain;
- evidence/status text remains fully legible;
- dialogs/sheets never cover the action they explain.

### Tablet: ~768px
- preserve mobile clarity;
- introduce side-by-side context only where it reduces scrolling;
- avoid a stretched phone layout.

### Desktop: 1024–1440px+
- true responsive adaptation, not centered mobile cards;
- Home: manifesto + route preview;
- Create: form + mission preview;
- Invite: consent/context + finite route cue;
- Pass: handoff action + proof/finality context;
- Arrived: emotional completion + receipt;
- Route: timeline + journey/context + proof details.

Desktop should show **action + context + proof** together without becoming a dashboard grid.

## 8. Motion and interaction

Motion should feel physical and purposeful:
- paper/card settling;
- route node reveal;
- baton handoff emphasis;
- stamp/receipt completion;
- subtle paper-lift hover/focus on desktop.

Never use:
- endless floating objects;
- decorative parallax that competes with reading;
- confetti as the sole arrival payoff;
- motion required to understand state.

`prefers-reduced-motion` must preserve all information and actions.

## 9. Mature-audience guardrail

The craft direction may be playful, but the product must not feel juvenile.

Keep mature by:
- grounded use cases and real human stakes;
- restrained illustration density;
- strong editorial hierarchy;
- sophisticated spacing and material layering;
- avoiding cartoon mascots, game-like reward systems, streaks or badges unrelated to the job;
- keeping receipts, custody and finality visually sober.

## 10. Anti-slop / anti-drift rejection tests

Reject an implementation if any of these become true:

- remove the craft textures and it becomes a generic SaaS app;
- remove the people and destination and it still reads as a generic crypto wallet;
- the baton becomes the brand instead of the human route;
- decorative notes outnumber useful product information;
- the desktop becomes a card dashboard;
- the invitation feels like a payment request;
- ARRIVED feels like a transaction-success toast;
- typography becomes unreadably small or fashion-led;
- screenshots or static image slices are used as fake UI instead of real components;
- any visual suggests stronger testnet behavior than exists.

## 11. Reference-use discipline

TRACE references are allowed only for specific jobs:
- Typography Dictionary / TRACE Typography Layer → hierarchy, measure, role separation, responsive typography QA.
- Branding Style Guides → brand-system logic, not identity copying.
- Design Spells → bounded micro-interaction mechanisms only.
- Growth.Design → cognitive-load / choice-friction review, not manipulation.
- Existing TRACE anti-slop rules → uniqueness and domain-native checks.

Every external influence must be translated through NimCarry’s own human-route contract.

## 12. Implementation sequence

1. **Freeze tokens:** color roles, type roles, spacing, shadows, materials, border/radius policy.
2. **Build primitives:** paper panel, note, tag, route node, baton, stamp, receipt.
3. **Implement Home + Create.**
4. **Implement Invitation + Pass.**
5. **Implement Arrived + Route Details.**
6. **Mobile QA:** 320 / 375 / 390.
7. **Tablet QA:** 768.
8. **Desktop QA:** 1024 / 1280 / 1440.
9. **Typography QA.**
10. **Uniqueness / anti-slop audit.**
11. **Truth/proof audit.**
12. **Human visual comparison against the approved board.**

## 13. Fidelity gate

The production candidate cannot pass unless all are true:

- visual identity is immediately recognizable as the approved craft/collage direction;
- target user + job can be stated after a 5-second first-view test;
- first-time user reaches the main point within 60 seconds without explanation;
- invitation consent is understandable before accepting;
- FINAL-only custody semantics remain unmistakable;
- all core screens are responsive at required widths;
- keyboard/focus/reduced-motion sanity passes;
- no screenshot-based UI implementation;
- no reference identity copied wholesale;
- CI passes;
- human approval is recorded.

## 14. Merge rule

`experiment/approved-craft-fidelity` is a production-candidate branch only after the visual implementation itself exists and passes this contract. Until then it is an implementation workstream and must not replace `main`.
