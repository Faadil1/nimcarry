# Cycle II demo capture runbook

1. Use the production Guided Demo: `https://nimcarry.faadil-casecraft.workers.dev/?demo=1&tour=1&reset=1`.
2. Use an existing Chromium/Playwright capture context at **1440×810** or **1920×1080**, 16:9, device scale factor 1.
3. Capture the web viewport only. Hide browser chrome, taskbar, DevTools, cursor, and any recording controls.
4. Emulate reduced motion or wait for fonts, layout, and visible animations to settle before every clip.
5. Keep `DEMO MODE — no wallet or network writes` visible whenever the app is shown. Do not remove or cover it.
6. Follow the existing deterministic tour: reset → Create Mission → prefilled invite → Open demo invite → Accept → demo pass → Continue demo to destination → Preview ARRIVED receipt.
7. Do not open Nimiq Pay, click a wallet approval, invoke a provider method, or make a transaction call.
8. Do not record private invitation URLs, invite tokens, bearer capabilities, wallet addresses, seeds, keys, or debug/provider diagnostics. Generated demo URLs are navigation state, not publication assets.
9. Prefer clean cuts between states. Do not show loading failures, console output, browser chrome, or cursor hover artifacts.
10. For the closing card, show only NimCarry, the public Live App, and the public GitHub repository.
11. Review the final video frame-by-frame for sensitive data and confirm that simulated ARRIVED is labeled as presentation-only, not testnet evidence.

No new video toolchain is required. Use existing local Chromium/Playwright if available; otherwise record the same states manually in a clean browser window.
