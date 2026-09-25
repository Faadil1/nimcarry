import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const profile = readFileSync("web/user-profile.js", "utf8");
const migration = readFileSync("migrations/003_human_user_registry.sql", "utf8");

describe("human-first user onboarding surface", () => {
  it("loads the profile layer alongside the existing product app", () => {
    expect(html).toContain('src="/user-profile.js"');
    expect(profile).toContain("Already have a NimCarry profile?");
    expect(profile).toContain("Create your profile without a wallet.");
    expect(profile).toContain('"/users/auth/request"');
    expect(profile).toContain('"/users/auth/verify"');
    expect(profile).toContain("Sign in to my profile");
    expect(profile).toContain("A name and email is enough to start.");
  });

  it("makes missing-code recovery explicit without revealing account existence", () => {
    expect(profile).toContain("If that exact email belongs to a NimCarry profile, a 6-digit code is on its way.");
    expect(profile).toContain("No code yet?");
    expect(profile).toContain("exact email originally registered with NimCarry");
    expect(profile).toContain("If you never created a NimCarry profile");
    expect(profile).toContain('role="status" aria-live="polite"');
    expect(profile).not.toContain("We found your account");
    expect(profile).not.toContain("No account exists");
  });

  it("persists only a minimal returning-user sign-in checkpoint across refreshes", () => {
    expect(profile).toContain("nimcarry.signInProgress");
    expect(profile).toContain("REQUESTING");
    expect(profile).toContain("CODE_SENT");
    expect(profile).toContain("VERIFYING");
    expect(profile).toContain("restoreSignInProgress");
    expect(profile).toContain("never persist the email address or one-time code");
    expect(profile).toContain("challenge_id");
    expect(profile).toContain("expires_at");
  });

  it("keeps wallet linking explicit and signed through Nimiq Pay", () => {
    expect(profile).toContain('getNimiqProvider');
    expect(profile).toContain('"/users/wallet/challenge"');
    expect(profile).toContain('nimiq.sign(challenge.message)');
    expect(profile).toContain('"/users/wallet/link"');
  });

  it("keeps multiwallet profile linking available after the first verified wallet", () => {
    expect(profile).toContain("Add another Nimiq wallet");
    expect(profile).toContain("wallets.map((wallet)");
    expect(profile).toContain('id="nimcarry-link-wallet"');
    expect(profile).toContain("wallets.length");
  });

  it("shows one human-readable Nimiq Pay notice instead of stacking provider errors", () => {
    expect(profile).toContain('nimcarry-wallet-link-notice');
    expect(profile).toContain("Open NimCarry inside Nimiq Pay to connect your wallet.");
    expect(profile).toContain('host.querySelector("#nimcarry-wallet-link-notice")');
    expect(profile).toContain('note.textContent = message');
  });

  it("lets provider injection recover after a failed browser attempt", () => {
    const provider = readFileSync("web/nimiq-provider.js", "utf8");
    expect(provider).toContain("providerPromise = undefined");
    expect(provider).toContain(".catch((error) =>");
  });

  it("persists users and wallet links separately from mission participants", () => {
    expect(migration).toContain("CREATE TABLE users");
    expect(migration).toContain("CREATE TABLE user_wallets");
    expect(migration).toContain("CREATE TABLE user_wallet_challenges");
    expect(migration).toContain("CREATE VIEW participant_users");
    expect(migration).not.toContain("ALTER TABLE participants");
  });
});
