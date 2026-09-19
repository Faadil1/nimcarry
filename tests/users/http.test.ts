import { createServer } from "node:http";
import { PrivateKey, PublicKey, Signature } from "@nimiq/core";
import { afterEach, describe, expect, it } from "vitest";
import { nimiqSignedMessageDigest } from "../../src/mission/wallet-auth.js";
import { MemoryUserEmailSender } from "../../src/users/email-auth.js";
import { createNimCarryHttpServer } from "../../src/users/http.js";
import { MemoryUserDirectory } from "../../src/users/user-directory.js";

const closers: Array<() => Promise<void>> = [];

async function listen(emailSender = new MemoryUserEmailSender()) {
  const missionServer = createServer((_req, res) => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "MISSION_FALLBACK" }));
  });
  const directory = new MemoryUserDirectory();
  const server = createNimCarryHttpServer(missionServer, directory, "https://nimcarry.example", emailSender);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server address unavailable");
  closers.push(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return { base: `http://127.0.0.1:${address.port}`, directory, emailSender };
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
      metric_policy_version: "real-usage-v2",
      registered_users: 1,
      consented_users: 1,
      nimiq_verified_users: 0,
      wallet_linked_users: 0,
      activated_users: 0,
      finalized_users: 0,
      protocol_participants: 0,
    });
  });

  it("restores an existing user with a one-time email code without replacing the old session", async () => {
    const sender = new MemoryUserEmailSender();
    const { base } = await listen(sender);
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
    const originalToken = registered.body.user_token as string;

    const requested = await json(base, "/users/login/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "YASMINE@example.com" }),
    });
    expect(requested.status).toBe(202);
    expect(requested.body.status).toBe("CODE_SENT_IF_ACCOUNT_EXISTS");
    expect(sender.sent).toHaveLength(1);

    const verified = await json(base, "/users/login/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: requested.body.request_id,
        code: sender.sent[0].code,
      }),
    });
    expect(verified.status).toBe(200);
    expect(verified.body.user_id).toBe(registered.body.user_id);
    expect(verified.body.user_status).toBe("RETURNING_USER");
    expect(verified.body.email_verified).toBe(true);
    expect(verified.body.user_token).not.toBe(originalToken);

    const originalSession = await json(base, "/users/me", {
      headers: { "X-NimCarry-User-Token": originalToken },
    });
    expect(originalSession.status).toBe(200);

    const newSession = await json(base, "/users/me", {
      headers: { "X-NimCarry-User-Token": verified.body.user_token },
    });
    expect(newSession.status).toBe(200);

    const replay = await json(base, "/users/login/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: requested.body.request_id,
        code: sender.sent[0].code,
      }),
    });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe("LOGIN_CODE_INVALID");
  });

  it("does not reveal whether an unknown email has a profile", async () => {
    const sender = new MemoryUserEmailSender();
    const { base } = await listen(sender);
    const requested = await json(base, "/users/login/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unknown@example.com" }),
    });

    expect(requested.status).toBe(202);
    expect(requested.body.status).toBe("CODE_SENT_IF_ACCOUNT_EXISTS");
    expect(requested.body.request_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sender.sent).toHaveLength(0);
  });

  it("fails closed when transactional email is not configured", async () => {
    const { base } = await listen(new MemoryUserEmailSender(false));
    const response = await json(base, "/users/login/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "yasmine@example.com" }),
    });
    expect(response.status).toBe(503);
    expect(response.body.error).toBe("EMAIL_SIGNIN_UNAVAILABLE");
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
    expect(stats.body.nimiq_verified_users).toBe(1);
    expect(stats.body.wallet_linked_users).toBe(1);
    expect(stats.body.activated_users).toBe(0);
    expect(stats.body.finalized_users).toBe(0);
    expect(stats.body.assurance).toMatchObject({
      nimiq_verified_users: "valid_nimiq_wallet_signature",
      activated_users: "verified_wallet_plus_post_verification_mission_create_accept_or_final",
      finalized_users: "verified_wallet_plus_post_verification_finalized_hop",
    });
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
