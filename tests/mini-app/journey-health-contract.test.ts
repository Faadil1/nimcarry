import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("web/app.js", "utf8");
const compat = readFileSync("web/http-compat.js", "utf8");
const server = readFileSync("src/service/mission-http-server.ts", "utf8");
const craft = readFileSync("web/final-human-craft.js", "utf8");
const capability = readFileSync("src/service/route-view-capability.ts", "utf8");

describe("NimCarry 1→5 journey health contract", () => {
  it("uses one bridge signature for acceptance plus read continuity", () => {
    expect(server).toContain("view_token: issued.token");
    expect(server).toContain("ACCEPT_INVITATION");
    expect(compat).toContain("activateBridgeContinuationAfterAcceptance");
    expect(compat).toContain("acceptedInvitation?.view_token");

    const helperStart = compat.indexOf("async function activateBridgeContinuationAfterAcceptance");
    const helperEnd = compat.indexOf("\n  window.fetch", helperStart);
    const helper = compat.slice(helperStart, helperEnd);
    expect(helper).not.toContain("nimiq.sign");
    expect(helper).not.toContain('action: "VIEW_ROUTE"');
  });

  it("keeps the accepted bridge on one screen until FINAL makes them holder", () => {
    expect(app).toContain('mission.viewer_role === "INVITEE" && invitationStatus === "ACCEPTED"');
    expect(app).toContain("Accepted — waiting for FINAL");
    expect(app).toContain("FINAL verified. You now carry this letter — choose the next bridge.");
  });

  it("never offers another payment from an expired pass window", () => {
    expect(app).toContain('const passReady = inv?.status === "ACCEPTED" && !passWindowExpired');
    expect(app).toContain("This pass can’t be reused.");
    expect(app).toContain("No new payment should be requested from this screen.");
  });

  it("renders a finalized bridge once even after mission recovery", () => {
    expect(app).toContain("const hasVerifiedPath = Array.isArray(m.route) && m.route.length > 0");
    expect(app).toContain('const holderSummary = hasVerifiedPath');
    expect(app).toContain('data-current-holder=');
    expect(craft).toContain('const verifiedSteps = [...screen.querySelectorAll(".route-card .route-step")]');
    expect(craft).toContain("if (verifiedSteps.length > 0) return");
  });

  it("keeps restart recovery as a fallback, not a normal second bridge step", () => {
    expect(capability).toContain("Normal bridge acceptance does not require a second");
    expect(capability).toContain("POST /missions/:id/view");
    expect(server).toContain("resolveProfileViewer");
  });
});
