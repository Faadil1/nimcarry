import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const guard = readFileSync("web/invitation-resume.js", "utf8");

describe("bridge acceptance resume guard", () => {
  it("loads before the main Mini App so challenge/sign responses can be captured", () => {
    const guardIndex = html.indexOf('src="/invitation-resume.js"');
    const appIndex = html.indexOf('src="/app.js"');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(appIndex).toBeGreaterThan(guardIndex);
  });

  it("persists only a short-lived ACCEPT_INVITATION proof in session storage", () => {
    expect(guard).toContain("carryone.pendingInvitationAcceptance.v1");
    expect(guard).toContain("sessionStorage");
    expect(guard).toContain("MAX_AGE_MS = 5 * 60 * 1000");
    expect(guard).toContain('requestJson?.action === "ACCEPT_INVITATION"');
    expect(guard).toContain("public_key");
    expect(guard).toContain("signature");
    expect(guard).not.toContain("localStorage");
    expect(guard).not.toContain("privateKey");
    expect(guard).not.toContain("seed");
  });

  it("can finish the already-approved accept after a host route restore without creating a payment path", () => {
    expect(guard).toContain("resumeAcceptedSignature");
    expect(guard).toContain("/accept");
    expect(guard).toContain("CHALLENGE_REPLAY");
    expect(guard).toContain("accept-resume=1");
    expect(guard).not.toContain("sendBasicTransaction");
    expect(guard).not.toContain("sendBasicTransactionWithData");
    expect(guard).not.toContain("AUTHORIZE_PASS");
  });
});
