import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const winning = readFileSync("web/winning-intelligence.js", "utf8");

describe("route finality note dedupe", () => {
  it("keeps the zero-hop finality note inside the route card", () => {
    expect(winning).toContain('screen.querySelectorAll(".wi-finality-note").forEach');
    expect(winning).toContain('if (!routeCard.contains(note)) note.remove()');
    expect(winning).toContain('routeCard.insertBefore(note, buttons)');
    expect(winning).toContain('routeCard.appendChild(note)');
    expect(winning).not.toContain('(route || routeCard).after(note)');
  });

  it("removes the pending-only note when the route becomes ARRIVED", () => {
    expect(winning).toContain('screen.querySelectorAll(".wi-finality-note").forEach((note) => note.remove())');
  });
});
