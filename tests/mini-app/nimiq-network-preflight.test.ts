import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const provider = readFileSync("web/nimiq-provider.js", "utf8");

describe("Nimiq Pay TESTNET preflight", () => {
  it("checks consensus and independently compares the provider height before any send", () => {
    expect(provider).toContain("isConsensusEstablished");
    expect(provider).toContain("getBlockNumber");
    expect(provider).toContain("rpc.testnet.nimiqwatch.com");
    expect(provider).toContain("NIMIQ_NETWORK_MISMATCH");
    expect(provider).toContain("No transaction was requested");
    expect(provider.indexOf("await assertTestnetPreflight(target)")).toBeLessThan(
      provider.indexOf("target.sendBasicTransactionWithData(request)")
    );
  });

  it("fails closed instead of silently falling back when TESTNET cannot be proven", () => {
    expect(provider).toContain("NIMIQ_TESTNET_PREFLIGHT_UNAVAILABLE");
    expect(provider).toContain("MAX_TESTNET_HEIGHT_DRIFT");
    expect(provider).not.toContain("catch (error) { return target.sendBasicTransactionWithData");
  });
});
