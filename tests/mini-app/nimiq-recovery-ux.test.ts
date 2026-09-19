import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const js = readFileSync("web/nimiq-recovery-ux.js", "utf8");
const css = readFileSync("web/nimiq-recovery-ux.css", "utf8");

describe("Nimiq Pay fail-closed recovery UX", () => {
  it("is wired into the approved runtime", () => {
    expect(html).toContain('href="/nimiq-recovery-ux.css"');
    expect(html).toContain('src="/nimiq-recovery-ux.js"');
  });

  it("cannot gain wallet, transaction, API, or storage authority", () => {
    expect(js).not.toContain("fetch(");
    expect(js).not.toContain("sendBasicTransactionWithData");
    expect(js).not.toContain("nimiq.sign");
    expect(js).not.toContain("localStorage.setItem");
    expect(js).not.toContain("sessionStorage.setItem");
  });

  it("keeps ambiguous submission fail-closed and blocks blind resend guidance", () => {
    expect(js).toContain("Don’t send a second baton yet.");
    expect(js).toContain("The route stays with the last verified holder unless FINAL is independently observed.");
    expect(js).toContain("Approval ≠ broadcast ≠ FINAL");
    expect(js).toContain("Do not resend the baton.");
  });

  it("explains when a full validity-window recheck proves no broadcast", () => {
    expect(js).toContain("Previous handoff safely closed");
    expect(js).toContain("No baton moved.");
    expect(js).toContain("No verified broadcast = no custody change");
    expect(js).toContain("prepare a fresh handoff");
  });

  it("guides verification of an unrecognized payment wallet before any 1 NIM request", () => {
    expect(js).toContain("Verify the payment wallet first");
    expect(js).toContain("NimCarry stopped before requesting 1 NIM.");
    expect(js).toContain("verified same-profile payment set");
    expect(js).toContain("Holder authorizes · verified wallet may pay · FINAL moves custody");
  });

  it("gives safe recovery paths for cancellation, wrong account, provider, and contract failures", () => {
    expect(js).toContain("The handoff was cancelled.");
    expect(js).toContain("Use the current holder wallet.");
    expect(js).toContain("The wallet connection is not ready.");
    expect(js).toContain("NimCarry refused to prepare this pass.");
    expect(js).toContain("Run provider check");
    expect(js).toContain("Check verified route");
  });

  it("stays responsive and reduced-motion safe", () => {
    expect(css).toContain("@media (min-width: 768px)");
    expect(css).toContain("@media (max-width: 520px)");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
