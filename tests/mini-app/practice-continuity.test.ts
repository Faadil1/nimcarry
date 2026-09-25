import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const index = readFileSync("web/index.html", "utf8");
const app = readFileSync("web/app.js", "utf8");
const smoke = readFileSync("scripts/judge-flow-smoke.mjs", "utf8");

describe("NimCarry practice-mode continuity", () => {
  it("does not ship literal newline escape artifacts in the HTML asset wiring", () => {
    expect(index).not.toContain("\\n");
    expect(index).toContain('<link rel="stylesheet" href="/nimcarry.css" />');
  });

  it("preserves demo and tour flags through app navigation", () => {
    expect(app).toContain("const preserveModePath = (path) =>");
    expect(app).toContain('if (state.demo) url.searchParams.set("demo", "1")');
    expect(app).toContain('if (query.get("tour") === "1") url.searchParams.set("tour", "1")');
    expect(app).toContain('history.pushState({}, "", preserveModePath(path))');
  });

  it("keeps practice flags on the links that switch perspective", () => {
    // Opening the practice introduction link keeps demo + tour on the URL.
    expect(app).toContain("preserveModePath(`/i/${created.invite_token}`)");
    // Opening the practice payment link goes through navigate(), which preserves the flags.
    expect(app).toContain("navigate(`/c/${encodeURIComponent(demoClaimToken(m.mission_id))}`)");
  });

  it("proves a browser refresh cannot silently turn practice into real mode", () => {
    expect(smoke).toContain('activeStep = "refresh-arrived"');
    expect(smoke).toContain('await page.reload({ waitUntil: "networkidle"');
    expect(smoke).toContain('afterRefresh.searchParams.get("demo") !== "1"');
  });
});
