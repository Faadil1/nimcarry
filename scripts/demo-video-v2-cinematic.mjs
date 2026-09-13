import { mkdir, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const playwrightRoot = process.env.DEMO_VIDEO_PLAYWRIGHT_ROOT;
if (!playwrightRoot) throw new Error("DEMO_VIDEO_PLAYWRIGHT_ROOT is required");
const playwrightModule = pathToFileURL(join(playwrightRoot, "node_modules", "playwright", "index.mjs")).href;
const { chromium } = await import(playwrightModule);

const outputRoot = process.env.DEMO_VIDEO_OUTPUT || "demo-video-v2";
const rawRoot = join(outputRoot, "cinematic-raw");
await mkdir(rawRoot, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: rawRoot, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
const video = page.video();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  const fileUrl = pathToFileURL(resolve("scripts/demo-video-v2-cinematic.html")).href;
  await page.goto(fileUrl, { waitUntil: "load" });
  await page.waitForTimeout(8300);
  if (pageErrors.length) throw new Error(`Cinematic page errors: ${pageErrors.join(" | ")}`);
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

const rawPath = await video.path();
await copyFile(rawPath, join(outputRoot, "nimcarry-cinematic-v2.webm"));
console.log(`Cinematic opener written to ${join(outputRoot, "nimcarry-cinematic-v2.webm")}`);
