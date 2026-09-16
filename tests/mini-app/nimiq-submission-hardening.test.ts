import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const provider = readFileSync("web/nimiq-provider.js", "utf8");
const guard = readFileSync("web/nimiq-submission-guard.js", "utf8");
const relay = readFileSync("src/service/canonical-relay-service.ts", "utf8");

describe("Nimiq Pay ambiguous-submission hardening", () => {
  it("unwraps resolved provider errors instead of treating them as transaction results", () => {
    expect(provider).toContain("isErrorResponse");
    expect(provider).toContain("NIMIQ_PAY_${operation}_FAILED");
    expect(provider).toContain("NIMIQ_PAY_SEND_UNEXPECTED_RESULT");
    expect(provider).toContain("looksLikeTxHash");
  });

  it("adds a current validityStartHeight when the caller omitted one", () => {
    expect(provider).toContain('property === "sendBasicTransactionWithData"');
    expect(provider).toContain("await target.getBlockNumber()");
    expect(provider).toContain("validityStartHeight");
    expect(provider).not.toContain("fee: 1000");
  });

  it("wires a fail-closed browser guard without creating a second transaction path", () => {
    expect(html).toContain('src="/nimiq-submission-guard.js"');
    expect(guard).toContain("NIMIQ_PAY_SUBMISSION_UNPROVEN");
    expect(guard).toContain("SUBMISSION_RECHECK_REQUIRED");
    expect(guard).toContain("/reconcile");
    expect(guard).toContain("Do not resend the baton");
    expect(guard).not.toContain("sendBasicTransactionWithData");
    expect(guard).not.toContain("nimiq.sign");
  });

  it("persists only a local safety hold, not wallet or transaction secrets", () => {
    expect(guard).toContain("first_seen_at");
    expect(guard).toContain("hold_until");
    expect(guard).not.toContain("recipient_data");
    expect(guard).not.toContain("privateKey");
    expect(guard).not.toContain("seed");
  });

  it("recovers a missing wallet hash only from an exact independently validated chain match", () => {
    expect(relay).toContain("discoverMatchingBroadcast");
    expect(relay).toContain("getTransactionsByAddress");
    expect(relay).toContain("validateObservedTransaction");
    expect(relay).toContain("await this.validateObservedTransaction(intent, tx)");
    expect(relay).toContain("verifiedPaymentRail");
    expect(relay).toContain("AMBIGUOUS_MATCHING_BROADCAST");
    expect(relay).toContain("recordObservedBroadcast");
  });
});
