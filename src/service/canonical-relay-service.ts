import type { Hop, HopStatus, NimiqTxLookup, PassIntent } from "../core/types.js";
import { RelayStore, RelayValidationError, isDormant, isIntentStale, paymentRailAddress, validateTransactionAgainstIntent } from "../core/relay.js";
import type { NimiqRpcClient } from "../nimiq/rpc-client.js";
import { hasReachedFinality, isIncluded, normalizeNimiqAccountType } from "../nimiq/rpc-client.js";

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
  invitation_id?: string | null;
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

  /**
   * Active relay intents that still need independent chain reconciliation.
   *
   * FINAL removes the active intent from the canonical store, while INVALID
   * hops are deliberately excluded so a bad observation does not create an
   * endless background retry loop. Intents with no recorded hash are included:
   * reconcile() may independently discover an exact matching broadcast from
   * the committed recipient-data tag.
   */
  getPendingReconciliationBatonIds(): string[] {
    const snapshot = this.store.snapshot();
    return snapshot.intents
      .filter((intent) => {
        const hop = snapshot.hops.find(
          (candidate) => candidate.batonId === intent.batonId && candidate.sequence === intent.sequence
        );
        return !hop || hop.status === "PENDING" || hop.status === "INCLUDED";
      })
      .map((intent) => intent.batonId);
  }

  /**
   * Durable FINAL hops whose mission projection may still need repair.
   *
   * FINAL relay state and mission ARRIVED state live in separate durable stores.
   * A process can stop after persisting FINAL but before projecting that fact
   * into the mission row. Exposing the baton ids lets the coordinator retry the
   * idempotent projection on startup/background sweeps without initiating any
   * wallet action or payment.
   */
  getFinalizedProjectionBatonIds(): string[] {
    const snapshot = this.store.snapshot();
    return [...new Set(
      snapshot.hops
        .filter((hop) => hop.status === "FINAL")
        .map((hop) => hop.batonId)
    )];
  }

  /**
   * Active intents with an exact transaction hash that was previously marked
   * INVALID are safe to re-verify after a validator/runtime upgrade.
   *
   * This is read-only chain recovery: it never authorizes, signs, or broadcasts
   * another payment. The coordinator bounds attempts per process so a genuinely
   * invalid transaction cannot create an endless reconciliation loop.
   */
  getRecoverableInvalidBroadcastBatonIds(): string[] {
    const snapshot = this.store.snapshot();
    return snapshot.intents
      .filter((intent) => {
        const hop = snapshot.hops.find(
          (candidate) => candidate.batonId === intent.batonId && candidate.sequence === intent.sequence
        );
        return hop?.status === "INVALID" && Boolean(hop.txHash);
      })
      .map((intent) => intent.batonId);
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

  private paymentSourceSnapshot(intent: PassIntent): {
    wallets: Set<string>;
    rails: Set<string>;
  } {
    const sources = intent.authorizedPaymentWallets?.length
      ? intent.authorizedPaymentWallets
      : [intent.currentHolder];
    const wallets = new Set<string>();
    const rails = new Set<string>();
    for (const source of sources) {
      const rail = paymentRailAddress(source);
      if (rail) rails.add(addressKey(rail));
      else wallets.add(addressKey(source));
    }
    return { wallets, rails };
  }

  private async independentlyVerifyHtlcRail(
    intent: PassIntent,
    railAddress: string,
    observedPayment?: NimiqTxLookup
  ): Promise<boolean> {
    if (!this.rpc.getTransactionsByAddress) return false;
    const { wallets } = this.paymentSourceSnapshot(intent);
    const rail = addressKey(railAddress);
    if (!rail) return false;

    const history = await this.rpc.getTransactionsByAddress(railAddress);

    // Preferred proof for new sends: read the still-live HTLC metadata, then
    // corroborate the exact funding transaction from an already-authorized
    // wallet. This is the strongest pre-payment proof and is what we freeze.
    if (this.rpc.getAccountByAddress) {
      const account = await this.rpc.getAccountByAddress(railAddress);
      if (
        account
        && normalizeNimiqAccountType(account.type) === "htlc"
        && account.sender
        && wallets.has(addressKey(account.sender))
        && Number.isFinite(account.totalAmount)
        && Number(account.totalAmount) > 0
      ) {
        const funding = history.find((candidate) =>
          candidate.blockNumber !== null
          && addressKey(candidate.to) === rail
          && addressKey(candidate.from) === addressKey(account.sender!)
          && candidate.value === Number(account.totalAmount)
        );
        if (funding) return true;
      }
    }

    // Legacy recovery only: old intents predate the frozen rail snapshot. A
    // consumed HTLC can disappear/change in current account state, but the
    // historic transaction itself permanently carries its sender/recipient
    // account types. Accept recovery only when BOTH:
    //   1) the observed payment is itself from an HTLC, and
    //   2) chain history contains the HTLC-creation/funding transaction from a
    //      wallet already frozen at AUTHORIZE_PASS into this exact rail.
    //
    // This does not authorize an arbitrary transfer-to-address as a payment
    // rail: the funding transaction must have recipientType=HTLC on-chain.
    if (!observedPayment) return false;
    if (addressKey(observedPayment.from) !== rail) return false;
    if (normalizeNimiqAccountType(observedPayment.senderType) !== "htlc") return false;

    const creationCandidates = history.filter((candidate) =>
      candidate.blockNumber !== null
      && addressKey(candidate.to) === rail
      && wallets.has(addressKey(candidate.from))
      && normalizeNimiqAccountType(candidate.recipientType) === "htlc"
      && Number.isFinite(candidate.value)
      && candidate.value > 0
      && (
        observedPayment.blockNumber === null
        || candidate.blockNumber === null
        || candidate.blockNumber <= observedPayment.blockNumber
      )
    );
    return creationCandidates.length === 1;
  }

  /**
   * Freeze Nimiq Pay HTLC rails before the wallet transaction is requested.
   *
   * The client may tell us which exposed accounts look like rails, but the
   * server independently proves each rail from live chain metadata + its funding
   * transaction. Only rails derived from the wallets already frozen at
   * AUTHORIZE_PASS can be added. Persisting this pre-spend proof prevents a
   * consumed HTLC from becoming unverifiable during later reconciliation.
   */
  async freezeVerifiedPaymentRails(batonId: string, candidateRails: string[]): Promise<PassIntent> {
    const intent = this.store.getActiveIntent(batonId);
    if (!intent) throw new RelayValidationError("NO_ACTIVE_INTENT", `No active intent for baton ${batonId}`);
    if (isIntentStale(intent)) {
      this.store.cancelIntent(batonId);
      throw new RelayValidationError("STALE_INTENT", `Intent for baton ${batonId} at sequence ${intent.sequence} has expired`);
    }

    const { rails: alreadyFrozen } = this.paymentSourceSnapshot(intent);
    const unique = candidateRails.filter((rail, index, all) => {
      const key = addressKey(rail);
      return Boolean(key) && all.findIndex((candidate) => addressKey(candidate) === key) === index;
    });
    const pending = unique.filter((rail) => !alreadyFrozen.has(addressKey(rail)));
    for (const rail of pending) {
      if (!await this.independentlyVerifyHtlcRail(intent, rail)) {
        throw new RelayValidationError(
          "PAYMENT_RAIL_UNVERIFIED",
          `Nimiq Pay account ${rail} could not be independently proven as a payment rail for an authorized wallet`
        );
      }
    }

    const updated = this.store.freezeVerifiedPaymentRails(batonId, pending);
    await this.flushDurability();
    return updated;
  }

  /**
   * A pass keeps one custody holder, but its AUTHORIZE_PASS snapshot may include
   * additional wallets that the same signed-in NimCarry profile verified before
   * the intent was created. Those wallets may fund the exact committed payment
   * without becoming the canonical holder.
   *
   * Direct basic-wallet payments are accepted only when the observed sender is
   * in the frozen wallet snapshot. HTLC rails use the durable pre-payment rail
   * snapshot when present. Older intents fall back to independent live
   * verification so already-created missions remain recoverable.
   */
  private async verifiedPaymentRail(intent: PassIntent, tx: NimiqTxLookup): Promise<string | null> {
    const { wallets: authorizedWallets, rails: frozenRails } = this.paymentSourceSnapshot(intent);
    const sender = addressKey(tx.from);

    if (authorizedWallets.has(sender)) {
      return sender === addressKey(intent.currentHolder) ? null : tx.from;
    }
    if (frozenRails.has(sender)) return tx.from;

    return await this.independentlyVerifyHtlcRail(intent, tx.from, tx) ? tx.from : null;
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
