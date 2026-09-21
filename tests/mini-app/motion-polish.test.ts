import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(join(root, "web", "nimcarry-motion.css"), "utf8");
const js = readFileSync(join(root, "web", "nimcarry-motion.js"), "utf8");
const html = readFileSync(join(root, "web", "index.html"), "utf8");
const brief = readFileSync(join(root, "docs", "design", "NIMCARRY-MOTION-POLISH-V1.md"), "utf8");

describe("NimCarry motion polish v1", () => {
  it("loads after the carried-letter visual system", () => {
    expect(html).toContain('<link rel="stylesheet" href="/nimcarry-motion.css" />');
    expect(html).toContain('<script src="/nimcarry-motion.js" defer></script>');
    expect(html.indexOf("/nimcarry-motion.css")).toBeGreaterThan(html.indexOf("/carried-letter-v2.css"));
    expect(html.indexOf("/nimcarry-motion.js")).toBeGreaterThan(html.indexOf("/carried-letter-v2.js"));
  });

  it("animates canonical state without inventing product truth", () => {
    expect(js).toContain('const FLOW_KEY = "nimcarry.motion.flow-index.v1"');
    expect(js).toContain(".wi-flow-step.current");
    expect(js).toContain('[data-destination-claim-status="PENDING"] #claim-destination');
    expect(js).toContain(".status-pill.arrived,.clv2-postmark,.clv2-arrival-close");
    expect(js).not.toContain("ARRIVED =");
    expect(js).not.toContain("FINAL =");
  });

  it("uses one-shot state motion rather than decorative looping", () => {
    expect(css).toContain("@keyframes nc-paper-enter");
    expect(css).toContain("@keyframes nc-current-settle");
    expect(css).toContain("@keyframes nc-claim-ready");
    expect(css).toContain("@keyframes nc-final-land");
    expect(css).not.toMatch(/animation:[^;\n]*infinite/i);
  });

  it("keeps reduced-motion parity", () => {
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain("animation:none!important");
    expect(css).toContain("transition:none!important");
    expect(css).toContain(".nc-flow-glider{display:none!important}");
  });

  it("documents explicit motion grammar and guardrails", () => {
    expect(brief).toContain("TARGET");
    expect(brief).toContain("TRIGGER");
    expect(brief).toContain("MOTION");
    expect(brief).toContain("REDUCED MOTION");
    expect(brief).toContain("Only backend-derived FINAL/ARRIVED state");
    expect(brief).toContain("Mobile remains the first acceptance surface");
  });
});
