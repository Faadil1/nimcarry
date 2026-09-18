import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrivateKey, PublicKey } from "@nimiq/core";
import { afterEach, describe, expect, it } from "vitest";
import { FileMissionRepository } from "../../src/mission/file-repository.js";
import { ReachMissionService, INVITATION_TTL_MS, MISSION_STALL_THRESHOLD_MS } from "../../src/mission/service.js";
import { TargetWalletProtector, normalizeNimiqAddress } from "../../src/mission/target-wallet-crypto.js";
import type { MissionAction, VerifiedWalletAction } from "../../src/mission/types.js";

const dirs: string[] = [];
function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "carry-one-mission-"));
  dirs.push(dir);
  return join(dir, "state.json");
}
function wallet(): string {
  return PublicKey.derive(PrivateKey.generate()).toAddress().toUserFriendlyAddress();
}
function auth(walletAddress: string, action: MissionAction, missionId?: string, invitationId?: string, sequence = 0): VerifiedWalletAction {
  return { wallet: normalizeNimiqAddress(walletAddress), action, missionId, invitationId, sequence };
}
function fixture() {
  const repo = new FileMissionRepository(tempFile());
  const protector = new TargetWalletProtector(Buffer.alloc(32, 11), Buffer.alloc(32, 12));
  const service = new ReachMissionService(repo, protector);
  return { repo, protector, service };
}
function consentedMissionInput(creator: string, now: number) {
  return {
    auth: auth(creator, "CREATE_MISSION" as const),
    targetLabel: "Target",
    targetWallet: wallet(),
    targetConsentConfirmed: true,
    missionNote: "Route me",
    now,
  };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Reach Mission foundation service", () => {
  it("requires explicit target consent and never exposes target wallet material", async () => {
    const { repo, service } = fixture();
    const creator = wallet();
    const target = wallet();

    await expect(service.createMission({
      auth: auth(creator, "CREATE_MISSION"),
      targetLabel: "Nimiq builder",
      targetWallet: target,
      missionNote: "Please route this through people who actually know the target.",
    })).rejects.toMatchObject({ reason: "TARGET_CONSENT_REQUIRED" });

    const mission = await service.createMission({
      auth: auth(creator, "CREATE_MISSION"),
      targetLabel: "Nimiq builder",
      targetWallet: target,
      targetConsentConfirmed: true,
      missionNote: "Please route this through people who actually know the target.",
      now: 1_000,
    });

    expect(mission.target_consent_confirmed).toBe(true);
    const publicJson = JSON.stringify(mission);
    expect(publicJson).not.toContain(normalizeNimiqAddress(target));
    expect(publicJson).not.toContain("targetWalletCiphertext");
    expect(publicJson).not.toContain("targetWalletHmac");

    const stored = (await repo.snapshot()).missions[0];
    expect(stored.targetWalletCiphertext).not.toContain(normalizeNimiqAddress(target));
    expect(stored.targetWalletHmac).not.toBe(normalizeNimiqAddress(target));
  });

  it("marks inactivity as STALLED without changing canonical custody", async () => {
    const { service } = fixture();
    const creator = wallet();
    const mission = await service.createMission(consentedMissionInput(creator, 5_000));
    const stalled = await service.getMission(mission.id, 5_000 + MISSION_STALL_THRESHOLD_MS + 1);
    expect(stalled.activity).toBe("STALLED");
    expect(stalled.current_sequence).toBe(0);
    expect(stalled.current_holder).toBe(mission.current_holder);
    expect(stalled.stalled_restart_available).toBe(true);
  });

  it("fails closed when two next-bridge invitations race", async () => {
    const { service } = fixture();
    const creator = wallet();
    const mission = await service.createMission(consentedMissionInput(creator, 10_000));
    const createAuth = auth(creator, "CREATE_INVITATION", mission.id, undefined, 1);
    const results = await Promise.allSettled([
      service.createInvitation({ missionId: mission.id, auth: createAuth, candidateLabel: "A", now: 11_000 }),
      service.createInvitation({ missionId: mission.id, auth: createAuth, candidateLabel: "B", now: 11_000 }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({ reason: "OPEN_INVITATION_EXISTS" });
  });

  it("binds an unbound invitation to the accepting wallet and allows reroute after decline", async () => {
    const { service } = fixture();
    const creator = wallet();
    const candidate = wallet();
    const mission = await service.createMission(consentedMissionInput(creator, 20_000));
    const first = await service.createInvitation({
      missionId: mission.id,
      auth: auth(creator, "CREATE_INVITATION", mission.id, undefined, 1),
      candidateLabel: "First bridge",
      whyYou: "You know this community.",
      now: 21_000,
    });
    expect((await service.declineInvitation(first.inviteToken, 22_000)).status).toBe("DECLINED");
    const second = await service.createInvitation({
      missionId: mission.id,
      auth: auth(creator, "CREATE_INVITATION", mission.id, undefined, 1),
      candidateLabel: "Second bridge",
      now: 23_000,
    });
    const accepted = await service.acceptInvitation({
      token: second.inviteToken,
      auth: auth(candidate, "ACCEPT_INVITATION", mission.id, second.invitation.id, 1),
      now: 24_000,
    });
    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.candidate_wallet_fingerprint).not.toBeNull();
  });

  it("persists an optional carrier display label only after signed acceptance", async () => {
    const { repo, service } = fixture();
    const creator = wallet();
    const candidate = wallet();
    const mission = await service.createMission(consentedMissionInput(creator, 25_000));
    const invitation = await service.createInvitation({
      missionId: mission.id,
      auth: auth(creator, "CREATE_INVITATION", mission.id, undefined, 1),
      now: 25_100,
    });
    await service.acceptInvitation({
      token: invitation.inviteToken,
      auth: auth(candidate, "ACCEPT_INVITATION", mission.id, invitation.invitation.id, 1),
      candidateDisplayLabel: "Bridge B",
      now: 25_200,
    });
    const stored = (await repo.snapshot()).invitations.find((item) => item.id === invitation.invitation.id);
    expect(stored?.candidateDisplayLabel).toBe("Bridge B");

  });

  it("rejects an overlong carrier display label before repository persistence", async () => {
    const { service } = fixture();
    const creator = wallet();
    const candidate = wallet();
    const mission = await service.createMission(consentedMissionInput(creator, 27_000));
    const invitation = await service.createInvitation({
      missionId: mission.id,
      auth: auth(creator, "CREATE_INVITATION", mission.id, undefined, 1),
      now: 27_100,
    });
    await expect(service.acceptInvitation({
      token: invitation.inviteToken,
      auth: auth(candidate, "ACCEPT_INVITATION", mission.id, invitation.invitation.id, 1),
      candidateDisplayLabel: "x".repeat(61),
      now: 27_200,
    })).rejects.toMatchObject({ reason: "INVALID_TEXT_LENGTH" });
  });

  it("expires untouched invitations without changing custody", async () => {
    const { service } = fixture();
    const creator = wallet();
    const mission = await service.createMission(consentedMissionInput(creator, 30_000));
    const invitation = await service.createInvitation({
      missionId: mission.id,
      auth: auth(creator, "CREATE_INVITATION", mission.id, undefined, 1),
      now: 31_000,
    });
    expect(await service.expireDueInvitations(31_000 + INVITATION_TTL_MS + 1)).toBe(1);
    expect((await service.getInvitationByToken(invitation.inviteToken)).status).toBe("EXPIRED");
    const after = await service.getMission(mission.id, 31_000 + INVITATION_TTL_MS + 1);
    expect(after.current_sequence).toBe(0);
    expect(after.finalized_hop_count).toBe(0);
  });

  it("reissues an expired accepted invitation in place and invalidates the old token", async () => {
    const { repo, service } = fixture();
    const creator = wallet();
    const candidate = wallet();
    const mission = await service.createMission(consentedMissionInput(creator, 50_000));
    const original = await service.createInvitation({ missionId: mission.id, auth: auth(creator, "CREATE_INVITATION", mission.id, undefined, 1), candidateWallet: candidate, now: 51_000 });
    await service.acceptInvitation({ token: original.inviteToken, auth: auth(candidate, "ACCEPT_INVITATION", mission.id, original.invitation.id, 1), now: 52_000 });
    await service.expireDueInvitations(52_000 + 60 * 60 * 1000 + 1);

    const reissued = await service.reissueInvitation({
      missionId: mission.id,
      invitationId: original.invitation.id,
      auth: auth(creator, "CREATE_INVITATION", mission.id, original.invitation.id, 1),
      candidateWallet: candidate,
      activePassRecipient: candidate,
      now: 53_000,
    });
    expect(reissued.invitation.id).toBe(original.invitation.id);
    expect(reissued.inviteToken).not.toBe(original.inviteToken);
    expect(reissued.invitation.status).toBe("INVITED");
    await expect(service.getInvitationByToken(original.inviteToken)).rejects.toMatchObject({ reason: "INVITATION_NOT_FOUND" });
    expect((await service.acceptInvitation({ token: reissued.inviteToken, auth: auth(candidate, "ACCEPT_INVITATION", mission.id, original.invitation.id, 1), now: 54_000 })).status).toBe("ACCEPTED");
    expect((await repo.snapshot()).auditEvents).toHaveLength(1);
  });

  it("fails closed when reissued candidate differs from an active pass intent", async () => {
    const { service } = fixture();
    const creator = wallet(); const candidate = wallet(); const wrong = wallet();
    const mission = await service.createMission(consentedMissionInput(creator, 60_000));
    const invitation = await service.createInvitation({ missionId: mission.id, auth: auth(creator, "CREATE_INVITATION", mission.id, undefined, 1), candidateWallet: candidate, now: 61_000 });
    await service.expireDueInvitations(61_000 + INVITATION_TTL_MS + 1);
    await expect(service.reissueInvitation({ missionId: mission.id, invitationId: invitation.invitation.id, auth: auth(creator, "CREATE_INVITATION", mission.id, invitation.invitation.id, 1), candidateWallet: wrong, activePassRecipient: candidate, now: 62_000 })).rejects.toMatchObject({ reason: "PASS_INTENT_RECIPIENT_MISMATCH" });
  });

  it("does not reissue an accepted or completed invitation after broadcast/finalization state", async () => {
    const { service } = fixture();
    const creator = wallet(); const candidate = wallet();
    const mission = await service.createMission(consentedMissionInput(creator, 70_000));
    const invitation = await service.createInvitation({ missionId: mission.id, auth: auth(creator, "CREATE_INVITATION", mission.id, undefined, 1), candidateWallet: candidate, now: 71_000 });
    await service.acceptInvitation({ token: invitation.inviteToken, auth: auth(candidate, "ACCEPT_INVITATION", mission.id, invitation.invitation.id, 1), now: 72_000 });
    await expect(service.reissueInvitation({ missionId: mission.id, invitationId: invitation.invitation.id, auth: auth(creator, "CREATE_INVITATION", mission.id, invitation.invitation.id, 1), candidateWallet: candidate, activePassRecipient: candidate, now: 73_000 })).rejects.toMatchObject({ reason: "INVITATION_NOT_REISSUABLE" });
  });

  it("refuses mission cancellation while an invitation is open", async () => {
    const { service } = fixture();
    const creator = wallet();
    const mission = await service.createMission(consentedMissionInput(creator, 40_000));
    await service.createInvitation({
      missionId: mission.id,
      auth: auth(creator, "CREATE_INVITATION", mission.id, undefined, 1),
      now: 41_000,
    });
    await expect(service.cancelMission(mission.id, auth(creator, "CANCEL_MISSION", mission.id), 42_000))
      .rejects.toMatchObject({ reason: "OPEN_INVITATION" });
  });
});
