import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const provider = readFileSync("web/nimiq-provider.js", "utf8");
const worker = readFileSync("cloudflare/worker.mjs", "utf8");

describe("Nimiq Pay TESTNET preflight", () => {
  it("checks consensus and independently compares the provider height before any send", () => {
    expect(provider).toContain("isConsensusEstablished");
    expect(provider).toContain("getBlockNumber");
    expect(provider).toContain('TESTNET_HEAD_URL = "/network/testnet-head"');
    expect(provider).not.toContain("https://rpc.testnet.nimiqwatch.com");
    expect(worker).toContain('url.pathname === "/network/testnet-head"');
    expect(worker).toContain("NIMIQ_RPC_URLS");
    expect(worker).toContain("TESTNET_HEAD_ATTEMPTS = 2");
    expect(provider).toContain("NIMIQ_NETWORK_MISMATCH");
    expect(provider).toContain("No transaction was requested");
    expect(provider.indexOf("await assertTestnetPreflight(target)")).toBeLessThan(
      provider.indexOf("target.sendBasicTransactionWithData(request)")
    );
  });

  it("keeps the independent chain read server-side and read-only", () => {
    expect(worker).toContain("independently_observed: true");
    expect(worker).toContain("writes_performed: false");
    expect(worker).toContain('"cache-control": "no-store"');
    expect(worker).toContain("TESTNET_HEAD_UNAVAILABLE");
    expect(worker).not.toContain("sendBasicTransactionWithData");
  });

  it("fails closed instead of silently falling back when TESTNET cannot be proven", () => {
    expect(provider).toContain("NIMIQ_TESTNET_PREFLIGHT_UNAVAILABLE");
    expect(provider).toContain("MAX_TESTNET_HEIGHT_DRIFT");
    expect(provider).not.toContain("catch (error) { return target.sendBasicTransactionWithData");
  });
});
