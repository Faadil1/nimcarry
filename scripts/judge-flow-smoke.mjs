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
  ".woff2": "font/woff2",
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
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 900 },
];

const report = {
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  target: localWebRoot ? "PR_LOCAL_BRANCH_RUNTIME" : "PRODUCTION_RUNTIME",
  mode: "PRACTICE MODE — nothing is signed or sent",
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

async function captureState(page, viewport, label, expectedMode) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const geometry = await page.evaluate((mode) => {
    const root = document.documentElement;
    const shell = document.querySelector(".app-shell");
    const screen = document.querySelector("#screen");
    const copy = document.querySelector(".nc-copy");
    const object = document.querySelector(".nc-object .nc-letter");
    // Every visible control must be a comfortable touch target.
    const small = [...document.querySelectorAll("#screen button, #screen a.button, #screen summary, #screen input:not([type=checkbox]), #screen textarea")]
      .filter((node) => node.offsetParent !== null)
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.height < 43.5)
      .map(({ node, rect }) => `${node.id || node.className || node.tagName}:${Math.round(rect.height)}`);
    return {
      mode: screen?.dataset.screen || null,
      ground: document.body.dataset.ground || null,
      inner_width: window.innerWidth,
      document_width: root.scrollWidth,
      shell_width: shell?.getBoundingClientRect().width || 0,
      screen_width: screen?.getBoundingClientRect().width || 0,
      copy_right: copy ? copy.getBoundingClientRect().right : null,
      letter_left: object ? object.getBoundingClientRect().left : null,
      small_targets: small,
      expected_mode: mode,
    };
  }, expectedMode);

  if (geometry.document_width > geometry.inner_width + 1) {
    throw new Error(`${label}: horizontal overflow ${geometry.document_width}px > ${geometry.inner_width}px`);
  }
  if (expectedMode && geometry.mode !== expectedMode) {
    throw new Error(`${label}: expected screen mode ${expectedMode}, got ${geometry.mode || "none"}`);
  }
  if (viewport.width >= 1024 && geometry.shell_width < 1080) {
    throw new Error(`${label}: desktop shell stayed mobile-width at ${Math.round(geometry.shell_width)}px`);
  }
  if (viewport.width >= 1024 && geometry.copy_right !== null && geometry.letter_left !== null && geometry.letter_left < geometry.copy_right - 40) {
    throw new Error(`${label}: desktop did not put the letter beside the copy`);
  }
  if (geometry.small_targets.length) {
    throw new Error(`${label}: touch targets below 44px: ${geometry.small_targets.join(", ")}`);
  }

  const file = `${viewport.name}-${label}.png`;
  await page.screenshot({ path: join(outputRoot, file), fullPage: true });
  return { label, file, ...geometry };
}

async function dragSealOntoRecipient(page) {
  await page.locator("#nc-drop").scrollIntoViewIfNeeded();
  const knob = await page.locator("#nc-drop-knob").boundingBox();
  const target = await page.locator(".nc-drop__target").boundingBox();
  if (!knob || !target) throw new Error("Drop gesture is not rendered");
  const y = knob.y + knob.height / 2;
  const fromX = knob.x + knob.width / 2;
  const toX = target.x + target.width / 2;
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) await page.mouse.move(fromX + ((toX - fromX) * i) / 12, y);
  await page.mouse.up();
}

async function run(viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const steps = [];
  const captures = [];
  const pageErrors = [];
  let activeStep = "boot";
  page.on("pageerror", (error) => {
    const record = { step: activeStep, message: error.message, stack: error.stack || "" };
    pageErrors.push(record);
    console.error(`[PAGEERROR ${viewport.name} @ ${activeStep}] ${error.stack || error.message}`);
  });

  try {
    activeStep = "live-home";
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 20000 });
    await page.locator(".nc-home").waitFor({ state: "visible" });
    if (await page.locator("#demo-banner").isVisible()) throw new Error("Live site showed the practice banner");
    if ((await page.locator("body").getAttribute("data-ground")) !== "forest") throw new Error("Live home did not use the forest ground");
    captures.push(await captureState(page, viewport, "00-live-home", "home"));

    // The recipient's payment link is a first-class surface. Exercise it at every viewport
    // without signing or mutating any real runtime: only the app's JSON GET is synthetic.
    activeStep = "destination-claim-responsive";
    const claimToken = "judge-destination-claim";
    const claimUrlPattern = `**/c/${claimToken}`;
    await page.route(claimUrlPattern, async (route) => {
      const request = route.request();
      if (request.resourceType() === "document") {
        await route.continue();
        return;
      }
      if (request.method() !== "GET") {
        await route.abort();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          claim: { id: "22222222-2222-4222-8222-222222222222", mission_id: "33333333-3333-4333-8333-333333333333", status: "PENDING", expires_at: "2026-09-22T04:00:00.000Z", claimed_at: null },
          mission: { mission_id: "33333333-3333-4333-8333-333333333333", target_label: "David", mission_note: "your share of dinner!", status: "ACTIVE", target_wallet_bound: false },
          sender_label: "Faadil",
        }),
      });
    });
    await page.goto(`${baseUrl}/c/${claimToken}`, { waitUntil: "networkidle", timeout: 20000 });
    await page.locator('[data-destination-claim-status="PENDING"]').waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#claim-destination").waitFor({ state: "visible" });
    const claimCopy = await page.locator('[data-destination-claim-status="PENDING"]').textContent();
    if (!/Receive in my wallet/i.test(claimCopy || "")) throw new Error(`Payment link surface missing its action: ${claimCopy || "empty"}`);
    if (!/Faadil sent/i.test(claimCopy || "")) throw new Error("Payment link did not name the sender");
    captures.push(await captureState(page, viewport, "00c-payment-link", "claim"));
    await page.unroute(claimUrlPattern);

    // A full mini-app close drops sessionStorage. Home must rediscover a non-secret mission
    // locator and route through fresh read-only VIEW_ROUTE recovery. Never persist bearer access.
    activeStep = "persistent-resume-home";
    const resumeMissionId = "11111111-1111-4111-8111-111111111111";
    await page.evaluate((missionId) => {
      sessionStorage.clear();
      localStorage.setItem("nimcarry.recentMissions.v1", JSON.stringify([missionId]));
    }, resumeMissionId);
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 20000 });
    await page.locator("#nimiq-recovery-panel").waitFor({ state: "visible", timeout: 5000 });
    const resumeCopy = await page.locator("#nimiq-recovery-panel").textContent();
    if (!/Resume without creating a new mission/i.test(resumeCopy || "")) throw new Error(`Persistent mission locator did not surface safe resume UI: ${resumeCopy || "empty"}`);
    const resumeHref = await page.locator("#nimiq-recovery-panel a").first().getAttribute("href");
    if (!resumeHref?.includes("/route-access-recovery.html") || !resumeHref.includes(resumeMissionId)) {
      throw new Error(`Resume UI did not require fresh VIEW_ROUTE recovery: ${resumeHref || "missing href"}`);
    }
    captures.push(await captureState(page, viewport, "00b-resume-home", "home"));
    await page.evaluate(() => localStorage.removeItem("nimcarry.recentMissions.v1"));

    activeStep = "practice-home";
    await page.goto(`${baseUrl}/?demo=1&tour=1&reset=1`, { waitUntil: "networkidle", timeout: 20000 });
    await page.locator("#demo-banner").waitFor({ state: "visible" });
    await page.locator('#demo-tour-guide[data-step="1"]').waitFor({ state: "visible" });
    steps.push({ label: "home", path: new URL(page.url()).pathname });
    captures.push(await captureState(page, viewport, "01-home", "home"));

    activeStep = "create";
    await page.locator("#create-button").click();
    steps.push(await expectPath(page, /^\/create$/, "create"));
    await page.locator("#create-form").waitFor({ state: "visible" });
    await page.locator('#demo-tour-guide[data-step="2"]').waitFor({ state: "visible" });
    await page.locator('input[name="target_label"]').fill("David");
    await page.locator('textarea[name="mission_note"]').fill("your share of dinner!");
    await page.locator(".nc-more > summary").click();
    await page.locator('input[name="creator_display_label"]').fill("Faadil");
    const letterName = await page.locator("[data-letter-name]").textContent();
    if (letterName?.trim() !== "David") throw new Error(`Letter did not fill in live: ${letterName || "empty"}`);
    if (await page.locator("#target-consent-row").isVisible()) throw new Error("Address confirmation shown without an address");
    captures.push(await captureState(page, viewport, "02-write", "create"));

    activeStep = "sealed";
    await page.locator("#create-form button[type='submit']").click();
    steps.push(await expectPath(page, /^\/mission\/[^/]+$/, "sealed"));
    await page.locator('[data-primary-action="SHARE_CLAIM"]').waitFor({ state: "visible" });
    await page.locator('.nc-letter[data-state="sealed"]').waitFor({ state: "visible" });
    await page.locator('#demo-tour-guide[data-step="3"]').waitFor({ state: "visible" });
    captures.push(await captureState(page, viewport, "03-sealed", "mission"));
    await page.locator("#claim-share-button").click();
    const shareNotice = await page.locator("#notice").textContent();
    if (!/Practice/i.test(shareNotice || "")) throw new Error("Practice share did not stay local");

    activeStep = "recipient";
    await page.locator("#demo-open-claim").click();
    steps.push(await expectPath(page, /^\/c\/practice-/, "recipient"));
    await page.locator('[data-destination-claim-status="PENDING"]').waitFor({ state: "visible" });
    captures.push(await captureState(page, viewport, "04-recipient", "claim"));
    await page.locator("#claim-destination").click();

    activeStep = "opened";
    steps.push(await expectPath(page, /^\/mission\/[^/]+$/, "opened"));
    await page.locator('[data-primary-action="SEND_1_NIM"]').waitFor({ state: "visible" });
    await page.locator('#demo-tour-guide[data-step="4"]').waitFor({ state: "visible" });
    captures.push(await captureState(page, viewport, "05-opened", "mission"));

    activeStep = "send";
    await page.locator("#pass-button").click();
    steps.push(await expectPath(page, /^\/mission\/[^/]+\/pass$/, "send"));
    await page.locator("#nc-drop").waitFor({ state: "visible" });
    const dropTop = await page.locator("#nc-drop").evaluate((node) => node.getBoundingClientRect().top);
    if (dropTop > viewport.height) throw new Error(`Send gesture starts below the fold at ${Math.round(dropTop)}px`);
    captures.push(await captureState(page, viewport, "06-send", "pass"));
    await dragSealOntoRecipient(page);
    await page.locator('#nc-phase[data-phase="verification-pending"]').waitFor({ state: "visible", timeout: 3000 });

    activeStep = "arrived";
    steps.push(await expectPath(page, /^\/mission\/[^/]+\/route$/, "arrived"));
    await page.locator(".nc-stamp--arrived").waitFor({ state: "visible" });
    const arrived = await page.locator(".status-pill").textContent();
    if (!/ARRIVED/i.test(arrived || "")) throw new Error(`Expected ARRIVED, got ${arrived || "empty status"}`);
    await page.locator('#demo-tour-guide[data-step="5"]').waitFor({ state: "visible" });
    const rows = await page.locator(".route-step").count();
    if (rows !== 1) throw new Error(`Expected exactly 1 confirmed payment, got ${rows}`);
    const routeText = await page.locator(".route-step").first().textContent();
    if (!/Sent directly/i.test(routeText || "") || !/David/i.test(routeText || "")) throw new Error(`Unexpected receipt row: ${routeText || "empty"}`);
    captures.push(await captureState(page, viewport, "07-arrived", "route"));

    // Reload must keep practice mode and the same single payment.
    activeStep = "refresh-arrived";
    await page.reload({ waitUntil: "networkidle", timeout: 20000 });
    const afterRefresh = new URL(page.url());
    if (afterRefresh.searchParams.get("demo") !== "1" || afterRefresh.searchParams.get("tour") !== "1") {
      throw new Error(`Practice context missing after refresh: ${afterRefresh.search}`);
    }
    await page.locator("#demo-banner").waitFor({ state: "visible" });
    const rowsAfterRefresh = await page.locator(".route-step").count();
    if (rowsAfterRefresh !== 1) throw new Error(`Expected one payment after refresh, got ${rowsAfterRefresh}`);
    steps.push({ label: "refresh-preserved-arrival", path: afterRefresh.pathname, search: afterRefresh.search });

    if (pageErrors.length) {
      const compact = pageErrors.map((entry) => `${entry.step}: ${entry.message}`).join(" | ");
      const error = new Error(`Page errors: ${compact}`);
      error.pageErrors = pageErrors;
      throw error;
    }
    return { verdict: "PASS", steps, captures, final_status: arrived?.trim() || "ARRIVED", page_errors: [] };
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
    console.log(`PASS ${viewport.name} — practice payment link reached ARRIVED`);
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
console.log(`NimCarry judge flow: PASS on mobile + tablet + desktop (${localWebRoot ? "PR local branch runtime" : "production"})`);
