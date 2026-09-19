import { createServer } from "node:http";
import { PrivateKey, PublicKey, Signature } from "@nimiq/core";
import { afterEach, describe, expect, it } from "vitest";
import { nimiqSignedMessageDigest } from "../../src/mission/wallet-auth.js";
import { createNimCarryHttpServer } from "../../src/users/http.js";
import { MemoryUserDirectory } from "../../src/users/user-directory.js";

const closers: Array<() => Promise<void>> = [];

async function listen() {
  const missionServer = createServer((_req, res) => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "MISSION_FALLBACK" }));
  });
  const directory = new MemoryUserDirectory();
  const server = createNimCarryHttpServer(missionServer, directory, "https://nimcarry.example");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server address unavailable");
  closers.push(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return { base: `http://127.0.0.1:${address.port}`, directory };
}

async function json(base: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, init);
  const body = await response.json();
  return { status: response.status, body };
}

function signer() {
  const privateKey = PrivateKey.generate();
  const publicKey = PublicKey.derive(privateKey);
  return {
    privateKey,
    publicKey,
    address: publicKey.toAddress().toUserFriendlyAddress(),
  };
}

afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

describe("human user HTTP API", () => {
  it("refuses profile creation without explicit current privacy consent", async () => {
    const { base } = await listen();
    const response = await json(base, "/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Yasmine", email: "yasmine@example.com" }),
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: "PRIVACY_CONSENT_REQUIRED" });
  });

  it("registers a user without a wallet and counts them immediately", async () => {
    const { base } = await listen();
    const registered = await json(base, "/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Yasmine",
        email: "yasmine@example.com",
        privacy_consent: true,
        privacy_notice_version: "2026-09-19",
      }),
    });

    expect(registered.status).toBe(201);
    expect(registered.body).toMatchObject({
      display_name: "Yasmine",
      email: "yasmine@example.com",
      wallet_linked: false,
      user_status: "REGISTERED",
    });
    expect(registered.body.user_token).toMatch(/^[A-Za-z0-9_-]{32,}$/);

    const stats = await json(base, "/users/stats");
    expect(stats.body).toMatchObject({
      registered_users: 1,
      wallet_linked_users: 0,
      protocol_participants: 0,
    });
  });

  it("links a Nimiq wallet only after a valid wallet signature", async () => {
    const { base } = await listen();
    const registered = await json(base, "/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Yasmine",
        email: "yasmine@example.com",
        privacy_consent: true,
        privacy_notice_version: "2026-09-19",
      }),
    });
    const token = registered.body.user_token as string;
    const s = signer();

    const challenge = await json(base, "/users/wallet/challenge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NimCarry-User-Token": token,
      },
      body: JSON.stringify({ wallet: s.address }),
    });
    expect(challenge.status).toBe(200);

    const signature = Signature.create(
      s.privateKey,
      s.publicKey,
      nimiqSignedMessageDigest(challenge.body.message as string)
    ).toHex();

    const linked = await json(base, "/users/wallet/link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NimCarry-User-Token": token,
      },
      body: JSON.stringify({
        challenge_id: challenge.body.challenge_id,
        public_key: s.publicKey.toHex(),
        signature,
      }),
    });

    expect(linked.status).toBe(200);
    expect(linked.body.wallet_linked).toBe(true);
    expect(linked.body.wallets).toHaveLength(1);

    const stats = await json(base, "/users/stats");
    expect(stats.body.wallet_linked_users).toBe(1);
  });

  it("lets a user delete their profile with the profile token", async () => {
    const { base } = await listen();
    const registered = await json(base, "/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Yasmine",
        email: "yasmine@example.com",
        privacy_consent: true,
        privacy_notice_version: "2026-09-19",
      }),
    });
    const token = registered.body.user_token as string;

    const deleted = await json(base, "/users/me", {
      method: "DELETE",
      headers: { "X-NimCarry-User-Token": token },
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body.deleted).toBe(true);

    const stats = await json(base, "/users/stats");
    expect(stats.body.registered_users).toBe(0);

    const me = await json(base, "/users/me", {
      headers: { "X-NimCarry-User-Token": token },
    });
    expect(me.status).toBe(401);
    expect(me.body.error).toBe("USER_TOKEN_INVALID");
  });

  it("delegates non-user routes to the existing mission server unchanged", async () => {
    const { base } = await listen();
    const response = await json(base, "/health");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "MISSION_FALLBACK" });
  });
});
