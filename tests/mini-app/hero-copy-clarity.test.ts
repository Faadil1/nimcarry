import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const clarity = readFileSync("web/hero-copy-clarity.js", "utf8");

describe("hero copy clarity pass", () => {
  it("loads after the rest of the presentation layer", () => {
    expect(html).toContain('src="/hero-copy-clarity.js"');
    expect(html.indexOf('src="/demo-tour.js"')).toBeLessThan(html.indexOf('src="/hero-copy-clarity.js"'));
  });

  it("states the human outcome and route before the custody mechanism", () => {
    const outcome = "Get introduced to someone you can’t reach directly.";
    const explanation = "NimCarry helps trusted people carry your introduction from person to person until it reaches them.";
    const flow = "Create a mission → invite a trusted bridge → follow the route until it arrives.";
    const brand = "People move opportunity forward.";
    const mechanism = "Exactly 1 NIM acts as the custody baton underneath the route. Only verified FINAL moves custody.";

    expect(clarity).toContain(outcome);
    expect(clarity).toContain(explanation);
    expect(clarity).toContain(flow);
    expect(clarity).toContain(brand);
    expect(clarity).toContain(mechanism);
    expect(clarity.indexOf(outcome)).toBeLessThan(clarity.indexOf(mechanism));
    expect(clarity.indexOf(flow)).toBeLessThan(clarity.indexOf(mechanism));
  });

  it("keeps the mutation pass idempotent", () => {
    expect(clarity).toContain("node.textContent !== text");
    expect(clarity).toContain("requestAnimationFrame(applyHeroClarity)");
  });
});
