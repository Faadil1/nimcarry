import type { Hop, PassIntent } from "../core/types.js";
import type { CanonicalRelayService, PublicHop } from "../service/canonical-relay-service.js";
import { isIntentStale } from "../core/relay.js";
import type { MissionRepository } from "./repository.js";
import { ReachMissionService, toPublicMission } from "./service.js";
import { normalizeNimiqAddress, TargetWalletProtector } from "./target-wallet-crypto.js";
import { MissionValidationError, type PublicMission, type VerifiedWalletAction } from "./types.js";

export class ReachMissionCoordinator {
  constructor(
    private readonly missions: ReachMissionService,
    private readonly repository: MissionRepository,
    private readonly relay: CanonicalRelayService,
    private readonly protector: TargetWalletProtector
  ) {
    missions.setBroadcastGuard((missionId) => relay.hasRecordedBroadcast(missionId));
    missions.setRouteWalletGuard((missionId, wallet) => this.walletAlreadyInFinalRoute(missionId, wallet));
  }

  activePassRecipient(missionId: string): string | undefined {
    return this.relay.getActiveIntent(missionId)?.recipient;
  }

  private walletAlreadyInFinalRoute(missionId: string, wallet: string): boolean {
    const normalized = normalizeNimiqAddress(wallet);
    return this.relay.getHistory(missionId).some((hop) =>
      hop.status === "CONFIRMED" &&
      (normalizeNimiqAddress(hop.current_holder) === normalized || normalizeNimiqAddress(hop.recipient) === normalized)
    );
  }

  async authorizeDelivery(input: {
    missionId: string;
    auth: VerifiedWalletAction;
    authorizedPaymentWallets?: string[];
    now?: number;
  }): Promise<PassIntent> {
    const mission = await this.missions.getMissionRecord(input.missionId);
    const now = input.now ?? Date.now();
    if (input.auth.action !== "AUTHORIZE_DELIVERY") {
      throw new MissionValidationError("WRONG_AUTH_ACTION", "AUTHORIZE_DELIVERY wallet authorization is required");
    }
    if (input.auth.missionId !== mission.id) {
      throw new MissionValidationError("AUTH_BINDING_MISMATCH", "Delivery authorization is bound to different mission state");
    }
    if (mission.status !== "ACTIVE") throw new MissionValidationError("MISSION_NOT_ACTIVE", `Mission is ${mission.status}`);
    const signer = normalizeNimiqAddress(input.auth.wallet);
    if (signer !== mission.currentHolderWalletNormalized || signer !== mission.creatorWalletNormalized) {
      throw new MissionValidationError("WRONG_CURRENT_HOLDER", "Only the mission creator/current holder can authorize direct delivery");
    }
    if (!mission.targetWalletCiphertext || !mission.targetWalletHmac || !mission.targetConsentConfirmed) {
      throw new MissionValidationError("DESTINATION_UNRESOLVED", "Destination must bind a wallet before delivery can be authorized");
    }
    const invitation = await this.repository.getOpenInvitation(mission.id);
    if (invitation) {
      throw new MissionValidationError("INTRODUCTION_IN_PROGRESS", "Finish or close the active introduction before direct delivery");
    }
    if (!mission.targetWalletCiphertext || !mission.targetWalletHmac || !mission.targetConsentConfirmed) {
      throw new MissionValidationError("DESTINATION_UNRESOLVED", "Destination must bind a wallet before delivery can be authorized");
    }
    const targetWallet = normalizeNimiqAddress(this.protector.decrypt(mission.targetWalletCiphertext));
    const existing = this.relay.getActiveIntent(mission.id);
    if (existing) {
      if (
        existing.invitationId === null &&
        existing.currentHolder === signer &&
        existing.recipient === targetWallet &&
        existing.recipientData !== null
      ) {
        if (isIntentStale(existing, now)) {
          if (this.relay.hasRecordedBroadcast(mission.id)) {
            throw new MissionValidationError("STALE_BROADCASTED_INTENT", "A stale delivery intent has broadcast evidence and cannot be replaced");
          }
          this.relay.cancelPass(mission.id);
        } else {
          await this.relay.flushDurability();
          return existing;
        }
      } else {
        throw new MissionValidationError("RELAY_INTENT_CONFLICT", "A different relay intent is already active for this mission");
      }
    }
    const intent = this.relay.initiatePass(mission.id, signer, targetWallet, {
      requireOpaqueTag: true,
      authorizedPaymentWallets: input.authorizedPaymentWallets,
      invitationId: null,
    });
    if (!intent.recipientData) {
      throw new MissionValidationError("MISSING_HOP_COMMITMENT", "Direct delivery authorization must include an opaque on-chain commitment");
    }
    await this.relay.flushDurability();
    return intent;
  }

  async authorizePass(input: {
    missionId: string;
    invitationId: string;
    auth: VerifiedWalletAction;
    authorizedPaymentWallets?: string[];
    now?: number;
  }): Promise<PassIntent> {
    const mission = await this.missions.getMissionRecord(input.missionId);
    const invitation = await this.missions.getInvitationRecord(input.invitationId);
    const now = input.now ?? Date.now();

    if (input.auth.action !== "AUTHORIZE_PASS") {
      throw new MissionValidationError("WRONG_AUTH_ACTION", "AUTHORIZE_PASS wallet authorization is required");
    }
    if (
      input.auth.missionId !== mission.id ||
      input.auth.invitationId !== invitation.id ||
      input.auth.sequence !== invitation.sequence
    ) {
      throw new MissionValidationError("AUTH_BINDING_MISMATCH", "Pass authorization is bound to different mission state");
    }
    if (mission.status !== "ACTIVE") throw new MissionValidationError("MISSION_NOT_ACTIVE", `Mission is ${mission.status}`);
    const signer = normalizeNimiqAddress(input.auth.wallet);
    if (signer !== mission.currentHolderWalletNormalized) {
      throw new MissionValidationError("WRONG_CURRENT_HOLDER", "Only the canonical holder can authorize this pass");
    }
    if (invitation.missionId !== mission.id || invitation.sequence !== mission.currentSequence + 1) {
      throw new MissionValidationError("INVITATION_SEQUENCE_MISMATCH", "Invitation is not the mission's next canonical hop");
    }
    if (
      invitation.acceptedAt !== null &&
      invitation.passDeadlineAt !== null &&
      now >= invitation.passDeadlineAt
    ) {
      throw new MissionValidationError("PASS_DEADLINE_EXPIRED", "Accepted bridge pass deadline has expired");
    }
    if (invitation.status !== "ACCEPTED" || !invitation.candidateWalletNormalized) {
      throw new MissionValidationError("INVITATION_NOT_ACCEPTED", "Next bridge must accept before a pass can be authorized");
    }
    if (invitation.passDeadlineAt === null) {
      throw new MissionValidationError("PASS_DEADLINE_EXPIRED", "Accepted bridge pass deadline has expired");
    }
    if (this.walletAlreadyInFinalRoute(mission.id, invitation.candidateWalletNormalized)) {
      throw new MissionValidationError("ROUTE_WALLET_REUSE", "A finalized route participant cannot re-enter the same mission");
    }

    // The bridge is a social/consent intermediary, not a second custody
    // destination. Once Grace (or any bridge) accepts, the creator's single
    // 1 NIM pass is addressed directly to the mission target. This keeps the
    // human route Creator → Bridge → Target while avoiding a second bridge-side
    // payment/selection step.
    const targetWallet = normalizeNimiqAddress(this.protector.decrypt(mission.targetWalletCiphertext));

    const existing = this.relay.getActiveIntent(mission.id);
    if (existing) {
      if (
        existing.sequence === invitation.sequence &&
        existing.currentHolder === signer &&
        existing.recipient === targetWallet &&
        existing.recipientData !== null
      ) {
        if (isIntentStale(existing, now)) {
          if (this.relay.hasRecordedBroadcast(mission.id)) {
            throw new MissionValidationError("STALE_BROADCASTED_INTENT", "A stale pass intent has broadcast evidence and cannot be replaced");
          }
          this.relay.cancelPass(mission.id);
          const renewed = this.relay.initiatePass(mission.id, signer, targetWallet, {
            requireOpaqueTag: true,
            authorizedPaymentWallets: input.authorizedPaymentWallets,
            invitationId: invitation.id,
          });
          if (!renewed.recipientData) {
            throw new MissionValidationError("MISSING_HOP_COMMITMENT", "Reach Mission pass authorization must include an opaque on-chain commitment");
          }
          await this.relay.flushDurability();
          return renewed;
        }
        await this.relay.flushDurability();
        return existing;
      }
      throw new MissionValidationError("RELAY_INTENT_CONFLICT", "A different relay intent is already active for this mission");
    }

    const intent = this.relay.initiatePass(mission.id, signer, targetWallet, {
      requireOpaqueTag: true,
      authorizedPaymentWallets: input.authorizedPaymentWallets,
      invitationId: invitation.id,
    });
    if (!intent.recipientData) {
      throw new MissionValidationError("MISSING_HOP_COMMITMENT", "Reach Mission pass authorization must include an opaque on-chain commitment");
    }
    await this.relay.flushDurability();
    return intent;
  }

  async recordDeliveryBroadcast(input: { missionId: string; txHash: string }): Promise<Hop> {
    const active = this.relay.getActiveIntent(input.missionId);
    if (!active) throw new MissionValidationError("NO_ACTIVE_PASS", "No authorized delivery exists for this mission");
    if (active.invitationId !== null) throw new MissionValidationError("DELIVERY_INTENT_KIND_MISMATCH", "This delivery requires its accepted bridge provenance");
    if (!active.recipientData) throw new MissionValidationError("MISSING_HOP_COMMITMENT", "Authorized delivery has no opaque commitment");
    try {
      return this.relay.recordBroadcast(input.missionId, input.txHash);
    } finally {
      await this.relay.flushDurability();
    }
  }

  async recordBroadcast(input: { missionId: string; invitationId: string; txHash: string }): Promise<Hop> {
    const invitation = await this.missions.getInvitationRecord(input.invitationId);
    const active = this.relay.getActiveIntent(input.missionId);
    if (!active) throw new MissionValidationError("NO_ACTIVE_PASS", "No authorized pass exists for this mission");
    if (!active.recipientData) throw new MissionValidationError("MISSING_HOP_COMMITMENT", "Authorized Reach Mission pass has no opaque commitment");
    if (invitation.missionId !== input.missionId || invitation.sequence !== active.sequence || invitation.status !== "ACCEPTED") {
      throw new MissionValidationError("INVITATION_PASS_MISMATCH", "Broadcast does not match the accepted invitation");
    }
    try {
      return this.relay.recordBroadcast(input.missionId, input.txHash);
    } finally {
      await this.relay.flushDurability();
    }
  }

  async reconcile(missionId: string): Promise<{ mission: PublicMission; hop: Hop | PublicHop | null }> {
    let observed: Hop | null = null;
    try {
      observed = await this.relay.reconcile(missionId);
    } finally {
      // Persist PENDING/INCLUDED/FINAL/INVALID relay state before any response
      // or mission projection can be acknowledged to the caller.
      await this.relay.flushDurability();
    }
    const applied = await this.applyNextFinalizedHop(missionId);
    return {
      mission: toPublicMission(await this.missions.getMissionRecord(missionId)),
      hop: observed ?? applied,
    };
  }

  /**
   * Background-safe reconciliation sweep. Each mission is isolated so one
   * temporarily unavailable RPC or one invalid observation cannot prevent other
   * pending missions from advancing. No wallet action or new payment is ever
   * initiated here.
   */
  async reconcilePending(): Promise<{ checked: number; arrived: number; errors: number }> {
    const missionIds = this.relay.getPendingReconciliationBatonIds();
    let arrived = 0;
    let errors = 0;

    for (const missionId of missionIds) {
      try {
        const result = await this.reconcile(missionId);
        if (result.mission.status === "ARRIVED") arrived += 1;
      } catch (error) {
        errors += 1;
        console.error(
          `NimCarry background reconciliation failed for ${missionId}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    return { checked: missionIds.length, arrived, errors };
  }

  private async applyNextFinalizedHop(missionId: string): Promise<PublicHop | null> {
    const mission = await this.missions.getMissionRecord(missionId);
    if (mission.status !== "ACTIVE") return null;
    const nextSequence = mission.currentSequence + 1;
    const finalHop = this.relay
      .getHistory(missionId)
      .find((hop) => hop.sequence === nextSequence && hop.status === "CONFIRMED");
    if (!finalHop) return null;

    if (!finalHop.invitation_id) {
      const recipient = normalizeNimiqAddress(finalHop.recipient);
      if (!mission.targetWalletHmac) {
        throw new MissionValidationError("DESTINATION_UNRESOLVED", "Final direct delivery has no resolved destination binding");
      }
      await this.repository.completeFinalDelivery({
        missionId,
        sequence: nextSequence,
        recipientWallet: recipient,
        recipientHmac: this.protector.hmac(recipient),
        now: finalHop.confirmed_at ? Date.parse(finalHop.confirmed_at) : Date.now(),
      });
      return finalHop;
    }

    const invitation = await this.repository.getOpenInvitation(missionId);
    if (!invitation || invitation.status !== "ACCEPTED" || invitation.sequence !== nextSequence) {
      throw new MissionValidationError(
        "FINAL_HOP_WITHOUT_ACCEPTED_INVITATION",
        "A finalized relay hop cannot be projected without its accepted invitation"
      );
    }
    const recipient = normalizeNimiqAddress(finalHop.recipient);
    await this.repository.completeFinalHop({
      missionId,
      invitationId: invitation.id,
      sequence: nextSequence,
      recipientWallet: recipient,
      recipientHmac: this.protector.hmac(recipient),
      now: finalHop.confirmed_at ? Date.parse(finalHop.confirmed_at) : Date.now(),
    });
    return finalHop;
  }
}
