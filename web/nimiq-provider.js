import { init } from "/vendor/nimiq-mini-app-sdk.js";

let providerPromise;

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
      if (property === "sendBasicTransactionWithData" && typeof target.sendBasicTransactionWithData === "function") {
        return async (transaction) => {
          let validityStartHeight = validHeight(transaction?.validityStartHeight);
          if (validityStartHeight === undefined && typeof target.getBlockNumber === "function") {
            validityStartHeight = validHeight(unwrap("BLOCK_HEIGHT", await target.getBlockNumber()));
          }
          const request = {
            ...transaction,
            ...(validityStartHeight === undefined ? {} : { validityStartHeight }),
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
