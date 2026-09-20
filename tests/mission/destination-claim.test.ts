import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrivateKey, PublicKey } from "@nimiq/core";
import { afterEach, describe, expect, it } from "vitest";
import { FileMissionRepository } from "../../src/mission/file-repository.js";
import { DESTINATION_CLAIM_TTL_MS, ReachMissionService } from "../../src/mission/service.js";
import { TargetWalletProtector, normalizeNimiqAddress } from "../../src/mission/target-wallet-crypto.js";
import type { MissionAction, VerifiedWalletAction } from "../../src/mission/types.js";

const dirs: string[] = [];

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "nimcarry-destination-claim-"));
  dirs.push(dir);
  return join(dir, "state.json");
}

function wallet(): string {
  return PublicKey.derive(PrivateKey.generate()).toAddress().toUserFriendlyAddress();
}

function auth(walletAddress: string, action: MissionAction, missionId?: string): VerifiedWalletAction {
  return {
    wallet: normalizeNimiqAddress(walletAddress),
    action,
    missionId,
    sequence: 0,
  };
}

function fixture() {
  const repo = new FileMissionRepository(tempFile());
  const protector = new TargetWalletProtector(Buffer.alloc(32, 31), Buffer.alloc(32, 32));
  const service = new ReachMissionService(repo, protector);
  return { repo, service };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Destination Claim foundation", () => {
  it("starts a mission without a destination wallet and moves no funds", async () => {
    const { repo, service } = fixture();
    const creator = wallet();
    const created = await service.createClaimMission({
      auth: auth(creator, "CREATE_MISSION"),
      targetLabel: "David",
      missionNote: "This is for David.",
      now: 1_000,
    });

    expect(created.mission.target_resolved).toBe(false);
    expect(created.mission.target_consent_confirmed).toBe(false);
    expect(created.claim.status).toBe("PENDING");
    expect(created.claim.bound).toBe(false);
    expect(created.claimToken.length).toBeGreaterThan(30);

    const snapshot = await repo.snapshot();
    expect(snapshot.missions[0].targetWalletCiphertext).toBeNull();
    expect(snapshot.missions[0].targetWalletHmac).toBeNull();
    expect(snapshot.destinationClaims).toHaveLength(1);
  });

  it("lets only the destination bind its own signed wallet and never exposes it publicly", async () => {
    const { repo, service } = fixture();
    const creator = wallet();
    const destination = wallet();
    const created = await service.createClaimMission({
      auth: auth(creator, "CREATE_MISSION"),
      targetLabel: "David",
      missionNote: "Private delivery.",
      now: 10_000,
    });

    const bound = await service.bindDestinationClaim({
      token: created.claimToken,
      auth: auth(destination, "BIND_DESTINATION", created.mission.id),
      now: 11_000,
    });

    expect(bound.claim.status).toBe("BOUND");
    expect(bound.claim.bound).toBe(true);
    expect(bound.mission.target_resolved).toBe(true);
    expect(bound.mission.target_consent_confirmed).toBe(true);
    expect(JSON.stringify(bound)).not.toContain(normalizeNimiqAddress(destination));

    const stored = (await repo.snapshot()).missions[0];
    expect(stored.targetWalletCiphertext).not.toContain(normalizeNimiqAddress(destination));
    expect(stored.targetWalletHmac).not.toBe(normalizeNimiqAddress(destination));
  });

  it("makes repeat binding by the same wallet idempotent and rejects a different wallet", async () => {
    const { service } = fixture();
    const creator = wallet();
    const destination = wallet();
    const attacker = wallet();
    const created = await service.createClaimMission({
      auth: auth(creator, "CREATE_MISSION"),
      targetLabel: "David",
      missionNote: "Private delivery.",
      now: 20_000,
    });

    await service.bindDestinationClaim({
      token: created.claimToken,
      auth: auth(destination, "BIND_DESTINATION", created.mission.id),
      now: 21_000,
    });
    const replay = await service.bindDestinationClaim({
      token: created.claimToken,
      auth: auth(destination, "BIND_DESTINATION", created.mission.id),
      now: 22_000,
    });
    expect(replay.claim.status).toBe("BOUND");

    await expect(service.bindDestinationClaim({
      token: created.claimToken,
      auth: auth(attacker, "BIND_DESTINATION", created.mission.id),
      now: 23_000,
    })).rejects.toMatchObject({ reason: "DESTINATION_ALREADY_BOUND" });
  });

  it("rejects creator self-binding and expired claims", async () => {
    const { service } = fixture();
    const creator = wallet();
    const destination = wallet();

    const selfClaim = await service.createClaimMission({
      auth: auth(creator, "CREATE_MISSION"),
      targetLabel: "David",
      missionNote: "Private delivery.",
      now: 30_000,
    });
    await expect(service.bindDestinationClaim({
      token: selfClaim.claimToken,
      auth: auth(creator, "BIND_DESTINATION", selfClaim.mission.id),
      now: 31_000,
    })).rejects.toMatchObject({ reason: "TARGET_IS_CREATOR" });

    const expiring = await service.createClaimMission({
      auth: auth(creator, "CREATE_MISSION"),
      targetLabel: "Another David",
      missionNote: "This one expires.",
      now: 40_000,
    });
    await expect(service.bindDestinationClaim({
      token: expiring.claimToken,
      auth: auth(destination, "BIND_DESTINATION", expiring.mission.id),
      now: 40_000 + DESTINATION_CLAIM_TTL_MS + 1,
    })).rejects.toMatchObject({ reason: "DESTINATION_CLAIM_EXPIRED" });
  });
});
