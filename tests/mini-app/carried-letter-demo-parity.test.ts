import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tour = readFileSync("web/demo-tour.js", "utf8");
const css = readFileSync("web/carried-letter-v2.css", "utf8");
const smoke = readFileSync("scripts/judge-flow-smoke.mjs", "utf8");

describe("NimCarry V2 guided practice parity", () => {
  it("keeps a persistent five-step practice narrative", () => {
    expect(tour).toContain("PRACTICE DESK");
    expect(tour).toContain("GUIDED PRACTICE");
    expect(tour).toContain('["Write","Choose","Consent","Handoff","Arrival"]');
    expect(tour).toContain("Practice acceptance is local only; no Nimiq signature is created.");
    expect(css).toContain(".demo-tour-progress");
  });

  it("never presents the guided handoff button as a real NIM send", () => {
    expect(tour).toContain("Run practice handoff");
    expect(tour).toContain("Practice only — this button never calls Nimiq Pay and never moves 1 NIM.");
    expect(tour).toContain("Open practice invite");
  });

  it("uses the same warm-wax and postmark presentation events as V2", () => {
    expect(tour).toContain('practiceHandoffEvent("verification-pending", "PENDING")');
    expect(tour).toContain('practiceHandoffEvent("final", "FINAL")');
    expect(tour).toContain("PRACTICE — warm wax.");
    expect(tour).toContain("PRACTICE POSTMARK");
  });

  it("holds practice states long enough to be seen", () => {
    expect(tour).toContain("setTimeout(resolve, 2200)");
    expect(tour).toContain("setTimeout(resolve, 850)");
  });

  it("makes ARRIVED explicitly a completed rehearsal", () => {
    expect(tour).toContain("PRACTICE COMPLETE");
    expect(tour).toContain("You just rehearsed the full Carried Letter loop.");
    expect(tour).toContain("No wallet approval, NIM transfer or chain finality occurred");
    expect(css).toContain(".demo-tour-complete");
  });

  it("keeps guided practice browser-local and visibly distinct", () => {
    expect(tour).toContain('localStorage.getItem(DEMO_KEY)');
    expect(tour).toContain('sessionStorage.getItem(META_KEY)');
    expect(tour).not.toContain("sendBasicTransactionWithData");
    expect(tour).not.toContain("nimiq.sign");
    expect(css).toContain(".carried-letter-v2-demo .clv2-wax-scene");
  });

  it("requires demo parity in the mobile + desktop judge smoke", () => {
    expect(smoke).toContain('#demo-tour-guide[data-step="1"]');
    expect(smoke).toContain('.clv2-wax-scene[data-phase="verification-pending"]');
    expect(smoke).toContain('.clv2-wax-scene[data-phase="final"]');
    expect(smoke).toContain(".demo-tour-complete");
    expect(smoke).toContain('#demo-tour-guide[data-step="5"]');
  });
});
