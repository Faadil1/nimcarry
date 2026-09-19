import { describe, expect, it } from "vitest";
import { RelayStore } from "../../src/core/relay.js";

describe("PassIntent payment-wallet snapshot", () => {
  it("defaults to the holder only and freezes a deduplicated explicit payment set", () => {
    const holder = "NQ11 HOLDER";
    const payment = "NQ22 PAYMENT";

    const defaultStore = new RelayStore();
    const defaultIntent = defaultStore.createIntent("mission-default", holder, "NQ33 RECIPIENT", {
      requireOpaqueTag: true,
    });
    expect(defaultIntent.authorizedPaymentWallets).toEqual([holder]);

    const store = new RelayStore();
    const intent = store.createIntent("mission-multi", holder, "NQ33 RECIPIENT", {
      requireOpaqueTag: true,
      authorizedPaymentWallets: [payment, holder, payment],
    });
    expect(intent.authorizedPaymentWallets).toEqual([holder, payment]);

    const snapshot = store.snapshot();
    snapshot.intents[0].authorizedPaymentWallets.push("NQ99 LATE");
    expect(store.getActiveIntent("mission-multi")?.authorizedPaymentWallets).toEqual([holder, payment]);
  });

  it("binds different frozen payment sets to different opaque commitments", () => {
    const a = new RelayStore().createIntent("mission-a", "NQ11 HOLDER", "NQ33 RECIPIENT", {
      requireOpaqueTag: true,
      authorizedPaymentWallets: ["NQ11 HOLDER"],
    });
    const b = new RelayStore().createIntent("mission-a", "NQ11 HOLDER", "NQ33 RECIPIENT", {
      requireOpaqueTag: true,
      authorizedPaymentWallets: ["NQ11 HOLDER", "NQ22 PAYMENT"],
    });
    expect(a.recipientData).not.toBe(b.recipientData);
  });
});
