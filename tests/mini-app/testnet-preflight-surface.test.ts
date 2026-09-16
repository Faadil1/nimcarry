import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/testnet-preflight.html", "utf8");
const js = readFileSync("web/testnet-preflight.js", "utf8");

describe("live TESTNET preflight surface", () => {
  it("is explicitly read-only and requires a PASS before payment", () => {
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    expect(html).toContain("Diagnostic only · no transaction writes");
    expect(html).toContain("PASS required before live baton test");
    expect(js).toContain("assertTestnetPreflight");
    expect(js).toContain("writes_performed: false");
    expect(js).toContain('safe_next_step: "STOP_NO_PAYMENT"');
  });

  it("cannot sign or broadcast from the preflight surface", () => {
    expect(js).not.toContain(".sign(");
    expect(js).not.toContain("sendBasicTransaction(");
    expect(js).not.toContain("sendBasicTransactionWithData(");
    expect(js).not.toContain("/broadcast");
  });
});
