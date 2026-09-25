// Carry One — canonical domain types.
// These are transport-agnostic: no Nimiq RPC shapes and no HTTP shapes live here.

export const ONE_NIM_IN_LUNA = 100_000; // 1 NIM = 100,000 Luna

/** Lifecycle of a single hop's underlying transaction. */
export type HopStatus = "PENDING" | "INCLUDED" | "FINAL" | "CANCELLED" | "INVALID";

/**
 * A committed, atomic intent to make the next canonical pass.
 * Created BEFORE any transaction is broadcast: the canonical hop is whichever
 * included transaction matches this intent, not "whichever transaction the
 * service happens to see first". This is what closes the race condition where
 * two devices for the same holder could otherwise both start a pass.
 */
export interface PassIntent {
  batonId: string;
  sequence: number; // expected next hop number
  /** Mission invitation whose accepted bridge authorized this delivery. */
  invitationId?: string | null;
  currentHolder: string; // wallet identity authorized to make this pass
  recipient: string; // intended next holder
  /**
   * Base wallets are frozen at AUTHORIZE_PASS. The holder remains the custody
   * authority, but any verified same-profile wallet in this snapshot may fund
   * the exact committed 1 NIM payment.
   *
   * Before the wallet transaction is requested, the server may append
   * independently verified derivative Nimiq Pay rails as reserved `rail:`
   * markers. Those markers do not add a new human wallet authority and are
   * never learned/expanded during later reconciliation.
   */
  authorizedPaymentWallets: string[];
  nonce: string; // uniqueness guard against duplicate/replayed intents
  /**
   * Reach Mission production flows bind the pass to an opaque on-chain
   * commitment. Legacy spike flows may leave this null for backwards-compatible
   * tests, but the mission coordinator always requires it.
   */
  recipientData: string | null;
  createdAt: number; // epoch ms
}

/** A confirmed or in-flight hop, once a transaction has been broadcast against an intent. */
export interface Hop {
  batonId: string;
  sequence: number;
  /** Durable provenance link to the bridge invitation for this delivery. */
  invitationId?: string | null;
  currentHolder: string;
  recipient: string;
  nonce: string;
  txHash: string | null; // null until a transaction is broadcast
  value: number | null; // Luna, filled in once we observe the tx
  status: HopStatus;
  createdAt: number;
  confirmedAt: number | null; // set when status transitions to FINAL
}

/** Display-only relay activity state. Never affects `status`. */
export type RelayActivity = "ACTIVE" | "DORMANT";

/** Minimal shape of what we need back from Nimiq RPC's getTransactionByHash. */
export interface NimiqTxLookup {
  hash: string;
  from: string; // human-readable on-chain sender; may be a Nimiq Pay HTLC payment rail
  to: string; // human-readable address
  value: number; // Luna
  blockNumber: number | null; // null while still in mempool
  confirmations: number; // 0 while unconfirmed
  /** Account type carried by the historic transaction itself; survives later account deletion/consumption. */
  senderType?: "basic" | "vesting" | "htlc" | "staking" | string;
  /** Account type the transaction addressed/created; useful to prove historic HTLC creation. */
  recipientType?: "basic" | "vesting" | "htlc" | "staking" | string;
  /** Recipient-data payload read back off-chain. Reach Mission canonical passes require it. */
  recipientData?: string;
}

/**
 * Minimal account metadata needed to prove that a Nimiq Pay HTLC payment rail
 * belongs to the wallet identity that signed AUTHORIZE_PASS. Unknown account
 * types intentionally expose no ownership fields.
 */
export interface NimiqAccountLookup {
  address: string;
  balance: number;
  type: "basic" | "vesting" | "htlc" | "staking" | string;
  sender?: string;
  recipient?: string;
  totalAmount?: number;
}

/**
 * Legacy technical-spike tag retained for compatibility with old relay-only
 * fixtures. Do not use this for Reach Mission production passes because it
 * exposes baton identity/sequence directly on-chain.
 */
export function batonDataTag(batonId: string, sequence: number): string {
  return `carryone:${batonId}:${sequence}`;
}
