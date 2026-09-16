import { describe, expect, it } from "vitest";
import { classifyPaymentSender, normalizeNimiqAddress, shortNimiqAddress } from "../../src/nimiq/payment-identity.js";

describe("payment identity diagnostics", () => {
  it("normalizes whitespace and case before comparing", () => {
    expect(normalizeNimiqAddress("nq12  abcd  efgh")).toBe("NQ12ABCDEFGH");
    expect(classifyPaymentSender("NQ12 ABCD EFGH", ["nq12abcdefgh"])).toBe("MATCHES_LISTED_ACCOUNT");
  });

  it("reports an observed sender that differs from all listed accounts without treating it as canonical validation", () => {
    expect(classifyPaymentSender("NQ99 ZZZZ YYYY", ["NQ11 AAAA BBBB", "NQ22 CCCC DDDD"]))
      .toBe("DIFFERS_FROM_LISTED_ACCOUNTS");
  });

  it("keeps the no-listAccounts case explicit", () => {
    expect(classifyPaymentSender("NQ99 ZZZZ YYYY", [])).toBe("NO_LISTED_ACCOUNTS");
  });

  it("redacts addresses for diagnostics", () => {
    expect(shortNimiqAddress("NQ12 3456 7890 1234 5678")).toBe("NQ1234…5678");
  });
});
