import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrivateKey, PublicKey } from "@nimiq/core";
import { afterEach, describe, expect, it } from "vitest";
import type { NimiqTxLookup } from "../../src/core/types.js";
import { INTENT_VALIDITY_WINDOW_MS } from "../../src/core/relay.js";
import type { NimiqRpcClient } from "../../src/nimiq/rpc-client.js";
import { FileMissionRepository } from "../../src/mission/file-repository.js";
import { ReachMissionCoordinator } from "../../src/mission/coordinator.js";
import { ReachMissionService } from "../../src/mission/service.js";
import { TargetWalletProtector, normalizeNimiqAddress } from "../../src/mission/target-wallet-crypto.js";
import type { MissionAction, VerifiedWalletAction } from "../../src/mission/types.js";
import { FileRelayStore } from "../../src/persistence/file-relay-store.js";
import { CanonicalRelayService } from "../../src/service/canonical-relay-service.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "carry-one-recovery-"));
  dirs.push(dir);
  return dir;
}
function wallet(): string {
  return PublicKey.derive(PrivateKey.generate()).toAddress().toUserFriendlyAddress();
}
function auth(walletAddress: string, action: MissionAction, missionId?: string, invitationId?: string, sequence = 0): VerifiedWalletAction {
  return { wallet: normalizeNimiqAddress(walletAddress), action, missionId, invitationId, sequence };
}

class MutableRpc implements NimiqRpcClient {
  tx: NimiqTxLookup | null = null;
  head = 3_032_100;
  async getTransactionByHash(): Promise<NimiqTxLookup | null> { return this.tx; }
  async getBlockNumber(): Promise<number> { return this.head; }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function acceptedMission(dir: string, targetWallet = wallet()) {
  const missionPath = join(dir, "mission-state.json");
  const relayPath = join(dir, "relay-state.json");
  const repo = new FileMissionRepository(missionPath);
  const protector = new TargetWalletProtector(Buffer.alloc(32, 21), Buffer.alloc(32, 22));
  const service = new ReachMissionService(repo, protector);
  const rpc = new MutableRpc();
  const relay = new CanonicalRelayService(new FileRelayStore(relayPath), rpc);
  const coordinator = new ReachMissionCoordinator(service, repo, relay, protector);
  const creator = wallet();
  const candidate = wallet();
  const mission = await service.createMission({
    auth: auth(creator, "CREATE_MISSION"),
    targetLabel: "Destination",
    targetWallet,
    targetConsentConfirmed: true,
    missionNote: "Reach this person through a real human bridge.",
    now: 1_000,
  });
  const created = await service.createInvitation({
    missionId: mission.id,
    auth: auth(creator, "CREATE_INVITATION", mission.id, undefined, 1),
    candidateLabel: "Bridge",
    candidateWallet: candidate,
    now: 2_000,
  });
  await service.acceptInvitation({
    token: created.inviteToken,
    auth: auth(candidate, "ACCEPT_INVITATION", mission.id, created.invitation.id, 1),
    now: 3_000,
  });
  const state = JSON.parse(readFileSync(missionPath, "utf8")) as { invitations: Array<{ passDeadlineAt: number }> };
  state.invitations[0].passDeadlineAt = 10_000_000_000_000;
  writeFileSync(missionPath, JSON.stringify(state));
  Object.assign((repo as unknown as { state: typeof state }).state.invitations[0], { passDeadlineAt: 10_000_000_000_000 });
  return { missionPath, relayPath, repo, protector, service, rpc, relay, coordinator, creator, candidate, target: targetWallet, mission, invitationId: created.invitation.id };
}

describe("durable foundation recovery", () => {
  it("reports an expired previously accepted handoff as PASS_DEADLINE_EXPIRED", async () => {
    const f = await acceptedMission(tempDir());
    const state = JSON.parse(readFileSync(f.missionPath, "utf8")) as { invitations: Array<{ status: string; acceptedAt: number | null; passDeadlineAt: number | null }> };
    state.invitations[0].status = "EXPIRED";
    state.invitations[0].acceptedAt = 3_000;
    state.invitations[0].passDeadlineAt = 3_500;
    writeFileSync(f.missionPath, JSON.stringify(state));
    Object.assign((f.repo as unknown as { state: typeof state }).state.invitations[0], {
      status: "EXPIRED",
      acceptedAt: 3_000,
      passDeadlineAt: 3_500,
    });

    await expect(f.coordinator.authorizePass({
      missionId: f.mission.id,
      invitationId: f.invitationId,
      auth: auth(f.creator, "AUTHORIZE_PASS", f.mission.id, f.invitationId, 1),
      now: 4_000,
    })).rejects.toMatchObject({ reason: "PASS_DEADLINE_EXPIRED" });
  });

  it("uses the accepted bridge as consent but sends the pass directly to the target", async () => {
    const target = wallet();
    const f = await acceptedMission(tempDir(), target);
    expect(normalizeNimiqAddress(f.candidate)).not.toBe(normalizeNimiqAddress(target));

    const intent = await f.coordinator.authorizePass({
      missionId: f.mission.id,
      invitationId: f.invitationId,
      auth: auth(f.creator, "AUTHORIZE_PASS", f.mission.id, f.invitationId, 1),
      now: 4_000,
    });

    expect(intent.currentHolder).toBe(normalizeNimiqAddress(f.creator));
    expect(intent.recipient).toBe(normalizeNimiqAddress(target));
    expect(intent.recipient).not.toBe(normalizeNimiqAddress(f.candidate));
  });

  it("reuses a still-valid matching pass intent", async () => {
    const f = await acceptedMission(tempDir());
    const first = await f.coordinator.authorizePass({ missionId: f.mission.id, invitationId: f.invitationId, auth: auth(f.creator, "AUTHORIZE_PASS", f.mission.id, f.invitationId, 1), now: 4_000 });
    const second = await f.coordinator.authorizePass({ missionId: f.mission.id, invitationId: f.invitationId, auth: auth(f.creator, "AUTHORIZE_PASS", f.mission.id, f.invitationId, 1), now: 4_001 });
    expect(second.nonce).toBe(first.nonce);
  });

  it("renews a stale unbroadcast matching intent durably for the same recipient", async () => {
    const f = await acceptedMission(tempDir());
    const first = await f.coordinator.authorizePass({ missionId: f.mission.id, invitationId: f.invitationId, auth: auth(f.creator, "AUTHORIZE_PASS", f.mission.id, f.invitationId, 1), now: 4_000 });
    const renewed = await f.coordinator.authorizePass({ missionId: f.mission.id, invitationId: f.invitationId, auth: auth(f.creator, "AUTHORIZE_PASS", f.mission.id, f.invitationId, 1), now: first.createdAt + INTENT_VALIDITY_WINDOW_MS + 1 });
    expect(renewed.nonce).not.toBe(first.nonce);
    expect(renewed.recipient).toBe(first.recipient);
    const restarted = new CanonicalRelayService(new FileRelayStore(f.relayPath), new MutableRpc());
    expect(restarted.getActiveIntent(f.mission.id)?.nonce).toBe(renewed.nonce);
  });

  it("refuses renewal after a broadcast and rejects a conflicting recipient", async () => {
    const f = await acceptedMission(tempDir());
    const first = await f.coordinator.authorizePass({ missionId: f.mission.id, invitationId: f.invitationId, auth: auth(f.creator, "AUTHORIZE_PASS", f.mission.id, f.invitationId, 1), now: 4_000 });
    await f.coordinator.recordBroadcast({ missionId: f.mission.id, invitationId: f.invitationId, txHash: "ef".repeat(32) });
    await expect(f.coordinator.authorizePass({ missionId: f.mission.id, invitationId: f.invitationId, auth: auth(f.creator, "AUTHORIZE_PASS", f.mission.id, f.invitationId, 1), now: first.createdAt + INTENT_VALIDITY_WINDOW_MS + 1 })).rejects.toMatchObject({ reason: "STALE_BROADCASTED_INTENT" });

    const conflict = await acceptedMission(tempDir());
    conflict.relay.initiatePass(conflict.mission.id, normalizeNimiqAddress(conflict.creator), normalizeNimiqAddress(wallet()), { requireOpaqueTag: true });
    await expect(conflict.coordinator.authorizePass({ missionId: conflict.mission.id, invitationId: conflict.invitationId, auth: auth(conflict.creator, "AUTHORIZE_PASS", conflict.mission.id, conflict.invitationId, 1), now: 4_000 })).rejects.toMatchObject({ reason: "RELAY_INTENT_CONFLICT" });
  });
  it("rehydrates mission and opaque active relay broadcast state after process restart", async () => {
    const dir = tempDir();
    const f = await acceptedMission(dir, wallet());
    const intent = await f.coordinator.authorizePass({
      missionId: f.mission.id,
      invitationId: f.invitationId,
      auth: auth(f.creator, "AUTHORIZE_PASS", f.mission.id, f.invitationId, 1),
      now: 4_000,
    });
    expect(intent.recipientData).toMatch(/^co:v1:/);
    await f.coordinator.recordBroadcast({ missionId: f.mission.id, invitationId: f.invitationId, txHash: "ab".repeat(32) });

    const repoAfterRestart = new FileMissionRepository(f.missionPath);
    const relayAfterRestart = new CanonicalRelayService(new FileRelayStore(f.relayPath), new MutableRpc());
    expect((await repoAfterRestart.getMission(f.mission.id))?.currentSequence).toBe(0);
    expect(relayAfterRestart.getActiveIntent(f.mission.id)?.recipientData).toBe(intent.recipientData);
    expect(relayAfterRestart.hasRecordedBroadcast(f.mission.id)).toBe(true);
  });

  it("projects FINAL relay custody into mission state and marks arrival", async () => {
    const dir = tempDir();
    const target = wallet();
    const f = await acceptedMission(dir, target);
    const intent = await f.coordinator.authorizePass({
      missionId: f.mission.id,
      invitationId: f.invitationId,
      auth: auth(f.creator, "AUTHORIZE_PASS", f.mission.id, f.invitationId, 1),
      now: 4_000,
    });
    const txHash = "cd".repeat(32);
    await f.coordinator.recordBroadcast({ missionId: f.mission.id, invitationId: f.invitationId, txHash });
    f.rpc.tx = {
      hash: txHash,
      from: normalizeNimiqAddress(f.creator),
      to: normalizeNimiqAddress(target),
      value: 100_000,
      blockNumber: 3_032_020,
      confirmations: 999,
      recipientData: intent.recipientData!,
    };

    const result = await f.coordinator.reconcile(f.mission.id);
    expect(result.mission.status).toBe("ARRIVED");
    expect(result.mission.current_sequence).toBe(1);
    expect(result.mission.finalized_hop_count).toBe(1);
    expect((await f.service.getInvitationRecord(f.invitationId)).status).toBe("COMPLETED");
  });

  it("repairs the crash window where relay finality persisted before mission projection", async () => {
    const dir = tempDir();
    const f = await acceptedMission(dir, wallet());
    const intent = await f.coordinator.authorizePass({
      missionId: f.mission.id,
      invitationId: f.invitationId,
      auth: auth(f.creator, "AUTHORIZE_PASS", f.mission.id, f.invitationId, 1),
      now: 4_000,
    });
    const txHash = "ef".repeat(32);
    await f.coordinator.recordBroadcast({ missionId: f.mission.id, invitationId: f.invitationId, txHash });
    f.rpc.tx = {
      hash: txHash,
      from: normalizeNimiqAddress(f.creator),
      to: normalizeNimiqAddress(f.target),
      value: 100_000,
      blockNumber: 3_032_020,
      confirmations: 999,
      recipientData: intent.recipientData!,
    };

    const finalHop = await f.relay.reconcile(f.mission.id);
    expect(finalHop?.status).toBe("FINAL");
    expect((await f.repo.getMission(f.mission.id))?.currentSequence).toBe(0);

    const repo2 = new FileMissionRepository(f.missionPath);
    const service2 = new ReachMissionService(repo2, f.protector);
    const relay2 = new CanonicalRelayService(new FileRelayStore(f.relayPath), f.rpc);
    const coordinator2 = new ReachMissionCoordinator(service2, repo2, relay2, f.protector);
    const recovered = await coordinator2.reconcile(f.mission.id);

    expect(recovered.mission.current_sequence).toBe(1);
    expect(recovered.mission.finalized_hop_count).toBe(1);
    expect((await service2.getInvitationRecord(f.invitationId)).status).toBe("COMPLETED");
  });
});
