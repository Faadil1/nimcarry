import type { NimiqAccountLookup, NimiqTxLookup } from "../core/types.js";
import type { NimiqRpcClient } from "./rpc-client.js";

export class RpcVerificationDelayedError extends Error {
  constructor(message = "All configured Nimiq RPC endpoints are temporarily unavailable") {
    super(message);
    this.name = "RpcVerificationDelayedError";
  }
}

/**
 * Read-only fallback wrapper. A transaction lookup tries every endpoint when
 * an earlier endpoint errors or has not indexed the hash yet. State is never
 * marked INVALID merely because an RPC is unavailable.
 */
export class ResilientNimiqRpcClient implements NimiqRpcClient {
  constructor(private readonly clients: NimiqRpcClient[]) {
    if (clients.length === 0) throw new Error("At least one Nimiq RPC client is required");
  }

  async getTransactionByHash(hash: string): Promise<NimiqTxLookup | null> {
    let successfulNull = false;
    for (const client of this.clients) {
      try {
        const tx = await client.getTransactionByHash(hash);
        if (tx) return tx;
        successfulNull = true;
      } catch {
        // Try the next independent read endpoint.
      }
    }
    if (successfulNull) return null;
    throw new RpcVerificationDelayedError();
  }

  async getBlockNumber(): Promise<number> {
    for (const client of this.clients) {
      try {
        return await client.getBlockNumber();
      } catch {
        // Try next.
      }
    }
    throw new RpcVerificationDelayedError();
  }

  async getTransactionsByAddress(address: string): Promise<NimiqTxLookup[]> {
    for (const client of this.clients) {
      try {
        if (!client.getTransactionsByAddress) continue;
        return await client.getTransactionsByAddress(address);
      } catch {
        // Try next.
      }
    }
    throw new RpcVerificationDelayedError();
  }

  async getAccountByAddress(address: string): Promise<NimiqAccountLookup | null> {
    let successfulNull = false;
    for (const client of this.clients) {
      try {
        if (!client.getAccountByAddress) continue;
        const account = await client.getAccountByAddress(address);
        if (account) return account;
        successfulNull = true;
      } catch {
        // Try next.
      }
    }
    if (successfulNull) return null;
    throw new RpcVerificationDelayedError();
  }
}
