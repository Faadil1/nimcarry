import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("web/app.js", "utf8");
const craft = readFileSync("web/final-human-craft.js", "utf8");

describe("mission bridge single-presence UX", () => {
  it("keeps the standalone holder only before the first FINAL path exists", () => {
    expect(app).toContain("const hasVerifiedPath = Array.isArray(m.route) && m.route.length > 0");
    expect(app).toContain('const holderSummary = hasVerifiedPath');
    expect(app).toContain('data-current-holder=');
    expect(app).toContain('Current holder');
  });

  it("represents a completed bridge as the single via mark, not the holder", () => {
    expect(app).toContain("entry.via?.display_label");
    expect(app).toContain("Bridge · delivered to");
    expect(app).toContain('markCurrentHolder: m.status === "ACTIVE"');
  });

  it("does not manufacture a second holder-to-destination diagram once a verified path exists", () => {
    expect(craft).toContain('const verifiedSteps = [...screen.querySelectorAll(".route-card .route-step")]');
    expect(craft).toContain("if (verifiedSteps.length > 0) return");
  });
});
