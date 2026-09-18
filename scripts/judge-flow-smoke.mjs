import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

const playwrightRoot = process.env.JUDGE_FLOW_PLAYWRIGHT_ROOT;
if (!playwrightRoot) throw new Error("JUDGE_FLOW_PLAYWRIGHT_ROOT is required");
const playwrightModule = pathToFileURL(join(playwrightRoot, "node_modules", "playwright", "index.mjs")).href;
const { chromium } = await import(playwrightModule);

const localWebRoot = String(process.env.JUDGE_FLOW_WEB_ROOT || "").trim();
const localPort = Number(process.env.JUDGE_FLOW_LOCAL_PORT || 4317);
let localServer = null;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json; charset=utf-8",
};

function safeWebPath(root, pathname) {
  const clean = normalize(decodeURIComponent(pathname))
    .replace(/^([.][.][/\\])+/, "")
    .replace(/^[/\\]+/, "");
  return join(root, clean || "index.html");
}

async function startLocalSpaServer(root, port) {
  const origin = `http://127.0.0.1:${port}`;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", origin);
    let path = safeWebPath(root, url.pathname);
    try {
      const info = await stat(path);
      if (info.isDirectory()) path = join(path, "index.html");
    } catch {
      path = join(root, "index.html");
    }
    try {
      const body = await readFile(path);
      res.writeHead(200, {
        "content-type": mime[extname(path)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { server, origin };
}

let baseUrl;
if (localWebRoot) {
  const started = await startLocalSpaServer(localWebRoot, localPort);
  localServer = started.server;
  baseUrl = started.origin;
} else {
  baseUrl = (process.argv[2] || process.env.NIMCARRY_JUDGE_URL || "").replace(/\/$/, "");
  if (!baseUrl) throw new Error("Usage: node scripts/judge-flow-smoke.mjs <production-url> or set JUDGE_FLOW_WEB_ROOT");
}

const outputRoot = process.env.JUDGE_FLOW_OUTPUT || "judge-flow-smoke";
await mkdir(outputRoot, { recursive: true });

const viewports = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "desktop-1280", width: 1280, height: 900 },
];

const report = {
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  target: localWebRoot ? "PR_LOCAL_BRANCH_RUNTIME" : "PRODUCTION_RUNTIME",
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

async function readMissionId(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("carryone.demo") || "null")?.mission?.mission_id || null);
}

async function run(viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const steps = [];
  const pageErrors = [];
  let activeStep = "boot";
  page.on("pageerror", (error) => {
    const record = { step: activeStep, message: error.message, stack: error.stack || "" };
    pageErrors.push(record);
    console.error(`[PAGEERROR ${viewport.name} @ ${activeStep}] ${error.stack || error.message}`);
  });

  try {
    activeStep = "home";
    await page.goto(`${baseUrl}/?demo=1&tour=1&reset=1`, { waitUntil: "networkidle", timeout: 20000 });
    await page.locator("#demo-banner").waitFor({ state: "visible" });
    await page.locator('#demo-tour-guide[data-step="1"]').waitFor({ state: "visible" });
    steps.push({ label: "home", path: new URL(page.url()).pathname });

    activeStep = "create";
    await page.locator("#create-button").click();
    steps.push(await expectPath(page, /^\/create$/, "create"));
    await page.locator("#create-form").waitFor({ state: "visible" });

    await page.locator('input[name="target_label"]').fill("Nimiq Community Lead");
    await page.locator('input[name="target_wallet"]').fill("NQDEMO_TARGET_0001");
    await page.locator('textarea[name="mission_note"]').fill("I need a warm introduction to one specific person I cannot reach directly.");
    await page.locator('input[name="creator_display_label"]').fill("Creator");
    await page.locator('input[name="target_consent_confirmed"]').check();
    activeStep = "mission-home";
    await page.locator("#create-form button[type='submit']").click();
    steps.push(await expectPath(page, /^\/mission\/[^/]+$/, "mission-home"));
    await page.locator("#invite-button").waitFor({ state: "visible" });

    activeStep = "invite-created";
    await page.locator("#invite-button").click();
    await page.locator("#invite-dialog").waitFor({ state: "visible" });
    await page.locator("#candidate-label").fill("Bridge B");
    await page.locator("#why-you").fill("You know someone closer to the destination.");
    await page.locator("#candidate-wallet").fill("NQDEMO_BRIDGE_0001");
    await page.locator("#invite-confirm").click();
    await page.locator("#demo-tour-open-invite").waitFor({ state: "visible" });
    steps.push({ label: "invite-created", path: new URL(page.url()).pathname });

    activeStep = "invitation-bridge-b";
    await page.locator("#demo-tour-open-invite").click();
    await page.waitForURL(/\/i\//, { timeout: 8000 });
    await page.locator("#accept").waitFor({ state: "visible" });
    steps.push({ label: "invitation-bridge-b", path: new URL(page.url()).pathname });
    await page.locator("#accept").click();
    steps.push(await expectPath(page, /^\/mission\/[^/]+$/, "mission-after-bridge-accept"));

    const missionId = await readMissionId(page);
    if (!missionId) throw new Error("Demo mission id missing after invitation acceptance");
    await page.locator("#pass-button").waitFor({ state: "visible" });

    activeStep = "pass-bridge-b";
    await page.locator("#pass-button").click();
    steps.push(await expectPath(page, /^\/mission\/[^/]+\/pass$/, "pass-bridge-b"));
    await page.locator(".clv2-handoff-manifest").waitFor({ state: "visible" });
    await page.locator('#demo-tour-guide[data-step="4"]').waitFor({ state: "visible" });
    await page.locator(".hc-pass-ritual").waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    if (await page.locator(".hc-pass-ritual").count()) throw new Error("Legacy pass ritual leaked into V2 handoff surface");
    await page.locator("#send").click();
    await page.locator('.clv2-wax-scene[data-phase="verification-pending"]').waitFor({ state: "visible", timeout: 3000 });
    const warmCopy = await page.locator(".clv2-wax-kicker").textContent();
    if (!/PRACTICE VERIFICATION/i.test(warmCopy || "")) throw new Error(`Expected practice warm-wax state, got ${warmCopy || "empty"}`);
    await page.locator('.clv2-wax-scene[data-phase="final"]').waitFor({ state: "visible", timeout: 5000 });
    const postmark = await page.locator(".clv2-postmark").textContent();
    if (!/PRACTICE/i.test(postmark || "")) throw new Error(`Expected practice postmark, got ${postmark || "empty"}`);
    activeStep = "route-after-first-final";
    steps.push(await expectPath(page, /^\/mission\/[^/]+\/route$/, "route-after-first-final"));
    await page.locator(".clv2-route-ledger-head").waitFor({ state: "visible" });
    await page.locator(".clv2-hop-stamp").first().waitFor({ state: "visible" });
    await page.locator("#demo-tour-continue").waitFor({ state: "visible" });

    activeStep = "refresh-route-after-first-final";
    const beforeRefresh = new URL(page.url());
    if (beforeRefresh.searchParams.get("demo") !== "1" || beforeRefresh.searchParams.get("tour") !== "1") {
      throw new Error(`Practice context missing before refresh: ${beforeRefresh.search}`);
    }
    await page.reload({ waitUntil: "networkidle", timeout: 20000 });
    const afterRefresh = new URL(page.url());
    if (afterRefresh.searchParams.get("demo") !== "1" || afterRefresh.searchParams.get("tour") !== "1") {
      throw new Error(`Practice context missing after refresh: ${afterRefresh.search}`);
    }
    await page.locator("#demo-banner").waitFor({ state: "visible" });
    await page.locator("#demo-tour-continue").waitFor({ state: "visible" });
    steps.push({ label: "refresh-preserved-practice-context", path: afterRefresh.pathname, search: afterRefresh.search });

    activeStep = "invite-destination";
    await page.locator("#demo-tour-continue").click();
    await page.locator("#invite-dialog").waitFor({ state: "visible" });
    await page.locator("#invite-confirm").click();
    await page.locator("#demo-tour-open-invite").waitFor({ state: "visible" });

    activeStep = "invitation-destination";
    await page.locator("#demo-tour-open-invite").click();
    await page.waitForURL(/\/i\//, { timeout: 8000 });
    await page.locator("#accept").waitFor({ state: "visible" });
    steps.push({ label: "invitation-destination", path: new URL(page.url()).pathname });
    await page.locator("#accept").click();
    steps.push(await expectPath(page, /^\/mission\/[^/]+$/, "mission-after-destination-accept"));
    await page.locator("#pass-button").waitFor({ state: "visible" });

    activeStep = "pass-destination";
    await page.locator("#pass-button").click();
    steps.push(await expectPath(page, /^\/mission\/[^/]+\/pass$/, "pass-destination"));
    await page.locator(".clv2-handoff-manifest").waitFor({ state: "visible" });
    await page.locator("#send").click();
    await page.locator('.clv2-wax-scene[data-phase="verification-pending"]').waitFor({ state: "visible", timeout: 3000 });
    await page.locator('.clv2-wax-scene[data-phase="final"]').waitFor({ state: "visible", timeout: 5000 });
    activeStep = "arrived-route";
    steps.push(await expectPath(page, /^\/mission\/[^/]+\/route$/, "arrived-route"));

    const arrived = await page.locator(".status-pill").textContent();
    if (!/ARRIVED/i.test(arrived || "")) throw new Error(`Expected ARRIVED, got ${arrived || "empty status"}`);
    await page.locator(".hc-arrived-moment").waitFor({ state: "visible" });
    await page.locator('#demo-tour-guide[data-step="5"]').waitFor({ state: "visible" });
    await page.locator(".demo-tour-complete").waitFor({ state: "visible" });
    await page.locator(".clv2-route-ledger-head").waitFor({ state: "visible" });
    const postmarks = await page.locator(".clv2-hop-stamp").count();
    if (postmarks < 2) throw new Error(`Expected at least 2 verified letter-back postmarks, got ${postmarks}`);
    await page.screenshot({ path: join(outputRoot, `${viewport.name}-arrived.png`), fullPage: true });

    if (pageErrors.length) {
      const compact = pageErrors.map((entry) => `${entry.step}: ${entry.message}`).join(" | ");
      const error = new Error(`Page errors: ${compact}`);
      error.pageErrors = pageErrors;
      throw error;
    }
    return { verdict: "PASS", steps, final_status: arrived?.trim() || "ARRIVED", page_errors: [] };
  } catch (error) {
    error.flowStep = activeStep;
    error.pageErrors = error.pageErrors || pageErrors;
    throw error;
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
    report.viewports[viewport.name] = {
      verdict: "FAIL",
      step: error.flowStep || "unknown",
      error: error?.message || String(error),
      page_errors: error.pageErrors || [],
    };
    console.error(`FAIL ${viewport.name} @ ${error.flowStep || "unknown"} — ${error?.message || String(error)}`);
  }
}

await writeFile(join(outputRoot, "report.json"), JSON.stringify(report, null, 2));
await browser.close();
if (localServer) await new Promise((resolve) => localServer.close(resolve));

if (failed) process.exit(1);
console.log(`NimCarry judge flow: PASS on mobile + desktop (${localWebRoot ? "PR local branch runtime" : "production"})`);
