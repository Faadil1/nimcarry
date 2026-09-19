import { PrivateKey, PublicKey } from "@nimiq/core";
import { describe, expect, it } from "vitest";
import {
  MemoryUserDirectory,
  PRIVACY_NOTICE_VERSION,
  UserDirectoryError,
  newProfileToken,
  normalizeDisplayName,
  normalizeEmail,
  profileTokenHash,
} from "../../src/users/user-directory.js";

function wallet(): string {
  return PublicKey.derive(PrivateKey.generate()).toAddress().toUserFriendlyAddress();
}

describe("human user directory", () => {
  it("registers a NimCarry user without requiring a Nimiq wallet", async () => {
    const directory = new MemoryUserDirectory();
    const token = newProfileToken();
    const profile = await directory.register({
      email: "  PERSON@Example.com ",
      displayName: "  Person  Example ",
      tokenHash: profileTokenHash(token),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: 900,
      now: 1_000,
    });

    expect(profile.emailNormalized).toBe("person@example.com");
    expect(profile.displayName).toBe("Person Example");
    expect(profile.privacyNoticeVersion).toBe(PRIVACY_NOTICE_VERSION);
    expect(profile.privacyConsentAt).toBe(900);
    expect(await directory.walletsForUser(profile.id)).toEqual([]);
    expect(await directory.stats()).toEqual({
      registeredUsers: 1,
      consentedUsers: 1,
      walletLinkedUsers: 0,
      activatedUsers: 0,
      finalizedUsers: 0,
      protocolParticipants: 0,
    });
  });

  it("does not double-count the same email", async () => {
    const directory = new MemoryUserDirectory();
    await directory.register({
      email: "person@example.com",
      displayName: "Person",
      tokenHash: profileTokenHash(newProfileToken()),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: Date.now(),
    });

    await expect(directory.register({
      email: "PERSON@example.com",
      displayName: "Other",
      tokenHash: profileTokenHash(newProfileToken()),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: Date.now(),
    })).rejects.toMatchObject({ reason: "EMAIL_ALREADY_REGISTERED" });
  });

  it("links a verified wallet separately from registration", async () => {
    const directory = new MemoryUserDirectory();
    const profile = await directory.register({
      email: "person@example.com",
      displayName: "Person",
      tokenHash: profileTokenHash(newProfileToken()),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: Date.now(),
    });

    await directory.linkVerifiedWallet(profile.id, wallet());
    expect(await directory.walletsForUser(profile.id)).toHaveLength(1);
    expect((await directory.stats()).walletLinkedUsers).toBe(1);
  });

  it("consumes wallet-link challenges exactly once", async () => {
    const directory = new MemoryUserDirectory();
    const profile = await directory.register({
      email: "person@example.com",
      displayName: "Person",
      tokenHash: profileTokenHash(newProfileToken()),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: Date.now(),
    });
    const challenge = {
      id: "1c4a0b58-d667-44b7-b637-b8522480136a",
      userId: profile.id,
      walletNormalized: wallet(),
      nonceHash: "nonce",
      canonicalMessage: "message",
      expiresAt: 10_000,
      usedAt: null,
      createdAt: 1_000,
    };

    await directory.createWalletChallenge(challenge);
    await directory.consumeWalletChallenge(challenge.id, 2_000);
    await expect(directory.consumeWalletChallenge(challenge.id, 3_000))
      .rejects.toMatchObject({ reason: "USER_CHALLENGE_REPLAY" });
  });

  it("restores an existing profile through a second session without replacing the original token", async () => {
    const directory = new MemoryUserDirectory();
    const originalToken = newProfileToken();
    const profile = await directory.register({
      email: "returning@example.com",
      displayName: "Returning Person",
      tokenHash: profileTokenHash(originalToken),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: Date.now(),
      now: 1_000,
    });

    const secondToken = newProfileToken();
    await directory.createSession(profile.id, profileTokenHash(secondToken), 2_000);
    await directory.markEmailVerified(profile.id, 2_000);

    expect((await directory.getByTokenHash(profileTokenHash(originalToken)))?.id).toBe(profile.id);
    expect((await directory.getByTokenHash(profileTokenHash(secondToken)))?.id).toBe(profile.id);
    expect((await directory.getById(profile.id))?.emailVerifiedAt).toBe(2_000);
    expect((await directory.findByEmail(" RETURNING@EXAMPLE.COM "))?.id).toBe(profile.id);
  });

  it("locks and consumes returning-user login challenges safely", async () => {
    const directory = new MemoryUserDirectory();
    const profile = await directory.register({
      email: "returning@example.com",
      displayName: "Returning Person",
      tokenHash: profileTokenHash(newProfileToken()),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: Date.now(),
      now: 1_000,
    });

    await directory.createLoginChallenge({
      id: "51af699e-7a85-4b90-8183-c5e3ecfa8327",
      userId: profile.id,
      codeHash: "hash",
      expiresAt: 10_000,
      usedAt: null,
      attempts: 0,
      createdAt: 1_500,
    });

    expect((await directory.failLoginChallenge("51af699e-7a85-4b90-8183-c5e3ecfa8327"))?.attempts).toBe(1);
    await directory.consumeLoginChallenge("51af699e-7a85-4b90-8183-c5e3ecfa8327", 2_000);
    await expect(directory.consumeLoginChallenge("51af699e-7a85-4b90-8183-c5e3ecfa8327", 3_000))
      .rejects.toMatchObject({ reason: "LOGIN_CODE_REPLAY" });
  });

  it("validates human identity fields", () => {
    expect(normalizeEmail(" A@Example.COM ")).toBe("a@example.com");
    expect(normalizeDisplayName("  A   B  ")).toBe("A B");
    expect(() => normalizeEmail("not-an-email")).toThrow(UserDirectoryError);
  });
});
