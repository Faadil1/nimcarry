import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RelayStore, RelayValidationError } from "../../src/core/relay.js";
import { ONE_NIM_IN_LUNA, type NimiqTxLookup } from "../../src/core/types.js";
import { NIMIQ_POLICY } from "../../src/nimiq/policy.js";
import type { NimiqRpcClient } from "../../src/nimiq/rpc-client.js";
import { CanonicalRelayService } from "../../src/service/canonical-relay-service.js";

class HistoryRpc implements NimiqRpcClient {
  history: NimiqTxLookup[] = [];
  head = NIMIQ_POLICY.genesisBlockNumber + 240;

  async getTransactionByHash(hash: string): Promise<NimiqTxLookup | null> {
    return this.history.find((tx) => tx.hash === hash) ?? null;
  }

  async getBlockNumber(): Promise<number> {
    return this.head;
  }

  async getTransactionsByAddress(address: string): Promise<NimiqTxLookup[]> {
    return this.history.filter((tx) => tx.to === address || tx.from === address);
  }
}

const hash = () => randomBytes(32).toString("hex");

function matchingTx(intent: ReturnType<CanonicalRelayService["initiatePass"]>, txHash = hash()): NimiqTxLookup {
  return {
    hash: txHash,
    from: intent.currentHolder,
    to: intent.recipient,
    value: ONE_NIM_IN_LUNA,
    blockNumber: NIMIQ_POLICY.genesisBlockNumber + 120,
    confirmations: 80,
    recipientData: intent.recipientData ?? undefined,
  };
}

describe("ambiguous Nimiq Pay submission recovery", () => {
  it("discovers and finalizes an exact on-chain handoff even when the wallet returned no hash", async () => {
    const rpc = new HistoryRpc();
    const service = new CanonicalRelayService(new RelayStore(), rpc);
    const intent = service.initiatePass("mission-ambiguous", "W0", "W1", { requireOpaqueTag: true });
    const tx = matchingTx(intent);
    rpc.history = [tx];
    rpc.head = tx.blockNumber! + NIMIQ_POLICY.blocksPerBatch;

    const recovered = await service.reconcile("mission-ambiguous");

    expect(recovered).toMatchObject({ txHash: tx.hash, status: "FINAL", value: ONE_NIM_IN_LUNA });
    expect(service.getHistory("mission-ambiguous")).toEqual([
      expect.objectContaining({ tx_hash: tx.hash, status: "CONFIRMED" }),
    ]);
    expect(service.getPublicView("mission-ambiguous")).toMatchObject({
      sequence: 1,
      current_holder: "W1",
      hop_count: 1,
    });
  });

  it("ignores unrelated recipient history and never manufactures a broadcast", async () => {
    const rpc = new HistoryRpc();
    const service = new CanonicalRelayService(new RelayStore(), rpc);
    const intent = service.initiatePass("mission-unrelated", "W0", "W1", { requireOpaqueTag: true });
    rpc.history = [
      { ...matchingTx(intent), hash: hash(), value: ONE_NIM_IN_LUNA - 1 },
      { ...matchingTx(intent), hash: hash(), from: "W9" },
      { ...matchingTx(intent), hash: hash(), recipientData: "co:v1:not-the-committed-hop" },
    ];

    await expect(service.reconcile("mission-unrelated")).resolves.toBeNull();
    expect(service.getHistory("mission-unrelated")).toEqual([]);
    expect(service.getPublicView("mission-unrelated")).toMatchObject({ current_holder: "W0", hop_count: 0 });
  });

  it("fails closed when more than one chain transaction matches the same opaque intent", async () => {
    const rpc = new HistoryRpc();
    const service = new CanonicalRelayService(new RelayStore(), rpc);
    const intent = service.initiatePass("mission-duplicate", "W0", "W1", { requireOpaqueTag: true });
    rpc.history = [matchingTx(intent), matchingTx(intent)];

    let caught: unknown;
    try {
      await service.reconcile("mission-duplicate");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RelayValidationError);
    expect((caught as RelayValidationError).reason).toBe("AMBIGUOUS_MATCHING_BROADCAST");
    expect(service.getHistory("mission-duplicate")).toEqual([]);
    expect(service.getPublicView("mission-duplicate")).toMatchObject({ current_holder: "W0", hop_count: 0 });
  });
});
