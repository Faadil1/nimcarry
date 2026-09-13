import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const playwrightRoot = process.env.JUDGE_FLOW_PLAYWRIGHT_ROOT;
if (!playwrightRoot) throw new Error("JUDGE_FLOW_PLAYWRIGHT_ROOT is required");
const playwrightModule = pathToFileURL(join(playwrightRoot, "node_modules", "playwright", "index.mjs")).href;
const { chromium } = await import(playwrightModule);

const baseUrl = (process.argv[2] || process.env.NIMCARRY_JUDGE_URL || "").replace(/\/$/, "");
if (!baseUrl) throw new Error("Usage: node scripts/judge-flow-smoke.mjs <production-url>");

const outputRoot = process.env.JUDGE_FLOW_OUTPUT || "judge-flow-smoke";
await mkdir(outputRoot, { recursive: true });

const viewports = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "desktop-1280", width: 1280, height: 900 },
];

const report = {
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  mode: "DEMO MODE — no wallet or network writes",
  viewports: {},
};

const browser = await chromium.launch({ headless: true });

async function expectPath(page, pattern, label) {
  await page.waitForFunction(
    ({ source, flags }) => new RegExp(source, flags).test(location.pathname),
    { source: pattern.source, flags: pattern.flags },
    { timeout: 8000 },
  );
  return { label, path: new URL(page.url()).pathname };
}

async function run(viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const steps = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(`${baseUrl}/?demo=1&tour=1&reset=1`, { waitUntil: "networkidle", timeout: 20000 });
    await page.locator("#demo-banner").waitFor({ state: "visible" });
    steps.push({ label: "home", path: new URL(page.url()).pathname });

    await page.locator("#create-button").click();
    steps.push(await expectPath(page, /^\/create$/, "create"));
    await page.locator("#create-form").waitFor({ state: "visible" });

    await page.locator('input[name="target_label"]').fill("Nimiq Community Lead");
    await page.locator('input[name="target_wallet"]').fill("NQDEMO_TARGET_0001");
    await page.locator('textarea[name="mission_note"]').fill("I need a warm introduction to one specific person I cannot reach directly.");
    await page.locator('input[name="creator_display_label"]').fill("Creator");
    await page.locator('input[name="target_consent_confirmed"]').check();
    await page.locator("#create-form button[type='submit']").click();
    steps.push(await expectPath(page, /^\/mission\/[^/]+$/, "mission-home"));
    await page.locator("#invite-button").waitFor({ state: "visible" });

    await page.locator("#invite-button").click();
    await page.locator("#invite-dialog").waitFor({ state: "visible" });
    await page.locator("#candidate-label").fill("Bridge B");
    await page.locator("#why-you").fill("You know someone closer to the destination.");
    await page.locator("#candidate-wallet").fill("NQDEMO_BRIDGE_0001");
    await page.locator("#invite-confirm").click();
    await page.locator("#demo-tour-open-invite").waitFor({ state: "visible" });
    steps.push({ label: "invite-created", path: new URL(page.url()).pathname });

    await page.locator("#demo-tour-open-invite").click();
    await page.waitForURL(/\/i\//, { timeout: 8000 });
    await page.locator("#accept").waitFor({ state: "visible" });
    steps.push({ label: "invitation", path: new URL(page.url()).pathname });
    await page.locator("#accept").click();
    await page.locator("#notice").filter({ hasText: "Demo bridge accepted" }).waitFor({ state: "visible" });

    const missionId = await page.evaluate(() => JSON.parse(localStorage.getItem("carryone.demo") || "null")?.mission?.mission_id);
    if (!missionId) throw new Error("Demo mission id missing after invitation acceptance");

    await page.goto(`${baseUrl}/mission/${encodeURIComponent(missionId)}?demo=1&tour=1`, { waitUntil: "networkidle" });
    await page.locator("#pass-button").waitFor({ state: "visible" });
    await page.locator("#pass-button").click();
    steps.push(await expectPath(page, /^\/mission\/[^/]+\/pass$/, "pass-bridge-b"));
    await page.locator("#send").click();
    steps.push(await expectPath(page, /^\/mission\/[^/]+\/route$/, "route-after-first-final"));
    await page.locator("#demo-tour-continue").waitFor({ state: "visible" });

    await page.locator("#demo-tour-continue").click();
    await page.locator("#invite-dialog").waitFor({ state: "visible" });
    await page.locator("#invite-confirm").click();
    await page.locator("#demo-tour-open-invite").waitFor({ state: "visible" });
    await page.locator("#demo-tour-open-invite").click();
    await page.waitForURL(/\/i\//, { timeout: 8000 });
    await page.locator("#accept").click();
    await page.locator("#notice").filter({ hasText: "Demo bridge accepted" }).waitFor({ state: "visible" });

    await page.goto(`${baseUrl}/mission/${encodeURIComponent(missionId)}?demo=1&tour=1`, { waitUntil: "networkidle" });
    await page.locator("#pass-button").waitFor({ state: "visible" });
    await page.locator("#pass-button").click();
    steps.push(await expectPath(page, /^\/mission\/[^/]+\/pass$/, "pass-destination"));
    await page.locator("#send").click();
    steps.push(await expectPath(page, /^\/mission\/[^/]+\/route$/, "arrived-route"));

    const arrived = await page.locator(".status-pill").textContent();
    if (!/ARRIVED/i.test(arrived || "")) throw new Error(`Expected ARRIVED, got ${arrived || "empty status"}`);
    await page.locator(".hc-arrived-moment").waitFor({ state: "visible" });
    await page.screenshot({ path: join(outputRoot, `${viewport.name}-arrived.png`), fullPage: true });

    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(" | ")}`);
    return { verdict: "PASS", steps, final_status: arrived?.trim() || "ARRIVED", page_errors: [] };
  } finally {
    await context.close();
  }
}

let failed = false;
for (const viewport of viewports) {
  try {
    report.viewports[viewport.name] = await run(viewport);
    console.log(`PASS ${viewport.name} — full guided flow reached ARRIVED`);
  } catch (error) {
    failed = true;
    report.viewports[viewport.name] = { verdict: "FAIL", error: error?.message || String(error) };
    console.error(`FAIL ${viewport.name} — ${error?.message || String(error)}`);
  }
}

await writeFile(join(outputRoot, "report.json"), JSON.stringify(report, null, 2));
await browser.close();

if (failed) process.exit(1);
console.log("NimCarry production judge flow: PASS on mobile + desktop");
