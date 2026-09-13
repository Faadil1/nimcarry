#!/usr/bin/env node

const base = (process.argv[2] || process.env.NIMCARRY_JUDGE_URL || "").replace(/\/$/, "");
if (!base) {
  console.error("Usage: node scripts/judge-smoke.mjs <base-url> or set NIMCARRY_JUDGE_URL");
  process.exit(2);
}

const checks = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path, { attempts = 1, delayMs = 0 } = {}) {
  const url = `${base}${path}`;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10000) });
      const text = await response.text();
      if (response.ok || attempt === attempts) return { url, response, text, ms: Date.now() - started, attempt };
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    console.log(`WAIT ${url} — attempt ${attempt}/${attempts} not ready (${lastError?.message || "unknown"})`);
    if (delayMs) await sleep(delayMs);
  }
  throw lastError || new Error(`Failed to fetch ${url}`);
}

function record(name, pass, detail) {
  checks.push({ name, pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
}

try {
  // Give Cloudflare/Git-backed production a short propagation window after a main push.
  const root = await get("/", { attempts: 12, delayMs: 10000 });
  record("root-http-200", root.response.ok, `${root.response.status} in ${root.ms}ms (attempt ${root.attempt})`);
  record("public-brand-visible", /NimCarry/.test(root.text), "NimCarry must be visible in served HTML");
  record("final-human-craft-runtime-wired", /final-human-craft\.css/.test(root.text) && /final-human-craft-max\.css/.test(root.text), "approved runtime identity must be wired in production HTML");
  record("final-only-proof-copy", /Only FINAL changes custody/.test(root.text), "judge-facing custody law must remain visible");
  record("mature-positioning-copy", /Real people · one destination/.test(root.text) || /People move opportunity forward/.test(root.text), "human-route positioning must remain visible");

  const demo = await get("/?demo=1");
  record("guided-demo-http-200", demo.response.ok, `${demo.response.status} in ${demo.ms}ms`);
  record("guided-demo-same-runtime", /final-human-craft\.css/.test(demo.text), "guided demo must use the same approved product runtime");

  for (const assetPath of ["/nimcarry-mark.svg", "/final-human-craft.css", "/final-human-craft-max.css"]) {
    const asset = await get(assetPath);
    record(`asset-${assetPath.slice(1)}-http-200`, asset.response.ok, `${asset.response.status} in ${asset.ms}ms`);
  }

  const health = await get("/health.json");
  let payload = null;
  try { payload = JSON.parse(health.text); } catch {}
  record("health-http-200", health.response.ok, `${health.response.status} in ${health.ms}ms`);
  record("health-contract", payload?.service === "nimcarry-web" && payload?.status === "ok" && payload?.proof_model === "FINAL_ONLY_CUSTODY", "static judge-window health contract");
} catch (error) {
  record("request-path", false, error instanceof Error ? error.message : String(error));
}

const failed = checks.filter((check) => !check.pass);
console.log(`\nNimCarry production judge smoke: ${failed.length === 0 ? "PASS" : "FAIL"} (${checks.length - failed.length}/${checks.length} checks)`);
if (failed.length > 0) {
  console.log("Failed checks:");
  for (const check of failed) console.log(`- ${check.name}: ${check.detail}`);
  process.exit(1);
}
