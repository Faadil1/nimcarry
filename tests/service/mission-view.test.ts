import { describe, expect, it } from "vitest";
import { PrivateKey, PublicKey } from "@nimiq/core";
import { composeMissionView } from "../../src/service/mission-view.js";
import { TargetWalletProtector } from "../../src/mission/target-wallet-crypto.js";
import type { InvitationRecord, MissionRecord } from "../../src/mission/types.js";

const protector = new TargetWalletProtector(Buffer.alloc(32, 31), Buffer.alloc(32, 32));
const A = PublicKey.derive(PrivateKey.generate()).toAddress().toUserFriendlyAddress();
const B = PublicKey.derive(PrivateKey.generate()).toAddress().toUserFriendlyAddress();
const mission: MissionRecord = {
  id: "mission-1", creatorWalletNormalized: A, creatorDisplayLabel: "A", currentHolderWalletNormalized: A,
  targetLabel: "Target", targetConsentConfirmed: true, targetWalletCiphertext: "cipher", targetWalletHmac: "target",
  missionNote: "note", status: "ACTIVE", visibility: "UNLISTED", finalizedHopCount: 0, currentSequence: 0,
  createdAt: 1, updatedAt: 1, arrivedAt: null, cancelledAt: null,
};
const invitation: InvitationRecord = {
  id: "invitation-1", missionId: "mission-1", sequence: 1, inviterWalletNormalized: A, candidateLabel: "B",
  candidateWalletNormalized: B, candidateDisplayLabel: "Bridge B", whyYou: "why", inviteTokenHash: "hash", status: "ACCEPTED",
  createdAt: 1, expiresAt: 10_000, acceptedAt: 2, passDeadlineAt: 10_000_000_000_000, declinedAt: null,
  withdrawnAt: null, completedAt: null, closedAt: null,
};

function view(options: { hasActiveIntent: boolean; activeIntentStale?: boolean; activeIntentHasBroadcast?: boolean; viewer?: string }) {
  return composeMissionView({ mission, invitation, route: [], protector, viewer: options.viewer ?? A, now: 1, ...options });
}

describe("mission primary action for accepted pass intents", () => {
  it("makes stale unbroadcast accepted state actionable", () => {
    expect(view({ hasActiveIntent: true, activeIntentStale: true, activeIntentHasBroadcast: false }).primary_action).toBe("PASS_1_NIM");
  });
  it("keeps a valid active intent waiting", () => {
    expect(view({ hasActiveIntent: true, activeIntentStale: false }).primary_action).toBe("WAIT");
  });
  it("blocks stale broadcasted intent and unauthorized viewers", () => {
    expect(view({ hasActiveIntent: true, activeIntentStale: true, activeIntentHasBroadcast: true }).primary_action).toBe("WAIT");
    expect(view({ hasActiveIntent: true, activeIntentStale: true, activeIntentHasBroadcast: false, viewer: B }).primary_action).toBe("WAIT");
  });

  it("shows the accepted display label only to viewers with full invitation context", () => {
    expect(view({ hasActiveIntent: false, viewer: A }).invitation?.candidate_display_label).toBe("Bridge B");
    expect(view({ hasActiveIntent: false, viewer: B }).invitation?.candidate_display_label).toBe("Bridge B");
    const stranger = PublicKey.derive(PrivateKey.generate()).toAddress().toUserFriendlyAddress();
    expect(view({ hasActiveIntent: false, viewer: stranger }).invitation?.candidate_display_label).toBeNull();
  });
});
