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
  await sleep(1_300);

  await page.locator("#demo-tour-open-invite").click();
  await page.waitForURL(/\/i\//, { timeout: 8_000 });
  await page.locator("#accept").waitFor({ state: "visible", timeout: 8_000 });
  await page.locator("#accept").evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  });
  await sleep(250);
  mark("shot12_accept_ready_visible");
  await sleep(1_350);

  await page.locator("#accept").click();
  await page.waitForURL(/\/mission\/[^/]+$/, { timeout: 8_000 });
  await page.locator("#pass-button").waitFor({ state: "visible", timeout: 8_000 });
  mark("shot12_accepted");
  await sleep(900);

  // Advance the first practice handoff so B becomes the simulated holder,
  // then let the guided route prepare the destination invitation for C.
  await page.locator("#pass-button").click();
  await page.waitForURL(/\/mission\/[^/]+\/pass/, { timeout: 8_000 });
  await page.locator("#send").waitFor({ state: "visible", timeout: 8_000 });
  await page.locator("#send").evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  });
  await page.locator("#send").click();
  await page.locator('.clv2-wax-scene[data-phase="verification-pending"]').waitFor({ state: "visible", timeout: 4_000 });
  mark("shot16_first_handoff_warm_wax");
  await page.locator('.clv2-wax-scene[data-phase="final"]').waitFor({ state: "visible", timeout: 6_000 });
  await page.waitForURL(/\/mission\/[^/]+\/route/, { timeout: 8_000 });
  await page.locator("#demo-tour-continue").waitFor({ state: "visible", timeout: 8_000 });
  mark("shot17_first_practice_postmark");
  await sleep(500);

  await page.locator("#demo-tour-continue").click();
  await page.locator("#invite-dialog").waitFor({ state: "visible", timeout: 8_000 });
  await page.locator("#invite-confirm").click();
  await page.locator("#demo-tour-open-invite").waitFor({ state: "visible", timeout: 8_000 });
  mark("shot20_destination_invite_ready");
  await sleep(700);

  await page.locator("#demo-tour-open-invite").click();
  await page.waitForURL(/\/i\//, { timeout: 8_000 });
  await page.locator("#accept").waitFor({ state: "visible", timeout: 8_000 });
  await page.locator("#accept").evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  });
  await sleep(250);
  mark("shot20_accept_ready_visible");
  await sleep(1_500);

  await page.locator("#accept").click();
  await page.waitForURL(/\/mission\/[^/]+$/, { timeout: 8_000 });
  await page.locator("#pass-button").waitFor({ state: "visible", timeout: 8_000 });
  mark("shot20_destination_accepted");
  await sleep(850);

  // Shot 21: B -> C practice handoff, captured only as presentation UI.
  await page.locator("#pass-button").click();
  await page.waitForURL(/\/mission\/[^/]+\/pass/, { timeout: 8_000 });
  await page.locator("#send").waitFor({ state: "visible", timeout: 8_000 });
  await page.locator("#send").evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  });
  mark("shot21_second_handoff_ready");
  await sleep(1_000);

  await page.locator("#send").click();
  await page.locator('.clv2-wax-scene[data-phase="verification-pending"]').waitFor({ state: "visible", timeout: 4_000 });
  mark("shot21_second_handoff_warm_wax");
  await sleep(1_250);

  await page.locator('.clv2-wax-scene[data-phase="final"]').waitFor({ state: "visible", timeout: 6_000 });
  await page.waitForURL(/\/mission\/[^/]+\/route/, { timeout: 8_000 });
  await page.locator(".hc-arrived-moment").waitFor({ state: "visible", timeout: 8_000 });
  mark("shot21_practice_arrived");
  await sleep(1_000);

  const state = await page.evaluate(() => ({
    path: location.pathname,
    search: location.search,
    screen: document.querySelector("#screen")?.dataset.clv2Screen || null,
    bodyClass: document.body.className,
    hasPassReady: Boolean(document.querySelector("#pass-button")),
    invitationStatus: document.querySelector(".clv2-invite-status")?.textContent?.trim() || null,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));

  if (state.overflow) throw new Error("Recording surface has horizontal overflow");
  if (!state.hasPassReady) throw new Error("Accepted mission did not expose Pass 1 NIM");

  mark("recording_complete");

  await writeFile(
    join(outputRoot, "manifest.json"),
    JSON.stringify({
      generated_at: new Date().toISOString(),
      source: `${baseUrl}/?demo=1&tour=1&reset=1`,
      mode: "LIVE_PRODUCTION_RUNTIME_GUIDED_PRACTICE",
      truth_boundary: "Shots 09–21 are guided-practice UI capture. Shot 21 practice FINAL/ARRIVED is presentation-only; real FINAL/ARRIVED proof comes from the verified TESTNET run.",
      viewport,
      marks,
      final_state: state,
    }, null, 2),
  );
} catch (error) {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  throw error;
}

const webmPath = join(outputRoot, "shots-09-21-live-practice.webm");
if (!video) throw new Error("Playwright video handle unavailable");

// Playwright finalizes video when the page closes. Start saveAs before
// closing so it can wait for the video stream without losing its target.
const saveVideo = video.saveAs(webmPath);
await page.close();
await saveVideo;
await context.close();
await browser.close();

console.log(`Saved live explainer UI recording to ${webmPath}`);
