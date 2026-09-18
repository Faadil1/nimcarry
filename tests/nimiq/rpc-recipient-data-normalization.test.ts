import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpNimiqRpcClient } from "../../src/nimiq/rpc-client.js";

const HOLDER = "NQ46 HOLDER BASIC";
const BRIDGE = "NQ48 BRIDGE BASIC";
const COMMITMENT = "co:v1:abc_DEF-123";
const COMMITMENT_HEX = Buffer.from(COMMITMENT, "utf8").toString("hex");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpNimiqRpcClient recipient-data normalization", () => {
  it("decodes canonical JSON-RPC recipientData hex back to UTF-8", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.method).toBe("getTransactionByHash");
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          hash: "a".repeat(64),
          from: HOLDER,
          to: BRIDGE,
          value: 100000,
          blockNumber: 11789000,
          confirmations: 12,
          recipientData: COMMITMENT_HEX,
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const rpc = new HttpNimiqRpcClient("https://rpc.example.test");
    await expect(rpc.getTransactionByHash("a".repeat(64))).resolves.toMatchObject({
      recipientData: COMMITMENT,
    });
  });

  it("decodes address-history recipient data before ambiguous-broadcast recovery", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.method).toBe("getTransactionsByAddress");
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: [{
          hash: "b".repeat(64),
          from: HOLDER,
          to: BRIDGE,
          value: 100000,
          blockNumber: 11789001,
          confirmations: 11,
          recipientData: COMMITMENT_HEX,
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const rpc = new HttpNimiqRpcClient("https://rpc.example.test");
    await expect(rpc.getTransactionsByAddress(BRIDGE)).resolves.toEqual([
      expect.objectContaining({ recipientData: COMMITMENT }),
    ]);
  });

  it("keeps already-decoded text and accepts plain-object raw hex forms", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      const recipientData = call === 1 ? COMMITMENT : { raw: COMMITMENT_HEX };
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          hash: "c".repeat(64),
          from: HOLDER,
          to: BRIDGE,
          value: 100000,
          blockNumber: 11789002,
          confirmations: 10,
          recipientData,
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const rpc = new HttpNimiqRpcClient("https://rpc.example.test");
    await expect(rpc.getTransactionByHash("c".repeat(64))).resolves.toMatchObject({ recipientData: COMMITMENT });
    await expect(rpc.getTransactionByHash("c".repeat(64))).resolves.toMatchObject({ recipientData: COMMITMENT });
  });
});
