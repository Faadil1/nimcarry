# NimCarry — Fable 5.1 mobile UI experiment

Branch: `experiment/fable-51-mobile-ui`

## Why this branch exists

This is a deliberately isolated UI/UX experiment. The production `main` branch remains the canonical submission build until this direction is proven better.

The quality bar was inspired by Breeje Anadkat's September 2026 post: **“Bad mobile design has no excuses anymore. Designed in Figma. Built with Fable 5.1.”** The experiment does not clone that design. It adopts the underlying standard: mobile should feel intentionally designed, not like a responsive desktop card stack.

## Design thesis

NimCarry should feel like a **custody instrument for a human route**, not a generic SaaS dashboard.

The experimental layer therefore pushes:

- a mobile-native, one-handed layout;
- a visual 1 NIM custody instrument on the home screen;
- stronger hierarchy around the current holder and verified route;
- compact route-state instrumentation instead of generic status cards;
- bottom-sheet dialogs;
- larger tactile actions and sticky form submission;
- a physical proof-object treatment for ARRIVED receipts;
- warm material colors rather than dark/blue AI-product styling;
- motion that communicates state while respecting reduced-motion preferences.

## Safety boundary

The experiment is presentation-only.

It must not:

- call APIs;
- sign wallet messages;
- submit NIM transactions;
- write application state;
- invent route state, FINAL, or ARRIVED;
- weaken privacy or capability boundaries.

Those constraints are enforced by `tests/mini-app/fable-51-mobile.test.ts`.

## Promotion gates

Do not merge into `main` until all are true:

1. CI passes on the experiment branch.
2. Home, Create, Invite, Mission, Pass, Route, and ARRIVED receipt are reviewed at mobile widths.
3. The design remains legible at 320–390 px widths and does not obstruct Nimiq Pay flows.
4. Reduced-motion remains functional.
5. Product truth boundaries are at least as clear as `main`.
6. The new direction is judged materially stronger, not merely more decorative.

If any gate fails, keep `main` unchanged and iterate only on this branch.
