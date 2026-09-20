import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { INTENT_VALIDITY_WINDOW_MS, RelayStore, RelayValidationError } from "../../src/core/relay.js";
import { ONE_NIM_IN_LUNA, batonDataTag, type NimiqTxLookup } from "../../src/core/types.js";
import { NIMIQ_POLICY } from "../../src/nimiq/policy.js";
import type { NimiqRpcClient } from "../../src/nimiq/rpc-client.js";
import { CanonicalRelayService } from "../../src/service/canonical-relay-service.js";

/** In-memory double for NimiqRpcClient: the test plays the role of "the network". */
class FakeRpcClient implements NimiqRpcClient {
  private txs = new Map<string, NimiqTxLookup>();
  private headBlockNumber: number = NIMIQ_POLICY.genesisBlockNumber;

  seeTx(tx: NimiqTxLookup) {
    this.txs.set(tx.hash, tx);
  }

  setHeadBlockNumber(n: number) {
    this.headBlockNumber = n;
  }

  async getTransactionByHash(hash: string): Promise<NimiqTxLookup | null> {
    return this.txs.get(hash) ?? null;
  }

  async getBlockNumber(): Promise<number> {
    return this.headBlockNumber;
  }
}

function randomHash(): string {
  return randomBytes(32).toString("hex");
}

const WALLETS = ["W0", "W1", "W2", "W3", "W4", "W5"];
const BATON = "baton-service-five-hop";

describe("CanonicalRelayService: full W0 -> W5 relay through intent/broadcast/reconcile", () => {
  it("advances one hop per pass, only after independent RPC verification reaches finality", async () => {
    const rpc = new FakeRpcClient();
    const service = new CanonicalRelayService(new RelayStore(), rpc);

    let blockNumber = NIMIQ_POLICY.genesisBlockNumber + 1;

    for (let i = 0; i < WALLETS.length - 1; i++) {
      const from = WALLETS[i];
      const to = WALLETS[i + 1];

      const intent = service.initiatePass(BATON, from, to);
      expect(intent.sequence).toBe(i + 1);

      const txHash = randomHash();
      const hop = service.recordBroadcast(BATON, txHash);
      expect(hop.status).toBe("PENDING");

      // Not observed on-chain yet: reconcile is a no-op, not a failure.
      const notYet = await service.reconcile(BATON);
      expect(notYet?.status).toBe("PENDING");

      // Now "the network" sees it, included but not yet past its batch's macro block.
      rpc.seeTx({
        hash: txHash,
        from,
        to,
        value: ONE_NIM_IN_LUNA,
        blockNumber,
        confirmations: 1,
        recipientData: batonDataTag(BATON, intent.sequence),
      });
      rpc.setHeadBlockNumber(blockNumber); // same block: included, not final
      const included = await service.reconcile(BATON);
      expect(included?.status).toBe("INCLUDED");

      // Head crosses the macro block closing this batch: now final.
      rpc.setHeadBlockNumber(blockNumber + NIMIQ_POLICY.blocksPerBatch);
      const final = await service.reconcile(BATON);
      expect(final?.status).toBe("FINAL");
      expect(final?.confirmedAt).not.toBeNull();

      blockNumber += 1;
    }

    const history = service.getHistory(BATON);
    expect(history).toHaveLength(5);
    expect(history.map((h) => h.status)).toEqual(["CONFIRMED", "CONFIRMED", "CONFIRMED", "CONFIRMED", "CONFIRMED"]);
    for (let i = 0; i < history.length - 1; i++) {
      expect(history[i].recipient).toBe(history[i + 1].current_holder);
    }

    const view = service.getPublicView(BATON);
    expect(view.sequence).toBe(5);
    expect(view.hop_count).toBe(5);
    expect(view.current_holder).toBe("W5");
    expect(view.status).toBe("READY"); // no active intent — ready for the next pass
  });

  it("fails closed and never advances when the observed transaction doesn't match the committed intent", async () => {
    const rpc = new FakeRpcClient();
    const service = new CanonicalRelayService(new RelayStore(), rpc);

    service.initiatePass(BATON, "W0", "W1");
    const badHash = randomHash();
    service.recordBroadcast(BATON, badHash);

    // A forged/duplicate observation claiming a different recipient.
    rpc.seeTx({
      hash: badHash,
      from: "W0",
      to: "W9",
      value: ONE_NIM_IN_LUNA,
      blockNumber: NIMIQ_POLICY.genesisBlockNumber + 1,
      confirmations: 1,
    });
    rpc.setHeadBlockNumber(NIMIQ_POLICY.genesisBlockNumber + 61);

    await expect(service.reconcile(BATON)).rejects.toThrow(RelayValidationError);
    expect(service.getHistory(BATON)[0].status).toBe("INVALID");
    // The fields that actually encode "never advances the canonical relay":
    // no confirmed hop, and the current holder is still W0, not W1.
    const afterInvalid = service.getPublicView(BATON);
    expect(afterInvalid.hop_count).toBe(0);
    expect(afterInvalid.current_holder).toBe("W0");
    expect(afterInvalid.status).toBe("INVALID");

    // The intent is deliberately left active (not cancelled) so the holder
    // can retry with the correct hash — this must not be permanently
    // bricked by one bad observation.
    const goodHash = randomHash();
    service.recordBroadcast(BATON, goodHash);
    rpc.seeTx({
      hash: goodHash,
      from: "W0",
      to: "W1",
      value: ONE_NIM_IN_LUNA,
      blockNumber: NIMIQ_POLICY.genesisBlockNumber + 1,
      confirmations: 1,
    });
    const recovered = await service.reconcile(BATON);
    expect(recovered?.status).toBe("FINAL");
    expect(service.getPublicView(BATON).current_holder).toBe("W1");
    expect(service.getPublicView(BATON).hop_count).toBe(1);
    // The retry replaced the invalid record at the same sequence, not duplicated it.
    expect(service.getHistory(BATON)).toHaveLength(1);
  });

  it("cancellation before any broadcast leaves the baton with the current holder", () => {
    const service = new CanonicalRelayService(new RelayStore(), new FakeRpcClient());

    service.initiatePass(BATON, "W0", "W1");
    service.cancelPass(BATON);

    expect(service.getPublicView(BATON).current_holder).toBe("W0");
    expect(service.getPublicView(BATON).sequence).toBe(0);
    // No leftover intent blocking a fresh attempt:
    expect(() => service.initiatePass(BATON, "W0", "W2")).not.toThrow();
  });

  it("rejects cancellation once a broadcast has already been recorded and leaves the intent intact", () => {
    const service = new CanonicalRelayService(new RelayStore(), new FakeRpcClient());
    service.initiatePass(BATON, "W0", "W1");
    const txHash = randomHash();
    service.recordBroadcast(BATON, txHash);

    expect(() => service.cancelPass(BATON)).toThrow(RelayValidationError);
    try {
      service.cancelPass(BATON);
    } catch (err) {
      expect((err as RelayValidationError).reason).toBe("CANNOT_CANCEL_BROADCAST");
    }

    // Intent remains intact: status is still PENDING, cannot create duplicate intent
    expect(service.getPublicView(BATON).status).toBe("PENDING");
    expect(() => service.initiatePass(BATON, "W0", "W2")).toThrow(RelayValidationError);
    expect(service.getHistory(BATON)[0]).toMatchObject({
      tx_hash: txHash,
      status: "PENDING",
    });
  });

  it("marks an unbroadcast stale intent invalid without advancing the baton", async () => {
    const service = new CanonicalRelayService(new RelayStore(), new FakeRpcClient());
    const intent = service.initiatePass(BATON, "W0", "W1");
    const staleAt = intent.createdAt + INTENT_VALIDITY_WINDOW_MS + 1;

    vi.setSystemTime(staleAt);
    await expect(service.reconcile(BATON)).resolves.toMatchObject({ status: "INVALID" });
    expect(service.getPublicView(BATON, staleAt)).toMatchObject({
      sequence: 0,
      current_holder: "W0",
      status: "INVALID",
      hop_count: 0,
    });
    expect(service.initiatePass(BATON, "W0", "W1").sequence).toBe(1);
    vi.useRealTimers();
  });

  it("closes a stale intent when RPC returns null after expiry", async () => {
    const store = new RelayStore();
    const service = new CanonicalRelayService(store, new FakeRpcClient());
    const intent = service.initiatePass(BATON, "W0", "W1");
    const txHash = randomHash();
    service.recordBroadcast(BATON, txHash);

    const staleAt = intent.createdAt + INTENT_VALIDITY_WINDOW_MS + 1;
    vi.setSystemTime(staleAt);

    // Reconcile when RPC returns null (tx never appeared) and intent is now stale
    const result = await service.reconcile(BATON);
    expect(result).toMatchObject({ status: "INVALID" });

    // Intent is cancelled / closed, not left active
    expect(store.getActiveIntent(BATON)).toBeUndefined();
    // A new intent can now be initiated without DUPLICATE_INTENT error
    expect(() => service.initiatePass(BATON, "W0", "W1")).not.toThrow();

    vi.useRealTimers();
  });

  it("rejects recordBroadcast against an expired/stale intent and closes the intent", () => {
    const store = new RelayStore();
    const service = new CanonicalRelayService(store, new FakeRpcClient());
    const intent = service.initiatePass(BATON, "W0", "W1");
    const staleAt = intent.createdAt + INTENT_VALIDITY_WINDOW_MS + 1;
    vi.setSystemTime(staleAt);

    const txHash = randomHash();
    let caught: RelayValidationError | null = null;
    try {
      service.recordBroadcast(BATON, txHash);
    } catch (err) {
      caught = err as RelayValidationError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.reason).toBe("STALE_INTENT");

    // Intent is no longer active
    expect(store.getActiveIntent(BATON)).toBeUndefined();
    // Fresh pass can now be initiated
    expect(() => service.initiatePass(BATON, "W0", "W1")).not.toThrow();

    vi.useRealTimers();
  });

  it("reconciling with no broadcast reported yet is a safe no-op (recovery after app close)", async () => {
    const service = new CanonicalRelayService(new RelayStore(), new FakeRpcClient());
    service.initiatePass(BATON, "W0", "W1");

    const result = await service.reconcile(BATON);
    expect(result).toBeNull();
    // Re-entrant: calling it again changes nothing.
    await expect(service.reconcile(BATON)).resolves.toBeNull();
  });

  it("exposes only active unresolved missions to the background reconciler", async () => {
    const rpc = new FakeRpcClient();
    const service = new CanonicalRelayService(new RelayStore(), rpc);
    const baton = "background-reconcile";

    const intent = service.initiatePass(baton, "W0", "W1");
    expect(service.listReconciliationCandidates()).toEqual([baton]);

    const txHash = randomHash();
    service.recordBroadcast(baton, txHash);
    expect(service.listReconciliationCandidates()).toEqual([baton]);

    const blockNumber = NIMIQ_POLICY.genesisBlockNumber + 1;
    rpc.seeTx({
      hash: txHash,
      from: "W0",
      to: "W1",
      value: ONE_NIM_IN_LUNA,
      blockNumber,
      confirmations: 1,
      recipientData: batonDataTag(baton, intent.sequence),
    });
    rpc.setHeadBlockNumber(blockNumber + NIMIQ_POLICY.blocksPerBatch);

    await expect(service.reconcile(baton)).resolves.toMatchObject({ status: "FINAL" });
    expect(service.listReconciliationCandidates()).toEqual([]);
  });

  it("rejects cross-baton transaction replay when reusing the same tx hash on a second baton", () => {
    const store = new RelayStore();
    const service = new CanonicalRelayService(store, new FakeRpcClient());
    const baton1 = "baton-1";
    const baton2 = "baton-2";

    service.initiatePass(baton1, "W0", "W1");
    const sharedTxHash = randomHash();
    service.recordBroadcast(baton1, sharedTxHash);

    // Baton 2 has matching endpoints W0 -> W1
    service.initiatePass(baton2, "W0", "W1");

    // Attempting to attach the same broadcast / tx hash to baton 2 must be rejected
    let caught: RelayValidationError | null = null;
    try {
      service.recordBroadcast(baton2, sharedTxHash);
    } catch (err) {
      caught = err as RelayValidationError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.reason).toBe("DUPLICATE_TX_HASH");

    // Baton 2's intent remains intact and no hop was recorded for baton 2
    expect(store.getActiveIntent(baton2)).toBeDefined();
    expect(store.getHops(baton2)).toHaveLength(0);
  });
});
