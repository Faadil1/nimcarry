import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const css = readFileSync("web/fable-51-mobile.css", "utf8");
const js = readFileSync("web/fable-51-mobile.js", "utf8");

describe("experimental Fable-inspired mobile UI", () => {
  it("loads only as a local presentation layer", () => {
    expect(html).toContain('href="/fable-51-mobile.css"');
    expect(html).toContain('src="/fable-51-mobile.js"');
    expect(js).not.toContain("fetch(");
    expect(js).not.toContain("sendBasicTransactionWithData");
    expect(js).not.toContain("nimiq.sign");
    expect(js).not.toContain("localStorage.setItem");
    expect(js).not.toContain("sessionStorage.setItem");
  });

  it("keeps core truth boundaries visible", () => {
    expect(js).toContain("FINAL-only custody");
    expect(js).toContain("Private route");
    expect(css).toContain("prefers-reduced-motion:reduce");
  });

  it("ships the branch-only custody instrument without changing application state", () => {
    expect(js).toContain("f51-orbit");
    expect(js).toContain("1 NIM");
    expect(js).toContain("custody baton");
    expect(js).toContain("aria-hidden");
  });
});
