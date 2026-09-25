import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("web/app.js", "utf8");
const ui = readFileSync("web/nc-ui.js", "utf8");
const css = readFileSync("web/nimcarry.css", "utf8");
const html = readFileSync("web/index.html", "utf8");
const profile = readFileSync("web/user-profile.js", "utf8");

describe("NimCarry letter interface", () => {
  it("renders without inline style attributes (the dev CSP forbids them)", () => {
    for (const source of [app, ui, profile]) expect(source).not.toContain('style="');
  });

  it("self-hosts its fonts instead of calling a third-party font service", () => {
    for (const font of ["fraunces", "fraunces-italic", "instrument-sans", "caveat", "space-mono-400", "space-mono-700"]) {
      expect(existsSync(`web/fonts/${font}.woff2`)).toBe(true);
    }
    expect(css).toContain('src:url("/fonts/fraunces.woff2")');
    expect(css + html).not.toContain("fonts.googleapis.com");
  });

  it("keeps the original palette as screen grounds", () => {
    for (const ground of ["forest", "night", "vermilion", "ochre", "indigo", "paper", "arrived"]) {
      expect(css).toContain(`body[data-ground="${ground}"]`);
    }
    expect(css).toContain("--forest:#183f36");
    expect(css).toContain("--vermilion:#a94f37");
    expect(ui).toContain("export function setGround(name)");
  });

  it("shows the sender a waiting stamp and the recipient an addressed letter", () => {
    expect(ui).toContain('if (state === "sealed") return `<div class="nc-stamp nc-stamp--waiting"');
    expect(app).toContain('state: "incoming"');
    expect(css).toContain('.nc-letter[data-state="incoming"] .nc-seal');
  });

  it("morphs the letter between screens only where supported and motion is allowed", () => {
    expect(app).toContain('typeof document.startViewTransition === "function" && !reducedMotion()');
    expect(css).toContain("view-transition-name:nc-letter");
  });

  it("keeps the account forms folded on home and out of practice mode", () => {
    expect(profile).toContain('sheet.className = "nc-account"');
    expect(profile).toContain('new URLSearchParams(location.search).get("demo") !== "1"');
    // The versioned privacy consent text is unchanged.
    expect(profile).toContain("I agree to NimCarry storing my name and email to create my profile and measure real product usage.");
  });
});

describe("NimCarry live wax seal", () => {
  const wax = readFileSync("web/nc-wax.js", "utf8");

  it("is presentation-only", () => {
    expect(wax).not.toContain("fetch(");
    expect(wax).not.toContain("localStorage");
    expect(wax).not.toContain("sessionStorage");
    expect(wax).not.toContain("import ");
  });

  it("falls back to the SVG seal without WebGL and never animates with reduced motion", () => {
    expect(wax).toContain('canvas.getContext("webgl"');
    expect(wax).toContain("if (!renderer) return;");
    expect(wax).toContain('if (reduced()) { paint(2.0); return; }');
    expect(css).toContain(".is-wax>svg{visibility:hidden}");
  });

  it("pauses when the page is hidden and skips seals off screen", () => {
    expect(wax).toContain('document.visibilityState === "visible"');
    expect(wax).toContain("rect.bottom < 0 || rect.top > innerHeight");
  });
});
