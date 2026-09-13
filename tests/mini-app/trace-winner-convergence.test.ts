import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const css = readFileSync("web/trace-winner-convergence.css", "utf8");
const js = readFileSync("web/trace-winner-convergence.js", "utf8");

describe("TRACE winner-convergence candidate", () => {
  it("loads only as an additive presentation layer", () => {
    expect(html).toContain('href="/trace-winner-convergence.css"');
    expect(html).toContain('src="/trace-winner-convergence.js"');
    expect(js).not.toContain("fetch(");
    expect(js).not.toContain("sendBasicTransactionWithData");
    expect(js).not.toContain("nimiq.sign");
    expect(js).not.toContain("localStorage.setItem");
    expect(js).not.toContain("sessionStorage.setItem");
  });

  it("keeps NimCarry's anti-collision and custody truth explicit", () => {
    expect(js).toContain("One destination");
    expect(js).toContain("Accept ≠ payment");
    expect(js).toContain("Only FINAL changes custody");
    expect(js).toContain("Last independently verified holder");
  });

  it("uses rendered product state rather than manufacturing FINAL or ARRIVED", () => {
    expect(js).toContain('hero.querySelector(".target-title")');
    expect(js).toContain('hero.querySelector(".holder-chip strong")');
    expect(js).toContain('hero.querySelector(".status-pill")');
    expect(js).not.toContain("demoSave");
  });

  it("preserves mobile and reduced-motion constraints", () => {
    expect(css).toContain("@media(max-width:520px)");
    expect(css).toContain("prefers-reduced-motion:reduce");
    expect(css).toContain("min-height:46px");
  });
});
