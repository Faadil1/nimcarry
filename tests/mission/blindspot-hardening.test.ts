import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrivateKey, PublicKey } from "@nimiq/core";
import { afterEach, describe, expect, it } from "vitest";
import { RelayStore, RelayValidationError, validateTransactionAgainstIntent } from "../../src/core/relay.js";
import { ONE_NIM_IN_LUNA, type NimiqTxLookup } from "../../src/core/types.js";
import type { NimiqRpcClient } from "../../src/nimiq/rpc-client.js";
import { FileMissionRepository } from "../../src/mission/file-repository.js";
import { ReachMissionCoordinator } from "../../src/mission/coordinator.js";
import { ReachMissionService } from "../../src/mission/service.js";
import { TargetWalletProtector, normalizeNimiqAddress } from "../../src/mission/target-wallet-crypto.js";
import type { MissionAction, VerifiedWalletAction } from "../../src/mission/types.js";
import { FileRelayStore } from "../../src/persistence/file-relay-store.js";
import { CanonicalRelayService } from "../../src/service/canonical-relay-service.js";

const dirs: string[] = [];
function wallet(): string { return PublicKey.derive(PrivateKey.generate()).toAddress().toUserFriendlyAddress(); }
function auth(w: string, action: MissionAction, missionId?: string, invitationId?: string, sequence = 0): VerifiedWalletAction {
  return { wallet: normalizeNimiqAddress(w), action, missionId, invitationId, sequence };
}
class Rpc implements NimiqRpcClient {
  tx: NimiqTxLookup | null = null;
  head = 3_032_100;
  async getTransactionByHash(): Promise<NimiqTxLookup | null> { return this.tx; }
  async getBlockNumber(): Promise<number> { return this.head; }
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("Reach Mission blind-spot hardening", () => {
  it("makes the mission on-chain commitment mandatory, opaque and under 64 bytes", () => {
    const store = new RelayStore();
    const intent = store.createIntent("secret-mission-id", "W0", "W1", { requireOpaqueTag: true });
    expect(intent.recipientData).toMatch(/^co:v1:/);
    expect(intent.recipientData).not.toContain("secret-mission-id");
    expect(Buffer.byteLength(intent.recipientData!, "utf8")).toBeLessThanOrEqual(64);

    const tx: NimiqTxLookup = {
      hash: "a".repeat(64), from: "W0", to: "W1", value: ONE_NIM_IN_LUNA,
      blockNumber: 3_032_020, confirmations: 1,
    };
    expect(() => validateTransactionAgainstIntent(intent, tx)).toThrow(RelayValidationError);
    try { validateTransactionAgainstIntent(intent, tx); }
    catch (error) { expect((error as RelayValidationError).reason).toBe("MISSING_HOP_COMMITMENT"); }

    expect(() => validateTransactionAgainstIntent(intent, { ...tx, recipientData: "co:v1:wrong" }))
      .toThrow(RelayValidationError);
    expect(() => validateTransactionAgainstIntent(intent, { ...tx, recipientData: intent.recipientData! }))
      .not.toThrow();
  });

  it("prevents a completed bridge-assisted delivery from opening a second hop", async () => {
    const dir = mkdtempSync(join(tmpdir(), "carry-one-loop-"));
    dirs.push(dir);
    const repo = new FileMissionRepository(join(dir, "mission.json"));
    const protector = new TargetWalletProtector(Buffer.alloc(32, 31), Buffer.alloc(32, 32));
    const service = new ReachMissionService(repo, protector);
    const rpc = new Rpc();
    const relay = new CanonicalRelayService(new FileRelayStore(join(dir, "relay.json")), rpc);
    const coordinator = new ReachMissionCoordinator(service, repo, relay, protector);
    const creator = wallet();
    const bridge = wallet();
    const target = wallet();

    const mission = await service.createMission({
      auth: auth(creator, "CREATE_MISSION"), targetLabel: "Target", targetWallet: target,
      targetConsentConfirmed: true, missionNote: "Please help this reach the target.", now: 1_000,
    });
    const invitation = await service.createInvitation({
      missionId: mission.id, auth: auth(creator, "CREATE_INVITATION", mission.id, undefined, 1),
      candidateWallet: bridge, now: 2_000,
    });
    await service.acceptInvitation({
      token: invitation.inviteToken,
      auth: auth(bridge, "ACCEPT_INVITATION", mission.id, invitation.invitation.id, 1), now: 3_000,
    });
    const intent = await coordinator.authorizePass({
      missionId: mission.id, invitationId: invitation.invitation.id,
      auth: auth(creator, "AUTHORIZE_PASS", mission.id, invitation.invitation.id, 1), now: 4_000,
    });
    const txHash = "b".repeat(64);
    await coordinator.recordBroadcast({ missionId: mission.id, invitationId: invitation.invitation.id, txHash });
    rpc.tx = {
      hash: txHash,
      from: normalizeNimiqAddress(creator),
      to: normalizeNimiqAddress(target),
      value: ONE_NIM_IN_LUNA,
      blockNumber: 3_032_020,
      confirmations: 999,
      recipientData: intent.recipientData!,
    };
    await coordinator.reconcile(mission.id);
    const completed = await service.getMissionRecord(mission.id);
    expect(completed.status).toBe("ARRIVED");
    expect(completed.currentHolderWalletNormalized).toBe(normalizeNimiqAddress(target));

    await expect(service.createInvitation({
      missionId: mission.id,
      auth: auth(bridge, "CREATE_INVITATION", mission.id, undefined, 2),
      candidateWallet: creator,
      now: 5_000,
    })).rejects.toMatchObject({ reason: expect.stringMatching(/MISSION_NOT_ACTIVE|NOT_CURRENT_HOLDER|WRONG_CURRENT_HOLDER/) });
  });

  it("finalizes a two-person claimed destination without fabricating an invitation or bridge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nimcarry-claim-direct-"));
    dirs.push(dir);
    const repo = new FileMissionRepository(join(dir, "mission.json"));
    const protector = new TargetWalletProtector(Buffer.alloc(32, 41), Buffer.alloc(32, 42));
    const service = new ReachMissionService(repo, protector);
    const rpc = new Rpc();
    const relay = new CanonicalRelayService(new FileRelayStore(join(dir, "relay.json")), rpc);
    const coordinator = new ReachMissionCoordinator(service, repo, relay, protector);
    const creator = wallet();
    const destination = wallet();

    const mission = await service.createMission({
      auth: auth(creator, "CREATE_MISSION"),
      targetLabel: "David",
      missionNote: "Direct private destination claim.",
      now: 10_000,
    });
    const opened = await service.createDestinationClaim({
      missionId: mission.id,
      creatorWallet: creator,
      now: 10_100,
    });
    await service.claimDestination({
      token: opened.claimToken,
      auth: auth(destination, "CLAIM_DESTINATION", mission.id),
      now: 10_200,
    });

    const intent = await coordinator.authorizePass({
      missionId: mission.id,
      auth: auth(creator, "AUTHORIZE_PASS", mission.id, undefined, 1),
      now: 10_300,
    });
    expect(intent.invitationId).toBeNull();
    expect(intent.recipient).toBe(normalizeNimiqAddress(destination));

    const txHash = "d".repeat(64);
    const pending = await coordinator.recordBroadcast({ missionId: mission.id, txHash });
    expect(pending.invitationId).toBeNull();

    rpc.tx = {
      hash: txHash,
      from: normalizeNimiqAddress(creator),
      to: normalizeNimiqAddress(destination),
      value: ONE_NIM_IN_LUNA,
      blockNumber: 3_032_020,
      confirmations: 999,
      recipientData: intent.recipientData!,
    };

    const reconciled = await coordinator.reconcile(mission.id);
    expect(reconciled.mission.status).toBe("ARRIVED");
    expect(reconciled.mission.current_sequence).toBe(1);
    expect(reconciled.mission.finalized_hop_count).toBe(1);
    expect((await repo.snapshot()).invitations).toHaveLength(0);
    expect((await repo.snapshot()).destinationClaims[0].status).toBe("CLAIMED");
  });

  it("background-repairs a direct FINAL that persisted before mission ARRIVED projection", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nimcarry-claim-projection-repair-"));
    dirs.push(dir);
    const missionPath = join(dir, "mission.json");
    const relayPath = join(dir, "relay.json");
    const repo = new FileMissionRepository(missionPath);
    const protector = new TargetWalletProtector(Buffer.alloc(32, 51), Buffer.alloc(32, 52));
    const service = new ReachMissionService(repo, protector);
    const rpc = new Rpc();
    const relay = new CanonicalRelayService(new FileRelayStore(relayPath), rpc);
    const coordinator = new ReachMissionCoordinator(service, repo, relay, protector);
    const creator = wallet();
    const destination = wallet();

    const mission = await service.createMission({
      auth: auth(creator, "CREATE_MISSION"),
      targetLabel: "David",
      missionNote: "Crash-window repair for direct claim.",
      now: 20_000,
    });
    const opened = await service.createDestinationClaim({
      missionId: mission.id,
      creatorWallet: creator,
      now: 20_100,
    });
    await service.claimDestination({
      token: opened.claimToken,
      auth: auth(destination, "CLAIM_DESTINATION", mission.id),
      now: 20_200,
    });
    const intent = await coordinator.authorizePass({
      missionId: mission.id,
      auth: auth(creator, "AUTHORIZE_PASS", mission.id, undefined, 1),
      now: 20_300,
    });
    const txHash = "e".repeat(64);
    await coordinator.recordBroadcast({ missionId: mission.id, txHash });
    rpc.tx = {
      hash: txHash,
      from: normalizeNimiqAddress(creator),
      to: normalizeNimiqAddress(destination),
      value: ONE_NIM_IN_LUNA,
      blockNumber: 3_032_020,
      confirmations: 999,
      recipientData: intent.recipientData!,
    };

    // Simulate the crash window: relay FINAL persists, mission projection does not.
    const finalHop = await relay.reconcile(mission.id);
    await relay.flushDurability();
    expect(finalHop?.status).toBe("FINAL");
    expect((await repo.getMission(mission.id))?.status).toBe("ACTIVE");
    expect(relay.getPendingReconciliationBatonIds()).toEqual([]);
    expect(relay.getFinalizedProjectionBatonIds()).toContain(mission.id);

    // New process: startup/background sweep must repair without another payment.
    const repo2 = new FileMissionRepository(missionPath);
    const service2 = new ReachMissionService(repo2, protector);
    const relay2 = new CanonicalRelayService(new FileRelayStore(relayPath), rpc);
    const coordinator2 = new ReachMissionCoordinator(service2, repo2, relay2, protector);
    const repaired = await coordinator2.reconcilePending();

    expect(repaired).toMatchObject({ checked: 1, arrived: 1, errors: 0 });
    const arrived = await service2.getMissionRecord(mission.id);
    expect(arrived.status).toBe("ARRIVED");
    expect(arrived.currentSequence).toBe(1);
    expect(arrived.finalizedHopCount).toBe(1);
    expect(arrived.currentHolderWalletNormalized).toBe(normalizeNimiqAddress(destination));
    expect((await repo2.snapshot()).invitations).toHaveLength(0);

    // Once settled, the same process does not keep rescanning this historical FINAL.
    await expect(coordinator2.reconcilePending()).resolves.toMatchObject({ checked: 0, arrived: 0, errors: 0 });
  });

});
