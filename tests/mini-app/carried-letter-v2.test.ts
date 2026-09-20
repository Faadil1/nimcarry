import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const js = readFileSync("web/carried-letter-v2.js", "utf8");
const css = readFileSync("web/carried-letter-v2.css", "utf8");
const smoke = readFileSync("scripts/judge-flow-smoke.mjs", "utf8");

describe("NimCarry V2 carried-letter foundation", () => {
  it("loads the V2 convergence layer after the existing product presentation layers", () => {
    expect(html).toContain('href="/carried-letter-v2.css"');
    expect(html).toContain('src="/carried-letter-v2.js"');
    expect(html.indexOf('src="/hero-copy-clarity.js"')).toBeLessThan(html.indexOf('src="/carried-letter-v2.js"'));
  });

  it("is presentation-only and cannot gain mission, wallet, transaction, or storage authority", () => {
    expect(js).not.toContain("fetch(");
    expect(js).not.toContain("sendBasicTransactionWithData");
    expect(js).not.toContain("nimiq.sign");
    expect(js).not.toContain("localStorage.setItem");
    expect(js).not.toContain("sessionStorage.setItem");
    expect(js).not.toContain("/missions/");
  });

  it("makes the first five seconds human-first", () => {
    expect(js).toContain("Get introduced to someone you can’t reach directly.");
    expect(js).toContain("You write it. Someone you trust carries it");
    expect(js).toContain("Write a letter");
    expect(js).toContain("The introduction is the thing being carried.");
    expect(js).not.toContain('text(hero.querySelector("h1"), "People move opportunity forward."');
  });

  it("keeps Nimiq visible but progressively disclosed", () => {
    expect(js).toContain("An independent record — the Nimiq network — verifies every handover before it counts.");
    expect(js).toContain("Nimiq Pay authorization is the consent proof.");
    expect(js).toContain("Approval can open delivery. Broadcast can make it observable. Only independent FINAL proves arrival.");
    expect(html).toContain('id="network-label"');
  });

  it("makes demo screenshots unambiguously practice-only", () => {
    expect(js).toContain("PRACTICE DESK — simulated route · no wallet or network writes");
    expect(css).toContain('content:"PRACTICE LETTER"');
    expect(css).toContain("--cl-indigo");
    expect(css).toContain(".carried-letter-v2-demo");
  });

  it("humanizes fail-closed route errors without manufacturing route state", () => {
    expect(js).toContain("There’s no letter here.");
    expect(js).toContain("Nothing has moved");
    expect(js).toContain("ROUTE_VIEW_CAPABILITY_");
    expect(js).not.toContain("demoSave");
  });

  it("preserves privacy and FINAL semantics in the new metaphor", () => {
    expect(js).toContain("Their address stays sealed from every carrier.");
    expect(js).toContain("Only independently verified handoffs are inked onto this letter.");
    expect(js).toContain("The bridge introduces the route; the bridge never receives custody.");
    expect(js).toContain("The 1 NIM is sent to the destination, not paid to the bridge.");
  });

  it("supports mobile, deliberate desktop composition and reduced motion", () => {
    expect(css).toContain("@media(max-width:640px)");
    expect(css).toContain("@media(max-width:380px)");
    expect(css).toContain("@media(min-width:1024px)");
    expect(css).toContain("@media(min-width:1440px)");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain("width:min(1240px,calc(100% - 52px))");
    expect(css).toContain('.screen[data-clv2-screen="mission"]');
    expect(css).toContain('.screen[data-clv2-screen="route"]>.clv2-route');
    expect(css).toContain(".clv2-seal-handoff .hc-max-pass-stage");
    expect(js).toContain("screen.dataset.clv2Screen = mode");
    expect(js).toContain('hero.querySelector(".hc-max-home-story")');
  });

  it("proves responsive geometry across the full judge journey", () => {
    expect(smoke).toContain("desktop shell stayed mobile-width");
    expect(smoke).toContain("horizontal overflow");
    expect(smoke).toContain('"01-home"');
    expect(smoke).toContain('"03-mission"');
    expect(smoke).toContain('"05-handoff"');
    expect(smoke).toContain('"07-arrived-direct"');
  });
});