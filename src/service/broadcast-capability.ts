import { randomBytes } from "node:crypto";

export const BROADCAST_CAPABILITY_TTL_MS = 15 * 60 * 1000;

export interface BroadcastCapabilityBinding {
  missionId: string;
  invitationId: string | null;
  sequence: number;
  intentNonce: string;
  holderWallet: string;
}

export interface IssuedBroadcastCapability {
  token: string;
  expiresAt: number;
}

interface BroadcastCapabilityRecord extends BroadcastCapabilityBinding {
  token: string;
  expiresAt: number;
  consumedAt: number | null;
}

export class BroadcastCapabilityError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
    this.name = "BroadcastCapabilityError";
  }
}

export interface BroadcastCapabilityStore {
  issue(binding: BroadcastCapabilityBinding, options?: { now?: number; ttlMs?: number }): IssuedBroadcastCapability;
  consume(token: string, expected: BroadcastCapabilityBinding, now?: number): void;
}

/**
 * Short-lived bearer capability issued only after a signed AUTHORIZE_PASS.
 *
 * The capability is intentionally process-local. A server restart invalidates
 * outstanding tokens; the canonical pass intent remains durable, so the holder
 * can perform a fresh signed AUTHORIZE_PASS and receive a new capability. That
 * is safer than persisting a bearer secret alongside mission state.
 */
export class MemoryBroadcastCapabilityStore implements BroadcastCapabilityStore {
  private readonly records = new Map<string, BroadcastCapabilityRecord>();

  issue(binding: BroadcastCapabilityBinding, options: { now?: number; ttlMs?: number } = {}): IssuedBroadcastCapability {
    const now = options.now ?? Date.now();
    const ttlMs = options.ttlMs ?? BROADCAST_CAPABILITY_TTL_MS;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new BroadcastCapabilityError("BROADCAST_CAPABILITY_TTL_INVALID", "Broadcast capability TTL must be positive");
    }
    this.prune(now);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = now + ttlMs;
    this.records.set(token, { ...binding, token, expiresAt, consumedAt: null });
    return { token, expiresAt };
  }

  consume(token: string, expected: BroadcastCapabilityBinding, now = Date.now()): void {
    this.prune(now, token);
    const record = this.records.get(token);
    if (!record) {
      throw new BroadcastCapabilityError("BROADCAST_CAPABILITY_NOT_FOUND", "Broadcast capability is unknown or expired");
    }
    if (record.consumedAt !== null) {
      throw new BroadcastCapabilityError("BROADCAST_CAPABILITY_REPLAY", "Broadcast capability has already been consumed");
    }
    if (now >= record.expiresAt) {
      this.records.delete(token);
      throw new BroadcastCapabilityError("BROADCAST_CAPABILITY_EXPIRED", "Broadcast capability has expired");
    }
    if (
      record.missionId !== expected.missionId ||
      record.invitationId !== expected.invitationId ||
      record.sequence !== expected.sequence ||
      record.intentNonce !== expected.intentNonce ||
      record.holderWallet !== expected.holderWallet
    ) {
      throw new BroadcastCapabilityError(
        "BROADCAST_CAPABILITY_BINDING_MISMATCH",
        "Broadcast capability is bound to different mission state"
      );
    }

    // Mark consumed synchronously before the caller attaches the tx hash. A
    // second concurrent request cannot pass this check. Same-request retries are
    // handled by the HTTP idempotency layer before this method is reached.
    record.consumedAt = now;
  }

  private prune(now: number, preserveToken?: string): void {
    for (const [token, record] of this.records) {
      if (token === preserveToken) continue;
      if (now >= record.expiresAt) this.records.delete(token);
    }
  }
}
