import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PgPoolLike } from "../persistence/pg-pool.js";
import { normalizeNimiqAddress } from "../mission/target-wallet-crypto.js";

export const PRIVACY_NOTICE_VERSION = "2026-09-19";

export interface UserProfile {
  id: string;
  emailNormalized: string;
  displayName: string;
  emailVerifiedAt: number | null;
  privacyNoticeVersion: string;
  privacyConsentAt: number;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
}

export interface UserWalletChallenge {
  id: string;
  userId: string;
  walletNormalized: string;
  nonceHash: string;
  canonicalMessage: string;
  expiresAt: number;
  usedAt: number | null;
  createdAt: number;
}

export interface UserLoginChallenge {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: number;
  usedAt: number | null;
  attempts: number;
  createdAt: number;
}

export interface UserStats {
  registeredUsers: number;
  consentedUsers: number;
  walletLinkedUsers: number;
  activatedUsers: number;
  finalizedUsers: number;
  protocolParticipants: number;
}

export interface RegisterUserInput {
  email: string;
  displayName: string;
  tokenHash: string;
  privacyNoticeVersion: string;
  privacyConsentAt: number;
  now?: number;
}

export interface UserDirectory {
  register(input: RegisterUserInput): Promise<UserProfile>;
  getById(userId: string): Promise<UserProfile | undefined>;
  findByEmail(email: string): Promise<UserProfile | undefined>;
  getByTokenHash(tokenHash: string): Promise<UserProfile | undefined>;
  createSession(userId: string, tokenHash: string, now?: number): Promise<void>;
  markEmailVerified(userId: string, now?: number): Promise<void>;
  touch(userId: string, now?: number): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  linkVerifiedWallet(userId: string, wallet: string, now?: number): Promise<void>;
  walletsForUser(userId: string): Promise<string[]>;
  createWalletChallenge(record: UserWalletChallenge): Promise<void>;
  getWalletChallenge(id: string): Promise<UserWalletChallenge | undefined>;
  consumeWalletChallenge(id: string, now?: number): Promise<void>;
  createLoginChallenge(record: UserLoginChallenge): Promise<void>;
  getLoginChallenge(id: string): Promise<UserLoginChallenge | undefined>;
  failLoginChallenge(id: string): Promise<UserLoginChallenge | undefined>;
  consumeLoginChallenge(id: string, now?: number): Promise<void>;
  stats(): Promise<UserStats>;
}

export class UserDirectoryError extends Error {
  constructor(public reason: string, message: string) {
    super(message);
    this.name = "UserDirectoryError";
  }
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new UserDirectoryError("INVALID_EMAIL", "Enter a valid email address");
  }
  return email;
}

export function normalizeDisplayName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 80) {
    throw new UserDirectoryError("INVALID_DISPLAY_NAME", "Name must be between 1 and 80 characters");
  }
  return name;
}

export function newProfileToken(): string {
  return randomBytes(32).toString("base64url");
}

export function profileTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export class MemoryUserDirectory implements UserDirectory {
  private readonly users = new Map<string, UserProfile>();
  private readonly emailToId = new Map<string, string>();
  private readonly tokenToId = new Map<string, string>();
  private readonly sessionTokenToId = new Map<string, string>();
  private readonly walletToId = new Map<string, string>();
  private readonly walletChallenges = new Map<string, UserWalletChallenge>();
  private readonly loginChallenges = new Map<string, UserLoginChallenge>();

  async register(input: RegisterUserInput): Promise<UserProfile> {
    const email = normalizeEmail(input.email);
    const displayName = normalizeDisplayName(input.displayName);
    if (input.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION || !Number.isFinite(input.privacyConsentAt)) {
      throw new UserDirectoryError("PRIVACY_CONSENT_REQUIRED", "Current privacy notice consent is required");
    }
    if (this.emailToId.has(email)) throw new UserDirectoryError("EMAIL_ALREADY_REGISTERED", "This email is already registered");
    if (this.tokenToId.has(input.tokenHash)) throw new UserDirectoryError("TOKEN_COLLISION", "Profile token collision");
    const now = input.now ?? Date.now();
    const profile: UserProfile = {
      id: randomUUID(),
      emailNormalized: email,
      displayName,
      emailVerifiedAt: null,
      privacyNoticeVersion: input.privacyNoticeVersion,
      privacyConsentAt: input.privacyConsentAt,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };
    this.users.set(profile.id, profile);
    this.emailToId.set(email, profile.id);
    this.tokenToId.set(input.tokenHash, profile.id);
    return { ...profile };
  }

  async getById(userId: string): Promise<UserProfile | undefined> {
    const profile = this.users.get(userId);
    return profile ? { ...profile } : undefined;
  }

  async findByEmail(email: string): Promise<UserProfile | undefined> {
    const id = this.emailToId.get(normalizeEmail(email));
    const profile = id ? this.users.get(id) : undefined;
    return profile ? { ...profile } : undefined;
  }

  async getByTokenHash(tokenHash: string): Promise<UserProfile | undefined> {
    const id = this.tokenToId.get(tokenHash) ?? this.sessionTokenToId.get(tokenHash);
    const profile = id ? this.users.get(id) : undefined;
    return profile ? { ...profile } : undefined;
  }

  async createSession(userId: string, tokenHash: string, _now = Date.now()): Promise<void> {
    if (!this.users.has(userId)) throw new UserDirectoryError("USER_NOT_FOUND", "NimCarry user does not exist");
    if (this.tokenToId.has(tokenHash) || this.sessionTokenToId.has(tokenHash)) {
      throw new UserDirectoryError("TOKEN_COLLISION", "Profile token collision");
    }
    this.sessionTokenToId.set(tokenHash, userId);
  }

  async markEmailVerified(userId: string, now = Date.now()): Promise<void> {
    const profile = this.users.get(userId);
    if (!profile) throw new UserDirectoryError("USER_NOT_FOUND", "NimCarry user does not exist");
    if (profile.emailVerifiedAt === null) profile.emailVerifiedAt = now;
    profile.updatedAt = now;
  }

  async touch(userId: string, now = Date.now()): Promise<void> {
    const profile = this.users.get(userId);
    if (!profile) return;
    profile.lastSeenAt = now;
    profile.updatedAt = now;
  }

  async deleteUser(userId: string): Promise<void> {
    const profile = this.users.get(userId);
    if (!profile) return;
    this.users.delete(userId);
    this.emailToId.delete(profile.emailNormalized);
    for (const [tokenHash, id] of this.tokenToId.entries()) if (id === userId) this.tokenToId.delete(tokenHash);
    for (const [tokenHash, id] of this.sessionTokenToId.entries()) if (id === userId) this.sessionTokenToId.delete(tokenHash);
    for (const [wallet, id] of this.walletToId.entries()) if (id === userId) this.walletToId.delete(wallet);
    for (const [id, challenge] of this.walletChallenges.entries()) if (challenge.userId === userId) this.walletChallenges.delete(id);
    for (const [id, challenge] of this.loginChallenges.entries()) if (challenge.userId === userId) this.loginChallenges.delete(id);
  }

  async linkVerifiedWallet(userId: string, wallet: string): Promise<void> {
    const normalized = normalizeNimiqAddress(wallet);
    const existing = this.walletToId.get(normalized);
    if (existing && existing !== userId) throw new UserDirectoryError("WALLET_ALREADY_LINKED", "This wallet is linked to another NimCarry user");
    this.walletToId.set(normalized, userId);
  }

  async walletsForUser(userId: string): Promise<string[]> {
    return [...this.walletToId.entries()].filter(([, id]) => id === userId).map(([wallet]) => wallet);
  }

  async createWalletChallenge(record: UserWalletChallenge): Promise<void> {
    if (this.walletChallenges.has(record.id)) throw new UserDirectoryError("CHALLENGE_COLLISION", "Wallet-link challenge collision");
    this.walletChallenges.set(record.id, { ...record });
  }

  async getWalletChallenge(id: string): Promise<UserWalletChallenge | undefined> {
    const challenge = this.walletChallenges.get(id);
    return challenge ? { ...challenge } : undefined;
  }

  async consumeWalletChallenge(id: string, now = Date.now()): Promise<void> {
    const challenge = this.walletChallenges.get(id);
    if (!challenge) throw new UserDirectoryError("USER_CHALLENGE_NOT_FOUND", "Wallet-link challenge does not exist");
    if (challenge.usedAt !== null) throw new UserDirectoryError("USER_CHALLENGE_REPLAY", "Wallet-link challenge was already used");
    if (now >= challenge.expiresAt) throw new UserDirectoryError("USER_CHALLENGE_EXPIRED", "Wallet-link challenge has expired");
    challenge.usedAt = now;
  }

  async createLoginChallenge(record: UserLoginChallenge): Promise<void> {
    if (this.loginChallenges.has(record.id)) throw new UserDirectoryError("LOGIN_CHALLENGE_COLLISION", "Login challenge collision");
    this.loginChallenges.set(record.id, { ...record });
  }

  async getLoginChallenge(id: string): Promise<UserLoginChallenge | undefined> {
    const challenge = this.loginChallenges.get(id);
    return challenge ? { ...challenge } : undefined;
  }

  async failLoginChallenge(id: string): Promise<UserLoginChallenge | undefined> {
    const challenge = this.loginChallenges.get(id);
    if (!challenge) return undefined;
    challenge.attempts += 1;
    return { ...challenge };
  }

  async consumeLoginChallenge(id: string, now = Date.now()): Promise<void> {
    const challenge = this.loginChallenges.get(id);
    if (!challenge) throw new UserDirectoryError("LOGIN_CODE_INVALID", "Sign-in code is invalid");
    if (challenge.usedAt !== null) throw new UserDirectoryError("LOGIN_CODE_REPLAY", "Sign-in code was already used");
    if (challenge.attempts >= 5) throw new UserDirectoryError("LOGIN_CODE_LOCKED", "Too many incorrect sign-in attempts");
    if (now >= challenge.expiresAt) throw new UserDirectoryError("LOGIN_CODE_EXPIRED", "Sign-in code has expired");
    challenge.usedAt = now;
  }

  async stats(): Promise<UserStats> {
    return {
      registeredUsers: this.users.size,
      consentedUsers: [...this.users.values()].filter(
        (user) => user.privacyNoticeVersion === PRIVACY_NOTICE_VERSION && Number.isFinite(user.privacyConsentAt)
      ).length,
      walletLinkedUsers: new Set(this.walletToId.values()).size,
      activatedUsers: 0,
      finalizedUsers: 0,
      protocolParticipants: 0,
    };
  }
}

interface UserRow {
  id: string;
  email_normalized: string;
  display_name: string;
  email_verified_at: Date | null;
  privacy_notice_version: string;
  privacy_consent_at: Date;
  created_at: Date;
  updated_at: Date;
  last_seen_at: Date;
}

interface UserWalletChallengeRow {
  id: string;
  user_id: string;
  wallet_normalized: string;
  nonce_hash: string;
  canonical_message: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

interface UserLoginChallengeRow {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: Date;
  used_at: Date | null;
  attempts: number;
  created_at: Date;
}

function fromRow(row: UserRow): UserProfile {
  return {
    id: row.id,
    emailNormalized: row.email_normalized,
    displayName: row.display_name,
    emailVerifiedAt: row.email_verified_at?.getTime() ?? null,
    privacyNoticeVersion: row.privacy_notice_version,
    privacyConsentAt: row.privacy_consent_at.getTime(),
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
    lastSeenAt: row.last_seen_at.getTime(),
  };
}

function challengeFromRow(row: UserWalletChallengeRow): UserWalletChallenge {
  return {
    id: row.id,
    userId: row.user_id,
    walletNormalized: row.wallet_normalized,
    nonceHash: row.nonce_hash,
    canonicalMessage: row.canonical_message,
    expiresAt: row.expires_at.getTime(),
    usedAt: row.used_at?.getTime() ?? null,
    createdAt: row.created_at.getTime(),
  };
}

function loginChallengeFromRow(row: UserLoginChallengeRow): UserLoginChallenge {
  return {
    id: row.id,
    userId: row.user_id,
    codeHash: row.code_hash,
    expiresAt: row.expires_at.getTime(),
    usedAt: row.used_at?.getTime() ?? null,
    attempts: row.attempts,
    createdAt: row.created_at.getTime(),
  };
}

export class PgUserDirectory implements UserDirectory {
  constructor(private readonly pool: PgPoolLike) {}

  async register(input: RegisterUserInput): Promise<UserProfile> {
    const email = normalizeEmail(input.email);
    const displayName = normalizeDisplayName(input.displayName);
    if (input.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION || !Number.isFinite(input.privacyConsentAt)) {
      throw new UserDirectoryError("PRIVACY_CONSENT_REQUIRED", "Current privacy notice consent is required");
    }
    const now = new Date(input.now ?? Date.now());
    const privacyConsentAt = new Date(input.privacyConsentAt);
    try {
      const result = await this.pool.query<UserRow>(
        `INSERT INTO users
           (id, email_normalized, display_name, profile_token_hash, privacy_notice_version, privacy_consent_at, created_at, updated_at, last_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)
         RETURNING *`,
        [randomUUID(), email, displayName, input.tokenHash, input.privacyNoticeVersion, privacyConsentAt, now]
      );
      return fromRow(result.rows[0]);
    } catch (error) {
      const code = (error as { code?: string }).code;
      const detail = ((error as { detail?: string }).detail ?? (error as Error).message) || "";
      if (code === "23505" && detail.includes("email_normalized")) {
        throw new UserDirectoryError("EMAIL_ALREADY_REGISTERED", "This email is already registered");
      }
      if (code === "23505" && detail.includes("profile_token_hash")) {
        throw new UserDirectoryError("TOKEN_COLLISION", "Profile token collision");
      }
      throw new UserDirectoryError("USER_DB_ERROR", "Could not register NimCarry user");
    }
  }

  async getById(userId: string): Promise<UserProfile | undefined> {
    const result = await this.pool.query<UserRow>("SELECT * FROM users WHERE id=$1", [userId]);
    return result.rows.length ? fromRow(result.rows[0]) : undefined;
  }

  async findByEmail(email: string): Promise<UserProfile | undefined> {
    const result = await this.pool.query<UserRow>("SELECT * FROM users WHERE email_normalized=$1", [normalizeEmail(email)]);
    return result.rows.length ? fromRow(result.rows[0]) : undefined;
  }

  async getByTokenHash(tokenHash: string): Promise<UserProfile | undefined> {
    const legacy = await this.pool.query<UserRow>("SELECT * FROM users WHERE profile_token_hash=$1", [tokenHash]);
    if (legacy.rows.length) return fromRow(legacy.rows[0]);
    const session = await this.pool.query<UserRow>(
      `SELECT u.*
       FROM user_sessions s
       JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL`,
      [tokenHash]
    );
    return session.rows.length ? fromRow(session.rows[0]) : undefined;
  }

  async createSession(userId: string, tokenHash: string, now = Date.now()): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO user_sessions (id, user_id, token_hash, created_at, last_seen_at, revoked_at)
         VALUES ($1,$2,$3,$4,$4,NULL)`,
        [randomUUID(), userId, tokenHash, new Date(now)]
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") throw new UserDirectoryError("TOKEN_COLLISION", "Profile token collision");
      throw new UserDirectoryError("USER_DB_ERROR", "Could not create NimCarry session");
    }
  }

  async markEmailVerified(userId: string, now = Date.now()): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET email_verified_at=COALESCE(email_verified_at,$2), updated_at=$2
       WHERE id=$1`,
      [userId, new Date(now)]
    );
  }

  async touch(userId: string, now = Date.now()): Promise<void> {
    await this.pool.query("UPDATE users SET last_seen_at=$2, updated_at=$2 WHERE id=$1", [userId, new Date(now)]);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.pool.query("DELETE FROM users WHERE id=$1", [userId]);
  }

  async linkVerifiedWallet(userId: string, wallet: string, now = Date.now()): Promise<void> {
    const normalized = normalizeNimiqAddress(wallet);
    try {
      await this.pool.query(
        `INSERT INTO user_wallets (user_id, wallet_normalized, linked_at, verified_at)
         VALUES ($1,$2,$3,$3)
         ON CONFLICT (user_id, wallet_normalized)
         DO UPDATE SET verified_at=EXCLUDED.verified_at`,
        [userId, normalized, new Date(now)]
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") throw new UserDirectoryError("WALLET_ALREADY_LINKED", "This wallet is linked to another NimCarry user");
      throw new UserDirectoryError("USER_DB_ERROR", "Could not link Nimiq wallet");
    }
  }

  async walletsForUser(userId: string): Promise<string[]> {
    const result = await this.pool.query<{ wallet_normalized: string }>(
      "SELECT wallet_normalized FROM user_wallets WHERE user_id=$1 ORDER BY linked_at ASC",
      [userId]
    );
    return result.rows.map((row) => row.wallet_normalized);
  }

  async createWalletChallenge(record: UserWalletChallenge): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO user_wallet_challenges
           (id, user_id, wallet_normalized, nonce_hash, canonical_message, expires_at, used_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          record.id,
          record.userId,
          record.walletNormalized,
          record.nonceHash,
          record.canonicalMessage,
          new Date(record.expiresAt),
          record.usedAt === null ? null : new Date(record.usedAt),
          new Date(record.createdAt),
        ]
      );
    } catch {
      throw new UserDirectoryError("CHALLENGE_COLLISION", "Could not create wallet-link challenge");
    }
  }

  async getWalletChallenge(id: string): Promise<UserWalletChallenge | undefined> {
    const result = await this.pool.query<UserWalletChallengeRow>(
      "SELECT * FROM user_wallet_challenges WHERE id=$1",
      [id]
    );
    return result.rows.length ? challengeFromRow(result.rows[0]) : undefined;
  }

  async consumeWalletChallenge(id: string, now = Date.now()): Promise<void> {
    const result = await this.pool.query<UserWalletChallengeRow>(
      `UPDATE user_wallet_challenges
       SET used_at=$2
       WHERE id=$1 AND used_at IS NULL AND expires_at>$2
       RETURNING *`,
      [id, new Date(now)]
    );
    if (result.rows.length > 0) return;
    const existing = await this.getWalletChallenge(id);
    if (!existing) throw new UserDirectoryError("USER_CHALLENGE_NOT_FOUND", "Wallet-link challenge does not exist");
    if (existing.usedAt !== null) throw new UserDirectoryError("USER_CHALLENGE_REPLAY", "Wallet-link challenge was already used");
    throw new UserDirectoryError("USER_CHALLENGE_EXPIRED", "Wallet-link challenge has expired");
  }

  async createLoginChallenge(record: UserLoginChallenge): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO user_login_challenges
           (id, user_id, code_hash, expires_at, used_at, attempts, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          record.id,
          record.userId,
          record.codeHash,
          new Date(record.expiresAt),
          record.usedAt === null ? null : new Date(record.usedAt),
          record.attempts,
          new Date(record.createdAt),
        ]
      );
    } catch {
      throw new UserDirectoryError("LOGIN_CHALLENGE_COLLISION", "Could not create sign-in challenge");
    }
  }

  async getLoginChallenge(id: string): Promise<UserLoginChallenge | undefined> {
    const result = await this.pool.query<UserLoginChallengeRow>(
      "SELECT * FROM user_login_challenges WHERE id=$1",
      [id]
    );
    return result.rows.length ? loginChallengeFromRow(result.rows[0]) : undefined;
  }

  async failLoginChallenge(id: string): Promise<UserLoginChallenge | undefined> {
    const result = await this.pool.query<UserLoginChallengeRow>(
      `UPDATE user_login_challenges
       SET attempts=attempts+1
       WHERE id=$1 AND used_at IS NULL
       RETURNING *`,
      [id]
    );
    return result.rows.length ? loginChallengeFromRow(result.rows[0]) : undefined;
  }

  async consumeLoginChallenge(id: string, now = Date.now()): Promise<void> {
    const result = await this.pool.query<UserLoginChallengeRow>(
      `UPDATE user_login_challenges
       SET used_at=$2
       WHERE id=$1 AND used_at IS NULL AND expires_at>$2 AND attempts<5
       RETURNING *`,
      [id, new Date(now)]
    );
    if (result.rows.length > 0) return;
    const existing = await this.getLoginChallenge(id);
    if (!existing) throw new UserDirectoryError("LOGIN_CODE_INVALID", "Sign-in code is invalid");
    if (existing.usedAt !== null) throw new UserDirectoryError("LOGIN_CODE_REPLAY", "Sign-in code was already used");
    if (existing.attempts >= 5) throw new UserDirectoryError("LOGIN_CODE_LOCKED", "Too many incorrect sign-in attempts");
    throw new UserDirectoryError("LOGIN_CODE_EXPIRED", "Sign-in code has expired");
  }

  async stats(): Promise<UserStats> {
    const [registered, consented, linked, activated, finalized] = await Promise.all([
      this.pool.query<{ count: string }>("SELECT count(*)::text AS count FROM users"),
      this.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users WHERE privacy_notice_version IS NOT NULL AND privacy_consent_at IS NOT NULL"
      ),
      this.pool.query<{ count: string }>(
        "SELECT count(DISTINCT user_id)::text AS count FROM user_wallets WHERE verified_at IS NOT NULL"
      ),
      this.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM (
           SELECT uw.user_id
           FROM user_wallets uw
           JOIN missions m
             ON m.creator_wallet_normalized = uw.wallet_normalized
            AND m.created_at >= uw.verified_at
           WHERE uw.verified_at IS NOT NULL

           UNION

           SELECT uw.user_id
           FROM user_wallets uw
           JOIN invitations i
             ON i.candidate_wallet_normalized = uw.wallet_normalized
            AND i.accepted_at IS NOT NULL
            AND i.accepted_at >= uw.verified_at
           WHERE uw.verified_at IS NOT NULL

           UNION

           SELECT uw.user_id
           FROM user_wallets uw
           JOIN hops h
             ON h.status = 'FINAL'
            AND h.finalized_at IS NOT NULL
            AND h.finalized_at >= uw.verified_at
            AND (
              h.sender_wallet_normalized = uw.wallet_normalized
              OR h.recipient_wallet_normalized = uw.wallet_normalized
            )
           WHERE uw.verified_at IS NOT NULL
         ) activated_users`
      ),
      this.pool.query<{ count: string }>(
        `SELECT count(DISTINCT uw.user_id)::text AS count
         FROM user_wallets uw
         JOIN hops h
           ON h.status = 'FINAL'
          AND h.finalized_at IS NOT NULL
          AND h.finalized_at >= uw.verified_at
          AND (
            h.sender_wallet_normalized = uw.wallet_normalized
            OR h.recipient_wallet_normalized = uw.wallet_normalized
          )
         WHERE uw.verified_at IS NOT NULL`
      ),
    ]);
    const activatedUsers = Number(activated.rows[0]?.count ?? 0);
    return {
      registeredUsers: Number(registered.rows[0]?.count ?? 0),
      consentedUsers: Number(consented.rows[0]?.count ?? 0),
      walletLinkedUsers: Number(linked.rows[0]?.count ?? 0),
      activatedUsers,
      finalizedUsers: Number(finalized.rows[0]?.count ?? 0),
      // Compatibility alias: protocol participation is now deliberately
      // post-verification activation, so legacy test rows can never inflate it.
      protocolParticipants: activatedUsers,
    };
  }
}
