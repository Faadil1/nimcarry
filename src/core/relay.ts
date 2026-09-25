import { randomUUID } from "node:crypto";
import type { Hop, HopStatus, NimiqTxLookup, PassIntent } from "./types.js";
import { batonDataTag, ONE_NIM_IN_LUNA } from "./types.js";
import { opaqueHopCommitment } from "./hop-commitment.js";
import { INTENT_VALIDITY_WINDOW_MS } from "../nimiq/policy.js";

/** Thrown for every rejection path — callers switch on `.reason` for tests/logging. */
export class RelayValidationError extends Error {
  constructor(public reason: string, message: string) {
    super(message);
  }
}

export interface RelayStoreSnapshot {
  intents: PassIntent[];
  hops: Hop[];
  holders: Array<[string, string]>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function addressKey(value: string): string {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

const PAYMENT_RAIL_MARKER_PREFIX = "rail:";

export function paymentRailMarker(address: string): string {
  return `${PAYMENT_RAIL_MARKER_PREFIX}${addressKey(address)}`;
}

export function paymentRailAddress(value: string): string | null {
  const raw = String(value ?? "");
  if (!raw.toLowerCase().startsWith(PAYMENT_RAIL_MARKER_PREFIX)) return null;
  const address = raw.slice(PAYMENT_RAIL_MARKER_PREFIX.length);
  return addressKey(address) || null;
}

/**
 * Canonical relay store. It is in-memory by default, but exposes a stable
 * snapshot/hydration boundary and a mutation hook so durable adapters can
 * persist the exact same fail-closed state machine without reimplementing it.
 */
export class RelayStore {
  private intents = new Map<string, PassIntent>(); // key: batonId
  private hops: Hop[] = [];
  private holders = new Map<string, string>(); // last canonical holder by baton

  constructor(snapshot?: RelayStoreSnapshot) {
    if (snapshot) {
      // Backward-compatible hydration: snapshots written before the opaque
      // commitment hardening did not have recipientData.
      this.intents = new Map(snapshot.intents.map((intent) => [intent.batonId, clone({
        ...intent,
        recipientData: intent.recipientData ?? null,
        authorizedPaymentWallets: intent.authorizedPaymentWallets?.length
          ? intent.authorizedPaymentWallets
          : [intent.currentHolder],
      })]));
      this.hops = snapshot.hops.map(clone);
      this.holders = new Map(snapshot.holders);
    }
  }

  protected onMutation(): void {
    // Durable adapters override this hook.
  }

  snapshot(): RelayStoreSnapshot {
    return {
      intents: [...this.intents.values()].map(clone),
      hops: this.hops.map(clone),
      holders: [...this.holders.entries()],
    };
  }

  key(batonId: string) {
    return batonId;
  }

  getActiveIntent(batonId: string): PassIntent | undefined {
    return this.intents.get(this.key(batonId));
  }

  getHops(batonId: string): Hop[] {
    return this.hops.filter((h) => h.batonId === batonId).sort((a, b) => a.sequence - b.sequence);
  }

  getHop(batonId: string, sequence: number): Hop | undefined {
    return this.hops.find((h) => h.batonId === batonId && h.sequence === sequence);
  }

  findHopByTxHash(txHash: string): Hop | undefined {
    return this.hops.find((h) => h.txHash === txHash);
  }

  getCurrentSequence(batonId: string): number {
    const hops = this.getHops(batonId).filter((hop) => hop.status === "FINAL");
    return hops.length === 0 ? 0 : hops[hops.length - 1].sequence;
  }

  getCurrentHolder(batonId: string): string | undefined {
    return this.holders.get(this.key(batonId));
  }

  /**
   * Commit an atomic intent BEFORE any transaction is broadcast. Reach Mission
   * calls this with `requireOpaqueTag`, which binds the only acceptable
   * on-chain transaction to an opaque recipient-data commitment.
   */
  createIntent(
    batonId: string,
    currentHolder: string,
    recipient: string,
    options: { requireOpaqueTag?: boolean; authorizedPaymentWallets?: string[]; invitationId?: string | null } = {}
  ): PassIntent {
    const existing = this.getActiveIntent(batonId);
    if (existing) {
      throw new RelayValidationError(
        "DUPLICATE_INTENT",
        `Baton ${batonId} already has an active intent at sequence ${existing.sequence}`
      );
    }
    if (currentHolder === recipient) {
      throw new RelayValidationError("SELF_PASS", "Cannot pass the baton to yourself");
    }
    const knownHolder = this.getCurrentHolder(batonId);
    if (knownHolder !== undefined && currentHolder !== knownHolder) {
      throw new RelayValidationError(
        "WRONG_CURRENT_HOLDER",
        `Baton ${batonId} is held by ${knownHolder}, not ${currentHolder}`
      );
    }

    const sequence = this.getCurrentSequence(batonId) + 1;
    const nonce = randomUUID();
    const paymentWallets = [currentHolder, ...(options.authorizedPaymentWallets ?? [])]
      .filter((wallet, index, all) =>
        Boolean(addressKey(wallet))
        && all.findIndex((candidate) => addressKey(candidate) === addressKey(wallet)) === index
      );
    const intent: PassIntent = {
      batonId,
      sequence,
      invitationId: options.invitationId ?? null,
      currentHolder,
      recipient,
      authorizedPaymentWallets: paymentWallets,
      nonce,
      recipientData: options.requireOpaqueTag
        ? opaqueHopCommitment({
            batonId,
            sequence,
            currentHolder,
            recipient,
            nonce,
            authorizedPaymentWallets: paymentWallets,
          })
        : null,
      createdAt: Date.now(),
    };
    this.intents.set(this.key(batonId), intent);
    this.holders.set(this.key(batonId), currentHolder);
    this.onMutation();
    return intent;
  }

  cancelIntent(batonId: string) {
    const changed = this.intents.delete(this.key(batonId));
    if (changed) this.onMutation();
  }

  /**
   * Freeze independently verified Nimiq Pay payment rails into the active
   * pre-broadcast intent. Rails are derivative payment sources for wallets that
   * were already authorized at AUTHORIZE_PASS; they never change the canonical
   * holder, recipient, amount, nonce, or opaque recipient-data commitment.
   *
   * Once any transaction hash is recorded for the intent, the source snapshot
   * is immutable. Repeating the same rail set before broadcast is idempotent.
   */
  freezeVerifiedPaymentRails(batonId: string, rails: string[]): PassIntent {
    const intent = this.getActiveIntent(batonId);
    if (!intent) {
      throw new RelayValidationError("NO_ACTIVE_INTENT", `No active intent for baton ${batonId}`);
    }
    const hop = this.getHop(batonId, intent.sequence);
    if (hop?.txHash) {
      throw new RelayValidationError(
        "PAYMENT_RAIL_SNAPSHOT_LOCKED",
        `Cannot change payment sources for baton ${batonId} after a transaction hash is recorded`
      );
    }

    const next = [...intent.authorizedPaymentWallets];
    for (const rail of rails) {
      const marker = paymentRailMarker(rail);
      if (marker === PAYMENT_RAIL_MARKER_PREFIX) continue;
      if (!next.some((candidate) => candidate.toLowerCase() === marker.toLowerCase())) next.push(marker);
    }

    const changed =
      next.length !== intent.authorizedPaymentWallets.length
      || next.some((candidate, index) => candidate !== intent.authorizedPaymentWallets[index]);
    if (!changed) return intent;

    intent.authorizedPaymentWallets = next;
    this.onMutation();
    return intent;
  }

  /** Record a hop for (batonId, sequence), replacing the same slot on retry. */
  recordHop(hop: Hop) {
    if (hop.txHash) {
      const existing = this.findHopByTxHash(hop.txHash);
      if (existing && (existing.batonId !== hop.batonId || existing.sequence !== hop.sequence)) {
        throw new RelayValidationError(
          "DUPLICATE_TX_HASH",
          `Transaction hash ${hop.txHash} has already been recorded for baton ${existing.batonId} at sequence ${existing.sequence}`
        );
      }
    }
    const idx = this.hops.findIndex((h) => h.batonId === hop.batonId && h.sequence === hop.sequence);
    if (idx >= 0) this.hops[idx] = hop;
    else this.hops.push(hop);
    if (hop.status === "FINAL") {
      this.holders.set(this.key(hop.batonId), hop.recipient);
      this.intents.delete(this.key(hop.batonId));
    }
    this.onMutation();
  }

  /** Mutates a recorded hop in place (PENDING -> INCLUDED -> FINAL, or -> INVALID). */
  updateHop(batonId: string, sequence: number, patch: Partial<Pick<Hop, "status" | "value" | "confirmedAt">>): Hop {
    const hop = this.getHop(batonId, sequence);
    if (!hop) throw new RelayValidationError("HOP_NOT_FOUND", `No hop at sequence ${sequence} for baton ${batonId}`);
    Object.assign(hop, patch);
    if (hop.status === "FINAL") {
      this.holders.set(this.key(hop.batonId), hop.recipient);
      this.intents.delete(this.key(hop.batonId));
    }
    this.onMutation();
    return hop;
  }
}

/** Validate an observed transaction against the committed intent. */
export function validateTransactionAgainstIntent(
  intent: PassIntent,
  tx: NimiqTxLookup,
  options: { authorizedPaymentSender?: string | null } = {}
): void {
  const directHolder = addressKey(tx.from) === addressKey(intent.currentHolder);
  const authorizedRail = Boolean(options.authorizedPaymentSender)
    && addressKey(tx.from) === addressKey(options.authorizedPaymentSender!);
  if (!directHolder && !authorizedRail) {
    throw new RelayValidationError(
      "WRONG_SENDER",
      `Transaction sender ${tx.from} is neither the committed holder nor an independently verified payment rail for that holder`
    );
  }
  if (addressKey(tx.to) !== addressKey(intent.recipient)) {
    throw new RelayValidationError("WRONG_RECIPIENT", `Transaction recipient ${tx.to} does not match committed recipient ${intent.recipient}`);
  }
  if (tx.value !== ONE_NIM_IN_LUNA) {
    throw new RelayValidationError(
      "WRONG_AMOUNT",
      `Transaction value ${tx.value} Luna does not equal exactly ${ONE_NIM_IN_LUNA} Luna (1 NIM)`
    );
  }

  // Reach Mission production intents make recipient data mandatory and exact.
  if (intent.recipientData !== null) {
    if (tx.recipientData === undefined) {
      throw new RelayValidationError("MISSING_HOP_COMMITMENT", "Canonical Reach Mission pass is missing its opaque on-chain commitment");
    }
    if (tx.recipientData !== intent.recipientData) {
      throw new RelayValidationError(
        "WRONG_HOP_COMMITMENT",
        `Transaction recipient data does not match the authorized opaque hop commitment`
      );
    }
    return;
  }

  // Legacy spike compatibility: if a legacy caller attached a clear-text tag,
  // validate it, but Reach Mission never uses this branch.
  if (tx.recipientData !== undefined) {
    const expected = batonDataTag(intent.batonId, intent.sequence);
    if (tx.recipientData !== expected) {
      throw new RelayValidationError(
        "WRONG_BATON_TAG",
        `Transaction recipient data "${tx.recipientData}" does not match expected tag "${expected}"`
      );
    }
  }
}

export { INTENT_VALIDITY_WINDOW_MS };

export function isIntentStale(intent: PassIntent, now = Date.now()): boolean {
  return now - intent.createdAt > INTENT_VALIDITY_WINDOW_MS;
}

/** Dormancy is display-only and never mutates custody. */
export const DORMANCY_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function isDormant(lastActionAt: number, now = Date.now()): boolean {
  return now - lastActionAt > DORMANCY_THRESHOLD_MS;
}

export type { HopStatus };
