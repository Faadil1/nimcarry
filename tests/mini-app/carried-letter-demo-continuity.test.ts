import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const index = readFileSync("web/index.html", "utf8");
const app = readFileSync("web/app.js", "utf8");
const tour = readFileSync("web/demo-tour.js", "utf8");
const smoke = readFileSync("scripts/judge-flow-smoke.mjs", "utf8");

describe("NimCarry V2 guided-demo continuity", () => {
  it("does not ship literal newline escape artifacts in the HTML asset wiring", () => {
    expect(index).not.toContain("\\n");
    expect(index).toContain('<link rel="stylesheet" href="/carried-letter-v2.css" />');
    expect(index).toContain('<script src="/carried-letter-v2.js" defer></script>');
  });

  it("preserves demo and tour flags through app navigation", () => {
    expect(app).toContain("const preserveModePath = (path) =>");
    expect(app).toContain('if (state.demo) url.searchParams.set("demo", "1")');
    expect(app).toContain('if (query.get("tour") === "1") url.searchParams.set("tour", "1")');
    expect(app).toContain('history.pushState({}, "", preserveModePath(path))');
  });

  it("preserves practice flags in direct guided-tour transitions", () => {
    expect(tour).toContain("const tourPath = (path) =>");
    expect(tour).toContain('url.searchParams.set("demo", "1")');
    expect(tour).toContain('url.searchParams.set("tour", "1")');
    expect(tour).toContain("tourPath(`/mission/");
  });

  it("proves a browser refresh cannot silently turn practice into real mode", () => {
    expect(smoke).toContain('activeStep = "refresh-arrived-direct-route"');
    expect(smoke).toContain('await page.reload({ waitUntil: "networkidle"');
    expect(smoke).toContain('beforeRefresh.searchParams.get("demo") !== "1"');
    expect(smoke).toContain('afterRefresh.searchParams.get("tour") !== "1"');
    expect(smoke).toContain("refresh-preserved-direct-arrival");
  });
});
