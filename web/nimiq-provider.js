import { init } from "/vendor/nimiq-mini-app-sdk.js";

let providerPromise;

const TESTNET_HEAD_URL = "/network/testnet-head";
const ACCOUNT_TYPES_URL = "/network/account-types";
const MAX_TESTNET_HEIGHT_DRIFT = 300;
const PREFLIGHT_TIMEOUT_MS = 5000;

function isErrorResponse(value) {
  return Boolean(value && typeof value === "object" && value.error && typeof value.error === "object");
}

function providerError(operation, value) {
  const type = String(value?.error?.type || "UNKNOWN").replace(/[^A-Za-z0-9_-]/g, "_").toUpperCase();
  const message = String(value?.error?.message || "Nimiq Pay reported an unknown error");
  const error = new Error(`NIMIQ_PAY_${operation}_FAILED[${type}]: ${message}`);
  error.name = "NimiqPayProviderError";
  error.providerErrorType = type;
  return error;
}

function unwrap(operation, value) {
  if (isErrorResponse(value)) throw providerError(operation, value);
  return value;
}

function validHeight(value) {
  const height = Number(value);
  return Number.isInteger(height) && height >= 0 ? height : undefined;
}

function looksLikeTxHash(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

export function extractProviderTxHash(value, depth = 0, seen = new Set()) {
  if (looksLikeTxHash(value)) return String(value).toLowerCase();
  if (!value || typeof value !== "object" || depth > 3 || seen.has(value)) return null;
  seen.add(value);

  const object = value;
  const candidateKeys = ["hash", "txHash", "transactionHash", "result", "data", "transaction", "tx"];
  const hashes = new Set();
  for (const key of candidateKeys) {
    if (!(key in object)) continue;
    const candidate = extractProviderTxHash(object[key], depth + 1, seen);
    if (candidate) hashes.add(candidate);
  }
  if (hashes.size > 1) {
    throw new Error("NIMIQ_PAY_SEND_AMBIGUOUS_RESULT: wallet returned more than one canonical transaction hash.");
  }
  return hashes.values().next().value ?? null;
}

export function nimiqAddressKey(value) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

export function isBasicNimiqAccountType(type) {
  return String(type ?? "").trim().toLowerCase() === "basic";
}

export function isHtlcNimiqAccountType(type) {
  return String(type ?? "").trim().toLowerCase() === "htlc";
}

export async function classifyNimiqAccounts(accounts) {
  const unique = [];
  const seen = new Set();
  for (const account of Array.isArray(accounts) ? accounts : []) {
    const key = nimiqAddressKey(account);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(account);
  }
  if (unique.length === 0) return [];

  const response = await fetch(ACCOUNT_TYPES_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ addresses: unique }),
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.independently_observed !== true || !Array.isArray(body?.accounts)) {
    throw new Error(
      body?.message ||
      "NIMIQ_ACCOUNT_CLASSIFICATION_UNAVAILABLE: could not classify Nimiq Pay accounts on TESTNET. No payment was requested."
    );
  }

  const byKey = new Map(body.accounts.map((account) => [nimiqAddressKey(account?.address), account]));
  return unique.map((address) => {
    const record = byKey.get(nimiqAddressKey(address));
    if (!record) {
      throw new Error("NIMIQ_ACCOUNT_CLASSIFICATION_INCOMPLETE: one exposed account could not be classified. No payment was requested.");
    }
    return {
      address,
      type: String(record.type || "unknown").toLowerCase(),
      sender: record.sender || null,
    };
  });
}

async function readCanonicalTestnetHeight() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREFLIGHT_TIMEOUT_MS);
  try {
    // Keep the wallet webview on same-origin HTTP. Cloudflare performs the
    // independent TESTNET RPC read server-side with bounded retry and no writes.
    const response = await fetch(TESTNET_HEAD_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const body = await response.json();
    if (body?.error || body?.network !== "TESTNET" || body?.independently_observed !== true) {
      throw new Error("INVALID_TESTNET_HEAD_RESPONSE");
    }
    const height = validHeight(body?.height);
    if (height === undefined) throw new Error("INVALID_TESTNET_HEIGHT");
    return height;
  } catch (error) {
    const wrapped = new Error("NIMIQ_TESTNET_PREFLIGHT_UNAVAILABLE: could not independently confirm the TESTNET chain. No transaction was requested.");
    wrapped.cause = error;
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertTestnetPreflight(target) {
  if (typeof target.isConsensusEstablished !== "function" || typeof target.getBlockNumber !== "function") {
    throw new Error("NIMIQ_NETWORK_PREFLIGHT_UNSUPPORTED: Nimiq Pay must expose consensus and block height before NimCarry can request a payment.");
  }
  const consensus = unwrap("CONSENSUS", await target.isConsensusEstablished());
  if (consensus !== true) {
    throw new Error("NIMIQ_NETWORK_NOT_READY: Nimiq Pay has not established consensus. No transaction was requested.");
  }
  const providerHeight = validHeight(unwrap("BLOCK_HEIGHT", await target.getBlockNumber()));
  if (providerHeight === undefined) {
    throw new Error("NIMIQ_NETWORK_HEIGHT_INVALID: Nimiq Pay returned no usable block height. No transaction was requested.");
  }
  const testnetHeight = await readCanonicalTestnetHeight();
  const drift = Math.abs(providerHeight - testnetHeight);
  if (drift > MAX_TESTNET_HEIGHT_DRIFT) {
    throw new Error(
      `NIMIQ_NETWORK_MISMATCH: Nimiq Pay is not aligned with NimCarry TESTNET (height drift ${drift}). Switch Nimiq Pay to TESTNET and retry. No transaction was requested.`
    );
  }
  return providerHeight;
}

function wrapProvider(raw) {
  if (!raw || typeof raw !== "object") throw new Error("NIMIQ_PAY_PROVIDER_INVALID: injected provider is unavailable.");

  return new Proxy(raw, {
    get(target, property, receiver) {
      if (property === "listAccounts" && typeof target.listAccounts === "function") {
        return async () => unwrap("LIST_ACCOUNTS", await target.listAccounts());
      }
      if (property === "sign" && typeof target.sign === "function") {
        return async (message) => unwrap("SIGN", await target.sign(message));
      }
      if (property === "isConsensusEstablished" && typeof target.isConsensusEstablished === "function") {
        return async () => unwrap("CONSENSUS", await target.isConsensusEstablished());
      }
      if (property === "getBlockNumber" && typeof target.getBlockNumber === "function") {
        return async () => unwrap("BLOCK_HEIGHT", await target.getBlockNumber());
      }
      if (property === "assertTestnetPreflight") {
        return async () => assertTestnetPreflight(target);
      }
      if (property === "sendBasicTransactionWithData" && typeof target.sendBasicTransactionWithData === "function") {
        return async (transaction) => {
          // The Mini App provider does not expose a network-id method. Before any
          // write request, compare its live chain height with an independent
          // TESTNET RPC head. This blocks the production-build default MAINNET
          // mode that previously looked like TESTNET in NimCarry's UI.
          const providerHeight = await assertTestnetPreflight(target);
          let validityStartHeight = validHeight(transaction?.validityStartHeight);
          if (validityStartHeight === undefined) validityStartHeight = providerHeight;
          const request = {
            ...transaction,
            validityStartHeight,
          };
          const result = unwrap("SEND", await target.sendBasicTransactionWithData(request));
          const txHash = extractProviderTxHash(result);
          if (!txHash) {
            const shape = result === null ? "null" : Array.isArray(result) ? "array" : typeof result;
            throw new Error(`NIMIQ_PAY_SEND_UNEXPECTED_RESULT: wallet returned no canonical transaction hash (result shape: ${shape}).`);
          }
          return txHash;
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function getNimiqProvider() {
  if (!providerPromise) {
    providerPromise = init({ timeout: 6000 })
      .then(wrapProvider)
      .catch((error) => {
        // A failed browser/webview injection attempt must not poison every
        // later retry in the same page session.
        providerPromise = undefined;
        throw error;
      });
  }
  return providerPromise;
}
