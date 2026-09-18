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
    expect(v2).toContain("HANDOFF SLIP");
    expect(v2).toContain("Exactly 1 NIM carries custody to this person only after independent FINAL.");
    expect(v2).toContain("[\"SEAL\", \"1 NIM\"]");
    expect(v2).toContain("[\"HOLDER CHANGES\", \"ONLY AT FINAL\"]");
  });

  it("keeps 1 NIM framed as custody rather than incentive", () => {
    expect(v2).toContain("It is the custody seal, not a reward, stake or fee.");
    expect(v2).toContain("The human introduction is the reason for the route");
  });

  it("keeps the warm-wax verification scene as the only post-action state machine", () => {
    expect(v2).toContain("clv2-wax-scene");
    expect(v2).toContain("Approval can open the handoff. Broadcast can make it observable. Neither changes the holder.");
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
