import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const profile = readFileSync("web/user-profile.js", "utf8");
const migration = readFileSync("migrations/003_human_user_registry.sql", "utf8");

describe("human-first user onboarding surface", () => {
  it("loads the profile layer alongside the existing product app", () => {
    expect(html).toContain('src="/user-profile.js"');
    expect(profile).toContain("Join NimCarry without a wallet.");
    expect(profile).toContain("Name + email creates your NimCarry user profile.");
  });

  it("keeps wallet linking explicit and signed through Nimiq Pay", () => {
    expect(profile).toContain('getNimiqProvider');
    expect(profile).toContain('"/users/wallet/challenge"');
    expect(profile).toContain('nimiq.sign(challenge.message)');
    expect(profile).toContain('"/users/wallet/link"');
  });

  it("persists users and wallet links separately from mission participants", () => {
    expect(migration).toContain("CREATE TABLE users");
    expect(migration).toContain("CREATE TABLE user_wallets");
    expect(migration).toContain("CREATE TABLE user_wallet_challenges");
    expect(migration).toContain("CREATE VIEW participant_users");
    expect(migration).not.toContain("ALTER TABLE participants");
  });
});
