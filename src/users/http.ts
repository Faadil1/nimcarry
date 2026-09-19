import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { PublicKey, Signature } from "@nimiq/core";
import { normalizeNimiqAddress } from "../mission/target-wallet-crypto.js";
import { nimiqSignedMessageDigest } from "../mission/wallet-auth.js";
import {
  PRIVACY_NOTICE_VERSION,
  UserDirectoryError,
  newProfileToken,
  profileTokenHash,
  type UserDirectory,
  type UserProfile,
} from "./user-directory.js";
import { DisabledUserEmailSender, type UserEmailSender } from "./email-sender.js";

const MAX_BODY_BYTES = 8 * 1024;
const WALLET_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const LOGIN_CODE_TTL_MS = 10 * 60 * 1000;
const LOGIN_CODE_RE = /^\d{6}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^[0-9a-fA-F]+$/;

interface HitBucket {
  startedAt: number;
  count: number;
}
const hits = new Map<string, HitBucket>();

function allow(key: string, limit: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const current = hits.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    hits.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  if (current.count <= limit) return { allowed: true, retryAfter: 0 };
  return { allowed: false, retryAfter: Math.max(1, Math.ceil((60_000 - (now - current.startedAt)) / 1000)) };
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": String(Buffer.byteLength(payload)),
    ...headers,
  });
  res.end(payload);
}

async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new UserDirectoryError("BODY_TOO_LARGE", "User request body is too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new UserDirectoryError("INVALID_JSON", "Request body must be valid JSON");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new UserDirectoryError("INVALID_BODY", "Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, name: string, max: number): string {
  if (typeof value !== "string") throw new UserDirectoryError("INVALID_FIELD", `${name} must be a string`);
  const text = value.trim();
  if (!text || text.length > max) throw new UserDirectoryError("INVALID_FIELD", `${name} is invalid`);
  return text;
}

function userToken(req: IncomingMessage): string | null {
  const raw = req.headers["x-nimcarry-user-token"];
  const token = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!token || !TOKEN_RE.test(token)) return null;
  return token;
}

async function requireUser(req: IncomingMessage, directory: UserDirectory): Promise<UserProfile> {
  const token = userToken(req);
  if (!token) throw new UserDirectoryError("USER_TOKEN_REQUIRED", "A NimCarry user profile token is required");
  const profile = await directory.getByTokenHash(profileTokenHash(token));
  if (!profile) throw new UserDirectoryError("USER_TOKEN_INVALID", "NimCarry user profile token is invalid");
  await directory.touch(profile.id);
  return profile;
}

function profilePayload(profile: UserProfile, wallets: string[]) {
  return {
    user_id: profile.id,
    display_name: profile.displayName,
    email: profile.emailNormalized,
    email_verified: profile.emailVerifiedAt !== null,
    privacy_notice_version: profile.privacyNoticeVersion,
    privacy_consent_at: new Date(profile.privacyConsentAt).toISOString(),
    wallet_linked: wallets.length > 0,
    wallets: wallets.map((wallet) => ({
      fingerprint: wallet.length > 16 ? `${wallet.slice(0, 7)}…${wallet.slice(-5)}` : wallet,
      verified: true,
    })),
    created_at: new Date(profile.createdAt).toISOString(),
  };
}

function ip(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "unknown";
}

function loginCodeHash(secret: string, challengeId: string, code: string): string {
  return createHmac("sha256", secret)
    .update("nimcarry-login-code:v1\n", "utf8")
    .update(challengeId, "utf8")
    .update("\n", "utf8")
    .update(code, "utf8")
    .digest("base64url");
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleUsers(
  req: IncomingMessage,
  res: ServerResponse,
  directory: UserDirectory,
  canonicalOrigin: string,
  emailSender: UserEmailSender,
  loginCodeSecret: string
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  const perMinute = path === "/users/auth/request" ? 8 : path === "/users/auth/verify" ? 20 : path === "/users/register" ? 10 : 60;
  const rate = allow(`users:${path}:${ip(req)}`, perMinute);
  if (!rate.allowed) {
    return send(res, 429, { error: "RATE_LIMITED", message: "Too many user requests" }, { "Retry-After": String(rate.retryAfter) });
  }

  if (req.method === "POST" && path === "/users/auth/request") {
    if (!emailSender.available || !loginCodeSecret) {
      throw new UserDirectoryError(
        "EMAIL_DELIVERY_NOT_CONFIGURED",
        "Returning-user email sign-in is not configured on this deployment yet"
      );
    }
    const body = await jsonBody(req);
    const email = stringField(body.email, "email", 254).trim().toLowerCase();
    const emailRateKey = createHash("sha256").update(email, "utf8").digest("base64url");
    const emailRate = allow(`login-email:${emailRateKey}`, 3);
    if (!emailRate.allowed) {
      return send(res, 429, { error: "RATE_LIMITED", message: "Too many sign-in codes requested" }, { "Retry-After": String(emailRate.retryAfter) });
    }

    const id = randomUUID();
    const now = Date.now();
    const expiresAt = now + LOGIN_CODE_TTL_MS;
    const profile = await directory.findByEmail(email);
    if (profile) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await directory.createLoginChallenge({
        id,
        userId: profile.id,
        codeHash: loginCodeHash(loginCodeSecret, id, code),
        expiresAt,
        usedAt: null,
        attempts: 0,
        createdAt: now,
      });
      try {
        await emailSender.sendLoginCode({ to: profile.emailNormalized, code, expiresAt });
      } catch {
        throw new UserDirectoryError("EMAIL_DELIVERY_FAILED", "NimCarry could not send the sign-in code. Please try again.");
      }
    }

    return send(res, 202, {
      accepted: true,
      challenge_id: id,
      message: "If that email belongs to a NimCarry profile, a 6-digit sign-in code has been sent.",
      expires_in_seconds: Math.floor(LOGIN_CODE_TTL_MS / 1000),
      expires_at: new Date(expiresAt).toISOString(),
    });
  }

  if (req.method === "POST" && path === "/users/auth/verify") {
    const body = await jsonBody(req);
    const challengeId = stringField(body.challenge_id, "challenge_id", 36).toLowerCase();
    const code = stringField(body.code, "code", 6);
    if (!UUID_RE.test(challengeId) || !LOGIN_CODE_RE.test(code)) {
      throw new UserDirectoryError("LOGIN_CODE_INVALID", "Sign-in code is invalid");
    }
    const challenge = await directory.getLoginChallenge(challengeId);
    if (!challenge) throw new UserDirectoryError("LOGIN_CODE_INVALID", "Sign-in code is invalid");
    if (challenge.usedAt !== null) throw new UserDirectoryError("LOGIN_CODE_REPLAY", "Sign-in code was already used");
    if (challenge.attempts >= 5) throw new UserDirectoryError("LOGIN_CODE_LOCKED", "Too many incorrect sign-in attempts");
    if (Date.now() >= challenge.expiresAt) throw new UserDirectoryError("LOGIN_CODE_EXPIRED", "Sign-in code has expired");

    const expected = loginCodeHash(loginCodeSecret, challengeId, code);
    if (!sameHash(expected, challenge.codeHash)) {
      const failed = await directory.failLoginChallenge(challengeId);
      if ((failed?.attempts ?? 0) >= 5) {
        throw new UserDirectoryError("LOGIN_CODE_LOCKED", "Too many incorrect sign-in attempts");
      }
      throw new UserDirectoryError("LOGIN_CODE_INVALID", "Sign-in code is invalid");
    }

    await directory.consumeLoginChallenge(challengeId);
    const now = Date.now();
    await directory.markEmailVerified(challenge.userId, now);
    const token = newProfileToken();
    await directory.createSession(challenge.userId, profileTokenHash(token), now);
    await directory.touch(challenge.userId, now);
    const profile = await directory.getById(challenge.userId);
    if (!profile) throw new UserDirectoryError("USER_NOT_FOUND", "NimCarry user does not exist");
    const wallets = await directory.walletsForUser(profile.id);
    return send(res, 200, {
      ...profilePayload(profile, wallets),
      user_token: token,
      user_status: "RETURNING",
      protocol_access: "NIMIQ_WALLET_REQUIRED_FOR_CUSTODY_ACTIONS",
    });
  }

  if (req.method === "POST" && path === "/users/register") {
    const body = await jsonBody(req);
    const displayName = stringField(body.display_name, "display_name", 80);
    const email = stringField(body.email, "email", 254);
    if (body.privacy_consent !== true || body.privacy_notice_version !== PRIVACY_NOTICE_VERSION) {
      throw new UserDirectoryError("PRIVACY_CONSENT_REQUIRED", "You must accept the current NimCarry Privacy Notice before creating a profile");
    }
    const token = newProfileToken();
    const now = Date.now();
    const profile = await directory.register({
      displayName,
      email,
      tokenHash: profileTokenHash(token),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: now,
      now,
    });
    const wallets = await directory.walletsForUser(profile.id);
    return send(res, 201, {
      ...profilePayload(profile, wallets),
      user_token: token,
      user_status: "REGISTERED",
      protocol_access: "NIMIQ_WALLET_REQUIRED_FOR_CUSTODY_ACTIONS",
    });
  }

  if (req.method === "GET" && path === "/users/me") {
    const profile = await requireUser(req, directory);
    return send(res, 200, profilePayload(profile, await directory.walletsForUser(profile.id)));
  }

  if (req.method === "DELETE" && path === "/users/me") {
    const profile = await requireUser(req, directory);
    await directory.deleteUser(profile.id);
    return send(res, 200, {
      deleted: true,
      user_id: profile.id,
      message: "NimCarry profile deleted. Protocol records and public blockchain history are not rewritten.",
    });
  }

  if (req.method === "GET" && path === "/users/stats") {
    const stats = await directory.stats();
    return send(res, 200, {
      metric_policy_version: "real-usage-v2",
      registered_users: stats.registeredUsers,
      consented_users: stats.consentedUsers,
      nimiq_verified_users: stats.walletLinkedUsers,
      wallet_linked_users: stats.walletLinkedUsers,
      activated_users: stats.activatedUsers,
      finalized_users: stats.finalizedUsers,
      protocol_participants: stats.protocolParticipants,
      assurance: {
        registered_users: "self_asserted_profile_with_explicit_privacy_consent",
        nimiq_verified_users: "valid_nimiq_wallet_signature",
        activated_users: "verified_wallet_plus_post_verification_mission_create_accept_or_final",
        finalized_users: "verified_wallet_plus_post_verification_finalized_hop",
      },
    });
  }

  if (req.method === "POST" && path === "/users/wallet/challenge") {
    const profile = await requireUser(req, directory);
    const body = await jsonBody(req);
    const wallet = normalizeNimiqAddress(stringField(body.wallet, "wallet", 80));
    const now = Date.now();
    const nonce = randomBytes(16).toString("base64url");
    const expiresAt = now + WALLET_CHALLENGE_TTL_MS;
    const message = [
      "nimcarry-user-wallet:v1",
      `origin=${canonicalOrigin}`,
      `user=${profile.id}`,
      `wallet=${wallet}`,
      `nonce=${nonce}`,
      `expires_at=${new Date(expiresAt).toISOString()}`,
    ].join("\n");
    const id = randomUUID();
    await directory.createWalletChallenge({
      id,
      userId: profile.id,
      walletNormalized: wallet,
      nonceHash: createHash("sha256").update(nonce, "utf8").digest("base64url"),
      canonicalMessage: message,
      expiresAt,
      usedAt: null,
      createdAt: now,
    });
    return send(res, 200, {
      challenge_id: id,
      message,
      expires_at: new Date(expiresAt).toISOString(),
    });
  }

  if (req.method === "POST" && path === "/users/wallet/link") {
    const profile = await requireUser(req, directory);
    const body = await jsonBody(req);
    const challengeId = stringField(body.challenge_id, "challenge_id", 36).toLowerCase();
    const publicKeyHex = stringField(body.public_key, "public_key", 256);
    const signatureHex = stringField(body.signature, "signature", 512);
    if (!UUID_RE.test(challengeId) || !HEX_RE.test(publicKeyHex) || !HEX_RE.test(signatureHex)) {
      throw new UserDirectoryError("INVALID_SIGNATURE_ENVELOPE", "Wallet-link signature envelope is malformed");
    }
    const challenge = await directory.getWalletChallenge(challengeId);
    if (!challenge || challenge.userId !== profile.id) {
      throw new UserDirectoryError("USER_CHALLENGE_NOT_FOUND", "Wallet-link challenge does not exist");
    }
    if (challenge.usedAt !== null) throw new UserDirectoryError("USER_CHALLENGE_REPLAY", "Wallet-link challenge was already used");
    if (Date.now() >= challenge.expiresAt) throw new UserDirectoryError("USER_CHALLENGE_EXPIRED", "Wallet-link challenge has expired");

    let publicKey: PublicKey;
    let signature: Signature;
    try {
      publicKey = PublicKey.fromHex(publicKeyHex);
      signature = Signature.fromHex(signatureHex);
    } catch {
      throw new UserDirectoryError("INVALID_SIGNATURE_ENVELOPE", "Wallet-link signature is invalid Nimiq hex data");
    }
    const signer = normalizeNimiqAddress(publicKey.toAddress().toUserFriendlyAddress());
    if (signer !== challenge.walletNormalized) {
      throw new UserDirectoryError("USER_WALLET_MISMATCH", "Signing key does not match the challenged wallet");
    }
    if (!publicKey.verify(signature, nimiqSignedMessageDigest(challenge.canonicalMessage))) {
      throw new UserDirectoryError("USER_WALLET_SIGNATURE_INVALID", "Wallet signature did not authorize this user link");
    }

    await directory.consumeWalletChallenge(challenge.id);
    await directory.linkVerifiedWallet(profile.id, signer);
    return send(res, 200, profilePayload(profile, await directory.walletsForUser(profile.id)));
  }

  return send(res, 404, { error: "NOT_FOUND", message: `No user route for ${req.method ?? "GET"} ${path}` });
}

function userErrorStatus(error: UserDirectoryError): number {
  if (["USER_TOKEN_REQUIRED", "USER_TOKEN_INVALID", "USER_WALLET_SIGNATURE_INVALID"].includes(error.reason)) return 401;
  if (["USER_WALLET_MISMATCH", "WALLET_ALREADY_LINKED"].includes(error.reason)) return 403;
  if (error.reason === "EMAIL_ALREADY_REGISTERED") return 409;
  if (["LOGIN_CODE_INVALID", "LOGIN_CODE_EXPIRED", "LOGIN_CODE_REPLAY", "LOGIN_CODE_LOCKED"].includes(error.reason)) return 401;
  if (["EMAIL_DELIVERY_NOT_CONFIGURED", "EMAIL_DELIVERY_FAILED"].includes(error.reason)) return 503;
  if (error.reason.endsWith("_NOT_FOUND")) return 404;
  if (error.reason.includes("DB_ERROR")) return 503;
  return 400;
}

/**
 * Wrap the existing mission server without changing its protocol surface.
 * /users/* is handled by the human identity registry; everything else is
 * delegated byte-for-byte to the existing mission server request listener.
 */
export function createNimCarryHttpServer(
  missionServer: Server,
  directory: UserDirectory,
  canonicalOrigin: string,
  emailSender: UserEmailSender = new DisabledUserEmailSender(),
  loginCodeSecret = ""
): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/users")) {
      missionServer.emit("request", req, res);
      return;
    }
    handleUsers(req, res, directory, canonicalOrigin, emailSender, loginCodeSecret).catch((error) => {
      if (error instanceof UserDirectoryError) {
        send(res, userErrorStatus(error), { error: error.reason, message: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      send(res, 500, { error: "USER_INTERNAL_ERROR", message });
    });
  });
}
