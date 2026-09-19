import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { PublicKey, Signature } from "@nimiq/core";
import { normalizeNimiqAddress } from "../mission/target-wallet-crypto.js";
import { nimiqSignedMessageDigest } from "../mission/wallet-auth.js";
import {
  UserDirectoryError,
  newProfileToken,
  profileTokenHash,
  type UserDirectory,
  type UserProfile,
} from "./user-directory.js";

const MAX_BODY_BYTES = 8 * 1024;
const WALLET_CHALLENGE_TTL_MS = 5 * 60 * 1000;
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

async function handleUsers(
  req: IncomingMessage,
  res: ServerResponse,
  directory: UserDirectory,
  canonicalOrigin: string
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  const rate = allow(`users:${ip(req)}`, path === "/users/register" ? 10 : 60);
  if (!rate.allowed) {
    return send(res, 429, { error: "RATE_LIMITED", message: "Too many user requests" }, { "Retry-After": String(rate.retryAfter) });
  }

  if (req.method === "POST" && path === "/users/register") {
    const body = await jsonBody(req);
    const displayName = stringField(body.display_name, "display_name", 80);
    const email = stringField(body.email, "email", 254);
    const token = newProfileToken();
    const profile = await directory.register({
      displayName,
      email,
      tokenHash: profileTokenHash(token),
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

  if (req.method === "GET" && path === "/users/stats") {
    const stats = await directory.stats();
    return send(res, 200, {
      registered_users: stats.registeredUsers,
      wallet_linked_users: stats.walletLinkedUsers,
      protocol_participants: stats.protocolParticipants,
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
  canonicalOrigin: string
): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/users")) {
      missionServer.emit("request", req, res);
      return;
    }
    handleUsers(req, res, directory, canonicalOrigin).catch((error) => {
      if (error instanceof UserDirectoryError) {
        send(res, userErrorStatus(error), { error: error.reason, message: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      send(res, 500, { error: "USER_INTERNAL_ERROR", message });
    });
  });
}
