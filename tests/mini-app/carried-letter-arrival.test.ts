import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("web/app.js", "utf8");
const v2 = readFileSync("web/carried-letter-v2.js", "utf8");
const css = readFileSync("web/carried-letter-v2.css", "utf8");

describe("NimCarry V2 carried-letter arrival", () => {
  it("uses the server-derived viewer role instead of guessing the destination viewer", () => {
    expect(app).toContain('data-viewer-role="${esc(m.viewer_role || "UNLISTED_VIEWER")}"');
    expect(v2).toContain('const viewerRole = clean(card.dataset.viewerRole).toUpperCase()');
    expect(v2).toContain('const isTargetViewer = arrived && viewerRole === "TARGET"');
  });

  it("reserves the destination-specific climax for authoritative ARRIVED + TARGET state", () => {
    expect(v2).toContain('const arrived = /ARRIVED/i.test(status)');
    expect(v2).toContain("A letter has been carried to you.");
    expect(v2).toContain("This was meant for you.");
    expect(v2).toContain("People chose to carry it until it reached you.");

    const invitationStart = v2.indexOf("function invitation()");
    const invitationEnd = v2.indexOf("function mission()", invitationStart);
    const invitationBlock = v2.slice(invitationStart, invitationEnd);
    expect(invitationBlock).not.toContain("A letter has been carried to you.");
    expect(invitationBlock).not.toContain("This was meant for you.");
  });

  it("reuses the stable ARRIVED landmark instead of hiding or duplicating it", () => {
    expect(v2).toContain('close = card.querySelector(".hc-arrived-moment")');
    expect(v2).toContain('close.classList.add("clv2-arrival-close")');
    expect(css).not.toContain(".clv2-arrived .hc-arrived-moment{display:none");
  });

  it("keeps a truthful generic ARRIVED view for creators, carriers and other authorized viewers", () => {
    expect(v2).toContain("The letter arrived.");
    expect(v2).toContain("It reached the intended person.");
    expect(v2).toContain("No one was paid. Everyone chose.");
    expect(v2).toContain("The seal opens only because the final handoff was independently verified.");
  });

  it("converges the existing receipt into a privacy-safe carried-letter artifact", () => {
    expect(v2).toContain("CARRIED LETTER RECEIPT");
    expect(v2).toContain("PRIVACY-SAFE PROVENANCE");
    expect(v2).toContain("FINAL handoffs only · scoped to this authorized view");
    expect(v2).toContain("This authorized view never reveals full wallet addresses or private destination data.");
    expect(v2).toContain("Copy carried-letter receipt");
  });

  it("keeps practice ARRIVED visually and textually distinct from verified TESTNET ARRIVED", () => {
    expect(v2).toContain("PRACTICE CARRIED LETTER · NOT ON RECORD");
    expect(v2).toContain("Practice arrival — simulated and visibly off-chain.");
    expect(v2).toContain("Practice artifact · simulated handoffs only");
    expect(css).toContain('content:"PRACTICE"');
  });

  it("keeps the arrival renderer presentation-only", () => {
    expect(v2).not.toContain("fetch(");
    expect(v2).not.toContain("sendBasicTransactionWithData");
    expect(v2).not.toContain("nimiq.sign");
    expect(v2).not.toContain("localStorage.setItem");
    expect(v2).not.toContain("sessionStorage.setItem");
  });

  it("gives the opened seal reduced-motion parity", () => {
    expect(css).toContain("@keyframes clv2-seal-left");
    expect(css).toContain("@keyframes clv2-seal-right");
    expect(css).toContain("background:var(--cl-green-night)");
    expect(css).not.toContain("background:#f8ecda");
    expect(css).toContain(".clv2-broken-seal::before");
    expect(css).toContain(".clv2-broken-seal::after");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain("animation:none!important");
  });
});
