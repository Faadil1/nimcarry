import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const playwrightRoot = process.env.EXPLAINER_PLAYWRIGHT_ROOT;
if (!playwrightRoot) throw new Error("EXPLAINER_PLAYWRIGHT_ROOT is required");

const playwrightModule = pathToFileURL(join(playwrightRoot, "node_modules", "playwright", "index.mjs")).href;
const { chromium } = await import(playwrightModule);

const baseUrl = (process.argv[2] || process.env.NIMCARRY_EXPLAINER_URL || "").replace(/\/$/, "");
if (!baseUrl) throw new Error("Usage: node scripts/record-explainer-ui.mjs <production-url>");

const outputRoot = process.env.EXPLAINER_OUTPUT || "explainer-ui-recording";
const rawRoot = join(outputRoot, "raw");
await mkdir(rawRoot, { recursive: true });

const viewport = { width: 390, height: 844 };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport,
  reducedMotion: "reduce",
  recordVideo: {
    dir: rawRoot,
    size: viewport,
  },
});

const page = await context.newPage();
const video = page.video();
const startedAt = Date.now();
const marks = [];
const mark = (label) => marks.push({ label, ms: Date.now() - startedAt });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  await page.goto(`${baseUrl}/?demo=1&tour=1&reset=1`, {
    waitUntil: "networkidle",
    timeout: 20_000,
  });
  await page.locator("#demo-banner").waitFor({ state: "visible" });
  await page.locator(".clv2-home").waitFor({ state: "visible" });
  mark("home_ready");
  await sleep(900);

  await page.locator("#create-button").click();
  await page.waitForURL(/\/create(?:\?|$)/, { timeout: 8_000 });
  await page.locator("#create-form").waitFor({ state: "visible" });
  mark("shot09_create_open");
  await sleep(650);

  await page.locator('input[name="target_label"]').fill("C");
  await page.locator('input[name="target_wallet"]').fill("NQDEMO_TARGET_0001");
  await page.locator('textarea[name="mission_note"]').fill("Reconnect after our brief meeting.");
  await page.locator('input[name="creator_display_label"]').fill("A");
  await page.locator('input[name="target_consent_confirmed"]').check();
  mark("shot09_create_filled");
  await sleep(1_200);

  await page.locator('#create-form button[type="submit"]').click();
  await page.waitForURL(/\/mission\/[^/]+(?:\?|$)/, { timeout: 8_000 });
  await page.locator("#invite-button").waitFor({ state: "visible" });
  mark("shot09_mission_created");
  await sleep(900);

  await page.locator("#invite-button").click();
  await page.locator("#invite-dialog").waitFor({ state: "visible" });
  mark("shot10_invite_dialog_open");
  await sleep(500);

  await page.locator("#candidate-label").fill("B");
  await page.locator("#why-you").fill("You know the person I'm trying to reach.");
  await page.locator("#candidate-wallet").fill("NQDEMO_BRIDGE_0001");
  mark("shot10_invite_filled");
  await sleep(900);

  await page.locator("#invite-confirm").click();
  await page.locator("#demo-tour-open-invite").waitFor({ state: "visible", timeout: 8_000 });
  mark("shot10_invite_ready");
  await sleep(1_600);

  const state = await page.evaluate(() => ({
    path: location.pathname,
    search: location.search,
    screen: document.querySelector("#screen")?.dataset.clv2Screen || null,
    bodyClass: document.body.className,
    hasInviteReady: Boolean(document.querySelector("#demo-tour-open-invite")),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));

  if (state.overflow) throw new Error("Recording surface has horizontal overflow");
  if (!state.hasInviteReady) throw new Error("Invite-ready state missing at end of recording");

  mark("recording_complete");

  await writeFile(
    join(outputRoot, "manifest.json"),
    JSON.stringify({
      generated_at: new Date().toISOString(),
      source: `${baseUrl}/?demo=1&tour=1&reset=1`,
      mode: "LIVE_PRODUCTION_RUNTIME_GUIDED_PRACTICE",
      truth_boundary: "Shots 09–10 are guided-practice UI capture; FINAL/ARRIVED proof must come from the real TESTNET run.",
      viewport,
      marks,
      final_state: state,
    }, null, 2),
  );
} finally {
  await context.close();
  await browser.close();
}

const webmPath = join(outputRoot, "shots-09-10-live-practice.webm");
if (!video) throw new Error("Playwright video handle unavailable");
await video.saveAs(webmPath);

console.log(`Saved live explainer UI recording to ${webmPath}`);
