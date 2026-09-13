import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const [webRoot, label, outputRoot, portRaw] = process.argv.slice(2);
if (!webRoot || !label || !outputRoot) throw new Error("usage: node trace-visual-capture.mjs <web-root> <label> <output-root> [port]");
const port = Number(portRaw || 4173);
const origin = `http://127.0.0.1:${port}`;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json; charset=utf-8",
};

function safePath(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([.][.][/\\])+/, "").replace(/^[/\\]+/, "");
  return join(webRoot, clean || "index.html");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", origin);
  let path = safePath(url.pathname);
  try {
    const info = await stat(path);
    if (info.isDirectory()) path = join(path, "index.html");
  } catch {
    path = join(webRoot, "index.html");
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(error));
  }
});

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
await mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: "320", width: 320, height: 720, full: ["home", "mission", "pass", "arrived"] },
  { name: "375", width: 375, height: 812, full: ["home", "create", "mission", "invite-created", "invitation", "pass", "route", "arrived"] },
  { name: "390", width: 390, height: 844, full: ["home", "mission", "pass", "arrived"] },
];
const report = { label, generated_at: new Date().toISOString(), origin, viewports: {} };

async function metrics(page, state) {
  return page.evaluate((stateName) => {
    const all = [...document.querySelectorAll("body *")];
    const overflow = all.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
    }).slice(0, 20).map((el) => ({ tag: el.tagName, class: el.className, text: (el.textContent || "").trim().slice(0, 80), rect: el.getBoundingClientRect().toJSON?.() || {} }));
    const smallButtons = [...document.querySelectorAll("button,.button")].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || "").trim().slice(0, 60), width: Math.round(r.width), height: Math.round(r.height) };
    }).filter((x) => x.width > 0 && (x.width < 44 || x.height < 44));
    const visibleText = all.filter((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.top < Math.min(window.innerHeight, 640) && r.bottom > 0 && s.visibility !== "hidden" && s.display !== "none";
    }).map((el) => (el.childElementCount === 0 ? (el.textContent || "").trim() : "")).filter(Boolean).join(" | ").slice(0, 2500);
    return {
      state: stateName,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      body_scroll_width: document.documentElement.scrollWidth,
      horizontal_overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      overflow_elements: overflow,
      small_buttons: smallButtons,
      first_view_text: visibleText,
      active_element: document.activeElement?.tagName || null,
    };
  }, state);
}

async function shot(page, viewportName, state, enabled) {
  const data = await metrics(page, state);
  if (enabled.includes(state)) await page.screenshot({ path: join(outputRoot, `${viewportName}-${state}.png`), fullPage: true });
  return data;
}

for (const vp of viewports) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const states = {};
  await page.goto(`${origin}/?demo=1`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  states.home = await shot(page, vp.name, "home", vp.full);

  await page.locator("#create-button").click();
  states.create = await shot(page, vp.name, "create", vp.full);
  await page.locator('input[name="target_label"]').fill("Nimiq builder");
  await page.locator('input[name="target_wallet"]').fill("NQ DEMO DESTINATION");
  await page.locator('textarea[name="mission_note"]').fill("I need a warm introduction to one specific person I cannot reach directly.");
  await page.locator('input[name="creator_display_label"]').fill("Creator");
  await page.locator('input[name="target_consent_confirmed"]').check();
  await page.locator("#create-form button[type='submit']").click();
  await page.waitForURL(/\/mission\//);
  states.mission = await shot(page, vp.name, "mission", vp.full);

  await page.locator("#invite-button").click();
  await page.locator("#candidate-label").fill("Bridge B");
  await page.locator("#why-you").fill("You know someone closer to the destination.");
  await page.locator("#invite-confirm").click();
  await page.waitForSelector(".invite-link");
  states["invite-created"] = await shot(page, vp.name, "invite-created", vp.full);
  const inviteUrl = (await page.locator(".invite-link").textContent()).trim();

  await page.goto(`${inviteUrl}?demo=1`, { waitUntil: "networkidle" });
  states.invitation = await shot(page, vp.name, "invitation", vp.full);
  await page.locator("#accept").click();
  await page.waitForTimeout(80);

  const missionId = await page.evaluate(() => JSON.parse(localStorage.getItem("carryone.demo") || "null")?.mission?.mission_id);
  await page.goto(`${origin}/mission/${encodeURIComponent(missionId)}?demo=1`, { waitUntil: "networkidle" });
  await page.locator("#pass-button").click();
  states.pass = await shot(page, vp.name, "pass", vp.full);
  await page.locator("#send").click();
  await page.waitForURL(/\/route/);
  states.route = await shot(page, vp.name, "route", vp.full);

  await page.goto(`${origin}/?demo=1`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#wi-preview-receipt");
  await page.locator("#wi-preview-receipt").click();
  await page.waitForURL(/\/route/);
  states.arrived = await shot(page, vp.name, "arrived", vp.full);

  report.viewports[vp.name] = states;
  await context.close();
}

await readFile(join(webRoot, "index.html"));
await import("node:fs/promises").then(({ writeFile }) => writeFile(join(outputRoot, "report.json"), JSON.stringify(report, null, 2)));
await browser.close();
await new Promise((resolve) => server.close(resolve));
console.log(`TRACE visual capture complete: ${label} -> ${outputRoot}`);
