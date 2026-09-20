import { Container, getContainer } from "@cloudflare/containers";
import { env as runtimeEnv } from "cloudflare:workers";

const REQUIRED_RUNTIME_CONFIG = [
  "CARRY_ONE_DATABASE_URL",
  "CARRY_ONE_TARGET_ENCRYPTION_KEY_B64URL",
  "CARRY_ONE_TARGET_HMAC_KEY_B64URL",
  "CARRY_ONE_CANONICAL_ORIGIN",
];

const DEFAULT_TESTNET_RPC_URL = "https://rpc.testnet.nimiqwatch.com";
const TESTNET_HEAD_TIMEOUT_MS = 2500;
const TESTNET_HEAD_ATTEMPTS = 2;
const ACCOUNT_CLASSIFICATION_MAX = 12;
const NIMIQ_ADDRESS_RE = /^NQ[0-9A-Z]{34}$/;

function validHeight(value) {
  const height = Number(value);
  return Number.isInteger(height) && height >= 0 ? height : undefined;
}

function normalizeNimiqAddress(value) {
  const compact = String(value ?? "").replace(/\s+/g, "").toUpperCase();
  return NIMIQ_ADDRESS_RE.test(compact) ? compact : null;
}

function normalizeAccountType(value) {
  const type = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (type === "basic" || type === "basicaccount" || type === "0") return "basic";
  if (type === "htlc" || type === "hashedtimelockcontract" || type === "2") return "htlc";
  if (type === "vesting" || type === "vestingcontract" || type === "1") return "vesting";
  if (type === "staking" || type === "stakingcontract" || type === "3") return "staking";
  return type || "unknown";
}

function rpcFieldKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function deepRpcField(root, names, maxDepth = 4) {
  const wanted = new Set(names.map(rpcFieldKey));
  const queue = [{ value: root, depth: 0 }];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    const value = current?.value;
    const depth = current?.depth ?? 0;
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);

    for (const [key, child] of Object.entries(value)) {
      if (wanted.has(rpcFieldKey(key)) && child !== undefined && child !== null) return child;
    }
    if (depth >= maxDepth) continue;
    for (const child of Object.values(value)) {
      if (child && typeof child === "object") queue.push({ value: child, depth: depth + 1 });
    }
  }
  return undefined;
}

function configuredTestnetRpcUrls(env) {
  const raw = String(env.NIMIQ_RPC_URLS || env.NIMIQ_RPC_URL || DEFAULT_TESTNET_RPC_URL);
  const urls = raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index);
  return urls.length ? urls : [DEFAULT_TESTNET_RPC_URL];
}

async function rpcBlockHeight(rpcUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TESTNET_HEAD_TIMEOUT_MS);
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "getBlockNumber", params: [], id: 1 }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const body = await response.json();
    if (body?.error) throw new Error("RPC_ERROR");
    const raw = body?.result && typeof body.result === "object" && "data" in body.result
      ? body.result.data
      : body?.result;
    const height = validHeight(raw);
    if (height === undefined) throw new Error("INVALID_TESTNET_HEIGHT");
    return height;
  } finally {
    clearTimeout(timeout);
  }
}

async function readIndependentTestnetHead(env) {
  const urls = configuredTestnetRpcUrls(env);
  let lastError = null;
  for (let attempt = 0; attempt < TESTNET_HEAD_ATTEMPTS; attempt += 1) {
    for (const rpcUrl of urls) {
      try {
        return { height: await rpcBlockHeight(rpcUrl), sourceCount: urls.length, attempt: attempt + 1 };
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError || new Error("TESTNET_HEAD_UNAVAILABLE");
}


async function rpcAccountByAddress(rpcUrl, address) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TESTNET_HEAD_TIMEOUT_MS);
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "getAccountByAddress", params: [address], id: 1 }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const body = await response.json();
    if (body?.error) throw new Error("RPC_ERROR");
    const raw = body?.result && typeof body.result === "object" && "data" in body.result
      ? body.result.data
      : body?.result;
    if (!raw || typeof raw !== "object") {
      return { address, type: "unknown", sender: null };
    }
    const typeRaw = deepRpcField(raw, ["type", "accountType"]);
    const senderRaw = deepRpcField(raw, ["sender", "senderAddress", "htlcSender"]);
    const recipientRaw = deepRpcField(raw, ["recipient", "recipientAddress", "htlcRecipient"]);
    const totalAmountRaw = deepRpcField(raw, ["totalAmount", "total_amount", "htlcTotalAmount"]);
    const totalAmount = Number(totalAmountRaw);
    return {
      address,
      type: normalizeAccountType(typeRaw),
      sender: senderRaw ? normalizeNimiqAddress(senderRaw) : null,
      recipient: recipientRaw ? normalizeNimiqAddress(recipientRaw) : null,
      total_amount: Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readIndependentTestnetAccount(env, address) {
  const urls = configuredTestnetRpcUrls(env);
  let lastError = null;
  for (let attempt = 0; attempt < TESTNET_HEAD_ATTEMPTS; attempt += 1) {
    for (const rpcUrl of urls) {
      try {
        return await rpcAccountByAddress(rpcUrl, address);
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError || new Error("TESTNET_ACCOUNT_LOOKUP_UNAVAILABLE");
}

async function accountTypesResponse(request, env) {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json(
      { error: "METHOD_NOT_ALLOWED", message: "Account classification is read-only and accepts POST JSON only." },
      { status: 405, headers: { "cache-control": "no-store", allow: "POST" } }
    );
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "INVALID_JSON", message: "Expected JSON body with an addresses array." },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  const rawAddresses = Array.isArray(body?.addresses) ? body.addresses : [];
  if (rawAddresses.length < 1 || rawAddresses.length > ACCOUNT_CLASSIFICATION_MAX) {
    return Response.json(
      { error: "INVALID_ADDRESSES", message: `Provide 1-${ACCOUNT_CLASSIFICATION_MAX} Nimiq addresses.` },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  const addresses = [];
  for (const raw of rawAddresses) {
    const address = normalizeNimiqAddress(raw);
    if (!address) {
      return Response.json(
        { error: "INVALID_ADDRESS", message: "Every account-classification input must be a valid NQ address." },
        { status: 400, headers: { "cache-control": "no-store" } }
      );
    }
    if (!addresses.includes(address)) addresses.push(address);
  }

  try {
    const accounts = [];
    for (const address of addresses) {
      accounts.push(await readIndependentTestnetAccount(env, address));
    }
    return Response.json(
      {
        network: "TESTNET",
        accounts,
        independently_observed: true,
        writes_performed: false,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return Response.json(
      {
        error: "TESTNET_ACCOUNT_CLASSIFICATION_UNAVAILABLE",
        message: "NimCarry could not independently classify the exposed Nimiq Pay accounts. No payment was requested.",
        writes_performed: false,
      },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}

async function testnetHeadResponse(request, env) {
  if (request.method.toUpperCase() !== "GET") {
    return Response.json(
      { error: "METHOD_NOT_ALLOWED", message: "TESTNET head preflight is read-only." },
      { status: 405, headers: { "cache-control": "no-store", allow: "GET" } }
    );
  }
  try {
    const result = await readIndependentTestnetHead(env);
    return Response.json(
      {
        network: "TESTNET",
        height: result.height,
        independently_observed: true,
        writes_performed: false,
        rpc_candidates: result.sourceCount,
        attempt: result.attempt,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return Response.json(
      {
        error: "TESTNET_HEAD_UNAVAILABLE",
        message: "NimCarry could not independently read the TESTNET head. No transaction was requested.",
        writes_performed: false,
      },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}

export class NimCarryContainer extends Container {
  defaultPort = 8787;
  sleepAfter = "2h";
  envVars = {
    NODE_ENV: "production",
    PORT: "8787",
    CARRY_ONE_REPOSITORY: "postgres",
    CARRY_ONE_LEGACY_RELAY_ENABLED: "false",
    CARRY_ONE_DATABASE_URL: runtimeEnv.CARRY_ONE_DATABASE_URL,
    CARRY_ONE_TARGET_ENCRYPTION_KEY_B64URL: runtimeEnv.CARRY_ONE_TARGET_ENCRYPTION_KEY_B64URL,
    CARRY_ONE_TARGET_HMAC_KEY_B64URL: runtimeEnv.CARRY_ONE_TARGET_HMAC_KEY_B64URL,
    CARRY_ONE_CANONICAL_ORIGIN: runtimeEnv.CARRY_ONE_CANONICAL_ORIGIN,
    RESEND_API_KEY: runtimeEnv.RESEND_API_KEY || "",
    NIMCARRY_EMAIL_FROM: runtimeEnv.NIMCARRY_EMAIL_FROM || "",
    NIMIQ_RPC_URL: runtimeEnv.NIMIQ_RPC_URL || "https://rpc.testnet.nimiqwatch.com",
    NIMIQ_RPC_URLS: runtimeEnv.NIMIQ_RPC_URLS || runtimeEnv.NIMIQ_RPC_URL || "https://rpc.testnet.nimiqwatch.com",
  };
}

function acceptsJson(request) {
  return (request.headers.get("accept") || "").toLowerCase().includes("application/json");
}

function shouldReachBackend(request, url) {
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === "/health" || path === "/usage") return true;
  if (path.startsWith("/auth/") || path.startsWith("/relay/")) return true;
  if (path.startsWith("/users/")) return true;

  // `/mission/*` is always an SPA route; the canonical HTTP API is `/missions/*`.
  if (path === "/missions" || path.startsWith("/missions/")) {
    return method !== "GET" || acceptsJson(request);
  }

  // `/i/:token` is intentionally both an invite SPA route and an API endpoint.
  // Browser navigation wants HTML; the app's fetch() explicitly asks for JSON.
  if (path.startsWith("/i/")) {
    return method !== "GET" || acceptsJson(request);
  }

  return false;
}

function missingRuntimeConfig(env) {
  return REQUIRED_RUNTIME_CONFIG.filter((name) => !env[name]);
}

async function deepRuntimeHealth(backend, request, env, backendResponse) {
  const relayProbeUrl = new URL("/relay/__nimcarry_runtime_smoke__/intent", request.url);
  const relayResponse = await backend.fetch(
    new Request(relayProbeUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: "{}",
    })
  );

  let relayPayload = null;
  try {
    relayPayload = await relayResponse.clone().json();
  } catch {
    relayPayload = null;
  }

  const legacyRelayGatePass =
    relayResponse.status === 403 && relayPayload?.error === "LEGACY_RELAY_DISABLED";
  const pass = backendResponse.ok && legacyRelayGatePass;

  return Response.json(
    {
      status: pass ? "ok" : "degraded",
      runtime: {
        backend_http_status: backendResponse.status,
        repository_mode: "postgres",
        mission_http_bindings: "enabled",
        canonical_origin: env.CARRY_ONE_CANONICAL_ORIGIN,
        container_identity: "nimcarry-primary",
        max_instances_for_proof_gate: 1,
        legacy_relay_gate: {
          pass: legacyRelayGatePass,
          status: relayResponse.status,
          error: relayPayload?.error ?? null,
        },
      },
    },
    {
      status: pass ? 200 : 503,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/network/testnet-head") {
      return testnetHeadResponse(request, env);
    }
    if (url.pathname === "/network/account-types") {
      return accountTypesResponse(request, env);
    }

    if (!shouldReachBackend(request, url)) {
      return env.ASSETS.fetch(request);
    }

    const missing = missingRuntimeConfig(env);
    if (missing.length > 0) {
      return Response.json(
        {
          error: "RUNTIME_NOT_CONFIGURED",
          message: "NimCarry Cloudflare runtime secrets are incomplete.",
          missing,
        },
        { status: 503 }
      );
    }

    // A stable Durable Object/container name keeps every API request in the
    // proof window on one process-local route-view/broadcast capability store.
    const backend = getContainer(env.NIMCARRY_API, "nimcarry-primary");
    const backendResponse = await backend.fetch(request);

    // `?deep=1` is a deterministic, read-safe production smoke check. The
    // synthetic legacy-relay POST is expected to fail closed with 403 before
    // request-body validation or any state mutation can occur.
    if (
      request.method.toUpperCase() === "GET" &&
      url.pathname === "/health" &&
      url.searchParams.get("deep") === "1" &&
      backendResponse.ok
    ) {
      return deepRuntimeHealth(backend, request, env, backendResponse);
    }

    return backendResponse;
  },
};
