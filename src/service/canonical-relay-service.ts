import type { Hop, HopStatus, NimiqTxLookup, PassIntent } from "../core/types.js";
import { RelayStore, RelayValidationError, isDormant, isIntentStale, validateTransactionAgainstIntent } from "../core/relay.js";
import type { NimiqRpcClient } from "../nimiq/rpc-client.js";
import { hasReachedFinality, isIncluded } from "../nimiq/rpc-client.js";

export type PublicStatus = "READY" | "PENDING" | "CONFIRMED" | "CANCELLED" | "INVALID";

function toPublicStatus(status: HopStatus): PublicStatus {
  switch (status) {
    case "PENDING":
    case "INCLUDED": return "PENDING";
    case "FINAL": return "CONFIRMED";
    case "CANCELLED": return "CANCELLED";
    case "INVALID": return "INVALID";
  }
}

function addressKey(value: string): string {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

export interface PublicHop {
  baton_id: string;
  sequence: number;
  invitation_id: string | null;
  current_holder: string;
  recipient: string;
  tx_hash: string | null;
  status: PublicStatus;
  created_at: string;
  confirmed_at: string | null;
}

export interface PublicRelayView {
  baton_id: string;
  sequence: number;
  current_holder: string;
  status: PublicStatus;
  hop_count: number;
  activity: "ACTIVE" | "DORMANT";
}

function toPublicHop(hop: Hop): PublicHop {
  return {
    baton_id: hop.batonId,
    sequence: hop.sequence,
    invitation_id: hop.invitationId ?? null,
    current_holder: hop.currentHolder,
    recipient: hop.recipient,
    tx_hash: hop.txHash,
    status: toPublicStatus(hop.status),
    created_at: new Date(hop.createdAt).toISOString(),
    confirmed_at: hop.confirmedAt === null ? null : new Date(hop.confirmedAt).toISOString(),
  };
}

/** Server-side canonical relay. Wallet operations never occur here. */
export class CanonicalRelayService {
  constructor(private store: RelayStore, private rpc: NimiqRpcClient) {}

  /**
   * Durability barrier used by request/coordinator boundaries. File/in-memory
   * stores do not expose flush(); PostgreSQL's queued adapter does. A mutation
   * must not be acknowledged as durable until this promise resolves.
   */
  async flushDurability(): Promise<void> {
    const durable = this.store as RelayStore & { flush?: () => Promise<void> };
    if (typeof durable.flush === "function") await durable.flush();
  }

  initiatePass(
    batonId: string,
    currentHolder: string,
    recipient: string,
    options: { requireOpaqueTag?: boolean; authorizedPaymentWallets?: string[]; invitationId?: string | null } = {}
  ): PassIntent {
    return this.store.createIntent(batonId, currentHolder, recipient, options);
  }

  getActiveIntent(batonId: string): PassIntent | null {
    return this.store.getActiveIntent(batonId) ?? null;
  }

  hasRecordedBroadcast(batonId: string): boolean {
    const intent = this.store.getActiveIntent(batonId);
    if (!intent) return false;
    const hop = this.store.getHop(batonId, intent.sequence);
    return Boolean(hop?.txHash);
  }

  private recordObservedBroadcast(intent: PassIntent, txHash: string): Hop {
    const existingHop = this.store.findHopByTxHash(txHash);
    if (existingHop && (existingHop.batonId !== intent.batonId || existingHop.sequence !== intent.sequence)) {
      throw new RelayValidationError(
        "DUPLICATE_TX_HASH",
        `Transaction hash ${txHash} has already been recorded for baton ${existingHop.batonId} at sequence ${existingHop.sequence}`
      );
    }
    const hop: Hop = {
      batonId: intent.batonId,
      sequence: intent.sequence,
      invitationId: intent.invitationId ?? null,
      currentHolder: intent.currentHolder,
      recipient: intent.recipient,
      nonce: intent.nonce,
      txHash,
      value: null,
      status: "PENDING",
      createdAt: intent.createdAt,
      confirmedAt: null,
    };
    this.store.recordHop(hop);
    return hop;
  }

  recordBroadcast(batonId: string, txHash: string): Hop {
    const intent = this.store.getActiveIntent(batonId);
    if (!intent) throw new RelayValidationError("NO_ACTIVE_INTENT", `No active intent for baton ${batonId} to attach a broadcast to`);
    if (isIntentStale(intent)) {
      this.store.cancelIntent(batonId);
      throw new RelayValidationError("STALE_INTENT", `Intent for baton ${batonId} at sequence ${intent.sequence} has expired`);
    }
    return this.recordObservedBroadcast(intent, txHash);
  }

  cancelPass(batonId: string): void {
    const intent = this.store.getActiveIntent(batonId);
    if (!intent) return;
    const hop = this.store.getHop(batonId, intent.sequence);
    if (hop && hop.txHash !== null) {
      throw new RelayValidationError(
        "CANNOT_CANCEL_BROADCAST",
        `Cannot cancel pass for baton ${batonId}: transaction ${hop.txHash} has already been broadcast`
      );
    }
    this.store.cancelIntent(batonId);
  }

  /**
   * A pass keeps one custody holder, but its AUTHORIZE_PASS snapshot may include
   * additional wallets that the same signed-in NimCarry profile verified before
   * the intent was created. Those wallets may fund the exact committed payment
   * without becoming the canonical holder.
   *
   * Direct basic-wallet payments are accepted only when the observed sender is
   * in the frozen snapshot. HTLC rails are accepted only when their on-chain
   * declared sender is in that snapshot and that same wallet funded the HTLC's
   * original total amount.
   */
  private async verifiedPaymentRail(intent: PassIntent, tx: NimiqTxLookup): Promise<string | null> {
    const authorizedWallets = new Set(
      (intent.authorizedPaymentWallets?.length ? intent.authorizedPaymentWallets : [intent.currentHolder])
        .map(addressKey)
    );

    if (authorizedWallets.has(addressKey(tx.from))) {
      return addressKey(tx.from) === addressKey(intent.currentHolder) ? null : tx.from;
    }
    if (!this.rpc.getAccountByAddress || !this.rpc.getTransactionsByAddress) return null;

    const account = await this.rpc.getAccountByAddress(tx.from);
    if (!account || String(account.type).toLowerCase() !== "htlc") return null;
    if (!account.sender || !authorizedWallets.has(addressKey(account.sender))) return null;
    if (!Number.isFinite(account.totalAmount) || Number(account.totalAmount) <= 0) return null;

    const history = await this.rpc.getTransactionsByAddress(tx.from);
    const creationFunding = history.find((candidate) =>
      addressKey(candidate.to) === addressKey(tx.from)
      && addressKey(candidate.from) === addressKey(account.sender!)
      && candidate.value === Number(account.totalAmount)
    );
    return creationFunding ? tx.from : null;
  }

  private async validateObservedTransaction(intent: PassIntent, tx: NimiqTxLookup): Promise<void> {
    const authorizedPaymentSender = await this.verifiedPaymentRail(intent, tx);
    validateTransactionAgainstIntent(intent, tx, { authorizedPaymentSender });
  }

  private async discoverMatchingBroadcast(intent: PassIntent): Promise<NimiqTxLookup | null> {
    if (!this.rpc.getTransactionsByAddress) return null;
    const observed = await this.rpc.getTransactionsByAddress(intent.recipient);
    const matches = new Map<string, NimiqTxLookup>();
    for (const tx of observed) {
      try {
        await this.validateObservedTransaction(intent, tx);
        matches.set(tx.hash, tx);
      } catch {
        // Address history is untrusted input. Only the exact committed recipient,
        // amount and opaque hop commitment plus a verified holder/payment-rail
        // relationship can recover a broadcast.
      }
    }
    if (matches.size > 1) {
      throw new RelayValidationError(
        "AMBIGUOUS_MATCHING_BROADCAST",
        `More than one on-chain transaction matches baton ${intent.batonId} at sequence ${intent.sequence}; manual review is required`
      );
    }
    return matches.values().next().value ?? null;
  }

  private async applyObservedTransaction(intent: PassIntent, hop: Hop, tx: NimiqTxLookup): Promise<Hop> {
    try {
      await this.validateObservedTransaction(intent, tx);
    } catch (err) {
      this.store.updateHop(intent.batonId, intent.sequence, { status: "INVALID" });
      throw err;
    }

    if (!isIncluded(tx)) return hop;
    const headBlockNumber = await this.rpc.getBlockNumber();
    const final = hasReachedFinality(tx, headBlockNumber);
    return this.store.updateHop(intent.batonId, intent.sequence, {
      status: final ? "FINAL" : "INCLUDED",
      value: tx.value,
      confirmedAt: final ? Date.now() : null,
    });
  }

  async reconcile(batonId: string): Promise<Hop | null> {
    const intent = this.store.getActiveIntent(batonId);
    if (!intent) return null;

    let hop = this.store.getHop(batonId, intent.sequence);
    if (!hop || hop.txHash === null) {
      // Nimiq Pay can fail after the approval UI without returning a hash. Before
      // allowing the no-hash path to remain unresolved, independently scan the
      // recipient's read-only chain history for the exact opaque commitment.
      // This recovers a real broadcast without trusting wallet UI state and
      // prevents a second 1 NIM send from being treated as the next action.
      const discovered = await this.discoverMatchingBroadcast(intent);
      if (discovered) {
        hop = this.recordObservedBroadcast(intent, discovered.hash);
        return this.applyObservedTransaction(intent, hop, discovered);
      }

      if (isIntentStale(intent)) {
        if (hop) {
          const invalidHop = this.store.updateHop(batonId, intent.sequence, { status: "INVALID" });
          this.store.cancelIntent(batonId);
          return invalidHop;
        }
        const invalidHop: Hop = {
          batonId: intent.batonId,
          sequence: intent.sequence,
          invitationId: intent.invitationId ?? null,
          currentHolder: intent.currentHolder,
          recipient: intent.recipient,
          nonce: intent.nonce,
          txHash: null,
          value: null,
          status: "INVALID",
          createdAt: intent.createdAt,
          confirmedAt: null,
        };
        this.store.recordHop(invalidHop);
        this.store.cancelIntent(batonId);
        return invalidHop;
      }
      return hop ?? null;
    }

    const tx = await this.rpc.getTransactionByHash(hop.txHash);
    if (!tx) {
      if (isIntentStale(intent)) {
        const invalidHop = this.store.updateHop(batonId, intent.sequence, { status: "INVALID" });
        this.store.cancelIntent(batonId);
        return invalidHop;
      }
      return hop;
    }

    return this.applyObservedTransaction(intent, hop, tx);
  }

  getHistory(batonId: string): PublicHop[] {
    return this.store.getHops(batonId).map(toPublicHop);
  }

  getPublicView(batonId: string, now = Date.now()): PublicRelayView {
    const hops = this.store.getHops(batonId);
    const intent = this.store.getActiveIntent(batonId);
    const latest = hops[hops.length - 1];
    const status: PublicStatus = intent
      ? latest && latest.sequence === intent.sequence
        ? toPublicStatus(latest.status)
        : "READY"
      : latest?.status === "INVALID"
        ? "INVALID"
        : "READY";
    const currentHolder = intent
      ? intent.currentHolder
      : (this.store.getCurrentHolder(batonId) ?? latest?.recipient ?? "unassigned");
    const lastActionAt = latest?.confirmedAt ?? latest?.createdAt ?? intent?.createdAt ?? now;
    return {
      baton_id: batonId,
      sequence: this.store.getCurrentSequence(batonId),
      current_holder: currentHolder,
      status,
      hop_count: hops.filter((h) => h.status === "FINAL").length,
      activity: isDormant(lastActionAt, now) ? "DORMANT" : "ACTIVE",
    };
  }
}
