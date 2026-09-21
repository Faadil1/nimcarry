import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const v2 = readFileSync("web/carried-letter-v2.js", "utf8");
const css = readFileSync("web/carried-letter-v2.css", "utf8");
const smoke = readFileSync("scripts/judge-flow-smoke.mjs", "utf8");

describe("NimCarry V2 compressed handoff ceremony", () => {
  it("removes the older multi-panel explanation from the V2 pass screen", () => {
    expect(v2).toContain(".hc-pass-art,.hc-pass-ritual,.hc-proof-rule,.hc-max-ritual-note,.hc-proof-details,.wi-proof-ladder");
    expect(v2).toContain("forEach((node) => node.remove())");
  });

  it("puts recipient, 1 NIM seal and FINAL rule in one artifact", () => {
    expect(v2).toContain("DIRECT DELIVERY SLIP");
    expect(v2).toContain("who bound their own wallet through the private claim.");
    expect(v2).toContain("The introducer supplies consent and context, never custody.");
    expect(v2).toContain("[\"AMOUNT\", \"1 NIM\"]");
    expect(v2).toContain("[[\"INTRODUCER\", accepted]]");
    expect(v2).toContain("[\"RECIPIENT\", destination]");
  });

  it("keeps 1 NIM framed as destination delivery rather than introducer incentive", () => {
    expect(v2).toContain("The destination bound their own wallet. The sender pays that wallet directly");
    expect(v2).toContain("The 1 NIM is sent to the destination, not the introducer.");
    expect(v2).toContain("The introducer supplies the human connection");
  });

  it("keeps the warm-wax verification scene as the only post-action state machine", () => {
    expect(v2).toContain("clv2-wax-scene");
    expect(v2).toContain("Approval can open delivery. Broadcast can make it observable. Only independent FINAL proves arrival.");
    expect(css).toContain(".clv2-handoff-manifest");
    expect(css).toContain(".clv2-manifest-seal");
  });

  it("proves the simplified pass surface in the full judge flow", () => {
    expect(smoke).toContain('page.locator(".clv2-handoff-manifest")');
    expect(smoke).toContain("Legacy pass ritual leaked into V2 handoff surface");
  });

  it("keeps handoff compression presentation-only", () => {
    expect(v2).not.toContain("fetch(");
    expect(v2).not.toContain("sendBasicTransactionWithData");
    expect(v2).not.toContain("nimiq.sign");
  });
});
