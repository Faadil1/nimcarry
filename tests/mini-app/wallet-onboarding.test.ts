import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const onboarding = readFileSync("web/wallet-onboarding.js", "utf8");

describe("first-time Nimiq wallet onboarding", () => {
  it("loads after the core app so onboarding only enhances rendered product states", () => {
    expect(html).toContain('src="/wallet-onboarding.js"');
    expect(html.indexOf('src="/app.js"')).toBeLessThan(html.indexOf('src="/wallet-onboarding.js"'));
  });

  it("explains that NimCarry uses wallet identity rather than a separate account", () => {
    expect(onboarding).toContain("No separate NimCarry signup.");
    expect(onboarding).toContain("NimCarry uses Nimiq wallet identity instead of an email/password account.");
    expect(onboarding).toContain("The destination must have a Nimiq address before the mission starts");
  });

  it("gives first-time users an explicit Nimiq setup path and lets invitees return to the same invite", () => {
    expect(onboarding).toContain("https://www.nimiq.com/nimiq-pay/");
    expect(onboarding).toContain("https://www.nimiq.com/wallet/");
    expect(onboarding).toContain('document.querySelector("#accept")');
    expect(onboarding).toContain("reopen this same private invitation");
    expect(onboarding).toContain("MutationObserver");
  });

  it("does not gain authority over mission, signing, or transaction state", () => {
    expect(onboarding).not.toContain("sendBasicTransactionWithData");
    expect(onboarding).not.toContain("nimiq.sign");
    expect(onboarding).not.toContain("/missions");
    expect(onboarding).not.toContain("FINAL");
  });
});
