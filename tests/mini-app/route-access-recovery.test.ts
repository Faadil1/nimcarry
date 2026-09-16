import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ux = readFileSync("web/nimiq-recovery-ux.js", "utf8");
const page = readFileSync("web/route-access-recovery.html", "utf8");
const recovery = readFileSync("web/route-access-recovery.js", "utf8");

describe("route access self-recovery", () => {
  it("surfaces a dedicated recovery action for invalid or expired route capabilities", () => {
    expect(ux).toContain("route_view_capability_(invalid|expired)");
    expect(ux).toContain("Restore mission access");
    expect(ux).toContain("/route-access-recovery.html");
  });

  it("can rediscover stale mission ids from session storage when browser history is lost", () => {
    expect(ux).toContain('const prefix = "carryone.view."');
    expect(ux).toContain("Previous mission found in this Nimiq Pay session");
    expect(ux).toContain("Resume without creating a new mission");
    expect(ux).toContain("recoveryPathForMission(id)");
  });

  it("uses a signed VIEW_ROUTE challenge and returns to the same mission", () => {
    expect(page).toContain("Restore this mission without changing custody");
    expect(recovery).toContain('action: "VIEW_ROUTE"');
    expect(recovery).toContain("/auth/challenge");
    expect(recovery).toContain("/view");
    expect(recovery).toContain("carryone.view.${missionId}");
    expect(recovery).toContain("nimiq.sign(message)");
  });

  it("adds an Idempotency-Key to the signed route-view capability mutation", () => {
    expect(recovery).toContain('headers.set("Idempotency-Key", randomToken("recovery"))');
    expect(recovery).toContain('path !== "/auth/challenge"');
  });

  it("contains no payment or custody mutation path", () => {
    expect(recovery).not.toContain("sendBasicTransaction");
    expect(recovery).not.toContain("sendBasicTransactionWithData");
    expect(recovery).not.toContain("AUTHORIZE_PASS");
    expect(recovery).not.toContain("pass-intent");
    expect(recovery).not.toContain("reconcile");
    expect(ux).not.toContain("sendBasicTransactionWithData");
  });
});
