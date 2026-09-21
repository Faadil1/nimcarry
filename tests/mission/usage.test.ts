import { describe, expect, it } from "vitest";
import { buildUsageEvidence } from "../../src/mission/usage.js";
import type { MissionStoreSnapshot } from "../../src/mission/types.js";

const snapshot: MissionStoreSnapshot = {
  missions: [
    {
      id: "m1",
      creatorWalletNormalized: "W0",
      creatorDisplayLabel: null,
      currentHolderWalletNormalized: "W2",
      targetLabel: "Target",
      targetWalletCiphertext: "cipher",
      targetWalletHmac: "hmac",
      targetConsentConfirmed: true,
      missionNote: "Reach this person",
      status: "ARRIVED",
      visibility: "UNLISTED",
      finalizedHopCount: 2,
      currentSequence: 2,
      createdAt: 1,
      arrivedAt: 5,
      cancelledAt: null,
      updatedAt: 5,
    },
  ],
  invitations: [
    {
      id: "i1", missionId: "m1", sequence: 1, inviterWalletNormalized: "W0", candidateLabel: null,
      candidateWalletNormalized: "W1", candidateDisplayLabel: null, whyYou: null, inviteTokenHash: "a",
      status: "COMPLETED", createdAt: 1, expiresAt: 2, acceptedAt: 1, passDeadlineAt: 2,
      declinedAt: null, withdrawnAt: null, completedAt: 3, closedAt: 3,
    },
    {
      id: "i2", missionId: "m1", sequence: 2, inviterWalletNormalized: "W1", candidateLabel: null,
      candidateWalletNormalized: "W2", candidateDisplayLabel: null, whyYou: null, inviteTokenHash: "b",
      status: "COMPLETED", createdAt: 3, expiresAt: 4, acceptedAt: 3, passDeadlineAt: 4,
      declinedAt: null, withdrawnAt: null, completedAt: 5, closedAt: 5,
    },
  ],
  destinationClaims: [],
  challenges: [],
};

const history = [
  { baton_id: "m1", sequence: 1, current_holder: "W0", recipient: "W1", tx_hash: "a", status: "CONFIRMED" as const, created_at: "", confirmed_at: "" },
  { baton_id: "m1", sequence: 2, current_holder: "W1", recipient: "W2", tx_hash: "b", status: "CONFIRMED" as const, created_at: "", confirmed_at: "" },
];

describe("real usage evidence", () => {
  it("counts unique wallets without exposing a wallet list or claiming unique humans", () => {
    const evidence = buildUsageEvidence(snapshot, [history]);
    expect(evidence).toMatchObject({
      missions_created: 1,
      missions_arrived: 1,
      invitations_created: 2,
      invitations_completed: 2,
      finalized_hops: 2,
      unique_participating_wallets: 3,
      invitation_acceptance_rate: 1,
      arrival_rate: 1,
    });
    expect(Object.keys(evidence)).not.toContain("wallets");
  });
});
