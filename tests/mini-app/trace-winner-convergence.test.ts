import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const finalCss = readFileSync("web/final-human-craft.css", "utf8");
const finalJs = readFileSync("web/final-human-craft.js", "utf8");
const legacyCss = readFileSync("web/trace-winner-convergence.css", "utf8");
const legacyJs = readFileSync("web/trace-winner-convergence.js", "utf8");

describe("TRACE convergence promotion into final human-craft runtime", () => {
  it("keeps the convergence experiment as provenance but does not load it in the final runtime", () => {
    expect(legacyCss.length).toBeGreaterThan(0);
    expect(legacyJs.length).toBeGreaterThan(0);
    expect(html).not.toContain('href="/trace-winner-convergence.css"');
    expect(html).not.toContain('src="/trace-winner-convergence.js"');
    expect(html).toContain('href="/final-human-craft.css"');
    expect(html).toContain('src="/final-human-craft.js"');
  });

  it("keeps the anti-collision and custody truths after visual cutover", () => {
    expect(finalJs).toContain("One destination");
    expect(finalJs).toContain("Accepting means you consent to participate — it does not move funds.");
    expect(finalJs).toContain("Approval or broadcast is not custody.");
    expect(finalJs).toContain("FINAL = custody");
    expect(finalJs).toContain("last verified holder");
  });

  it("uses rendered product state rather than manufacturing FINAL or ARRIVED", () => {
    expect(finalJs).toContain('hero.querySelector(".target-title")');
    expect(finalJs).toContain('hero.querySelector(".holder-chip strong")');
    expect(finalJs).toContain('card.querySelector(".status-pill")');
    expect(finalJs).not.toContain("demoSave");
    expect(finalJs).not.toContain("fetch(");
  });

  it("preserves mobile, desktop and reduced-motion constraints in the promoted identity", () => {
    expect(finalCss).toContain("@media(max-width:520px)");
    expect(finalCss).toContain("@media(min-width:1024px)");
    expect(finalCss).toContain("prefers-reduced-motion:reduce");
    expect(finalCss).toContain("min-height:46px");
  });
});
