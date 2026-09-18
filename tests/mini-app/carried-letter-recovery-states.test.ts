import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("web/app.js", "utf8");
const v2 = readFileSync("web/carried-letter-v2.js", "utf8");
const css = readFileSync("web/carried-letter-v2.css", "utf8");
const recoveryUx = readFileSync("web/nimiq-recovery-ux.js", "utf8");
const recoveryPage = readFileSync("web/route-access-recovery.html", "utf8");

describe("NimCarry V2 carried-letter interruption and recovery states", () => {
  it("exposes only canonical lifecycle metadata to the presentation layer", () => {
    expect(app).toContain('data-mission-status="${esc(m.status || "")}"');
    expect(app).toContain('data-mission-activity="${esc(activity || "")}"');
    expect(app).toContain('data-invitation-status="${esc(m.invitation?.status || "")}"');
    expect(app).toContain('data-invitation-expires-at="${esc(m.invitation?.expires_at || "")}"');
    expect(app).toContain('data-pass-deadline-at="${esc(m.invitation?.pass_deadline_at || "")}"');
  });

  it("answers where the letter is for every supported interruption state", () => {
    expect(v2).toContain("The letter is still with its last verified holder.");
    expect(v2).toContain("The invitation timed out. The letter stayed here.");
    expect(v2).toContain("They chose not to carry it.");
    expect(v2).toContain("This invitation was closed before a handoff.");
    expect(v2).toContain("The letter is waiting for an answer.");
    expect(v2).toContain("They chose to carry it. The handoff has not happened yet.");
    expect(v2).toContain("This letter was closed before a verified handoff.");
  });

  it("never equates invitation, consent, expiry or silence with custody", () => {
    expect(v2).toContain("Invitation is not custody.");
    expect(v2).toContain("Consent enables the handoff; FINAL completes it.");
    expect(v2).toContain("Expiry closes an invitation, not custody.");
    expect(v2).toContain("Silence never moves custody.");
    expect(v2).toContain("Closed is not carried.");
  });

  it("turns dead invitation links into a fail-closed human state", () => {
    expect(v2).toContain("This letter can’t be opened.");
    expect(v2).toContain("Nothing moved because an invitation is never custody.");
    expect(css).toContain("RETURN TO SENDER");
  });

  it("keeps the raw technical cause available to the recovery classifier", () => {
    expect(v2).toContain("notice.dataset.systemMessage = current");
    expect(recoveryUx).toContain("notice.dataset.systemMessage?.trim() || visibleMessage");
    expect(recoveryUx).toContain("route_view_capability_(invalid|expired|required)");
  });

  it("handles expired invitations and handoff windows without suggesting a duplicate baton", () => {
    expect(recoveryUx).toContain("This invitation is closed");
    expect(recoveryUx).toContain("The letter never left its verified holder.");
    expect(recoveryUx).toContain("The handoff window closed");
    expect(recoveryUx).toContain("Don’t reuse an expired authorization.");
    expect(recoveryUx).toContain("A handoff may already be in flight");
    expect(recoveryUx).toContain("Don’t create a second handoff.");
  });

  it("keeps route recovery read-only and participant scoped", () => {
    expect(recoveryPage).toContain("The letter is still safe. Restore your view.");
    expect(recoveryPage).toContain("This restores access, not custody.");
    expect(recoveryPage).toContain("No NIM is sent. No bridge is re-invited. No handoff is created.");
    expect(recoveryPage).toContain("clv2-utility-letter");
    expect(css).toContain(".clv2-utility-grid");
    expect(recoveryUx).toContain("Private route access stays participant-scoped");
  });

  it("keeps the V2 recovery presentation layer mutation-free", () => {
    expect(v2).not.toContain("fetch(");
    expect(v2).not.toContain("sendBasicTransactionWithData");
    expect(v2).not.toContain("nimiq.sign");
    expect(v2).not.toContain("localStorage.setItem");
    expect(v2).not.toContain("sessionStorage.setItem");
  });

  it("keeps interruption artifacts readable with reduced motion", () => {
    expect(css).toContain(".clv2-route-state-stamp");
    expect(css).toContain(".clv2-unavailable-letter::before");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain(".clv2-route-state-stamp,");
  });
});
