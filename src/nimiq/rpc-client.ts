import type { NimiqAccountLookup, NimiqTxLookup } from "../core/types.js";
import { NIMIQ_POLICY, lastMacroBlock } from "./policy.js";

/**
 * Abstraction over "however we end up talking to Nimiq" so the relay logic
 * never depends on the transport. In production this hits the JSON-RPC
 * `getTransactionByHash` + block height lookups; in tests we swap in a mock.
 *
 * VERIFIED against live testnet (https://rpc.testnet.nimiqwatch.com), 2026-08-31:
 *   - `getTransactionByHash` EXISTS and returns `blockNumber` + `confirmations`
 *     plus `from`/`to` as NQ addresses, `value` in Luna, `validityStartHeight`,
 *     `networkId`, `executionResult`, etc.
 *   - The nimiqwatch history node wraps every result in `{ data, ... }`; other
 *     nodes return the raw object. `HttpNimiqRpcClient` handles both.
 *   - There is no dedicated `isFinal` flag. Finality is DERIVED — see
 *     `hasReachedFinality` and the batch-boundary math in `./policy.ts`.
 */
export interface NimiqRpcClient {
  getTransactionByHash(hash: string): Promise<NimiqTxLookup | null>;
  /** Height of the current chain head (for finality derivation). */
  getBlockNumber(): Promise<number>;
  getTransactionsByAddress?(address: string): Promise<NimiqTxLookup[]>;
  /** Read-only account metadata used to verify Nimiq Pay HTLC payment rails. */
  getAccountByAddress?(address: string): Promise<NimiqAccountLookup | null>;
}

/**
 * Nimiq JSON-RPC serializes transaction recipient data as a hex string.
 * Some higher-level/plain transaction shapes instead expose { raw: <hex> }.
 * NimCarry's canonical intent stores the human/provider text form (co:v1:...),
 * so normalize every RPC representation back to UTF-8 before validation.
 */
function normalizeRecipientData(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  const raw =
    typeof value === "object" && value !== null && "raw" in value
      ? (value as { raw?: unknown }).raw
      : value;

  if (typeof raw !== "string") {
    if (Array.isArray(raw) && raw.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
      return Buffer.from(raw).toString("utf8");
    }
    return String(raw);
  }

  const trimmed = raw.trim();
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (hex.length > 0 && hex.length % 2 === 0 && /^[0-9a-f]+$/i.test(hex)) {
    return Buffer.from(hex, "hex").toString("utf8");
  }
  return raw;
}

export function normalizeNimiqAccountType(value: unknown): string {
  const type = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (type === "basic" || type === "basicaccount" || type === "0") return "basic";
  if (type === "vesting" || type === "vestingcontract" || type === "1") return "vesting";
  if (type === "htlc" || type === "hashedtimelockcontract" || type === "hashedtimelockedcontract" || type === "2") return "htlc";
  if (type === "staking" || type === "stakingcontract" || type === "3") return "staking";
  return type || "unknown";
}

function rpcFieldKey(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function deepRpcField(root: unknown, names: string[], maxDepth = 4): unknown {
  const wanted = new Set(names.map(rpcFieldKey));
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  const seen = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!current.value || typeof current.value !== "object") continue;
    const object = current.value as Record<string, unknown>;
    if (seen.has(object)) continue;
    seen.add(object);

    for (const [key, child] of Object.entries(object)) {
      if (wanted.has(rpcFieldKey(key)) && child !== undefined && child !== null) return child;
    }
    if (current.depth >= maxDepth) continue;
    for (const child of Object.values(object)) {
      if (child && typeof child === "object") queue.push({ value: child, depth: current.depth + 1 });
    }
  }
  return undefined;
}

function rpcRecipientData(tx: Record<string, any>): string | undefined {
  return normalizeRecipientData(tx.recipientData ?? tx.data ?? undefined);
}

/**
 * Real JSON-RPC implementation. Points at the Nimiq testnet history node by
 * default (free, rate limited, read-only). Swap `rpcUrl` for your own node.
 * This client only ever READS the chain — it never signs or broadcasts.
 * Sending is the Nimiq Pay Provider's job (see `./pay-provider.ts`), which
 * only exists client-side inside the Nimiq Pay webview.
 */
export class HttpNimiqRpcClient implements NimiqRpcClient {
  constructor(
    private rpcUrl: string = "https://rpc.testnet.nimiqwatch.com",
    private auth?: { username: string; password: string }
  ) {}

  private async rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.auth) {
      const creds = Buffer.from(`${this.auth.username}:${this.auth.password}`).toString("base64");
      headers["Authorization"] = `Basic ${creds}`;
    }

    const res = await fetch(this.rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    });
    if (!res.ok) throw new Error(`Nimiq RPC ${method} failed: HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`Nimiq RPC ${method} error: ${JSON.stringify(body.error)}`);
    // The nimiqwatch history node wraps results in { data, ... }; standard nodes return the raw object.
    const raw =
      body.result && typeof body.result === "object" && "data" in body.result
        ? (body.result as { data: T }).data
        : (body.result as T);
    return raw;
  }

  /** Returns the raw transaction object or null when not found / not yet in a block. */
  async getTransactionByHash(hash: string): Promise<NimiqTxLookup | null> {
    const r = await this.rpc<any>("getTransactionByHash", [hash]);
    if (!r) return null;
    const senderType = normalizeNimiqAccountType(r.fromType ?? r.senderType);
    const recipientType = normalizeNimiqAccountType(r.toType ?? r.recipientType);
    return {
      hash: r.hash,
      from: r.fromAddress ?? r.from,
      to: r.toAddress ?? r.to,
      value: r.value,
      blockNumber: r.blockNumber ?? null,
      confirmations: r.confirmations ?? 0,
      ...(senderType !== "unknown" ? { senderType } : {}),
      ...(recipientType !== "unknown" ? { recipientType } : {}),
      recipientData: rpcRecipientData(r),
    };
  }

  async getBlockNumber(): Promise<number> {
    return this.rpc<number>("getBlockNumber");
  }

  async getTransactionsByAddress(address: string): Promise<NimiqTxLookup[]> {
    const result = await this.rpc<unknown>("getTransactionsByAddress", [address, 100, null]);
    const rows = Array.isArray(result)
      ? result
      : result && typeof result === "object" && "transactions" in result
        ? (result as { transactions: unknown[] }).transactions
        : [];
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const tx = row as Record<string, any>;
      if (!tx.hash || !tx.fromAddress && !tx.from || !tx.toAddress && !tx.to || tx.value === undefined) return [];
      const senderType = normalizeNimiqAccountType(tx.fromType ?? tx.senderType);
      const recipientType = normalizeNimiqAccountType(tx.toType ?? tx.recipientType);
      return [{
        hash: String(tx.hash),
        from: String(tx.fromAddress ?? tx.from),
        to: String(tx.toAddress ?? tx.to),
        value: Number(tx.value),
        blockNumber: tx.blockNumber ?? null,
        confirmations: Number(tx.confirmations ?? 0),
        ...(senderType !== "unknown" ? { senderType } : {}),
        ...(recipientType !== "unknown" ? { recipientType } : {}),
        recipientData: rpcRecipientData(tx),
      }];
    });
  }

  async getAccountByAddress(address: string): Promise<NimiqAccountLookup | null> {
    const result = await this.rpc<unknown>("getAccountByAddress", [address]);
    if (!result || typeof result !== "object") return null;
    const account = result as Record<string, any>;
    const typeRaw = deepRpcField(account, ["type", "accountType"]);
    const type = normalizeNimiqAccountType(typeRaw);
    if (!account.address || type === "unknown") return null;
    const lookup: NimiqAccountLookup = {
      address: String(account.address),
      balance: Number(account.balance ?? 0),
      type,
    };
    const sender = deepRpcField(account, ["sender", "senderAddress", "htlcSender"]);
    const recipient = deepRpcField(account, ["recipient", "recipientAddress", "htlcRecipient"]);
    const totalAmount = deepRpcField(account, ["totalAmount", "total_amount", "htlcTotalAmount"]);
    if (sender !== undefined && sender !== null) lookup.sender = String(sender);
    if (recipient !== undefined && recipient !== null) lookup.recipient = String(recipient);
    if (totalAmount !== undefined && totalAmount !== null && Number.isFinite(Number(totalAmount))) {
      lookup.totalAmount = Number(totalAmount);
    }
    return lookup;
  }
}

/**
 * How finality is decided: a transaction is FINAL only once the chain head
 * has crossed the Tendermint/PBFT macro (checkpoint) block that ends the
 * batch the transaction is in — NOT a flat confirmation-count guess. Crossing
 * that macro block requires at most `blocksPerBatch` (60) confirmations,
 * verified against live testnet: batches close every 60 one-second micro
 * blocks, and the macro block carries 2f+1 validator signatures (irreversible).
 */
export function hasReachedFinality(tx: NimiqTxLookup, headBlockNumber: number): boolean {
  if (tx.blockNumber === null) return false; // still in mempool
  return headBlockNumber >= lastMacroBlock(tx.blockNumber) + NIMIQ_POLICY.blocksPerBatch;
}

export function isFinal(client: NimiqRpcClient, tx: NimiqTxLookup): Promise<boolean> {
  if (tx.blockNumber === null) return Promise.resolve(false);
  return client.getBlockNumber().then((head) => hasReachedFinality(tx, head));
}

export function isIncluded(tx: NimiqTxLookup): boolean {
  return tx.blockNumber !== null;
}

/** Poll until a transaction is FINAL, INVALID (never lands), or timeout. */
export async function pollForFinality(
  client: NimiqRpcClient,
  hash: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<"FINAL" | "PENDING_TIMEOUT" | "NOT_FOUND"> {
  const intervalMs = opts.intervalMs ?? 5000;
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000; // 15 min default ceiling
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tx = await client.getTransactionByHash(hash);
    if (!tx) return "NOT_FOUND";
    if (await isFinal(client, tx)) return "FINAL";
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return "PENDING_TIMEOUT";
}
