import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PgPoolLike } from "../persistence/pg-pool.js";
import { normalizeNimiqAddress } from "../mission/target-wallet-crypto.js";

export interface UserProfile {
  id: string;
  emailNormalized: string;
  displayName: string;
  emailVerifiedAt: number | null;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
}

export interface UserStats {
  registeredUsers: number;
  walletLinkedUsers: number;
  protocolParticipants: number;
}

export interface UserDirectory {
  register(input: { email: string; displayName: string; tokenHash: string; now?: number }): Promise<UserProfile>;
  getByTokenHash(tokenHash: string): Promise<UserProfile | undefined>;
  touch(userId: string, now?: number): Promise<void>;
  linkVerifiedWallet(userId: string, wallet: string, now?: number): Promise<void>;
  walletsForUser(userId: string): Promise<string[]>;
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
  private readonly walletToId = new Map<string, string>();

  async register(input: { email: string; displayName: string; tokenHash: string; now?: number }): Promise<UserProfile> {
    const email = normalizeEmail(input.email);
    const displayName = normalizeDisplayName(input.displayName);
    if (this.emailToId.has(email)) throw new UserDirectoryError("EMAIL_ALREADY_REGISTERED", "This email is already registered");
    if (this.tokenToId.has(input.tokenHash)) throw new UserDirectoryError("TOKEN_COLLISION", "Profile token collision");
    const now = input.now ?? Date.now();
    const profile: UserProfile = {
      id: randomUUID(),
      emailNormalized: email,
      displayName,
      emailVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };
    this.users.set(profile.id, profile);
    this.emailToId.set(email, profile.id);
    this.tokenToId.set(input.tokenHash, profile.id);
    return { ...profile };
  }

  async getByTokenHash(tokenHash: string): Promise<UserProfile | undefined> {
    const id = this.tokenToId.get(tokenHash);
    const profile = id ? this.users.get(id) : undefined;
    return profile ? { ...profile } : undefined;
  }

  async touch(userId: string, now = Date.now()): Promise<void> {
    const profile = this.users.get(userId);
    if (!profile) return;
    profile.lastSeenAt = now;
    profile.updatedAt = now;
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

  async stats(): Promise<UserStats> {
    return {
      registeredUsers: this.users.size,
      walletLinkedUsers: new Set(this.walletToId.values()).size,
      protocolParticipants: 0,
    };
  }
}

interface UserRow {
  id: string;
  email_normalized: string;
  display_name: string;
  email_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_seen_at: Date;
}

function fromRow(row: UserRow): UserProfile {
  return {
    id: row.id,
    emailNormalized: row.email_normalized,
    displayName: row.display_name,
    emailVerifiedAt: row.email_verified_at?.getTime() ?? null,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
    lastSeenAt: row.last_seen_at.getTime(),
  };
}

export class PgUserDirectory implements UserDirectory {
  constructor(private readonly pool: PgPoolLike) {}

  async register(input: { email: string; displayName: string; tokenHash: string; now?: number }): Promise<UserProfile> {
    const email = normalizeEmail(input.email);
    const displayName = normalizeDisplayName(input.displayName);
    const now = new Date(input.now ?? Date.now());
    try {
      const result = await this.pool.query<UserRow>(
        `INSERT INTO users
           (id, email_normalized, display_name, profile_token_hash, created_at, updated_at, last_seen_at)
         VALUES ($1,$2,$3,$4,$5,$5,$5)
         RETURNING *`,
        [randomUUID(), email, displayName, input.tokenHash, now]
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

  async getByTokenHash(tokenHash: string): Promise<UserProfile | undefined> {
    const result = await this.pool.query<UserRow>("SELECT * FROM users WHERE profile_token_hash=$1", [tokenHash]);
    return result.rows.length ? fromRow(result.rows[0]) : undefined;
  }

  async touch(userId: string, now = Date.now()): Promise<void> {
    await this.pool.query("UPDATE users SET last_seen_at=$2, updated_at=$2 WHERE id=$1", [userId, new Date(now)]);
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

  async stats(): Promise<UserStats> {
    const [registered, linked, participants] = await Promise.all([
      this.pool.query<{ count: string }>("SELECT count(*)::text AS count FROM users"),
      this.pool.query<{ count: string }>("SELECT count(DISTINCT user_id)::text AS count FROM user_wallets"),
      this.pool.query<{ count: string }>(
        `SELECT count(DISTINCT uw.user_id)::text AS count
         FROM participants p
         JOIN user_wallets uw ON uw.wallet_normalized=p.wallet_normalized`
      ),
    ]);
    return {
      registeredUsers: Number(registered.rows[0]?.count ?? 0),
      walletLinkedUsers: Number(linked.rows[0]?.count ?? 0),
      protocolParticipants: Number(participants.rows[0]?.count ?? 0),
    };
  }
}
