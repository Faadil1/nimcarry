import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrivateKey, PublicKey } from "@nimiq/core";
import { beforeAll, describe, expect, it } from "vitest";
import { PgMemPool } from "../helpers/pg-mem-pool.js";
import { PgRelayStore } from "../../src/persistence/pg-relay-store.js";
import { PgMissionRepository } from "../../src/persistence/pg-mission-repository.js";
import type { MissionRecord } from "../../src/mission/types.js";
import { normalizeNimiqAddress } from "../../src/mission/target-wallet-crypto.js";
import { ONE_NIM_IN_LUNA } from "../../src/core/types.js";

function wallet(): string {
  return PublicKey.derive(PrivateKey.generate()).toAddress().toUserFriendlyAddress();
}

function missionRecord(overrides: Partial<MissionRecord> = {}): MissionRecord {
  const creator = normalizeNimiqAddress(wallet());
  return {
    id: crypto.randomUUID(),
    creatorWalletNormalized: creator,
    creatorDisplayLabel: null,
    currentHolderWalletNormalized: creator,
    targetLabel: "Destination",
    targetWalletCiphertext: "v1.abc.def.ghi",
    targetWalletHmac: "hmac-target",
    targetConsentConfirmed: true,
    missionNote: "Get this to the target",
    status: "ACTIVE",
    visibility: "UNLISTED",
    finalizedHopCount: 0,
    currentSequence: 0,
    createdAt: 1000,
    arrivedAt: null,
    cancelledAt: null,
    updatedAt: 1000,
    ...overrides,
  };
}

const MIGRATION_PATH = join(import.meta.dirname!, "../../migrations/001_reach_mission_foundation.sql");

let pool: PgMemPool;
let missionRepo: PgMissionRepository;

beforeAll(async () => {
  pool = new PgMemPool();
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  await pool.exec(sql);
  // pg-mem lacks PostgreSQL's cardinality(text[]) function used by migration 006.
  // Add only the column here; production applies the full constraints in migration 006.
  await pool.exec("ALTER TABLE pass_intents ADD COLUMN authorized_payment_wallets text[]");
  missionRepo = new PgMissionRepository(pool);
});

// Creates a mission + accepted invitation, returning handles needed by relay operations.
async function seededMission() {
  const creator = normalizeNimiqAddress(wallet());
  const candidate = normalizeNimiqAddress(wallet());
  const mission = missionRecord({
    creatorWalletNormalized: creator,
    currentHolderWalletNormalized: creator,
  });
  await missionRepo.createMission(mission);
  const invId = crypto.randomUUID();
  const tokenHash = crypto.randomUUID();
  await missionRepo.createInvitation({
    id: invId,
    missionId: mission.id,
    sequence: 1,
    inviterWalletNormalized: creator,
    candidateLabel: null,
    candidateWalletNormalized: null,
    candidateDisplayLabel: null,
    whyYou: null,
    inviteTokenHash: tokenHash,
    status: "INVITED",
    createdAt: 3000,
    expiresAt: 3000 + 12 * 60 * 60 * 1000,
    acceptedAt: null,
    passDeadlineAt: null,
    declinedAt: null,
    withdrawnAt: null,
    completedAt: null,
    closedAt: null,
  });
  await missionRepo.acceptInvitation(invId, candidate, 4000, 4000 + 60 * 60 * 1000);
  return { mission, creator, candidate, invitationId: invId };
}

describe("PgRelayStore", () => {
  it("persists a created intent and rehydrates it after loading a new store", async () => {
    const { mission } = await seededMission();
    const relay = await PgRelayStore.load(pool);
    const creator = normalizeNimiqAddress(mission.creatorWalletNormalized);
    const paymentWallet = normalizeNimiqAddress(wallet());
    const intent = relay.createIntent(mission.id, creator, "RECIPIENT_W0", {
      requireOpaqueTag: true,
      authorizedPaymentWallets: [creator, paymentWallet],
    });
    expect(intent.recipientData).toMatch(/^co:v1:/);
    expect(intent.authorizedPaymentWallets).toEqual([creator, paymentWallet]);
    await relay.flush();

    // Reload from DB in a brand new store
    const fresh = await PgRelayStore.load(pool);
    const reloaded = fresh.getActiveIntent(mission.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.recipientData).toBe(intent.recipientData);
    expect(reloaded!.sequence).toBe(intent.sequence);
    expect(reloaded!.authorizedPaymentWallets).toEqual(intent.authorizedPaymentWallets);
  });

  it("persists a hop with tx hash and rehydrates it", async () => {
    const { mission, creator, candidate } = await seededMission();
    const relay = await PgRelayStore.load(pool);
    const intent = relay.createIntent(mission.id, normalizeNimiqAddress(creator), normalizeNimiqAddress(candidate), {
      requireOpaqueTag: true,
    });
    const txHash = "aa".repeat(32);
    relay.recordHop({
      batonId: mission.id,
      sequence: intent.sequence,
      currentHolder: intent.currentHolder,
      recipient: intent.recipient,
      nonce: intent.nonce,
      txHash,
      value: null,
      status: "PENDING",
      createdAt: intent.createdAt,
      confirmedAt: null,
    });
    const persistedHop = relay.getHop(mission.id, intent.sequence);
    expect(persistedHop!.txHash).toBe(txHash);
    expect(persistedHop!.status).toBe("PENDING");
    await relay.flush();

    const fresh = await PgRelayStore.load(pool);
    const hops = fresh.getHops(mission.id);
    expect(hops).toHaveLength(1);
    expect(hops[0].txHash).toBe(txHash);
    expect(hops[0].status).toBe("PENDING");
  });

  it("updates hop to FINAL, clears intent, and updates holder after reload", async () => {
    const { mission, creator, candidate } = await seededMission();
    const relay = await PgRelayStore.load(pool);
    const intent = relay.createIntent(mission.id, normalizeNimiqAddress(creator), normalizeNimiqAddress(candidate), {
      requireOpaqueTag: true,
    });
    relay.recordHop({
      batonId: mission.id,
      sequence: intent.sequence,
      currentHolder: intent.currentHolder,
      recipient: intent.recipient,
      nonce: intent.nonce,
      txHash: "bb".repeat(32),
      value: null,
      status: "PENDING",
      createdAt: intent.createdAt,
      confirmedAt: null,
    });
    relay.updateHop(mission.id, 1, {
      status: "FINAL",
      value: ONE_NIM_IN_LUNA,
      confirmedAt: Date.now(),
    });

    // Finalized: intent deleted, holder updated
    expect(relay.getActiveIntent(mission.id)).toBeUndefined();
    expect(relay.getCurrentHolder(mission.id)).toBe(normalizeNimiqAddress(candidate));
    await relay.flush();

    const fresh = await PgRelayStore.load(pool);
    expect(fresh.getActiveIntent(mission.id)).toBeUndefined();
    expect(fresh.getCurrentHolder(mission.id)).toBe(normalizeNimiqAddress(candidate));
    const hops = fresh.getHops(mission.id);
    expect(hops).toHaveLength(1);
    expect(hops[0].status).toBe("FINAL");
    expect(hops[0].value).toBe(ONE_NIM_IN_LUNA);
  });

  it("ignores orphaned in-memory relay rows after an administrative mission deletion", async () => {
    const { mission: removed, creator: removedCreator, candidate: removedCandidate } = await seededMission();
    const relay = await PgRelayStore.load(pool);
    const removedIntent = relay.createIntent(
      removed.id,
      normalizeNimiqAddress(removedCreator),
      normalizeNimiqAddress(removedCandidate),
      { requireOpaqueTag: true }
    );
    relay.recordHop({
      batonId: removed.id,
      sequence: removedIntent.sequence,
      currentHolder: removedIntent.currentHolder,
      recipient: removedIntent.recipient,
      nonce: removedIntent.nonce,
      txHash: "dd".repeat(32),
      value: ONE_NIM_IN_LUNA,
      status: "FINAL",
      createdAt: removedIntent.createdAt,
      confirmedAt: Date.now(),
    });
    await relay.flush();

    // pg-mem does not reproduce every production ON DELETE CASCADE edge, so
    // model the administrative cleanup explicitly while deliberately keeping
    // this already-loaded relay instance stale in memory.
    await pool.query("DELETE FROM hops WHERE mission_id = $1", [removed.id]);
    await pool.query("DELETE FROM pass_intents WHERE mission_id = $1", [removed.id]);
    await pool.query("DELETE FROM invitations WHERE mission_id = $1", [removed.id]);
    await pool.query("DELETE FROM missions WHERE id = $1", [removed.id]);

    const { mission: live, creator: liveCreator, candidate: liveCandidate } = await seededMission();
    const liveIntent = relay.createIntent(
      live.id,
      normalizeNimiqAddress(liveCreator),
      normalizeNimiqAddress(liveCandidate),
      { requireOpaqueTag: true }
    );
    await relay.flush();

    const row = await pool.query<{ mission_id: string; nonce: string }>(
      "SELECT mission_id, nonce FROM pass_intents WHERE mission_id = $1",
      [live.id]
    );
    expect(row.rows).toEqual([{ mission_id: live.id, nonce: liveIntent.nonce }]);
  });

  it("rejects duplicate tx hash at DB level across different batons (defense-in-depth)", async () => {
    const { mission: m1, creator: c1 } = await seededMission();
    const { mission: m2, creator: c2 } = await seededMission();
    const relay1 = await PgRelayStore.load(pool);
    const relay2 = await PgRelayStore.load(pool);

    const holder1 = normalizeNimiqAddress(c1);
    const holder2 = normalizeNimiqAddress(c2);
    const i1 = relay1.createIntent(m1.id, holder1, "RECIPIENT_A", { requireOpaqueTag: true });
    const i2 = relay2.createIntent(m2.id, holder2, "RECIPIENT_B", { requireOpaqueTag: true });
    const sharedHash = "ff".repeat(32);
    relay1.recordHop({
      batonId: m1.id,
      sequence: i1.sequence,
      currentHolder: i1.currentHolder,
      recipient: i1.recipient,
      nonce: i1.nonce,
      txHash: sharedHash,
      value: null,
      status: "PENDING",
      createdAt: i1.createdAt,
      confirmedAt: null,
    });
    relay2.recordHop({
      batonId: m2.id,
      sequence: i2.sequence,
      currentHolder: i2.currentHolder,
      recipient: i2.recipient,
      nonce: i2.nonce,
      txHash: sharedHash,
      value: null,
      status: "PENDING",
      createdAt: i2.createdAt,
      confirmedAt: null,
    });

    // Flush sequentially: relay1's hop lands first, then relay2's duplicate
    // tx hash must be rejected by the DB's global_tx_hash_replay_guard.
    await relay1.flush();
    let relay2Rejected = false;
    try {
      await relay2.flush();
    } catch (error) {
      relay2Rejected = true;
      expect((error as { code?: string; data?: { code?: string } }).code ?? (error as { data?: { code?: string } }).data?.code).toBe("23505");
    }
    expect(relay2Rejected).toBe(true);

    const fresh = await PgRelayStore.load(pool);
    const allHops = [...fresh.getHops(m1.id), ...fresh.getHops(m2.id)];
    expect(allHops.filter((h) => h.txHash === sharedHash)).toHaveLength(1);
  });
});
