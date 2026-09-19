import { randomUUID } from "node:crypto";
import type { PgPoolLike } from "./pg-pool.js";
import { RelayStore, type RelayStoreSnapshot } from "../core/relay.js";
import type { Hop, HopStatus, PassIntent } from "../core/types.js";

interface IntentRow {
  mission_id: string;
  sequence: number;
  current_holder_wallet_normalized: string;
  recipient_wallet_normalized: string;
  nonce: string;
  recipient_data: string;
  authorized_payment_wallets: string[] | null;
  created_at: Date;
}

interface HopRow {
  mission_id: string;
  sequence: number;
  sender_wallet_normalized: string;
  recipient_wallet_normalized: string;
  nonce: string;
  tx_hash: string | null;
  recipient_value_luna: number | null;
  status: HopStatus;
  created_at: Date;
  included_at: Date | null;
  finalized_at: Date | null;
  invalidated_at: Date | null;
}

function intentFromRow(row: IntentRow): PassIntent {
  return {
    batonId: row.mission_id,
    sequence: row.sequence,
    currentHolder: row.current_holder_wallet_normalized,
    recipient: row.recipient_wallet_normalized,
    nonce: row.nonce,
    recipientData: row.recipient_data,
    authorizedPaymentWallets: row.authorized_payment_wallets?.length
      ? row.authorized_payment_wallets
      : [row.current_holder_wallet_normalized],
    createdAt: row.created_at.getTime(),
  };
}

function confirmedMs(row: HopRow): number | null {
  const base = row.finalized_at ?? row.included_at ?? row.invalidated_at ?? null;
  return base === null ? null : base.getTime();
}

function hopFromRow(row: HopRow): Hop {
  return {
    batonId: row.mission_id,
    sequence: row.sequence,
    currentHolder: row.sender_wallet_normalized,
    recipient: row.recipient_wallet_normalized,
    nonce: row.nonce,
    txHash: row.tx_hash,
    value: row.recipient_value_luna,
    status: row.status,
    createdAt: row.created_at.getTime(),
    confirmedAt: confirmedMs(row),
  };
}

/**
 * Postgres-backed adapter for the canonical relay state machine.
 *
 * All relay validation (DUPLICATE_INTENT, SELF_PASS, WRONG_CURRENT_HOLDER,
 * DUPLICATE_TX_HASH, hop sequencing) lives in the shared {@link RelayStore}
 * base class and runs in-memory before any persistence. This adapter persists
 * the resulting snapshot to `pass_intents` + `hops` after each mutation and
 * rehydrates from those tables on construction, giving cross-process durability.
 * The DB's `global_tx_hash_replay_guard` is a cross-baton / cross-instance
 * final backstop over and above the in-memory check.
 *
 * Because Postgres reads are async, use the static {@link PgRelayStore.load}
 * factory (which hydrates before returning) rather than `new` directly.
 */
export class PgRelayStore extends RelayStore {
  private constructor(
    private readonly pool: PgPoolLike,
    snapshot: RelayStoreSnapshot
  ) {
    super(snapshot);
  }

  /**
   * Build a hydrated store. Loads persisted intents/hops/holders from Postgres
   * first, then constructs the in-memory state machine from that snapshot.
   */
  static async load(pool: PgPoolLike): Promise<PgRelayStore> {
    const snapshot = await loadSnapshot(pool);
    return new PgRelayStore(pool, snapshot);
  }

  protected override onMutation(): void {
    this.enqueue(this.snapshot());
  }

  private queue: Promise<void> = Promise.resolve();
  private persistError: Error | null = null;

  private enqueue(snapshot: RelayStoreSnapshot): void {
    const next = this.queue.then(() => this.writeSnapshot(snapshot));
    // Keep the queue resolvable so later writes still run; surface the first
    // failure through flush() instead of becoming an unhandled rejection.
    const settled = next.catch((error) => {
      this.persistError = this.persistError ?? (error as Error);
    });
    this.queue = settled;
  }

  /**
   * Wait for every queued write to settle and rethrow the first persistence
   * failure. Callers that require durability (or want to assert DB-level
   * rejects) await this after the synchronous mutation.
   */
  async flush(): Promise<void> {
    await this.queue;
    const error = this.persistError;
    this.persistError = null;
    if (error) throw error;
  }

  private async writeSnapshot(snapshot: RelayStoreSnapshot): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      try {
        for (const intent of snapshot.intents) {
          if (intent.recipientData === null) continue;
          await client.query(
            `INSERT INTO pass_intents
              (mission_id, invitation_id, sequence, current_holder_wallet_normalized,
               recipient_wallet_normalized, nonce, recipient_data, authorized_payment_wallets, created_at)
             VALUES ($1,(SELECT id FROM invitations WHERE mission_id=$1 AND sequence=$2 LIMIT 1),
                     $2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (mission_id) DO UPDATE SET
               sequence=EXCLUDED.sequence,
               current_holder_wallet_normalized=EXCLUDED.current_holder_wallet_normalized,
               recipient_wallet_normalized=EXCLUDED.recipient_wallet_normalized,
               nonce=EXCLUDED.nonce,
               recipient_data=EXCLUDED.recipient_data,
               authorized_payment_wallets=EXCLUDED.authorized_payment_wallets,
               created_at=EXCLUDED.created_at`,
            [
              intent.batonId,
              intent.sequence,
              intent.currentHolder,
              intent.recipient,
              intent.nonce,
              intent.recipientData,
              intent.authorizedPaymentWallets,
              new Date(intent.createdAt),
            ]
          );
        }

        // Hops are upserted by (mission_id, sequence) and never deleted: the
        // same row is patched in place (keeping its PK id) so the
        // global_tx_hash_replay_guard also protects against a different
        // store instance recording the same tx hash.
        for (const hop of snapshot.hops) {
          await client.query(
            `INSERT INTO hops
              (id, mission_id, invitation_id, sequence, sender_wallet_normalized,
               recipient_wallet_normalized, tx_hash, recipient_value_luna, status,
               created_at, included_at, finalized_at, invalidated_at)
             VALUES ($1,$2,(SELECT id FROM invitations WHERE mission_id=$2 AND sequence=$3 LIMIT 1),
                     $3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (mission_id, sequence) DO UPDATE SET
               sender_wallet_normalized=EXCLUDED.sender_wallet_normalized,
               recipient_wallet_normalized=EXCLUDED.recipient_wallet_normalized,
               tx_hash=EXCLUDED.tx_hash,
               recipient_value_luna=EXCLUDED.recipient_value_luna,
               status=EXCLUDED.status,
               included_at=EXCLUDED.included_at,
               finalized_at=EXCLUDED.finalized_at,
               invalidated_at=EXCLUDED.invalidated_at`,
            [
              randomUUID(),
              hop.batonId,
              hop.sequence,
              hop.currentHolder,
              hop.recipient,
              hop.txHash,
              hop.value,
              hop.status,
              new Date(hop.createdAt),
              hop.status === "INCLUDED" || hop.status === "FINAL" ? new Date(hop.createdAt) : null,
              hop.status === "FINAL" ? new Date(hop.confirmedAt ?? hop.createdAt) : null,
              hop.status === "INVALID" ? new Date(hop.createdAt) : null,
            ]
          );
        }

        // Intents are superseded once their sequence is finalized, so drop any
        // stale row regardless of which process finalized it. This must run
        // AFTER the hop upsert so the FINAL rows just written are visible.
        // pg-mem cannot parse correlated subqueries / DELETE USING on the
        // target table, so prunes use a simple select-then-delete loop.
        const finalized = await client.query<{ mission_id: string; sequence: number }>(
          `SELECT h.mission_id, MAX(h.sequence) AS sequence
           FROM hops h
           WHERE h.status = 'FINAL'
           GROUP BY h.mission_id
           ORDER BY h.mission_id`
        );
        for (const row of finalized.rows) {
          await client.query(
            `DELETE FROM pass_intents WHERE mission_id = $1 AND sequence <= $2`,
            [row.mission_id, row.sequence]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } finally {
      client.release();
    }
  }
}

async function loadSnapshot(pool: PgPoolLike): Promise<RelayStoreSnapshot> {
  const [intentsResult, hopsResult] = await Promise.all([
    pool.query<IntentRow>("SELECT * FROM pass_intents WHERE tx_hash IS NULL"),
    pool.query<HopRow>("SELECT * FROM hops ORDER BY mission_id, sequence"),
  ]);

  const hops = hopsResult.rows.map(hopFromRow);

  // FINAL hops define the canonical current holder, matching the in-memory
  // RelayStore behavior (holders only update on FINAL).
  const holders = new Map<string, string>();
  for (const hop of hops) {
    if (hop.status === "FINAL") holders.set(hop.batonId, hop.recipient);
  }

  return {
    intents: intentsResult.rows.map(intentFromRow),
    hops,
    holders: [...holders.entries()],
  };
}
