import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/payment-identity-diagnostic.html", "utf8");
const js = readFileSync("web/payment-identity-diagnostic.js", "utf8");

describe("payment identity diagnostic page", () => {
  it("is explicitly private/read-only and uses Nimiq Pay account discovery", () => {
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    expect(html).toContain("Diagnostic only · no transaction writes");
    expect(html).toContain('class="final-human-craft carried-letter-v2"');
    expect(html).toContain('class="card clv2-utility-surface"');
    expect(html).toContain("Read the address. Do not move the letter.");
    expect(js).toContain("listAccounts()");
    expect(js).toContain("writes_performed: false");
  });

  it("cannot sign or broadcast from the diagnostic surface", () => {
    expect(js).not.toContain("sendBasicTransaction(");
    expect(js).not.toContain("sendBasicTransactionWithData(");
    expect(js).not.toContain(".sign(");
    expect(js).not.toContain("fetch(");
  });
});
