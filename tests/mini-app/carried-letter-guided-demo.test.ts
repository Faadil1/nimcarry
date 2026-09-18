import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tour = readFileSync("web/demo-tour.js", "utf8");
const demoUx = readFileSync("web/demo-ux.js", "utf8");
const css = readFileSync("web/carried-letter-v2.css", "utf8");
const smoke = readFileSync("scripts/judge-flow-smoke.mjs", "utf8");

describe("NimCarry V2 guided demo matches the chosen Carried Letter direction", () => {
  it("uses a five-act practice-letter guide instead of generic numbered screens", () => {
    expect(tour).toContain('["WRITE", "Write the private letter"]');
    expect(tour).toContain('["FIRST CARRIER", "Choose one trusted person"]');
    expect(tour).toContain('["POSTMARK", "Verify the first handoff"]');
    expect(tour).toContain('["DESTINATION", "Carry it to the intended person"]');
    expect(tour).toContain('["RECEIPT", "Open the privacy-safe proof"]');
    expect(css).toContain(".clv2-demo-tour-rail");
  });

  it("uses human demo participants and a human reason", () => {
    expect(tour).toContain('label.value = "Maya"');
    expect(tour).toContain("You know the Nimiq community and can carry this introduction one step closer.");
    expect(tour).toContain("I’m looking for a warm introduction to share NimCarry with the Nimiq community.");
  });

  it("gives the destination a different invitation climax", () => {
    expect(tour).toContain("A letter has been carried to you.");
    expect(tour).toContain("Receive the letter");
    expect(tour).toContain("How should the arrival receipt remember you?");
    expect(tour).toContain("You were chosen to carry this letter.");
    expect(tour).toContain("Carry this letter");
  });

  it("demonstrates warm wax then postmark rather than jumping straight to FINAL", () => {
    expect(tour).toContain('phase: "verification-pending"');
    expect(tour).toContain("PRACTICE — warm wax.");
    expect(tour).toContain('phase: "final"');
    expect(tour).toContain("PRACTICE POSTMARK");
  });

  it("ends with a clear practice-only arrival artifact", () => {
    expect(tour).toContain("PRACTICE COMPLETE");
    expect(tour).toContain("2 simulated postmarks · 0 wallet writes");
    expect(css).toContain(".clv2-demo-finish");
  });

  it("preserves demo+tour identity after acceptance", () => {
    expect(demoUx).toContain('query.get("tour") === "1"');
    expect(demoUx).toContain('?demo=1${tour}');
  });

  it("proves the chosen direction in the real guided browser flow", () => {
    expect(smoke).toContain('page.locator("#demo-tour-rail")');
    expect(smoke).toContain("You were chosen to carry this letter.");
    expect(smoke).toContain("A letter has been carried to you.");
    expect(smoke).toContain('page.locator(".clv2-wax-scene.is-warm")');
    expect(smoke).toContain('page.locator(".clv2-demo-finish")');
  });
});
