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
  });

  it("keeps the optional carried-letter mark with the short-lived recovery proof", () => {
    expect(guard).toContain('event.target instanceof Element ? event.target.closest("#accept")');
    expect(guard).toContain('document.querySelector("#candidate-display-label")');
    expect(guard).toContain("candidate_display_label");
    expect(guard).toContain("pending.candidate_display_label");
  });

  it("replays the canonical flat signed envelope instead of a nested compatibility body", () => {
    expect(guard).toContain("challenge_id: pending.challenge_id");
    expect(guard).toContain("public_key: pending.public_key");
    expect(guard).toContain("signature: pending.signature");
    expect(guard).not.toContain("auth: {\n            challenge_id: pending.challenge_id");
  });

  it("uses a stable idempotency key for direct acceptance recovery", () => {
    expect(guard).toContain('pending.accept_idempotency_key || randomToken("accept-resume")');
    expect(guard).toContain('"Idempotency-Key": acceptIdempotencyKey');
    expect(guard).toContain("accept_idempotency_key: acceptIdempotencyKey");
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
