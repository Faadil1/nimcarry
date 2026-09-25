import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const onboarding = readFileSync("web/wallet-onboarding.js", "utf8");

describe("human-first Nimiq wallet onboarding", () => {
  it("loads after the core app so onboarding only enhances rendered product states", () => {
    expect(html).toContain('src="/wallet-onboarding.js"');
    expect(html.indexOf('src="/app.js"')).toBeLessThan(html.indexOf('src="/wallet-onboarding.js"'));
  });

  it("separates NimCarry user identity from Nimiq protocol custody", () => {
    expect(onboarding).toContain("Your NimCarry profile is just a name and email.");
    expect(onboarding).toContain("To send, you approve the payment in Nimiq Pay.");
    // The payment-link flow must never tell senders they need the recipient's address up front.
    expect(onboarding).not.toContain("still needs a known Nimiq destination");
  });

  it("lets invitees register human-first and connect Nimiq only before custody", () => {
    expect(onboarding).toContain("You can join NimCarry before you have Nimiq.");
    expect(onboarding).toContain("name + email NimCarry profile");
    expect(onboarding).toContain("connect or create a Nimiq wallet in Nimiq Pay");
    expect(onboarding).toContain("https://www.nimiq.com/nimiq-pay/");
    expect(onboarding).toContain("https://www.nimiq.com/wallet/");
  });

  it("does not gain authority over mission, signing, or transaction state", () => {
    expect(onboarding).not.toContain("sendBasicTransactionWithData");
    expect(onboarding).not.toContain("nimiq.sign");
    expect(onboarding).not.toContain("/missions");
    expect(onboarding).not.toContain("FINAL");
  });
});
