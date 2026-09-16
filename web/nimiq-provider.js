import { init } from "/vendor/nimiq-mini-app-sdk.js";

let providerPromise;

const TESTNET_RPC_URL = "https://rpc.testnet.nimiqwatch.com";
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

async function readCanonicalTestnetHeight() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREFLIGHT_TIMEOUT_MS);
  try {
    const response = await fetch(TESTNET_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
          if (!looksLikeTxHash(result)) {
            throw new Error("NIMIQ_PAY_SEND_UNEXPECTED_RESULT: wallet returned no canonical transaction hash.");
          }
          return result;
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function getNimiqProvider() {
  if (!providerPromise) providerPromise = init({ timeout: 6000 }).then(wrapProvider);
  return providerPromise;
}
