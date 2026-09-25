import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ux = readFileSync("web/nimiq-recovery-ux.js", "utf8");
const page = readFileSync("web/route-access-recovery.html", "utf8");
const recovery = readFileSync("web/route-access-recovery.js", "utf8");

describe("route access self-recovery", () => {
  it("surfaces a dedicated recovery action for invalid or expired route capabilities", () => {
    expect(ux).toContain("route_view_capability_(invalid|expired|required)");
    expect(ux).toContain("Restore mission access");
    expect(ux).toContain("/route-access-recovery.html");
  });

  it("can rediscover a mission after session storage is lost without persisting bearer access", () => {
    expect(ux).toContain('const prefix = "carryone.view."');
    expect(ux).toContain('const RECENT_MISSIONS_KEY = "nimcarry.recentMissions.v1"');
    expect(ux).toContain("persistentMissionIds");
    expect(ux).toContain("knownMissionIds");
    expect(ux).toContain("A payment in progress on this device");
    expect(ux).toContain("Resume without creating a new mission");
    expect(ux).toContain("This only reads it. It never sends NIM a second time.");
    expect(ux).toContain("recoveryPathForMission(id)");
    expect(ux).not.toContain('localStorage.setItem(`carryone.view.');
  });

  it("uses a signed VIEW_ROUTE challenge and returns to the same mission", () => {
    expect(page).toContain("The letter is still safe. Restore your view");
    expect(page).toContain("No NIM is sent, no one is re-invited, and nothing about the payment changes.");
    expect(page).toContain('class="nc-scene hero-card nc-utility"');
    expect(page).toContain("Restore the view. Never move the letter.");
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
