import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/testnet-preflight.html", "utf8");
const js = readFileSync("web/testnet-preflight.js", "utf8");

describe("live TESTNET preflight surface", () => {
  it("is explicitly read-only and requires a PASS before payment", () => {
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    expect(html).toContain("Diagnostic only · no transaction writes");
    expect(html).toContain("Passes → small test payment → real NimCarry payment");
    expect(html).toContain('class="nc-scene hero-card nc-utility"');
    expect(html).toContain('href="/nimcarry.css"');
    expect(html).toContain("Check the network before the seal moves.");
    expect(js).toContain("assertTestnetPreflight");
    expect(js).toContain("writes_performed: false");
    expect(js).toContain('safe_next_step: "STOP_NO_PAYMENT"');
    expect(js).toContain('safe_next_step: "PLAIN_TESTNET_CANARY_THEN_ONE_CONTROLLED_NIMCARRY_A_TO_B"');
  });

  it("cannot sign or broadcast from the preflight surface", () => {
    expect(js).not.toContain(".sign(");
    expect(js).not.toContain("sendBasicTransaction(");
    expect(js).not.toContain("sendBasicTransactionWithData(");
    expect(js).not.toContain("/broadcast");
  });
});
