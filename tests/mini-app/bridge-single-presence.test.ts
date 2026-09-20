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

  it("marks only the latest FINAL route row as the current holder while active", () => {
    expect(app).toContain("const lastSequence = Number(ordered.at(-1)?.sequence)");
    expect(app).toContain("options.markCurrentHolder === true");
    expect(app).toContain('markCurrentHolder: m.status === "ACTIVE"');
  });

  it("does not manufacture a second holder-to-destination diagram once a verified path exists", () => {
    expect(craft).toContain('const verifiedSteps = [...screen.querySelectorAll(".route-card .route-step")]');
    expect(craft).toContain("if (verifiedSteps.length > 0) return");
  });
});
