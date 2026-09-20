import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrivateKey, PublicKey } from "@nimiq/core";
import { beforeAll, describe, expect, it } from "vitest";
import { PgMemPool } from "../helpers/pg-mem-pool.js";
import { PgMissionRepository } from "../../src/persistence/pg-mission-repository.js";
import type { MissionRecord } from "../../src/mission/types.js";
import { normalizeNimiqAddress } from "../../src/mission/target-wallet-crypto.js";

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

function invitationRecord(
  missionId: string,
  sequence: number,
  inviterWallet: string,
  overrides: { candidateWalletNormalized?: string | null; inviteTokenHash?: string } = {}
) {
  return {
    id: crypto.randomUUID(),
    missionId,
    sequence,
    inviterWalletNormalized: normalizeNimiqAddress(inviterWallet),
    candidateLabel: null,
    candidateWalletNormalized: overrides.candidateWalletNormalized ?? null,
    candidateDisplayLabel: null,
    whyYou: null,
    inviteTokenHash: overrides.inviteTokenHash ?? crypto.randomUUID(),
    status: "INVITED" as const,
    createdAt: 3000,
    expiresAt: 3000 + 12 * 60 * 60 * 1000,
    acceptedAt: null,
    passDeadlineAt: null,
    declinedAt: null,
    withdrawnAt: null,
    completedAt: null,
    closedAt: null,
  };
}

const MIGRATION_PATH = join(import.meta.dirname!, "../../migrations/001_reach_mission_foundation.sql");
const REPOSITORY_SOURCE = readFileSync(join(import.meta.dirname!, "../../src/persistence/pg-mission-repository.ts"), "utf8");

let pool: PgMemPool;
let repo: PgMissionRepository;

beforeAll(async () => {
  pool = new PgMemPool();
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  await pool.exec(sql);
  repo = new PgMissionRepository(pool);
});

// Helper: create mission + invitation + accept, returning handles for a single-hop e2e.
async function acceptedMission() {
  const creator = normalizeNimiqAddress(wallet());
  const candidate = normalizeNimiqAddress(wallet());
  const mission = missionRecord({
    creatorWalletNormalized: creator,
    currentHolderWalletNormalized: creator,
    targetWalletHmac: "hmac-target",
  });
  await repo.createMission(mission);
  const inv = invitationRecord(mission.id, 1, creator);
  await repo.createInvitation(inv);
  await repo.acceptInvitation(inv.id, candidate, 4000, 4000 + 60 * 60 * 1000);
  const acceptedInv = (await repo.getInvitation(inv.id))!;
  return { mission, creator, candidate, invitationId: inv.id, acceptedInv };
}

describe("PgMissionRepository", () => {
  it("creates and retrieves a mission with correct fields", async () => {
    const record = missionRecord({ targetConsentConfirmed: true });
    await repo.createMission(record);
    const result = await repo.getMission(record.id);
    expect(result).toBeDefined();
    expect(result!.id).toBe(record.id);
    expect(result!.targetConsentConfirmed).toBe(true);
    expect(result!.status).toBe("ACTIVE");
    expect(result!.targetLabel).toBe("Destination");
  });

  it("rejects duplicate mission ids", async () => {
    const record = missionRecord();
    await repo.createMission(record);
    await expect(repo.createMission({ ...record, id: record.id }))
      .rejects.toMatchObject({ reason: expect.any(String) });
  });

  it("returns undefined for non-existent mission", async () => {
    expect(await repo.getMission(crypto.randomUUID())).toBeUndefined();
  });

  describe("cancellation", () => {
    it("cancels a pristine mission as creator", async () => {
      const creator = normalizeNimiqAddress(wallet());
      const record = missionRecord({ creatorWalletNormalized: creator, currentHolderWalletNormalized: creator });
      await repo.createMission(record);
      const cancelled = await repo.cancelMissionPristine(record.id, creator, 2000);
      expect(cancelled.status).toBe("CANCELLED");
      expect(cancelled.cancelledAt).toBe(2000);
    });

    it("rejects cancellation by a non-authorized wallet", async () => {
      const creator = normalizeNimiqAddress(wallet());
      const record = missionRecord({ creatorWalletNormalized: creator, currentHolderWalletNormalized: creator });
      await repo.createMission(record);
      await expect(repo.cancelMissionPristine(record.id, normalizeNimiqAddress(wallet()), 2000))
        .rejects.toMatchObject({ reason: expect.any(String) });
    });

    it("rejects cancellation of already-cancelled mission", async () => {
      const creator = normalizeNimiqAddress(wallet());
      const record = missionRecord({ creatorWalletNormalized: creator, currentHolderWalletNormalized: creator });
      await repo.createMission(record);
      await repo.cancelMissionPristine(record.id, creator, 2000);
      await expect(repo.cancelMissionPristine(record.id, creator, 2001))
        .rejects.toMatchObject({ reason: "MISSION_NOT_ACTIVE" });
    });
  });

  describe("invitations", () => {
    it("creates and retrieves an invitation by id and token hash", async () => {
      const creator = normalizeNimiqAddress(wallet());
      const mission = missionRecord({ creatorWalletNormalized: creator, currentHolderWalletNormalized: creator });
      await repo.createMission(mission);
      const inv = invitationRecord(mission.id, 1, creator);
      await repo.createInvitation(inv);
      expect(await repo.getInvitation(inv.id)).toBeDefined();
      expect((await repo.getInvitationByTokenHash(inv.inviteTokenHash))!.id).toBe(inv.id);
    });

    it("enforces one open invitation per mission at DB level", async () => {
      const creator = normalizeNimiqAddress(wallet());
      const mission = missionRecord({ creatorWalletNormalized: creator, currentHolderWalletNormalized: creator });
      await repo.createMission(mission);
      const inv1 = invitationRecord(mission.id, 1, creator);
      await repo.createInvitation(inv1);
      await expect(repo.createInvitation(invitationRecord(mission.id, 1, creator, { inviteTokenHash: "tok-b" })))
        .rejects.toMatchObject({ reason: expect.any(String) });
    });

    it("acceptInvitation binds to the accepting wallet and sets pass deadline", async () => {
      const { invitationId, candidate } = await acceptedMission();
      const inv = (await repo.getInvitation(invitationId))!;
      expect(inv.status).toBe("ACCEPTED");
      expect(inv.candidateWalletNormalized).toBe(candidate);
      expect(inv.passDeadlineAt).toBeDefined();
      expect(inv.acceptedAt).toBeDefined();
    });

    it("persists the accepting carrier display label atomically with acceptance", async () => {
      const creator = normalizeNimiqAddress(wallet());
      const candidate = normalizeNimiqAddress(wallet());
      const mission = missionRecord({ creatorWalletNormalized: creator, currentHolderWalletNormalized: creator });
      await repo.createMission(mission);
      const inv = invitationRecord(mission.id, 1, creator);
      await repo.createInvitation(inv);
      const accepted = await repo.acceptInvitation(inv.id, candidate, 4000, 4000 + 60 * 60 * 1000, "Bridge B");
      expect(accepted.status).toBe("ACCEPTED");
      expect(accepted.candidateDisplayLabel).toBe("Bridge B");
      expect((await repo.getInvitation(inv.id))!.candidateDisplayLabel).toBe("Bridge B");
    });

    it("rejects accept with wrong wallet", async () => {
      const { mission, invitationId } = await acceptedMission();
      // The invitation is already ACCEPTED, so re-accepting is rejected
      const inv = (await repo.getInvitation(invitationId))!;
      expect(inv.status).toBe("ACCEPTED");
    });

    it("closeInvitation marks DECLINED and sets declinedAt", async () => {
      const creator = normalizeNimiqAddress(wallet());
      const mission = missionRecord({ creatorWalletNormalized: creator, currentHolderWalletNormalized: creator });
      await repo.createMission(mission);
      const inv = invitationRecord(mission.id, 1, creator);
      await repo.createInvitation(inv);
      const closed = await repo.closeInvitation(inv.id, "DECLINED", 5000);
      expect(closed.status).toBe("DECLINED");
      expect(closed.declinedAt).toBe(5000);
    });

    it("closeInvitation rejects when invitation is already closed", async () => {
      const creator = normalizeNimiqAddress(wallet());
      const mission = missionRecord({ creatorWalletNormalized: creator, currentHolderWalletNormalized: creator });
      await repo.createMission(mission);
      const inv = invitationRecord(mission.id, 1, creator);
      await repo.createInvitation(inv);
      await repo.closeInvitation(inv.id, "DECLINED", 5000);
      await expect(repo.closeInvitation(inv.id, "WITHDRAWN", 6000))
        .rejects.toMatchObject({ reason: "INVITATION_ALREADY_CLOSED" });
    });

    it("expireDueInvitations expires only due invitations", async () => {
      const creator = normalizeNimiqAddress(wallet());
      const mission = missionRecord({ creatorWalletNormalized: creator, currentHolderWalletNormalized: creator });
      await repo.createMission(mission);
      const inv1 = invitationRecord(mission.id, 1, creator, { inviteTokenHash: "expire-me" });
      await repo.createInvitation(inv1);
      // invitation was created at 3000, expires at 3000 + 12h. now = 3000 + 12h + 1 → expired.
      const expiredCount = await repo.expireDueInvitations(3000 + 12 * 60 * 60 * 1000 + 1);
      expect(expiredCount).toBeGreaterThanOrEqual(1);
      const invAfter = (await repo.getInvitation(inv1.id))!;
      expect(invAfter.status).toBe("EXPIRED");
    });

    it("clears a prior carrier display mark when an invitation is reissued", async () => {
      const creator = normalizeNimiqAddress(wallet());
      const candidate = normalizeNimiqAddress(wallet());
      const mission = missionRecord({ creatorWalletNormalized: creator, currentHolderWalletNormalized: creator });
      await repo.createMission(mission);
      const inv = invitationRecord(mission.id, 1, creator);
      await repo.createInvitation(inv);
      await repo.acceptInvitation(inv.id, candidate, 4000, 4000 + 60 * 60 * 1000, "Old mark");
      await repo.expireDueInvitations(4000 + 60 * 60 * 1000 + 1);
      const reissued = await repo.reissueInvitation({
        invitationId: inv.id,
        inviteTokenHash: "fresh-mark-token",
        candidateLabel: "Bridge",
        candidateWalletNormalized: candidate,
        whyYou: null,
        createdAt: 10_000,
        expiresAt: 10_000 + 12 * 60 * 60 * 1000,
      });
      expect(reissued.status).toBe("INVITED");
      expect(reissued.candidateDisplayLabel).toBeNull();
    });

    it("reissues the same expired invitation row without a sequence duplicate key", async () => {
      const { mission, invitationId, candidate } = await acceptedMission();
      await repo.expireDueInvitations(4000 + 60 * 60 * 1000 + 1);
      const reissued = await repo.reissueInvitation({
        invitationId,
        inviteTokenHash: "fresh-token-hash",
        candidateLabel: "Bridge",
        candidateWalletNormalized: candidate,
        whyYou: "Please try again.",
        createdAt: 10000,
        expiresAt: 10000 + 12 * 60 * 60 * 1000,
      });
      expect(reissued.id).toBe(invitationId);
      expect(reissued.sequence).toBe(1);
      expect(reissued.status).toBe("INVITED");
      expect((await repo.getInvitationByTokenHash("fresh-token-hash"))!.id).toBe(invitationId);
      expect((await repo.getInvitationByTokenHash("fresh-token-hash"))!.inviteTokenHash).toBe("fresh-token-hash");
      expect((await repo.getMission(mission.id))!.currentSequence).toBe(0);
    });
  });

  it("pins mission_status casts for real PostgreSQL prepared statements", () => {
    expect(REPOSITORY_SOURCE).toContain("status=$4::mission_status");
    expect(REPOSITORY_SOURCE).toContain("WHEN $4::mission_status = 'ARRIVED'::mission_status THEN $5");
  });

  describe("completeFinalHop", () => {
    it("marks ARRIVED when recipient HMAC matches target", async () => {
      const { mission, acceptedInv, candidate } = await acceptedMission();
      const result = await repo.completeFinalHop({
        missionId: mission.id,
        invitationId: acceptedInv.id,
        sequence: 1,
        recipientWallet: candidate,
        recipientHmac: "hmac-target",
        now: 5000,
      });
      expect(result.mission.status).toBe("ARRIVED");
      expect(result.mission.arrivedAt).toBe(5000);
      expect(result.mission.finalizedHopCount).toBe(1);
      expect(result.invitation.status).toBe("COMPLETED");
    });

    it("stores an opted-in accepted carrier mark in finalized participant provenance", async () => {
      const creator = normalizeNimiqAddress(wallet());
      const candidate = normalizeNimiqAddress(wallet());
      const mission = missionRecord({
        creatorWalletNormalized: creator,
        currentHolderWalletNormalized: creator,
        targetWalletHmac: "hmac-target",
      });
      await repo.createMission(mission);
      const inv = invitationRecord(mission.id, 1, creator);
      await repo.createInvitation(inv);
      await repo.acceptInvitation(inv.id, candidate, 4000, 4000 + 60 * 60 * 1000, "Bridge B");
      await repo.completeFinalHop({
        missionId: mission.id,
        invitationId: inv.id,
        sequence: 1,
        recipientWallet: candidate,
        recipientHmac: "hmac-target",
        now: 5000,
      });

      const participant = await pool.query<{
        display_label: string | null;
        display_name_opt_in: boolean;
        first_final_sequence: number | null;
      }>(
        "SELECT display_label, display_name_opt_in, first_final_sequence FROM participants WHERE mission_id = $1 AND wallet_normalized = $2",
        [mission.id, candidate]
      );
      expect(participant.rows).toHaveLength(1);
      expect(participant.rows[0]).toMatchObject({
        display_label: "Bridge B",
        display_name_opt_in: true,
        first_final_sequence: 1,
      });
    });

    it("rejects FINAL projection when recipient HMAC differs from target", async () => {
      const { mission, acceptedInv, candidate } = await acceptedMission();
      await expect(repo.completeFinalHop({
        missionId: mission.id,
        invitationId: acceptedInv.id,
        sequence: 1,
        recipientWallet: candidate,
        recipientHmac: "different-hmac",
        now: 6000,
      })).rejects.toMatchObject({ reason: "WRONG_FINAL_RECIPIENT" });
      const unchanged = await repo.getMission(mission.id);
      expect(unchanged?.status).toBe("ACTIVE");
      expect(unchanged?.finalizedHopCount).toBe(0);
      expect(unchanged?.currentSequence).toBe(0);
    });

    it("is idempotent for double-completion of the same hop", async () => {
      const { mission, acceptedInv, candidate } = await acceptedMission();
      const first = await repo.completeFinalHop({
        missionId: mission.id,
        invitationId: acceptedInv.id,
        sequence: 1,
        recipientWallet: candidate,
        recipientHmac: "hmac-target",
        now: 5000,
      });
      const second = await repo.completeFinalHop({
        missionId: mission.id,
        invitationId: acceptedInv.id,
        sequence: 1,
        recipientWallet: candidate,
        recipientHmac: "hmac-target",
        now: 5000,
      });
      expect(second.mission.status).toBe("ARRIVED");
      expect(second.mission.finalizedHopCount).toBe(1);
    });

    it("rejects completion with wrong invitation id", async () => {
      const { mission } = await acceptedMission();
      await expect(repo.completeFinalHop({
        missionId: mission.id,
        invitationId: crypto.randomUUID(),
        sequence: 1,
        recipientWallet: normalizeNimiqAddress(wallet()),
        recipientHmac: "hmac",
        now: 5000,
      })).rejects.toMatchObject({ reason: expect.any(String) });
    });

    it("rejects completion with wrong sequence", async () => {
      const { mission, acceptedInv, candidate } = await acceptedMission();
      await expect(repo.completeFinalHop({
        missionId: mission.id,
        invitationId: acceptedInv.id,
        sequence: 2, // wrong: next sequence is 1
        recipientWallet: candidate,
        recipientHmac: "hmac-target",
        now: 5000,
      })).rejects.toMatchObject({ reason: expect.any(String) });
    });

    it("rejects completion if mission is not ACTIVE", async () => {
      const creator = normalizeNimiqAddress(wallet());
      const mission = missionRecord({
        creatorWalletNormalized: creator,
        currentHolderWalletNormalized: creator,
        status: "CANCELLED",
      });
      await repo.createMission(mission);
      await expect(repo.completeFinalHop({
        missionId: mission.id,
        invitationId: crypto.randomUUID(),
        sequence: 1,
        recipientWallet: normalizeNimiqAddress(wallet()),
        recipientHmac: "hmac",
        now: 5000,
      })).rejects.toMatchObject({ reason: "MISSION_NOT_ACTIVE" });
    });
  });

  describe("auth challenges", () => {
    it("creates, retrieves and consumes a challenge exactly once", async () => {
      const challengeId = crypto.randomUUID();
      const createdAt = Date.now();
      const usedAt = createdAt + 1000;
      const record = {
        id: challengeId,
        walletNormalized: normalizeNimiqAddress(wallet()),
        action: "CREATE_MISSION" as const,
        missionId: null,
        invitationId: null,
        sequence: 0,
        nonceHash: crypto.randomUUID(),
        canonicalMessage: "carry.one:mint:nonce",
        status: "ISSUED" as const,
        expiresAt: createdAt + 60_000,
        usedAt: null,
        createdAt,
      };
      await repo.createChallenge(record);
      const fresh = await repo.getChallenge(challengeId);
      expect(fresh).toBeDefined();
      expect(fresh!.status).toBe("ISSUED");
      const used = await repo.consumeChallenge(challengeId, usedAt);
      expect(used.status).toBe("USED");
      expect(used.usedAt).toBe(usedAt);
      await expect(repo.consumeChallenge(challengeId, usedAt + 1000))
        .rejects.toMatchObject({ reason: "CHALLENGE_REPLAY" });
    });

    it("expires a challenge when deadline has passed", async () => {
      const challengeId = crypto.randomUUID();
      await repo.createChallenge({
        id: challengeId,
        walletNormalized: normalizeNimiqAddress(wallet()),
        action: "CREATE_MISSION",
        missionId: null,
        invitationId: null,
        sequence: 0,
        nonceHash: crypto.randomUUID(),
        canonicalMessage: "msg",
        status: "ISSUED",
        expiresAt: 10_000,
        usedAt: null,
        createdAt: 1,
      });
      await expect(repo.consumeChallenge(challengeId, 10_001))
        .rejects.toMatchObject({ reason: "CHALLENGE_EXPIRED" });
    });

    it("rejects duplicate nonce hash at DB level", async () => {
      const nonceHash = crypto.randomUUID();
      const base = {
        walletNormalized: normalizeNimiqAddress(wallet()),
        action: "CREATE_MISSION" as const,
        missionId: null,
        invitationId: null,
        sequence: 0,
        nonceHash,
        canonicalMessage: "msg",
        status: "ISSUED" as const,
        expiresAt: Date.now() + 60_000,
        usedAt: null,
        createdAt: Date.now(),
      };
      await repo.createChallenge({ ...base, id: crypto.randomUUID() });
      await expect(repo.createChallenge({ ...base, id: crypto.randomUUID() }))
        .rejects.toMatchObject({ reason: expect.stringMatching(/CHALLENGE_COLLISION|DUPLICATE_KEY/i) });
    });
  });

  describe("snapshot", () => {
    it("returns all missions, invitations and challenges", async () => {
      const snapshot = await repo.snapshot();
      expect(snapshot.missions.length).toBeGreaterThanOrEqual(1);
      expect(snapshot.invitations.length).toBeGreaterThanOrEqual(1);
      expect(snapshot.challenges.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("PgMissionRepository — DB-level invariants", () => {
  it("enforces invite_token_hash uniqueness across missions", async () => {
    const tokenHash = "cross-mission-duplicate-token";
    const creator1 = normalizeNimiqAddress(wallet());
    const creator2 = normalizeNimiqAddress(wallet());
    const m1 = missionRecord({ creatorWalletNormalized: creator1, currentHolderWalletNormalized: creator1 });
    const m2 = missionRecord({ creatorWalletNormalized: creator2, currentHolderWalletNormalized: creator2 });
    const r1 = new PgMissionRepository(pool);
    const r2 = new PgMissionRepository(pool);
    await r1.createMission(m1);
    await r2.createMission(m2);
    await r1.createInvitation(invitationRecord(m1.id, 1, creator1, { inviteTokenHash: tokenHash }));
    await expect(r2.createInvitation(invitationRecord(m2.id, 1, creator2, { inviteTokenHash: tokenHash })))
      .rejects.toMatchObject({ reason: expect.stringMatching(/INVITE_TOKEN_COLLISION|DUPLICATE_KEY/i) });
  });

  it("enforces one_invitation_sequence_per_mission at DB level", async () => {
    const creator = normalizeNimiqAddress(wallet());
    const mission = missionRecord({ creatorWalletNormalized: creator, currentHolderWalletNormalized: creator });
    const r = new PgMissionRepository(pool);
    await r.createMission(mission);
    await r.createInvitation(invitationRecord(mission.id, 1, creator, { inviteTokenHash: "seq-dup-1" }));
    await expect(r.createInvitation(invitationRecord(mission.id, 1, creator, { inviteTokenHash: "seq-dup-2" })))
      .rejects.toMatchObject({ reason: expect.stringMatching(/WRONG_SEQUENCE|DUPLICATE_KEY|OPEN_INVITATION/i) });
  });
});
