import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const playwrightRoot = process.env.DEMO_VIDEO_PLAYWRIGHT_ROOT;
if (!playwrightRoot) throw new Error("DEMO_VIDEO_PLAYWRIGHT_ROOT is required");
const playwrightModule = pathToFileURL(join(playwrightRoot, "node_modules", "playwright", "index.mjs")).href;
const { chromium } = await import(playwrightModule);

const baseUrl = (process.argv[2] || process.env.NIMCARRY_DEMO_URL || "").replace(/\/$/, "");
if (!baseUrl) throw new Error("Usage: node scripts/demo-video-v2-capture.mjs <runtime-url>");

const outputRoot = process.env.DEMO_VIDEO_OUTPUT || "demo-video-v2";
const rawRoot = join(outputRoot, "raw");
await mkdir(rawRoot, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  reducedMotion: "reduce",
  recordVideo: { dir: rawRoot, size: { width: 1600, height: 900 } },
});
const page = await context.newPage();
const video = page.video();
const pageErrors = [];
let stage = "boot";
page.on("pageerror", (error) => {
  pageErrors.push(`${stage}: ${error.message}`);
  console.error(`[PAGEERROR @ ${stage}] ${error.stack || error.message}`);
});

const pause = (ms) => page.waitForTimeout(ms);
const setStage = (value) => { stage = value; console.log(`DEMO STAGE ${value}`); };
const waitPath = async (pattern) => {
  await page.waitForFunction(
    ({ source, flags }) => new RegExp(source, flags).test(location.pathname),
    { source: pattern.source, flags: pattern.flags },
    { timeout: 10000 },
  );
};
const click = async (selector) => {
  const node = page.locator(selector);
  await node.scrollIntoViewIfNeeded();
  await pause(350);
  await node.click();
};

try {
  setStage("home");
  await page.goto(`${baseUrl}/?demo=1&tour=1&reset=1`, { waitUntil: "networkidle", timeout: 25000 });
  await page.locator("#demo-banner").waitFor({ state: "visible" });
  await pause(6500);

  setStage("create");
  await click("#create-button");
  await waitPath(/^\/create$/);
  await page.locator("#create-form").waitFor({ state: "visible" });
  await pause(2500);
  await page.locator('input[name="target_label"]').fill("Nimiq Community Lead");
  await pause(650);
  await page.locator('input[name="target_wallet"]').fill("NQDEMO_TARGET_0001");
  await pause(650);
  await page.locator('textarea[name="mission_note"]').fill("A warm introduction to one specific person I cannot reach directly.");
  await pause(800);
  await page.locator('input[name="creator_display_label"]').fill("Creator");
  await page.locator('input[name="target_consent_confirmed"]').check();
  await pause(2500);
  await click("#create-form button[type='submit']");
  await waitPath(/^\/mission\/[^/]+$/);
  await page.locator("#invite-button").waitFor({ state: "visible" });
  await pause(4500);

  setStage("invite-bridge");
  await click("#invite-button");
  await page.locator("#invite-dialog").waitFor({ state: "visible" });
  await pause(1200);
  await page.locator("#candidate-label").fill("Bridge B");
  await page.locator("#why-you").fill("You know someone closer to the destination.");
  await page.locator("#candidate-wallet").fill("NQDEMO_BRIDGE_0001");
  await pause(1700);
  await click("#invite-confirm");
  await page.locator("#demo-tour-open-invite").waitFor({ state: "visible" });
  await pause(2700);
  await click("#demo-tour-open-invite");
  await page.waitForURL(/\/i\//, { timeout: 10000 });
  await page.locator("#accept").waitFor({ state: "visible" });
  await pause(6000);

  setStage("accept-bridge");
  await click("#accept");
  await page.waitForURL(/\/mission\/[^/?]+(?:\?.*)?$/, { timeout: 10000 });
  await page.locator("#pass-button").waitFor({ state: "visible" });
  await pause(3200);

  setStage("pass-bridge");
  await click("#pass-button");
  await waitPath(/^\/mission\/[^/]+\/pass$/);
  await page.locator("#send").waitFor({ state: "visible" });
  await pause(6500);
  await click("#send");
  await waitPath(/^\/mission\/[^/]+\/route$/);
  await page.locator("#demo-tour-continue").waitFor({ state: "visible" });
  await pause(6000);

  setStage("destination-invite");
  await click("#demo-tour-continue");
  await page.locator("#invite-dialog").waitFor({ state: "visible" });
  await pause(1000);
  await click("#invite-confirm");
  await page.locator("#demo-tour-open-invite").waitFor({ state: "visible" });
  await pause(1500);
  await click("#demo-tour-open-invite");
  await page.waitForURL(/\/i\//, { timeout: 10000 });
  await page.locator("#accept").waitFor({ state: "visible" });
  await pause(3500);
  await click("#accept");
  await page.waitForURL(/\/mission\/[^/?]+(?:\?.*)?$/, { timeout: 10000 });
  await page.locator("#pass-button").waitFor({ state: "visible" });
  await pause(2200);

  setStage("pass-destination");
  await click("#pass-button");
  await waitPath(/^\/mission\/[^/]+\/pass$/);
  await page.locator("#send").waitFor({ state: "visible" });
  await pause(4200);
  await click("#send");
  await waitPath(/^\/mission\/[^/]+\/route$/);
  const status = await page.locator(".status-pill").textContent();
  if (!/ARRIVED/i.test(status || "")) throw new Error(`Expected ARRIVED, got ${status || "empty status"}`);
  await page.locator(".hc-arrived-moment").waitFor({ state: "visible" });
  await pause(9000);
  await page.screenshot({ path: join(outputRoot, "arrived-final.png"), fullPage: true });

  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(" | ")}`);

  await writeFile(join(outputRoot, "capture-manifest.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    source: baseUrl,
    mode: "GUIDED DEMO — simulated route state, no wallet or network writes",
    truth_boundary: "Only independently verified FINAL changes custody in the real product.",
    viewport: { width: 1600, height: 900 },
    final_status: status?.trim() || "ARRIVED",
    page_errors: [],
  }, null, 2));
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

const rawPath = await video.path();
await copyFile(rawPath, join(outputRoot, "nimcarry-demo-v2-raw.webm"));
console.log(`Raw demo capture written to ${join(outputRoot, "nimcarry-demo-v2-raw.webm")}`);
