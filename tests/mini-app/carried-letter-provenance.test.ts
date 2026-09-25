import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const missionView = readFileSync("src/service/mission-view.ts", "utf8");
const httpServer = readFileSync("src/service/mission-http-server.ts", "utf8");
const pg = readFileSync("src/persistence/pg-mission-repository.ts", "utf8");
const fileRepo = readFileSync("src/mission/file-repository.ts", "utf8");
const compat = readFileSync("web/http-compat.js", "utf8");
const app = readFileSync("web/app.js", "utf8");

describe("NimCarry V2 finalized carrier provenance", () => {
  it("sources introduced marks only from the exact finalized invitation provenance", () => {
    expect(httpServer).toContain('hop.status === "CONFIRMED"');
    expect(httpServer).toContain("if (!hop.invitation_id) return");
    expect(httpServer).toContain("await deps.repository.getInvitation(hop.invitation_id)");
    expect(httpServer).toContain("finalizedBridgeMarks[hop.sequence] = {");
    expect(httpServer).toContain("historicalInvitation.candidateDisplayLabel");
  });

  it("never attaches a mark to a non-FINAL route entry", () => {
    expect(missionView).toContain('hop.status === "CONFIRMED" && hop.confirmed_at !== null');
    expect(missionView).toContain("finalized && revealBridgeMarks ? bridge.label : null");
  });

  it("redacts carrier marks from unlisted/anonymous viewers", () => {
    expect(missionView).toContain('const revealBridgeMarks = viewerRole !== "UNLISTED_VIEWER"');
  });

  it("clears a stale mark when an invitation is reissued", () => {
    expect(fileRepo).toContain("candidateDisplayLabel: null");
    expect(pg).toContain("candidate_display_label=NULL");
  });

  it("retains opted-in mark provenance when a hop actually finalizes", () => {
    expect(pg).toContain("display_name_opt_in");
    expect(pg).toContain("invitationRow.candidate_display_label !== null");
    expect(pg).toContain("invitationRow.candidate_display_label");
  });

  it("preserves only authorized labels through browser normalization", () => {
    expect(compat).toContain("entry.current_holder?.display_label || null");
    expect(compat).toContain("entry.bridge?.display_label || null");
    expect(compat).toContain("entry.recipient?.display_label || null");
    expect(app).toContain("data-carrier-mark");
  });

  it("renders the same authorized mark as letter ink and receipt provenance", () => {
  });
});
