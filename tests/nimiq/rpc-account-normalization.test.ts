import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpNimiqRpcClient } from "../../src/nimiq/rpc-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpNimiqRpcClient account normalization", () => {
  it("resolves HTLC metadata when an RPC nests additional fields", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.method).toBe("getAccountByAddress");
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          data: {
            address: "NQ23 TEST HTLC",
            balance: 10999690000,
            type: "htlc",
            accountAdditionalFields: {
              Htlc: {
                senderAddress: "NQ46 VERIFIED BASIC",
                recipientAddress: "NQ54 RAIL RECIPIENT",
                total_amount: 11000000000,
              },
            },
          },
          metadata: { blockNumber: 1, blockHash: "abc" },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const rpc = new HttpNimiqRpcClient("https://rpc.example.test");
    await expect(rpc.getAccountByAddress!("NQ23 TEST HTLC")).resolves.toMatchObject({
      address: "NQ23 TEST HTLC",
      type: "htlc",
      sender: "NQ46 VERIFIED BASIC",
      recipient: "NQ54 RAIL RECIPIENT",
      totalAmount: 11000000000,
    });
  });

  it.each([
    ["HashedTimeLockedContract", "htlc"],
    ["hashed_time_locked_contract", "htlc"],
    [2, "htlc"],
    ["BasicAccount", "basic"],
    [0, "basic"],
  ])("normalizes provider account type %p to %s", async (rawType, expectedType) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: {
        data: {
          address: "NQ23 TEST ACCOUNT",
          balance: 1,
          type: rawType,
          accountAdditionalFields: expectedType === "htlc" ? {
            Htlc: {
              senderAddress: "NQ46 VERIFIED BASIC",
              totalAmount: 11000000000,
            },
          } : undefined,
        },
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const rpc = new HttpNimiqRpcClient("https://rpc.example.test");
    await expect(rpc.getAccountByAddress!("NQ23 TEST ACCOUNT")).resolves.toMatchObject({
      address: "NQ23 TEST ACCOUNT",
      type: expectedType,
    });
  });

});
