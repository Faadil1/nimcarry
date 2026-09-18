import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("web/app.js", "utf8");
const v2 = readFileSync("web/carried-letter-v2.js", "utf8");
const css = readFileSync("web/carried-letter-v2.css", "utf8");
const tour = readFileSync("web/demo-tour.js", "utf8");
const service = readFileSync("src/mission/service.ts", "utf8");
const pg = readFileSync("src/persistence/pg-mission-repository.ts", "utf8");
const view = readFileSync("src/service/mission-view.ts", "utf8");

describe("NimCarry V2 sign-the-back consent provenance", () => {
  it("collects an optional self-chosen display label without replacing cryptographic consent", () => {
    expect(app).toContain('id="candidate-display-label"');
    expect(app).toContain("The Nimiq authorization — not this name — is the consent proof.");
    expect(app).toContain('signedAuth("ACCEPT_INVITATION"');
    expect(app).toContain("candidate_display_label: candidateDisplayLabel");
    expect(v2).toContain("The signed Nimiq authorization — not the ink — is the consent proof.");
  });

  it("persists the mark only through the signed acceptance path", () => {
    expect(service).toContain('candidateDisplayLabel = input.candidateDisplayLabel');
    expect(service).toContain('boundedText(input.candidateDisplayLabel, 1, 60, "candidateDisplayLabel")');
    expect(pg).toContain("candidate_display_label=$5");
    expect(pg).toContain("candidateDisplayLabel");
  });

  it("keeps the mark inside full invitation privacy scope", () => {
    expect(view).toContain("candidate_display_label: redacted ? null : invitation.candidateDisplayLabel");
    expect(view).toContain("viewerSeesFullInvitation");
    expect(app).toContain('data-accepted-display-label="${esc(m.invitation?.candidate_display_label || "")}"');
  });

  it("makes successful acceptance visibly different before custody moves", () => {
    expect(v2).toContain("SIGNED AFTER NIMIQ AUTHORIZATION");
    expect(v2).toContain("Custody has not moved.");
    expect(v2).toContain("clv2-signed-back");
    expect(css).toContain(".clv2-ink-signature");
  });

  it("keeps guided demo honest while showcasing the optional mark", () => {
    expect(tour).toContain("prefillAcceptanceMark");
    expect(tour).toContain("#candidate-display-label");
    expect(app).toContain("Demo bridge accepted. The signature mark is presentation only; no wallet or network write occurred.");
    expect(css).toContain(".carried-letter-v2-demo .clv2-signed-back");
  });

  it("does not turn the presentation layer into acceptance authority", () => {
    expect(v2).not.toContain("fetch(");
    expect(v2).not.toContain("nimiq.sign");
    expect(v2).not.toContain("sessionStorage.setItem");
    expect(v2).not.toContain("localStorage.setItem");
  });
});
