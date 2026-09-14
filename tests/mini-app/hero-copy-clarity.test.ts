import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const clarity = readFileSync("web/hero-copy-clarity.js", "utf8");

describe("hero copy clarity pass", () => {
  it("loads after the rest of the presentation layer", () => {
    expect(html).toContain('src="/hero-copy-clarity.js"');
    expect(html.indexOf('src="/demo-tour.js"')).toBeLessThan(html.indexOf('src="/hero-copy-clarity.js"'));
  });

  it("states the user job before the brand sentence", () => {
    expect(clarity).toContain("Get a warm introduction to someone you can’t reach directly.");
    expect(clarity).toContain("Choose one destination. Invite a trusted bridge. Exactly 1 NIM becomes the custody baton, and only verified FINAL moves the route forward.");
    expect(clarity).toContain("People move opportunity forward.");
  });

  it("keeps the mutation pass idempotent", () => {
    expect(clarity).toContain("node.textContent !== text");
    expect(clarity).toContain("requestAnimationFrame(applyHeroClarity)");
  });
});
