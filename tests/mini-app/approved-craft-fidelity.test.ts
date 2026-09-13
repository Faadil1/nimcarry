import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const css = readFileSync("web/approved-craft-fidelity.css", "utf8");
const js = readFileSync("web/approved-craft-fidelity.js", "utf8");
const contract = readFileSync("docs/design/APPROVED-CRAFT-FIDELITY-CONTRACT.yaml", "utf8");

describe("approved craft fidelity production layer", () => {
  it("is wired as an additive presentation layer", () => {
    expect(html).toContain('href="/approved-craft-fidelity.css"');
    expect(html).toContain('src="/approved-craft-fidelity.js"');
    expect(js).not.toContain("fetch(");
    expect(js).not.toContain("sendBasicTransactionWithData");
    expect(js).not.toContain("nimiq.sign");
    expect(js).not.toContain("localStorage.setItem");
    expect(js).not.toContain("sessionStorage.setItem");
  });

  it("implements the approved human-route identity rather than a generic wallet", () => {
    expect(js).toContain("People move opportunity forward.");
    expect(js).toContain('line.append("One destination. "');
    expect(js).toContain('node("em", "", "Real people.")');
    expect(js).toContain('" A route you can follow."');
    expect(js).toContain("Pass the baton, not a reward.");
    expect(js).toContain("The people are the route.");
    expect(css).toContain("cf-human-route");
    expect(css).toContain("cf-person-portrait");
    expect(css).toContain("cf-baton");
  });

  it("keeps truth and consent semantics visible", () => {
    expect(js).toContain("Accepting is consent to participate — not consent to a payment.");
    expect(js).toContain("only independently verified FINAL moves custody");
    expect(js).toContain("Approval ≠ custody");
    expect(js).toContain("FINAL = custody");
    expect(contract).toContain("final_only_changes_custody: true");
    expect(contract).toContain("screenshot_based_ui: forbidden");
  });

  it("contains true responsive adaptations across required widths", () => {
    expect(css).toContain("@media(max-width:520px)");
    expect(css).toContain("@media(max-width:340px)");
    expect(css).toContain("@media(min-width:768px)");
    expect(css).toContain("@media(min-width:1024px)");
    expect(css).toContain("@media(min-width:1280px)");
    expect(css).toContain("@media(min-width:1440px)");
    expect(css).toContain("prefers-reduced-motion:reduce");
  });

  it("keeps desktop as a contextual adaptation instead of stretched mobile", () => {
    expect(css).toContain("grid-template-columns:minmax(0,1.04fr) minmax(380px,.96fr)");
    expect(css).toContain("cf-create-layout");
    expect(css).toContain("cf-invitation");
    expect(css).toContain("cf-pass");
    expect(css).toContain("cf-mission");
  });
});
