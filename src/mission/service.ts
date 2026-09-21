import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { MissionRepository } from "./repository.js";
import {
  MissionValidationError,
  type DestinationClaimRecord,
  type InvitationRecord,
  type MissionAction,
  type MissionActivity,
  type MissionRecord,
  type MissionVisibility,
  type PublicDestinationClaim,
  type PublicInvitation,
  type PublicMission,
  type VerifiedWalletAction,
} from "./types.js";
import { normalizeNimiqAddress, TargetWalletProtector, walletFingerprint } from "./target-wallet-crypto.js";

export const INVITATION_TTL_MS = 12 * 60 * 60 * 1000;
export const DESTINATION_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
export const ACCEPTED_PASS_DEADLINE_MS = 60 * 60 * 1000;
export const MISSION_STALL_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

function boundedText(value: string, min: number, max: number, field: string): string {
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new MissionValidationError("INVALID_TEXT_LENGTH", `${field} must be between ${min} and ${max} characters`);
  }
  return text;
}

function assertAction(
  auth: VerifiedWalletAction,
  action: MissionAction,
  bindings: { missionId?: string; invitationId?: string; sequence?: number } = {}
): void {
  if (auth.action !== action) throw new MissionValidationError("WRONG_AUTH_ACTION", `Expected ${action} authorization`);
  if (bindings.missionId !== undefined && auth.missionId !== bindings.missionId) {
    throw new MissionValidationError("AUTH_MISSION_MISMATCH", "Authorization is bound to another mission");
  }
  if (bindings.invitationId !== undefined && auth.invitationId !== bindings.invitationId) {
    throw new MissionValidationError("AUTH_INVITATION_MISMATCH", "Authorization is bound to another invitation");
  }
  if (bindings.sequence !== undefined && auth.sequence !== bindings.sequence) {
    throw new MissionValidationError("AUTH_SEQUENCE_MISMATCH", "Authorization is bound to another sequence");
  }
}

export function missionActivity(record: MissionRecord, now = Date.now()): MissionActivity {
  if (record.status !== "ACTIVE") return "TERMINAL";
  return now - record.updatedAt > MISSION_STALL_THRESHOLD_MS ? "STALLED" : "ACTIVE";
}

export function toPublicMission(record: MissionRecord, now = Date.now()): PublicMission {
  const activity = missionActivity(record, now);
  return {
    id: record.id,
    creator_wallet: walletFingerprint(record.creatorWalletNormalized),
    current_holder: walletFingerprint(record.currentHolderWalletNormalized),
    target_label: record.targetLabel,
    target_consent_confirmed: record.targetConsentConfirmed,
    target_wallet_bound: record.targetWalletHmac !== null && record.targetWalletCiphertext !== null,
    mission_note: record.missionNote,
    status: record.status,
    activity,
    visibility: record.visibility,
    finalized_hop_count: record.finalizedHopCount,
    current_sequence: record.currentSequence,
    created_at: new Date(record.createdAt).toISOString(),
    last_activity_at: new Date(record.updatedAt).toISOString(),
    arrived_at: record.arrivedAt === null ? null : new Date(record.arrivedAt).toISOString(),
    route_following_available: record.status !== "CANCELLED",
    stalled_restart_available: activity === "STALLED",
  };
}

export function toPublicDestinationClaim(record: DestinationClaimRecord): PublicDestinationClaim {
  return {
    id: record.id,
    mission_id: record.missionId,
    status: record.status,
    expires_at: new Date(record.expiresAt).toISOString(),
    claimed_at: record.claimedAt === null ? null : new Date(record.claimedAt).toISOString(),
  };
}

export function toPublicInvitation(record: InvitationRecord): PublicInvitation {
  return {
    id: record.id,
    mission_id: record.missionId,
    sequence: record.sequence,
    candidate_label: record.candidateLabel,
    candidate_wallet_fingerprint: record.candidateWalletNormalized ? walletFingerprint(record.candidateWalletNormalized) : null,
    why_you: record.whyYou,
    status: record.status,
    expires_at: new Date(record.expiresAt).toISOString(),
    pass_deadline_at: record.passDeadlineAt === null ? null : new Date(record.passDeadlineAt).toISOString(),
  };
}

export class ReachMissionService {
  private broadcastGuard: (missionId: string) => boolean = () => false;
  private routeWalletGuard: (missionId: string, wallet: string) => boolean = () => false;

  constructor(
    private readonly repository: MissionRepository,
    private readonly protector: TargetWalletProtector
  ) {}

  setBroadcastGuard(guard: (missionId: string) => boolean): void {
    this.broadcastGuard = guard;
  }

  /** Returns true when a wallet already participated in the finalized route. */
  setRouteWalletGuard(guard: (missionId: string, wallet: string) => boolean): void {
    this.routeWalletGuard = guard;
  }

  async createMission(input: {
    auth: VerifiedWalletAction;
    targetLabel: string;
    /** Optional. Omit it to let the destination bind their own wallet through a private claim. */
    targetWallet?: string;
    /** Required only when a destination wallet is supplied at creation. */
    targetConsentConfirmed?: boolean;
    /** This is the human purpose/ask shown to the destination/optional bridge, not a generic memo. */
    missionNote: string;
    creatorDisplayLabel?: string;
    visibility?: MissionVisibility;
    now?: number;
  }): Promise<PublicMission> {
    assertAction(input.auth, "CREATE_MISSION");
    const now = input.now ?? Date.now();
    const creator = normalizeNimiqAddress(input.auth.wallet);

    let targetWalletCiphertext: string | null = null;
    let targetWalletHmac: string | null = null;
    let targetConsentConfirmed = false;
    if (input.targetWallet) {
      if (input.targetConsentConfirmed !== true) {
        throw new MissionValidationError(
          "TARGET_CONSENT_REQUIRED",
          "A pre-bound destination wallet requires explicit destination consent"
        );
      }
      const target = this.protector.protect(input.targetWallet);
      if (creator === target.normalized) {
        throw new MissionValidationError("TARGET_IS_CREATOR", "A mission destination must differ from its creator");
      }
      targetWalletCiphertext = target.ciphertext;
      targetWalletHmac = target.hmac;
      targetConsentConfirmed = true;
    }

    const record: MissionRecord = {
      id: randomUUID(),
      creatorWalletNormalized: creator,
      creatorDisplayLabel: input.creatorDisplayLabel?.trim() || null,
      currentHolderWalletNormalized: creator,
      targetLabel: boundedText(input.targetLabel, 1, 60, "targetLabel"),
      targetWalletCiphertext,
      targetWalletHmac,
      targetConsentConfirmed,
      missionNote: boundedText(input.missionNote, 1, 180, "missionNote"),
      status: "ACTIVE",
      visibility: input.visibility ?? "UNLISTED",
      finalizedHopCount: 0,
      currentSequence: 0,
      createdAt: now,
      arrivedAt: null,
      cancelledAt: null,
      updatedAt: now,
    };
    return toPublicMission(await this.repository.createMission(record), now);
  }

  async createDestinationClaim(input: {
    missionId: string;
    creatorWallet: string;
    now?: number;
  }): Promise<{ claim: PublicDestinationClaim; claimToken: string }> {
    const mission = await this.requireMission(input.missionId);
    const creator = normalizeNimiqAddress(input.creatorWallet);
    if (mission.creatorWalletNormalized !== creator) {
      throw new MissionValidationError("NOT_MISSION_AUTHORITY", "Only the mission creator can open the destination claim");
    }
    if (mission.targetWalletHmac !== null || mission.targetWalletCiphertext !== null) {
      throw new MissionValidationError("TARGET_ALREADY_BOUND", "This mission already has a destination wallet");
    }
    const existing = await this.repository.getDestinationClaimForMission(mission.id);
    if (existing && existing.status === "PENDING" && (input.now ?? Date.now()) < existing.expiresAt) {
      throw new MissionValidationError("DESTINATION_CLAIM_ALREADY_OPEN", "This mission already has an active destination claim");
    }
    const now = input.now ?? Date.now();
    const token = randomBytes(32).toString("base64url");
    const record: DestinationClaimRecord = {
      id: randomUUID(),
      missionId: mission.id,
      claimTokenHash: hashToken(token),
      status: "PENDING",
      createdAt: now,
      expiresAt: now + DESTINATION_CLAIM_TTL_MS,
      claimedAt: null,
      closedAt: null,
      claimedWalletNormalized: null,
    };
    const created = await this.repository.createDestinationClaim(record);
    return { claim: toPublicDestinationClaim(created), claimToken: token };
  }

  async getDestinationClaimByToken(token: string, now = Date.now()): Promise<{ claim: PublicDestinationClaim; mission: PublicMission }> {
    const claim = await this.requireDestinationClaimToken(token);
    if (claim.status === "PENDING" && now >= claim.expiresAt) {
      await this.repository.expireDueDestinationClaims(now);
      throw new MissionValidationError("DESTINATION_CLAIM_EXPIRED", "Destination claim has expired");
    }
    return { claim: toPublicDestinationClaim(claim), mission: toPublicMission(await this.requireMission(claim.missionId), now) };
  }

  async getDestinationClaimForMission(missionId: string): Promise<DestinationClaimRecord | undefined> {
    return this.repository.getDestinationClaimForMission(missionId);
  }

  async claimDestination(input: {
    token: string;
    auth: VerifiedWalletAction;
    now?: number;
  }): Promise<{ claim: PublicDestinationClaim; mission: PublicMission }> {
    const claim = await this.requireDestinationClaimToken(input.token);
    assertAction(input.auth, "CLAIM_DESTINATION", { missionId: claim.missionId });
    const now = input.now ?? Date.now();
    if (claim.status === "CLAIMED" && claim.claimedWalletNormalized) {
      const wallet = normalizeNimiqAddress(input.auth.wallet);
      if (wallet !== claim.claimedWalletNormalized) {
        throw new MissionValidationError("DESTINATION_CLAIM_TAKEN", "This destination claim was already accepted by another wallet");
      }
      return {
        claim: toPublicDestinationClaim(claim),
        mission: toPublicMission(await this.requireMission(claim.missionId), now),
      };
    }
    if (claim.status !== "PENDING") {
      throw new MissionValidationError("DESTINATION_CLAIM_CLOSED", `Destination claim is ${claim.status}`);
    }
    if (now >= claim.expiresAt) {
      await this.repository.expireDueDestinationClaims(now);
      throw new MissionValidationError("DESTINATION_CLAIM_EXPIRED", "Destination claim has expired");
    }
    const mission = await this.requireMission(claim.missionId);
    if (mission.status !== "ACTIVE") throw new MissionValidationError("MISSION_NOT_ACTIVE", `Mission ${mission.id} is ${mission.status}`);
    const wallet = normalizeNimiqAddress(input.auth.wallet);
    if (wallet === mission.creatorWalletNormalized) {
      throw new MissionValidationError("TARGET_IS_CREATOR", "The creator cannot claim their own destination");
    }
    if (this.routeWalletGuard(mission.id, wallet)) {
      throw new MissionValidationError("ROUTE_WALLET_REUSE", "A finalized route participant cannot become the destination again");
    }
    const protectedTarget = this.protector.protect(wallet);
    const result = await this.repository.claimDestination({
      claimId: claim.id,
      missionId: mission.id,
      walletNormalized: wallet,
      targetWalletCiphertext: protectedTarget.ciphertext,
      targetWalletHmac: protectedTarget.hmac,
      now,
    });
    return {
      claim: toPublicDestinationClaim(result.claim),
      mission: toPublicMission(result.mission, now),
    };
  }

  async expireDueDestinationClaims(now = Date.now()): Promise<number> {
    return this.repository.expireDueDestinationClaims(now);
  }

  async getMission(id: string, now = Date.now()): Promise<PublicMission> {
    return toPublicMission(await this.requireMission(id), now);
  }

  async getMissionRecord(id: string): Promise<MissionRecord> {
    return this.requireMission(id);
  }

  async cancelMission(id: string, auth: VerifiedWalletAction, now = Date.now()): Promise<PublicMission> {
    assertAction(auth, "CANCEL_MISSION", { missionId: id });
    if (this.broadcastGuard(id)) {
      throw new MissionValidationError("BROADCAST_IN_FLIGHT", "Mission cannot be cancelled after a transaction broadcast");
    }
    return toPublicMission(await this.repository.cancelMissionPristine(id, normalizeNimiqAddress(auth.wallet), now), now);
  }

  async createInvitation(input: {
    missionId: string;
    auth: VerifiedWalletAction;
    candidateLabel?: string;
    candidateWallet?: string;
    whyYou?: string;
    now?: number;
  }): Promise<{ invitation: PublicInvitation; inviteToken: string }> {
    const mission = await this.requireMission(input.missionId);
    if (mission.targetWalletHmac === null || mission.targetWalletCiphertext === null) {
      throw new MissionValidationError(
        "TARGET_NOT_BOUND",
        "Bind the destination wallet through the private claim before adding an optional bridge"
      );
    }
    const sequence = mission.currentSequence + 1;
    assertAction(input.auth, "CREATE_INVITATION", { missionId: mission.id, sequence });
    const signer = normalizeNimiqAddress(input.auth.wallet);
    if (signer !== mission.currentHolderWalletNormalized) {
      throw new MissionValidationError("WRONG_CURRENT_HOLDER", "Only the canonical current holder can invite the next bridge");
    }
    const now = input.now ?? Date.now();
    const token = randomBytes(32).toString("base64url");
    const candidateWallet = input.candidateWallet ? normalizeNimiqAddress(input.candidateWallet) : null;
    if (candidateWallet && this.routeWalletGuard(mission.id, candidateWallet)) {
      throw new MissionValidationError("ROUTE_WALLET_REUSE", "A finalized route participant cannot be selected again in the same mission");
    }
    const record: InvitationRecord = {
      id: randomUUID(),
      missionId: mission.id,
      sequence,
      inviterWalletNormalized: signer,
      candidateLabel: input.candidateLabel ? boundedText(input.candidateLabel, 1, 60, "candidateLabel") : null,
      candidateWalletNormalized: candidateWallet,
      candidateDisplayLabel: null,
      whyYou: input.whyYou ? boundedText(input.whyYou, 1, 120, "whyYou") : null,
      inviteTokenHash: hashToken(token),
      status: "INVITED",
      createdAt: now,
      expiresAt: now + INVITATION_TTL_MS,
      acceptedAt: null,
      passDeadlineAt: null,
      declinedAt: null,
      withdrawnAt: null,
      completedAt: null,
      closedAt: null,
    };
    const created = await this.repository.createInvitation(record);
    return { invitation: toPublicInvitation(created), inviteToken: token };
  }

  async reissueInvitation(input: {
    missionId: string;
    invitationId: string;
    auth: VerifiedWalletAction;
    candidateLabel?: string;
    candidateWallet?: string;
    whyYou?: string;
    activePassRecipient?: string | null;
    now?: number;
  }): Promise<{ invitation: PublicInvitation; inviteToken: string }> {
    const mission = await this.requireMission(input.missionId);
    const invitation = await this.getInvitationRecord(input.invitationId);
    const sequence = mission.currentSequence + 1;
    assertAction(input.auth, "CREATE_INVITATION", { missionId: mission.id, invitationId: invitation.id, sequence });
    const signer = normalizeNimiqAddress(input.auth.wallet);
    if (mission.status !== "ACTIVE") throw new MissionValidationError("MISSION_NOT_ACTIVE", `Mission ${mission.id} is ${mission.status}`);
    if (mission.currentHolderWalletNormalized !== signer) throw new MissionValidationError("WRONG_CURRENT_HOLDER", "Only the canonical current holder can reissue an invitation");
    if (invitation.missionId !== mission.id || invitation.sequence !== sequence) throw new MissionValidationError("INVITATION_SEQUENCE_MISMATCH", "Invitation is not the mission's next canonical sequence");
    if (invitation.status !== "EXPIRED") throw new MissionValidationError("INVITATION_NOT_REISSUABLE", `Invitation is ${invitation.status}`);
    if (input.activePassRecipient === null) throw new MissionValidationError("ACTIVE_PASS_RECIPIENT_REQUIRED", "An active pass intent requires a matching candidate wallet");
    const candidateWallet = input.candidateWallet ? normalizeNimiqAddress(input.candidateWallet) : null;
    if (input.activePassRecipient && candidateWallet !== normalizeNimiqAddress(input.activePassRecipient)) {
      throw new MissionValidationError("PASS_INTENT_RECIPIENT_MISMATCH", "Reissued candidate must match the active pass intent recipient");
    }
    if (candidateWallet && this.routeWalletGuard(mission.id, candidateWallet)) throw new MissionValidationError("ROUTE_WALLET_REUSE", "A finalized route participant cannot be selected again in the same mission");
    const now = input.now ?? Date.now();
    const token = randomBytes(32).toString("base64url");
    const updated = await this.repository.reissueInvitation({
      invitationId: invitation.id,
      inviteTokenHash: hashToken(token),
      candidateLabel: input.candidateLabel ? boundedText(input.candidateLabel, 1, 60, "candidateLabel") : null,
      candidateWalletNormalized: candidateWallet,
      whyYou: input.whyYou ? boundedText(input.whyYou, 1, 120, "whyYou") : null,
      createdAt: now,
      expiresAt: now + INVITATION_TTL_MS,
    });
    await this.repository.recordAuditEvent({
      id: randomUUID(), missionId: mission.id, invitationId: invitation.id,
      actorWalletNormalized: signer, eventType: "INVITATION_REISSUED",
      metadata: { sequence, prior_status: "EXPIRED", active_pass_intent: Boolean(input.activePassRecipient) }, createdAt: now,
    });
    return { invitation: toPublicInvitation(updated), inviteToken: token };
  }

  async getInvitationByToken(token: string): Promise<PublicInvitation> {
    return toPublicInvitation(await this.requireInvitationToken(token));
  }

  /** Server-side private record for a token. Lets the HTTP layer scope route-view access to the invitation's candidate. */
  async getInvitationRecordByToken(token: string): Promise<InvitationRecord> {
    return this.requireInvitationToken(token);
  }

  async getInvitationRecord(id: string): Promise<InvitationRecord> {
    const record = await this.repository.getInvitation(id);
    if (!record) throw new MissionValidationError("INVITATION_NOT_FOUND", `Invitation ${id} does not exist`);
    return record;
  }

  async acceptInvitation(input: {
    token: string;
    auth: VerifiedWalletAction;
    candidateDisplayLabel?: string;
    now?: number;
  }): Promise<PublicInvitation> {
    const invitation = await this.requireInvitationToken(input.token);
    assertAction(input.auth, "ACCEPT_INVITATION", {
      missionId: invitation.missionId,
      invitationId: invitation.id,
      sequence: invitation.sequence,
    });
    const wallet = normalizeNimiqAddress(input.auth.wallet);
    if (
      invitation.status === "ACCEPTED" &&
      invitation.candidateWalletNormalized !== null &&
      normalizeNimiqAddress(invitation.candidateWalletNormalized) === wallet
    ) {
      // Reopening the same invite link after a successful acceptance is a
      // harmless replay from the same bridge. Treat it as idempotent instead of
      // surfacing INVITATION_NOT_INVITED to a user who already consented.
      return toPublicInvitation(invitation);
    }
    if (this.routeWalletGuard(invitation.missionId, wallet)) {
      throw new MissionValidationError("ROUTE_WALLET_REUSE", "A finalized route participant cannot re-enter the same mission");
    }
    const now = input.now ?? Date.now();
    const candidateDisplayLabel = input.candidateDisplayLabel
      ? boundedText(input.candidateDisplayLabel, 1, 60, "candidateDisplayLabel")
      : null;
    const accepted = await this.repository.acceptInvitation(
      invitation.id,
      wallet,
      now,
      now + ACCEPTED_PASS_DEADLINE_MS,
      candidateDisplayLabel
    );
    return toPublicInvitation(accepted);
  }

  async declineInvitation(token: string, now = Date.now()): Promise<PublicInvitation> {
    const invitation = await this.requireInvitationToken(token);
    return toPublicInvitation(await this.repository.closeInvitation(invitation.id, "DECLINED", now));
  }

  async withdrawInvitation(id: string, auth: VerifiedWalletAction, now = Date.now()): Promise<PublicInvitation> {
    const invitation = await this.getInvitationRecord(id);
    assertAction(auth, "WITHDRAW_INVITATION", {
      missionId: invitation.missionId,
      invitationId: invitation.id,
      sequence: invitation.sequence,
    });
    const mission = await this.requireMission(invitation.missionId);
    if (normalizeNimiqAddress(auth.wallet) !== mission.currentHolderWalletNormalized) {
      throw new MissionValidationError("WRONG_CURRENT_HOLDER", "Only the current holder can withdraw an invitation");
    }
    if (this.broadcastGuard(mission.id)) {
      throw new MissionValidationError("BROADCAST_IN_FLIGHT", "Invitation cannot be withdrawn after transaction broadcast");
    }
    return toPublicInvitation(await this.repository.closeInvitation(id, "WITHDRAWN", now));
  }

  async expireDueInvitations(now = Date.now()): Promise<number> {
    return this.repository.expireDueInvitations(now);
  }

  private async requireDestinationClaimToken(token: string): Promise<DestinationClaimRecord> {
    const claim = await this.repository.getDestinationClaimByTokenHash(hashToken(token));
    if (!claim) {
      throw new MissionValidationError("DESTINATION_CLAIM_NOT_FOUND", "Destination claim link is invalid or no longer recognized");
    }
    return claim;
  }

  private async requireMission(id: string): Promise<MissionRecord> {
    const mission = await this.repository.getMission(id);
    if (!mission) throw new MissionValidationError("MISSION_NOT_FOUND", `Mission ${id} does not exist`);
    return mission;
  }

  private async requireInvitationToken(token: string): Promise<InvitationRecord> {
    const invitation = await this.repository.getInvitationByTokenHash(hashToken(token));
    if (!invitation) throw new MissionValidationError("INVITATION_NOT_FOUND", "Invite link is invalid or no longer recognized");
    return invitation;
  }
}
