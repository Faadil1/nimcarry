# NimCarry Motion Polish v1

## Why this pass exists

The current product already has a distinctive paper / carried-letter visual language and strong state semantics. The next design pass should make those states **feel continuous**, without turning NimCarry into a generic animated SaaS interface.

The external motion reference supplied on 2026-09-21 is used only for its transferable mechanics:

- an active state that visibly travels instead of simply switching;
- tonal / spatial continuity between states;
- small inertia on newly revealed surfaces;
- motion demonstrated visually rather than described abstractly;
- final polish by correcting timing, clipping, scale and interaction details one by one.

We do **not** copy its mascot, glossy gradients, glassmorphism, phone-frame staging or consumer-app aesthetic.

## Design source of truth

For this pass, the source of truth is:

1. the current NimCarry production UI and repository;
2. the real mobile screenshots generated during TESTNET testing;
3. the existing Carried Letter visual system;
4. the supplied 5.5-second motion reference.

A Figma source is not required to start. If one is introduced later, it becomes an additional fidelity reference rather than a replacement for live product truth.

## Motion grammar

### 1. Route progress

**TARGET** → five-step route indicator  
**TRIGGER** → canonical mission state changes  
**MOTION** → a restrained marker travels from the previous step to the current step; the current numbered seal settles once  
**TIMING** → 680 ms, spring-like ease  
**EXIT/RETURN** → new state stays static after settling  
**INPUT PARITY** → no interaction required  
**REDUCED MOTION** → no travel animation; state remains fully visible  
**IMPLEMENTATION** → `.nc-flow-glider` + session-scoped previous index

### 2. Screen / paper arrival

**TARGET** → primary card of a newly rendered route  
**TRIGGER** → SPA route/state render  
**MOTION** → 10 px paper settle + sub-1% scale normalization  
**TIMING** → 420 ms  
**EXIT/RETURN** → none  
**INPUT PARITY** → none  
**REDUCED MOTION** → immediate final layout  
**IMPLEMENTATION** → `.nc-motion-enter`

### 3. Private claim readiness

**TARGET** → claim / share primary action  
**TRIGGER** → first render of a PENDING claim or SHARE_CLAIM mission state  
**MOTION** → one soft scale + ring emphasis  
**TIMING** → 820 ms, once only  
**EXIT/RETURN** → static CTA  
**INPUT PARITY** → keyboard focus receives equivalent emphasis family  
**REDUCED MOTION** → no animation  
**IMPLEMENTATION** → `.nc-motion-emphasis`

### 4. Verification / route evidence

**TARGET** → verified route rows  
**TRIGGER** → route rows become visible  
**MOTION** → reading-order reveal with 70 ms stagger  
**TIMING** → 460 ms each  
**EXIT/RETURN** → static evidence  
**INPUT PARITY** → none  
**REDUCED MOTION** → immediate rows  
**IMPLEMENTATION** → `.nc-motion-route-step`

### 5. FINAL / ARRIVED

**TARGET** → ARRIVED pill / postmark / arrival close  
**TRIGGER** → independently verified FINAL is represented in UI  
**MOTION** → one restrained postmark landing  
**TIMING** → 620 ms  
**EXIT/RETURN** → static proof  
**INPUT PARITY** → none  
**REDUCED MOTION** → immediate proof  
**IMPLEMENTATION** → `.nc-motion-final`

## Non-negotiables

- Motion never claims financial completion.
- Only backend-derived FINAL/ARRIVED state may trigger the final postmark motion.
- No autoplay loops except existing intentionally ambient details.
- No motion is required to understand state or complete an action.
- `prefers-reduced-motion` must preserve every action and every piece of information.
- Mobile remains the first acceptance surface; tablet and desktop remain hard gates.
- Animation must not mask pending/error states or create a fake sense of speed around Nimiq finality.

## Review workflow

1. Ship the first motion pass behind normal static semantics.
2. Capture mobile / tablet / desktop guided-flow evidence.
3. Compare the live result against the current static UI and the supplied motion reference.
4. Correct only concrete defects: timing, clipping, transform origin, scale, hierarchy, or interaction feedback.
5. Promote only if the product still feels domain-native and the motion makes state easier to follow rather than merely more decorative.
