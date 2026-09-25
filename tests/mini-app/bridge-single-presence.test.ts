import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("web/app.js", "utf8");

describe("mission bridge single-presence UX", () => {
  it("shows the confirmed path in one place only: the receipt", () => {
    const mission = app.slice(app.indexOf("function missionScene("), app.indexOf("function derivePrimaryAction("));
    expect(mission).not.toContain("routeMarkup(");
    expect(app.match(/routeMarkup\(m\.route/g)?.length).toBe(1);
  });

  it("represents a completed introduction as the single via mark, never as a holder", () => {
    expect(app).toContain("const bridgeMark = entry.via?.display_label || null;");
    expect(app).toContain("const who = bridgeMark ? `Introduced by ${bridgeMark}` : \"Sent directly\";");
    expect(app).toContain("1 NIM to ${esc(recipient)}");
    expect(app).toContain('data-current-holder="${isCurrentHolder ? "true" : "false"}"');
  });
});
