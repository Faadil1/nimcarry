import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("web/app.js", "utf8");
const recoveryUx = readFileSync("web/nimiq-recovery-ux.js", "utf8");
const recoveryPage = readFileSync("web/route-access-recovery.html", "utf8");

describe("NimCarry interruption and recovery states", () => {
  it("exposes only canonical lifecycle metadata to the presentation", () => {
    expect(app).toContain('data-mission-status="${esc(m.status || "")}"');
    expect(app).toContain('data-mission-activity="${esc(activity || "")}"');
    expect(app).toContain('data-invitation-status="${esc(m.invitation?.status || "")}"');
    expect(app).toContain('data-invitation-expires-at="${esc(m.invitation?.expires_at || "")}"');
    expect(app).toContain('data-pass-deadline-at="${esc(m.invitation?.pass_deadline_at || "")}"');
  });

  it("answers what happened for every supported interruption state", () => {
    expect(app).toContain("It’s gone<br><em>quiet.</em>");
    expect(app).toContain("Ask someone<br><em>else?</em>");
    expect(app).toContain("Waiting for<br><em>${esc(candidate)}.</em>");
    expect(app).toContain("Nothing<br>was sent.");
    expect(app).toContain("This link is<br><em>closed.</em>");
    expect(app).toContain("This link can’t<br><em>be used.</em>");
  });

  it("never implies money moved on invitation, consent, expiry or silence", () => {
    expect(app).toContain("Nothing moves until they say yes. They never hold the NIM.");
    expect(app).toContain("Nothing was sent. You can ask another person or send directly.");
    expect(app).toContain("The introduction hasn’t moved for a while. Nothing was sent.");
    expect(app).toContain("Saying yes never moves money.");
  });

  it("keeps the raw technical cause available to the recovery classifier", () => {
    expect(app).toContain("els.notice.dataset.systemMessage = message;");
    expect(app).toContain("ROUTE_VIEW_CAPABILITY_(?:INVALID|REQUIRED|EXPIRED)");
    expect(recoveryUx).toContain("notice.dataset.systemMessage?.trim() || visibleMessage");
    expect(recoveryUx).toContain("route_view_capability_(invalid|expired|required)");
  });

  it("handles expired invitations and handoff windows without suggesting a duplicate send", () => {
    expect(recoveryUx).toContain("This invitation is closed");
    expect(recoveryUx).toContain("The handoff window closed");
    expect(recoveryUx).toContain("Don’t reuse an expired authorization.");
    expect(recoveryUx).toContain("A handoff may already be in flight");
    expect(recoveryUx).toContain("Don’t create a second handoff.");
  });

  it("keeps route recovery read-only and participant scoped", () => {
    expect(recoveryPage).toContain("This restores access, not custody.");
    expect(recoveryPage).toContain("No NIM is sent.");
    expect(recoveryPage).toContain('href="/nimcarry.css"');
    expect(recoveryUx).toContain("Private route access stays participant-scoped");
    expect(recoveryUx).toContain("It never sends NIM a second time.");
  });
});
