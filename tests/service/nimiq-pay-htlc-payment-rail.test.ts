import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RelayStore } from "../../src/core/relay.js";
import { ONE_NIM_IN_LUNA, type NimiqAccountLookup, type NimiqTxLookup } from "../../src/core/types.js";
import { NIMIQ_POLICY } from "../../src/nimiq/policy.js";
import type { NimiqRpcClient } from "../../src/nimiq/rpc-client.js";
import { CanonicalRelayService } from "../../src/service/canonical-relay-service.js";

const HOLDER = "NQ46 HOLDER BASIC";
const BRIDGE = "NQ24 BRIDGE BASIC";
const PAYMENT_WALLET = "NQ06 SAME USER PAYMENT";
const HTLC = "NQ23 PAYMENT HTLC";
const ATTACKER = "NQ99 ATTACKER";
const HTLC_TOTAL = 11_000_000_000;
const hash = () => randomBytes(32).toString("hex");

class HtlcRpc implements NimiqRpcClient {
  history: NimiqTxLookup[] = [];
  accounts = new Map<string, NimiqAccountLookup>();
  head = NIMIQ_POLICY.genesisBlockNumber + 500;

  async getTransactionByHash(txHash: string): Promise<NimiqTxLookup | null> {
    return this.history.find((tx) => tx.hash === txHash) ?? null;
  }

  async getBlockNumber(): Promise<number> {
    return this.head;
  }

  async getTransactionsByAddress(address: string): Promise<NimiqTxLookup[]> {
    return this.history.filter((tx) => tx.to === address || tx.from === address);
  }

  async getAccountByAddress(address: string): Promise<NimiqAccountLookup | null> {
    return this.accounts.get(address) ?? null;
  }
}

function fundingTx(from = HOLDER): NimiqTxLookup {
  return {
    hash: hash(),
    from,
    to: HTLC,
    value: HTLC_TOTAL,
    blockNumber: NIMIQ_POLICY.genesisBlockNumber + 100,
    confirmations: 300,
  };
}

function paymentTx(intent: ReturnType<CanonicalRelayService["initiatePass"]>): NimiqTxLookup {
  return {
    hash: hash(),
    from: HTLC,
    to: intent.recipient,
    value: ONE_NIM_IN_LUNA,
    blockNumber: NIMIQ_POLICY.genesisBlockNumber + 300,
    confirmations: 100,
    recipientData: intent.recipientData ?? undefined,
  };
}

describe("Nimiq Pay verified multiwallet payment sources", () => {
  it("accepts a FINAL direct payment from a frozen same-profile payment wallet without changing the canonical holder identity", async () => {
    const rpc = new HtlcRpc();
    const service = new CanonicalRelayService(new RelayStore(), rpc);
    const intent = service.initiatePass("mission-multiwallet-direct", HOLDER, BRIDGE, {
      requireOpaqueTag: true,
      authorizedPaymentWallets: [HOLDER, PAYMENT_WALLET],
    });
    const payment: NimiqTxLookup = {
      hash: hash(),
      from: PAYMENT_WALLET,
      to: intent.recipient,
      value: ONE_NIM_IN_LUNA,
      blockNumber: NIMIQ_POLICY.genesisBlockNumber + 300,
      confirmations: 100,
      recipientData: intent.recipientData ?? undefined,
    };
    rpc.history = [payment];
    rpc.head = payment.blockNumber! + NIMIQ_POLICY.blocksPerBatch;

    const reconciled = await service.reconcile("mission-multiwallet-direct");

    expect(reconciled).toMatchObject({
      txHash: payment.hash,
      status: "FINAL",
      currentHolder: HOLDER,
      recipient: BRIDGE,
    });
    expect(service.getPublicView("mission-multiwallet-direct")).toMatchObject({
      current_holder: BRIDGE,
      hop_count: 1,
    });
  });

  it("rejects a direct payment wallet that was not frozen into the pass intent", async () => {
    const rpc = new HtlcRpc();
    const service = new CanonicalRelayService(new RelayStore(), rpc);
    const intent = service.initiatePass("mission-unverified-direct", HOLDER, BRIDGE, {
      requireOpaqueTag: true,
      authorizedPaymentWallets: [HOLDER],
    });
    rpc.history = [{
      hash: hash(),
      from: PAYMENT_WALLET,
      to: intent.recipient,
      value: ONE_NIM_IN_LUNA,
      blockNumber: NIMIQ_POLICY.genesisBlockNumber + 300,
      confirmations: 100,
      recipientData: intent.recipientData ?? undefined,
    }];

    await expect(service.reconcile("mission-unverified-direct")).resolves.toBeNull();
    expect(service.getPublicView("mission-unverified-direct")).toMatchObject({
      current_holder: HOLDER,
      hop_count: 0,
    });
  });

  it("accepts an HTLC rail funded by a frozen same-profile payment wallet", async () => {
    const rpc = new HtlcRpc();
    const service = new CanonicalRelayService(new RelayStore(), rpc);
    const intent = service.initiatePass("mission-multiwallet-htlc", HOLDER, BRIDGE, {
      requireOpaqueTag: true,
      authorizedPaymentWallets: [HOLDER, PAYMENT_WALLET],
    });
    const payment = paymentTx(intent);
    rpc.accounts.set(HTLC, {
      address: HTLC,
      balance: HTLC_TOTAL - ONE_NIM_IN_LUNA,
      type: "htlc",
      sender: PAYMENT_WALLET,
      recipient: "NQ54 PAYMENT RAIL RECIPIENT",
      totalAmount: HTLC_TOTAL,
    });
    rpc.history = [fundingTx(PAYMENT_WALLET), payment];
    rpc.head = payment.blockNumber! + NIMIQ_POLICY.blocksPerBatch;

    const reconciled = await service.reconcile("mission-multiwallet-htlc");

    expect(reconciled).toMatchObject({ txHash: payment.hash, status: "FINAL" });
    expect(service.getPublicView("mission-multiwallet-htlc")).toMatchObject({
      current_holder: BRIDGE,
      hop_count: 1,
    });
  });
});

describe("Nimiq Pay HTLC payment-rail verification", () => {

  it("freezes a verified HTLC rail before payment and still validates after the live HTLC metadata changes", async () => {
    const rpc = new HtlcRpc();
    const service = new CanonicalRelayService(new RelayStore(), rpc);
    const intent = service.initiatePass("mission-frozen-htlc", HOLDER, BRIDGE, {
      requireOpaqueTag: true,
      authorizedPaymentWallets: [HOLDER],
    });

    rpc.accounts.set(HTLC, {
      address: HTLC,
      balance: HTLC_TOTAL,
      type: "htlc",
      sender: HOLDER,
      totalAmount: HTLC_TOTAL,
    });
    rpc.history = [fundingTx()];

    const frozen = await service.freezeVerifiedPaymentRails("mission-frozen-htlc", [HTLC]);
    expect(frozen.authorizedPaymentWallets).toContain(`rail:${HTLC.replace(/\s+/g, "").toUpperCase()}`);

    // Simulate the post-send race that triggered the real device failure:
    // the provider rail no longer exposes its original HTLC metadata after use.
    rpc.accounts.delete(HTLC);
    const payment = paymentTx(intent);
    rpc.history = [fundingTx(), payment];
    rpc.head = payment.blockNumber! + NIMIQ_POLICY.blocksPerBatch;

    const reconciled = await service.reconcile("mission-frozen-htlc");
    expect(reconciled).toMatchObject({ txHash: payment.hash, status: "FINAL" });
    expect(service.getPublicView("mission-frozen-htlc")).toMatchObject({
      current_holder: BRIDGE,
      hop_count: 1,
    });
  });

  it("refuses to freeze an HTLC rail whose funding is not independently tied to an authorized wallet", async () => {
    const rpc = new HtlcRpc();
    const service = new CanonicalRelayService(new RelayStore(), rpc);
    service.initiatePass("mission-reject-frozen-htlc", HOLDER, BRIDGE, {
      requireOpaqueTag: true,
      authorizedPaymentWallets: [HOLDER],
    });

    rpc.accounts.set(HTLC, {
      address: HTLC,
      balance: HTLC_TOTAL,
      type: "htlc",
      sender: HOLDER,
      totalAmount: HTLC_TOTAL,
    });
    rpc.history = [fundingTx(ATTACKER)];

    await expect(
      service.freezeVerifiedPaymentRails("mission-reject-frozen-htlc", [HTLC])
    ).rejects.toMatchObject({ reason: "PAYMENT_RAIL_UNVERIFIED" });
  });

  it("accepts a FINAL payment from an HTLC only when its on-chain origin is the signed holder", async () => {
    const rpc = new HtlcRpc();
    const service = new CanonicalRelayService(new RelayStore(), rpc);
    const intent = service.initiatePass("mission-htlc", HOLDER, BRIDGE, { requireOpaqueTag: true });
    const payment = paymentTx(intent);
    rpc.accounts.set(HTLC, {
      address: HTLC,
      balance: HTLC_TOTAL - ONE_NIM_IN_LUNA,
      type: "htlc",
      sender: HOLDER,
      recipient: "NQ54 PAYMENT RAIL RECIPIENT",
      totalAmount: HTLC_TOTAL,
    });
    rpc.history = [fundingTx(), payment];
    rpc.head = payment.blockNumber! + NIMIQ_POLICY.blocksPerBatch;

    const reconciled = await service.reconcile("mission-htlc");

    expect(reconciled).toMatchObject({ txHash: payment.hash, status: "FINAL", value: ONE_NIM_IN_LUNA });
    expect(service.getPublicView("mission-htlc")).toMatchObject({ current_holder: BRIDGE, hop_count: 1 });
  });

  it("rejects an HTLC that merely claims the holder but was funded by someone else", async () => {
    const rpc = new HtlcRpc();
    const service = new CanonicalRelayService(new RelayStore(), rpc);
    const intent = service.initiatePass("mission-spoof-funding", HOLDER, BRIDGE, { requireOpaqueTag: true });
    rpc.accounts.set(HTLC, {
      address: HTLC,
      balance: HTLC_TOTAL - ONE_NIM_IN_LUNA,
      type: "htlc",
      sender: HOLDER,
      totalAmount: HTLC_TOTAL,
    });
    rpc.history = [fundingTx(ATTACKER), paymentTx(intent)];

    await expect(service.reconcile("mission-spoof-funding")).resolves.toBeNull();
    expect(service.getPublicView("mission-spoof-funding")).toMatchObject({ current_holder: HOLDER, hop_count: 0 });
  });

  it("rejects an HTLC whose declared sender is not the signed holder", async () => {
    const rpc = new HtlcRpc();
    const service = new CanonicalRelayService(new RelayStore(), rpc);
    const intent = service.initiatePass("mission-wrong-htlc-sender", HOLDER, BRIDGE, { requireOpaqueTag: true });
    rpc.accounts.set(HTLC, {
      address: HTLC,
      balance: HTLC_TOTAL - ONE_NIM_IN_LUNA,
      type: "htlc",
      sender: ATTACKER,
      totalAmount: HTLC_TOTAL,
    });
    rpc.history = [fundingTx(), paymentTx(intent)];

    await expect(service.reconcile("mission-wrong-htlc-sender")).resolves.toBeNull();
    expect(service.getPublicView("mission-wrong-htlc-sender")).toMatchObject({ current_holder: HOLDER, hop_count: 0 });
  });
});
