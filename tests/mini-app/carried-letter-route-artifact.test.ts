import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const v2 = readFileSync("web/carried-letter-v2.js", "utf8");
const css = readFileSync("web/carried-letter-v2.css", "utf8");
const smoke = readFileSync("scripts/judge-flow-smoke.mjs", "utf8");

describe("NimCarry V2 route as carried-letter artifact", () => {
  it("collapses older route decoration into one letter-back world", () => {
    expect(v2).toContain('.hc-route-heading,.hc-max-route-motto,.cf-route-heading');
    expect(v2).toContain("BACK OF THE LETTER · VERIFIED JOURNEY");
    expect(v2).toContain("Only FINAL handoffs earn a postmark");
  });

  it("creates one postmark per already-rendered verified route step", () => {
    expect(v2).toContain('const steps = [...card.querySelectorAll(".route-step")]');
    expect(v2).toContain("clv2-route-postmark-step");
    expect(v2).toContain("clv2-hop-stamp");
    expect(v2).toContain("FINAL ${String(index + 1).padStart(2, \"0\")}");
  });

  it("keeps practice marks visibly non-record", () => {
    expect(v2).toContain("PRACTICE LETTER BACK");
    expect(v2).toContain("Simulated practice marks · not on record");
    expect(v2).toContain("PRACTICE ${String(index + 1).padStart(2, \"0\")}");
    expect(css).toContain(".carried-letter-v2-demo .clv2-hop-stamp");
  });

  it("uses the route itself as a paper provenance ledger", () => {
    expect(css).toContain(".clv2-route-ledger-head");
    expect(css).toContain(".clv2-route .route::before");
    expect(css).toContain(".clv2-route .route-step .rail::before");
    expect(css).toContain(".clv2-hop-stamp");
  });

  it("proves the artifact in the full mobile and desktop judge path", () => {
    expect(smoke).toContain('page.locator(".clv2-route-ledger-head")');
    expect(smoke).toContain('page.locator(".clv2-hop-stamp")');
    expect(smoke).toContain("Expected at least 2 verified letter-back postmarks");
  });

  it("keeps the route artifact presentation-only", () => {
    expect(v2).not.toContain("fetch(");
    expect(v2).not.toContain("sendBasicTransactionWithData");
    expect(v2).not.toContain("nimiq.sign");
  });
});
