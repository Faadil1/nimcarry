import { PrivateKey, PublicKey } from "@nimiq/core";
import { describe, expect, it } from "vitest";
import {
  MemoryUserDirectory,
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
      now: 1_000,
    });

    expect(profile.emailNormalized).toBe("person@example.com");
    expect(profile.displayName).toBe("Person Example");
    expect(await directory.walletsForUser(profile.id)).toEqual([]);
    expect(await directory.stats()).toEqual({
      registeredUsers: 1,
      walletLinkedUsers: 0,
      protocolParticipants: 0,
    });
  });

  it("does not double-count the same email", async () => {
    const directory = new MemoryUserDirectory();
    await directory.register({
      email: "person@example.com",
      displayName: "Person",
      tokenHash: profileTokenHash(newProfileToken()),
    });

    await expect(directory.register({
      email: "PERSON@example.com",
      displayName: "Other",
      tokenHash: profileTokenHash(newProfileToken()),
    })).rejects.toMatchObject({ reason: "EMAIL_ALREADY_REGISTERED" });
  });

  it("links a verified wallet separately from registration", async () => {
    const directory = new MemoryUserDirectory();
    const profile = await directory.register({
      email: "person@example.com",
      displayName: "Person",
      tokenHash: profileTokenHash(newProfileToken()),
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

  it("validates human identity fields", () => {
    expect(normalizeEmail(" A@Example.COM ")).toBe("a@example.com");
    expect(normalizeDisplayName("  A   B  ")).toBe("A B");
    expect(() => normalizeEmail("not-an-email")).toThrow(UserDirectoryError);
  });
});
