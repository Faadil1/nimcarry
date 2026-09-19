import { describe, expect, it, vi, beforeEach } from "vitest";

const listAccounts = vi.fn();
const sendBasicTransactionWithData = vi.fn();

vi.mock("@nimiq/mini-app-sdk", () => ({
  init: vi.fn(async () => ({ listAccounts, sendBasicTransactionWithData })),
}));

const { AmbiguousPaymentSourceError, MiniAppSdkPayProvider, MockPayProvider, UserCancelledPaymentError, WrongWalletSelectionError } = await import(
  "../../src/nimiq/pay-provider.js"
);

const VALID_HASH = "a".repeat(64);
const HOLDER = "NQ11 HOLDER";
const RECIPIENT = "NQ22 RECIPIENT";
const DATA = `co:v1:${"x".repeat(43)}`;
const canonicalRequest = {
  expectedSender: HOLDER,
  recipient: RECIPIENT,
  amountLuna: 100_000,
  data: DATA,
};

describe("MiniAppSdkPayProvider", () => {
  beforeEach(() => {
    listAccounts.mockReset();
    sendBasicTransactionWithData.mockReset();
    listAccounts.mockResolvedValue([HOLDER]);
  });

  it("preflights the canonical holder and explicitly requests a zero-fee 1 NIM data transaction", async () => {
    sendBasicTransactionWithData.mockResolvedValue(VALID_HASH);
    const provider = new MiniAppSdkPayProvider();
    const result = await provider.sendPass(canonicalRequest);

    expect(result.txHash).toBe(VALID_HASH);
    expect(listAccounts).toHaveBeenCalledTimes(1);
    expect(sendBasicTransactionWithData).toHaveBeenCalledWith({
      recipient: RECIPIENT,
      value: 100_000,
      fee: 0,
      data: DATA,
      validityStartHeight: undefined,
    });
  });

  it("fails before payment when more than one Nimiq account could fund the transaction", async () => {
    listAccounts.mockResolvedValue([HOLDER, "NQ99 OTHER"]);
    const provider = new MiniAppSdkPayProvider();
    await expect(provider.sendPass(canonicalRequest)).rejects.toBeInstanceOf(AmbiguousPaymentSourceError);
    expect(sendBasicTransactionWithData).not.toHaveBeenCalled();
  });

  it("fails before payment when the canonical holder wallet is not available in the session", async () => {
    listAccounts.mockResolvedValue(["NQ99 OTHER"]);
    const provider = new MiniAppSdkPayProvider();
    await expect(provider.sendPass(canonicalRequest)).rejects.toBeInstanceOf(WrongWalletSelectionError);
    expect(sendBasicTransactionWithData).not.toHaveBeenCalled();
  });

  it("rejects clear-text/legacy data and non-zero-fee canonical passes", async () => {
    const provider = new MiniAppSdkPayProvider();
    await expect(provider.sendPass({ ...canonicalRequest, data: "carryone:mission:1" })).rejects.toThrow(/opaque co:v1/);
    await expect(provider.sendPass({ ...canonicalRequest, feeLuna: 1 })).rejects.toThrow(/zero-luna/);
  });

  it("surfaces a cancelled native approval as UserCancelledPaymentError", async () => {
    sendBasicTransactionWithData.mockResolvedValue({ error: { type: "USER_REJECTED", message: "dismissed" } });
    const provider = new MiniAppSdkPayProvider();
    await expect(provider.sendPass(canonicalRequest)).rejects.toBeInstanceOf(UserCancelledPaymentError);
  });

  it("refuses a non-hash provider return value", async () => {
    sendBasicTransactionWithData.mockResolvedValue("not-a-real-hash");
    const provider = new MiniAppSdkPayProvider();
    await expect(provider.sendPass(canonicalRequest)).rejects.toThrow(/doesn't look like a transaction hash/);
  });
});

describe("MockPayProvider", () => {
  it("resolves a canonical queued approval", async () => {
    const provider = new MockPayProvider();
    provider.queueApproval();
    const result = await provider.sendPass(canonicalRequest);
    expect(result.txHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects with UserCancelledPaymentError when cancellation is queued", async () => {
    const provider = new MockPayProvider();
    provider.queueCancellation();
    await expect(provider.sendPass(canonicalRequest)).rejects.toBeInstanceOf(UserCancelledPaymentError);
  });
});
