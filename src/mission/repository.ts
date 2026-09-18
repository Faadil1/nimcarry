import type {
  AuthChallengeRecord,
  InvitationRecord,
  InvitationStatus,
  MissionRecord,
  MissionStoreSnapshot,
} from "./types.js";

export interface MissionRepository {
  createMission(record: MissionRecord): Promise<MissionRecord>;
  getMission(id: string): Promise<MissionRecord | undefined>;
  cancelMissionPristine(id: string, signerWallet: string, now: number): Promise<MissionRecord>;

  createInvitation(record: InvitationRecord): Promise<InvitationRecord>;
  reissueInvitation(input: {
    invitationId: string;
    inviteTokenHash: string;
    candidateLabel: string | null;
    candidateWalletNormalized: string | null;
    whyYou: string | null;
    createdAt: number;
    expiresAt: number;
  }): Promise<InvitationRecord>;
  getInvitation(id: string): Promise<InvitationRecord | undefined>;
  getInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | undefined>;
  getOpenInvitation(missionId: string): Promise<InvitationRecord | undefined>;
  getInvitationForSequence(missionId: string, sequence: number): Promise<InvitationRecord | undefined>;
  acceptInvitation(id: string, wallet: string, now: number, passDeadlineAt: number, candidateDisplayLabel?: string | null): Promise<InvitationRecord>;
  closeInvitation(id: string, status: Extract<InvitationStatus, "DECLINED" | "EXPIRED" | "WITHDRAWN">, now: number): Promise<InvitationRecord>;
  expireDueInvitations(now: number): Promise<number>;

  completeFinalHop(input: {
    missionId: string;
    invitationId: string;
    sequence: number;
    recipientWallet: string;
    recipientHmac: string;
    now: number;
  }): Promise<{ mission: MissionRecord; invitation: InvitationRecord }>;

  createChallenge(record: AuthChallengeRecord): Promise<AuthChallengeRecord>;
  getChallenge(id: string): Promise<AuthChallengeRecord | undefined>;
  consumeChallenge(id: string, now: number): Promise<AuthChallengeRecord>;

  snapshot(): Promise<MissionStoreSnapshot>;
  recordAuditEvent(event: import("./types.js").AuditEventRecord): Promise<void>;
}
