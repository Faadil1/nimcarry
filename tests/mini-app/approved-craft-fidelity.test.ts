import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const css = readFileSync("web/final-human-craft.css", "utf8");
const js = readFileSync("web/final-human-craft.js", "utf8");
const logo = readFileSync("web/nimcarry-mark.svg", "utf8");
const contract = readFileSync("docs/design/APPROVED-CRAFT-FIDELITY-CONTRACT.yaml", "utf8");

describe("final human-craft product identity", () => {
  it("cuts legacy visual experiment layers and wires only the chosen direction", () => {
    expect(html).toContain('href="/final-human-craft.css"');
    expect(html).toContain('src="/final-human-craft.js"');
    expect(html).not.toContain('href="/living-route.css"');
    expect(html).not.toContain('href="/trace-winner-convergence.css"');
    expect(html).not.toContain('href="/mature-positioning.css"');
    expect(html).not.toContain('href="/approved-craft-fidelity.css"');
    expect(html).not.toContain('src="/living-route.js"');
    expect(html).not.toContain('src="/trace-winner-convergence.js"');
    expect(html).not.toContain('src="/mature-positioning.js"');
    expect(html).not.toContain('src="/approved-craft-fidelity.js"');
    expect(html).not.toContain('src="/approved-craft-polish.js"');
  });

  it("is presentation-only and cannot change custody authority", () => {
    expect(js).not.toContain("fetch(");
    expect(js).not.toContain("sendBasicTransactionWithData");
    expect(js).not.toContain("nimiq.sign");
    expect(js).not.toContain("localStorage.setItem");
    expect(js).not.toContain("sessionStorage.setItem");
  });

  it("locks the mature product positioning", () => {
    expect(js).toContain("People move opportunity forward.");
    expect(js).toContain("Warm introductions");
    expect(js).toContain("Referrals");
    expect(js).toContain("Opportunities");
    expect(js).toContain("Community access");
    expect(js).toContain("One destination");
    expect(js).toContain("The introduction is the valuable thing");
    expect(html).toContain("Real people · one destination");
  });

  it("keeps consent, baton and FINAL semantics explicit", () => {
    expect(js).toContain("Accepting means you consent to participate — it does not move funds.");
    expect(js).toContain("It is not a reward.");
    expect(js).toContain("Approval or broadcast is not custody.");
    expect(js).toContain("FINAL = custody");
    expect(contract).toContain("final_only_changes_custody: true");
    expect(contract).toContain("screenshot_based_ui: forbidden");
  });

  it("uses the new organic human-craft brand mark instead of the old route-dot mark", () => {
    expect(logo).toContain("#183f36");
    expect(logo).toContain("#a94f37");
    expect(logo).toContain("#c4933f");
    expect(logo).not.toContain("1</text>");
  });

  it("contains true mobile tablet and desktop adaptations", () => {
    expect(css).toContain("@media(max-width:520px)");
    expect(css).toContain("@media(max-width:340px)");
    expect(css).toContain("@media(min-width:768px)");
    expect(css).toContain("@media(min-width:1024px)");
    expect(css).toContain("@media(min-width:1280px)");
    expect(css).toContain("@media(min-width:1440px)");
    expect(css).toContain("prefers-reduced-motion:reduce");
    expect(css).toContain("hc-create-layout");
    expect(css).toContain("hc-invitation");
    expect(css).toContain("hc-pass");
    expect(css).toContain("hc-route-arrived");
  });
});
