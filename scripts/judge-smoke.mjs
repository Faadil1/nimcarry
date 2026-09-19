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

async function postJson(path, body) {
  const url = `${base}${path}`;
  const started = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  return { url, response, text, payload, ms: Date.now() - started };
}

function record(name, pass, detail) {
  checks.push({ name, pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
}

try {
  // Give Cloudflare/Git-backed production a propagation window after a main push.
  // A stale Worker can still return HTTP 200, so wait for the expected release marker too.
  let root = null;
  let rootAttempt = 0;
  for (rootAttempt = 1; rootAttempt <= 12; rootAttempt += 1) {
    root = await get("/");
    if (root.response.ok && /real-usage/.test(root.text) && /privacy\.html/.test(root.text)) break;
    if (rootAttempt < 12) {
      console.log(`WAIT ${base}/ — production HTML has not reached the expected release yet (attempt ${rootAttempt}/12)`);
      await sleep(10000);
    }
  }
  record("root-http-200", Boolean(root?.response.ok), root ? `${root.response.status} in ${root.ms}ms (attempt ${rootAttempt})` : "no response");
  record("public-brand-visible", /NimCarry/.test(root.text), "NimCarry must be visible in served HTML");
  record("final-human-craft-runtime-wired", /final-human-craft\.css/.test(root.text) && /final-human-craft-max\.css/.test(root.text), "approved runtime identity must be wired in production HTML");
  record("recovery-ux-runtime-wired", /nimiq-recovery-ux\.css/.test(root.text) && /nimiq-recovery-ux\.js/.test(root.text), "fail-closed recovery guidance must be wired after promotion");
  record("final-only-proof-copy", /Only FINAL changes custody/.test(root.text), "judge-facing custody law must remain visible");
  record("mature-positioning-copy", /Real people · one destination/.test(root.text) || /People move opportunity forward/.test(root.text), "human-route positioning must remain visible");
  record("privacy-link-visible", /privacy\.html/.test(root.text), "public UI must disclose the Privacy Notice");
  record("usage-evidence-link-visible", /real-usage/.test(root.text), "public UI must expose aggregate usage evidence");

  const privacy = await get("/privacy.html");
  record("privacy-http-200", privacy.response.ok, `${privacy.response.status} in ${privacy.ms}ms`);
  record(
    "privacy-notice-contract",
    /Privacy Notice/.test(privacy.text) &&
      /name and email/i.test(privacy.text) &&
      /delete your profile/i.test(privacy.text) &&
      /one-time code/i.test(privacy.text) &&
      /profile sessions/i.test(privacy.text) &&
      /public blockchain history/i.test(privacy.text),
    "privacy disclosure must cover profile data, deletion, and immutable protocol evidence"
  );

  const usageEvidence = await get("/real-usage");
  record("usage-evidence-http-200", usageEvidence.response.ok, `${usageEvidence.response.status} in ${usageEvidence.ms}ms`);
  record(
    "usage-evidence-contract",
    /Real usage evidence/i.test(usageEvidence.text) &&
      /Registered profiles/i.test(usageEvidence.text) &&
      /aggregate only/i.test(usageEvidence.text) &&
      /Registration is acquisition, not activation/i.test(usageEvidence.text) &&
      /Nimiq-verified users/i.test(usageEvidence.text) &&
      /Activated users/i.test(usageEvidence.text) &&
      /Finalized users/i.test(usageEvidence.text),
    "judge-facing usage page must preserve metric boundaries and privacy"
  );

  let userProfileAsset = null;
  let profileAssetAttempt = 0;
  for (profileAssetAttempt = 1; profileAssetAttempt <= 12; profileAssetAttempt += 1) {
    userProfileAsset = await get("/user-profile.js");
    if (
      userProfileAsset.response.ok &&
      /Returning user/.test(userProfileAsset.text) &&
      /\/users\/auth\/request/.test(userProfileAsset.text) &&
      /\/users\/auth\/verify/.test(userProfileAsset.text)
    ) break;
    if (profileAssetAttempt < 12) {
      console.log(`WAIT ${base}/user-profile.js — returning-user asset not promoted yet (attempt ${profileAssetAttempt}/12)`);
      await sleep(10000);
    }
  }
  record("user-profile-http-200", Boolean(userProfileAsset?.response.ok), userProfileAsset ? `${userProfileAsset.response.status} in ${userProfileAsset.ms}ms (attempt ${profileAssetAttempt})` : "no response");
  record(
    "returning-user-auth-ui-contract",
    /Returning user/.test(userProfileAsset?.text || "") &&
      /Send sign-in code/.test(userProfileAsset?.text || "") &&
      /Sign in to my profile/.test(userProfileAsset?.text || "") &&
      /\/users\/auth\/request/.test(userProfileAsset?.text || "") &&
      /\/users\/auth\/verify/.test(userProfileAsset?.text || ""),
    "existing profiles must have a real returning-user path rather than forcing duplicate signup"
  );
  record(
    "wallet-provider-guidance-contract",
    /nimcarry-wallet-link-notice/.test(userProfileAsset?.text || "") &&
      /Open NimCarry inside Nimiq Pay to connect your wallet/.test(userProfileAsset?.text || ""),
    "browser fallback must show one clear Nimiq Pay instruction instead of raw repeated provider errors"
  );

  const authRequestProbe = await postJson("/users/auth/request", { email: "nimcarry-smoke-missing@example.invalid" });
  const authRequestPass =
    authRequestProbe.response.status === 202 &&
    authRequestProbe.payload?.accepted === true &&
    /^[0-9a-f-]{36}$/i.test(String(authRequestProbe.payload?.challenge_id || ""));
  record(
    "returning-auth-request-contract",
    authRequestPass,
    `${authRequestProbe.response.status} in ${authRequestProbe.ms}ms — production email delivery must be configured and unknown emails must not disclose account existence`
  );

  const authVerifyProbe = await postJson("/users/auth/verify", {
    challenge_id: "00000000-0000-4000-8000-000000000000",
    code: "000000",
  });
  record(
    "returning-auth-verify-contract",
    authVerifyProbe.response.status === 401 && authVerifyProbe.payload?.error === "LOGIN_CODE_INVALID",
    `${authVerifyProbe.response.status} in ${authVerifyProbe.ms}ms — invalid challenges must fail without creating sessions`
  );

  const demo = await get("/?demo=1");
  record("guided-demo-http-200", demo.response.ok, `${demo.response.status} in ${demo.ms}ms`);
  record("guided-demo-same-runtime", /final-human-craft\.css/.test(demo.text), "guided demo must use the same approved product runtime");

  const testnetHead = await get("/network/testnet-head", { attempts: 3, delayMs: 1500 });
  let testnetHeadPayload = null;
  try { testnetHeadPayload = JSON.parse(testnetHead.text); } catch {}
  record("testnet-head-http-200", testnetHead.response.ok, `${testnetHead.response.status} in ${testnetHead.ms}ms`);
  record(
    "testnet-head-read-only-contract",
    testnetHeadPayload?.network === "TESTNET" &&
      Number.isInteger(Number(testnetHeadPayload?.height)) &&
      testnetHeadPayload?.independently_observed === true &&
      testnetHeadPayload?.writes_performed === false,
    "same-origin independent TESTNET head must be live before a wallet write can be requested"
  );

  let userStats = null;
  let userStatsPayload = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    userStats = await get("/users/stats");
    try { userStatsPayload = JSON.parse(userStats.text); } catch { userStatsPayload = null; }
    if (
      userStats.response.ok &&
      userStatsPayload?.metric_policy_version === "real-usage-v2" &&
      Number.isInteger(Number(userStatsPayload?.registered_users)) &&
      Number.isInteger(Number(userStatsPayload?.consented_users)) &&
      Number.isInteger(Number(userStatsPayload?.nimiq_verified_users)) &&
      Number.isInteger(Number(userStatsPayload?.wallet_linked_users)) &&
      Number.isInteger(Number(userStatsPayload?.activated_users)) &&
      Number.isInteger(Number(userStatsPayload?.finalized_users)) &&
      Number.isInteger(Number(userStatsPayload?.protocol_participants))
    ) break;
    if (attempt < 12) {
      console.log(`WAIT ${base}/users/stats — user API route not deployed yet (attempt ${attempt}/12)`);
      await sleep(10000);
    }
  }
  record("users-stats-http-200", Boolean(userStats?.response.ok), userStats ? `${userStats.response.status} in ${userStats.ms}ms` : "no response");
  record(
    "users-stats-json-contract",
    userStatsPayload?.metric_policy_version === "real-usage-v2" &&
      Number.isInteger(Number(userStatsPayload?.registered_users)) &&
      Number.isInteger(Number(userStatsPayload?.consented_users)) &&
      Number.isInteger(Number(userStatsPayload?.nimiq_verified_users)) &&
      Number.isInteger(Number(userStatsPayload?.wallet_linked_users)) &&
      Number.isInteger(Number(userStatsPayload?.activated_users)) &&
      Number.isInteger(Number(userStatsPayload?.finalized_users)) &&
      Number.isInteger(Number(userStatsPayload?.protocol_participants)) &&
      userStatsPayload?.assurance?.nimiq_verified_users === "valid_nimiq_wallet_signature",
    "Human-first user metrics must be routed to the container as JSON, never the SPA shell"
  );

  for (const assetPath of [
    "/nimcarry-mark.svg",
    "/final-human-craft.css",
    "/final-human-craft-max.css",
    "/nimiq-recovery-ux.css",
    "/nimiq-recovery-ux.js",
  ]) {
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
