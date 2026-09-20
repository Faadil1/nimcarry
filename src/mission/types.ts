export type MissionStatus = "ACTIVE" | "ARRIVED" | "CANCELLED";
export type MissionActivity = "ACTIVE" | "STALLED" | "TERMINAL";
export type MissionVisibility = "UNLISTED" | "PRIVATE" | "PUBLIC";
export type InvitationStatus = "INVITED" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "WITHDRAWN" | "COMPLETED";
export type ChallengeStatus = "ISSUED" | "USED" | "EXPIRED";

export type MissionAction =
  | "CREATE_MISSION"
  | "CREATE_INVITATION"
  | "ACCEPT_INVITATION"
  | "WITHDRAW_INVITATION"
  | "AUTHORIZE_PASS"
  | "AUTHORIZE_DELIVERY"
  | "BIND_DESTINATION"
  | "CANCEL_MISSION"
  | "VIEW_ROUTE";

export interface VerifiedWalletAction {
  wallet: string;
  action: MissionAction;
  missionId?: string;
  invitationId?: string;
  sequence?: number;
  challengeId?: string;
}

export interface MissionRecord {
  id: string;
  creatorWalletNormalized: string;
  creatorDisplayLabel: string | null;
  currentHolderWalletNormalized: string;
  targetLabel: string;
  targetWalletCiphertext: string | null;
  targetWalletHmac: string | null;
  /** True once the destination endpoint is resolved and consent/binding is complete. */
  targetConsentConfirmed: boolean;
  missionNote: string;
  status: MissionStatus;
  visibility: MissionVisibility;
  finalizedHopCount: number;
  currentSequence: number;
  createdAt: number;
  arrivedAt: number | null;
  cancelledAt: number | null;
  updatedAt: number;
}

export type DestinationClaimStatus = "PENDING" | "BOUND" | "EXPIRED" | "CANCELLED";

export interface DestinationClaimRecord {
  id: string;
  missionId: string;
  claimTokenHash: string;
  status: DestinationClaimStatus;
  createdAt: number;
  expiresAt: number;
  boundWalletNormalized: string | null;
  boundAt: number | null;
}

export interface PublicDestinationClaim {
  mission_id: string;
  target_label: string;
  mission_note: string;
  status: DestinationClaimStatus;
  expires_at: string;
  bound: boolean;
}

export interface InvitationRecord {
  id: string;
  missionId: string;
  sequence: number;
  inviterWalletNormalized: string;
  candidateLabel: string | null;
  candidateWalletNormalized: string | null;
  candidateDisplayLabel: string | null;
  whyYou: string | null;
  inviteTokenHash: string;
  status: InvitationStatus;
  createdAt: number;
  expiresAt: number;
  acceptedAt: number | null;
  passDeadlineAt: number | null;
  declinedAt: number | null;
  withdrawnAt: number | null;
  completedAt: number | null;
  closedAt: number | null;
}

export interface AuthChallengeRecord {
  id: string;
  walletNormalized: string;
  action: MissionAction;
  missionId: string | null;
  invitationId: string | null;
  sequence: number;
  nonceHash: string;
  canonicalMessage: string;
  status: ChallengeStatus;
  expiresAt: number;
  usedAt: number | null;
  createdAt: number;
}

export interface PublicMission {
  id: string;
  creator_wallet: string;
  current_holder: string;
  target_label: string;
  /** Boolean disclosure only; the target wallet itself remains private. */
  target_consent_confirmed: boolean;
  mission_note: string;
  status: MissionStatus;
  activity: MissionActivity;
  visibility: MissionVisibility;
  finalized_hop_count: number;
  current_sequence: number;
  created_at: string;
  last_activity_at: string;
  arrived_at: string | null;
  /** Following is social retention, not custody or a reward mechanic. */
  route_following_available: boolean;
  /** A stalled route may inspire a new mission; the old baton is never clawed back. */
  stalled_restart_available: boolean;
}

export interface PublicInvitation {
  id: string;
  mission_id: string;
  sequence: number;
  candidate_label: string | null;
  candidate_wallet_fingerprint: string | null;
  why_you: string | null;
  status: InvitationStatus;
  expires_at: string;
  pass_deadline_at: string | null;
}

export interface MissionStoreSnapshot {
  missions: MissionRecord[];
  invitations: InvitationRecord[];
  destinationClaims?: DestinationClaimRecord[];
  challenges: AuthChallengeRecord[];
  auditEvents?: AuditEventRecord[];
}

export interface AuditEventRecord {
  id: string;
  missionId: string | null;
  invitationId: string | null;
  actorWalletNormalized: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export class MissionValidationError extends Error {
  constructor(public reason: string, message: string) {
    super(message);
    this.name = "MissionValidationError";
  }
}
