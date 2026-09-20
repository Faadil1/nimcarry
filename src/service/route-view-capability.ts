import { randomBytes } from "node:crypto";

export const ROUTE_VIEW_CAPABILITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RouteViewCapabilityBinding {
  missionId: string;
  /**
   * Wallet the bearer is authorized to view the route as. Empty for an
   * intentionally impersonal route-follow view (e.g. an open invitation whose
   * candidate wallet was not pre-bound).
   */
  holderWallet: string | null;
}

export interface IssuedRouteViewCapability {
  token: string;
  expiresAt: number;
}

interface RouteViewCapabilityRecord extends RouteViewCapabilityBinding {
  token: string;
  expiresAt: number;
}

export class RouteViewCapabilityError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
    this.name = "RouteViewCapabilityError";
  }
}

export interface RouteViewCapabilityStore {
  issue(binding: RouteViewCapabilityBinding, options?: { now?: number; ttlMs?: number }): IssuedRouteViewCapability;
  verify(token: string, expected: { missionId: string }, now?: number): RouteViewCapabilityBinding;
}

/**
 * Short-lived bearer capability that authorizes read-only route following.
 *
 * The capability is intentionally process-local: a server restart invalidates
 * outstanding route-view tokens. This is safe because read access is derived
 * from role, never custody. Normal bridge acceptance does not require a second
 * signature: the verified `ACCEPT_INVITATION` response issues this read-only
 * capability in the same signed interaction. `POST /missions/:id/view` remains
 * an explicit recovery path when a fresh capability is needed later.
 *
 * Invitation tokens are landing-page-only (`GET /i/:token`) and never become
 * route-view capabilities themselves.
 */
export class MemoryRouteViewCapabilityStore implements RouteViewCapabilityStore {
  private readonly records = new Map<string, RouteViewCapabilityRecord>();

  issue(binding: RouteViewCapabilityBinding, options: { now?: number; ttlMs?: number } = {}): IssuedRouteViewCapability {
    const now = options.now ?? Date.now();
    const ttlMs = options.ttlMs ?? ROUTE_VIEW_CAPABILITY_TTL_MS;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RouteViewCapabilityError("ROUTE_VIEW_CAPABILITY_TTL_INVALID", "Route view capability TTL must be positive");
    }
    this.prune(now);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = now + ttlMs;
    this.records.set(token, { ...binding, token, expiresAt });
    return { token, expiresAt };
  }

  verify(token: string, expected: { missionId: string }, now = Date.now()): RouteViewCapabilityBinding {
    this.prune(now);
    const record = this.records.get(token);
    if (!record) {
      throw new RouteViewCapabilityError("ROUTE_VIEW_CAPABILITY_INVALID", "Route view capability is unknown or expired");
    }
    if (now >= record.expiresAt) {
      this.records.delete(token);
      throw new RouteViewCapabilityError("ROUTE_VIEW_CAPABILITY_EXPIRED", "Route view capability has expired");
    }
    if (record.missionId !== expected.missionId) {
      throw new RouteViewCapabilityError(
        "ROUTE_VIEW_CAPABILITY_MISSION_MISMATCH",
        "Route view capability is bound to another mission"
      );
    }
    return { missionId: record.missionId, holderWallet: record.holderWallet };
  }

  private prune(now: number): void {
    for (const [token, record] of this.records) {
      if (now >= record.expiresAt) this.records.delete(token);
    }
  }
}