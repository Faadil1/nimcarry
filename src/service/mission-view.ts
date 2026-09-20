import type { PublicHop, PublicStatus } from "./canonical-relay-service.js";
import { missionActivity } from "../mission/service.js";
import { TargetWalletProtector, normalizeNimiqAddress, walletFingerprint } from "../mission/target-wallet-crypto.js";
import type { InvitationRecord, InvitationStatus, MissionActivity, MissionRecord, MissionStatus } from "../mission/types.js";

export type ViewerRole = "CREATOR" | "HOLDER" | "PARTICIPANT" | "INVITEE" | "TARGET" | "UNLISTED_VIEWER";
export type PrimaryAction = "CREATE_INVITATION" | "WAIT" | "PASS_1_NIM" | "REROUTE" | "VIEW_ROUTE" | "START_NEW_ROUTE";

export interface RouteEntry {
  sequence: number;
  current_holder: { display_label: string | null; wallet_fingerprint: string; is_viewer: boolean };
  bridge: { display_label: string | null; wallet_fingerprint: string | null; is_viewer: boolean } | null;
  recipient: { display_label: string | null; wallet_fingerprint: string; is_viewer: boolean };
  status: PublicStatus;
  tx_hash: string | null;
  confirmed_at: string | null;
}

export interface InvitationSummary {
  invitation_id: string;
  sequence: number;
  candidate_label: string | null;
  candidate_display_label: string | null;
  candidate_wallet_fingerprint: string | null;
  why_you: string | null;
  status: InvitationStatus;
  expires_at: string;
  pass_deadline_at: string | null;
}

export interface MissionView {
  mission_id: string;
  status: MissionStatus;
  activity: MissionActivity;
  target_label: string;
  target_consent_confirmed: boolean;
  mission_note: string;
  sequence: number;
  finalized_hop_count: number;
  current_holder: { display_label: string | null; wallet_fingerprint: string; is_viewer: boolean };
  invitation: InvitationSummary | null;
  route: RouteEntry[];
  route_following_available: boolean;
  stalled_restart_available: boolean;
  viewer_role: ViewerRole;
  primary_action: PrimaryAction | null;
}

function sameWallet(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return false;
  try {
    return normalizeNimiqAddress(left) === normalizeNimiqAddress(right);
  } catch {
    return left === right;
  }
}

function toRouteEntry(
  hop: PublicHop,
  mission: MissionRecord,
  viewer: string | null,
  finalizedBridgeMarks: Readonly<Record<number, { label: string | null; wallet: string | null }>>,
  revealBridgeMarks: boolean
): RouteEntry {
  const finalized = hop.status === "CONFIRMED" && hop.confirmed_at !== null;
  const bridge = finalizedBridgeMarks[hop.sequence] ?? null;
  return {
    sequence: hop.sequence,
    current_holder: {
      display_label: hop.sequence === 1 && revealBridgeMarks ? mission.creatorDisplayLabel : null,
      wallet_fingerprint: walletFingerprint(hop.current_holder),
      is_viewer: sameWallet(viewer, hop.current_holder),
    },
    bridge: bridge
      ? {
          display_label: finalized && revealBridgeMarks ? bridge.label : null,
          wallet_fingerprint: bridge.wallet && revealBridgeMarks ? walletFingerprint(bridge.wallet) : null,
          is_viewer: sameWallet(viewer, bridge.wallet),
        }
      : null,
    recipient: {
      display_label: finalized && revealBridgeMarks ? mission.targetLabel : null,
      // The destination wallet is mission-private. Even after FINAL, bridges
      // and route followers see the human target label, not David's address.
      wallet_fingerprint: sameWallet(viewer, hop.recipient) ? walletFingerprint(hop.recipient) : "private",
      is_viewer: sameWallet(viewer, hop.recipient),
    },
    status: hop.status,
    tx_hash: hop.tx_hash,
    confirmed_at: hop.confirmed_at,
  };
}

function toInvitationSummary(invitation: InvitationRecord, redacted: boolean): InvitationSummary {
  return {
    invitation_id: invitation.id,
    sequence: invitation.sequence,
    candidate_label: redacted ? null : invitation.candidateLabel,
    candidate_display_label: redacted ? null : invitation.candidateDisplayLabel,
    candidate_wallet_fingerprint: redacted
      ? null
      : invitation.candidateWalletNormalized
        ? walletFingerprint(invitation.candidateWalletNormalized)
        : null,
    why_you: redacted ? null : invitation.whyYou,
    status: invitation.status,
    expires_at: new Date(invitation.expiresAt).toISOString(),
    pass_deadline_at: redacted ? null : invitation.passDeadlineAt === null ? null : new Date(invitation.passDeadlineAt).toISOString(),
  };
}

/**
 * Full invitation context (candidate label/wallet fingerprint, `why_you`, pass
 * deadline) is private to the mission's creator, its current holder, and the
 * intended recipient (the invitation's pre-bound candidate wallet). Every other
 * viewer — including unlisted/route-follow viewers, the target, and earlier
 * bridges — sees only the invitation's existence, sequence and status.
 */
function viewerSeesFullInvitation(mission: MissionRecord, invitation: InvitationRecord | null, viewer: string | null): boolean {
  if (viewer === null) return false;
  if (viewer === mission.creatorWalletNormalized) return true;
  if (viewer === mission.currentHolderWalletNormalized) return true;
  if (
    invitation !== null &&
    invitation.candidateWalletNormalized !== null &&
    sameWallet(viewer, invitation.candidateWalletNormalized)
  ) {
    return true;
  }
  return false;
}

function currentHolderLabel(
  mission: MissionRecord,
  viewerRole: ViewerRole
): string | null {
  if (mission.currentHolderWalletNormalized === mission.creatorWalletNormalized) return mission.creatorDisplayLabel;
  if (viewerRole === "UNLISTED_VIEWER") return null;
  if (mission.status === "ARRIVED") return mission.targetLabel;
  return null;
}

function deriveViewerRole(
  mission: MissionRecord,
  invitation: InvitationRecord | null,
  route: PublicHop[],
  finalizedBridgeMarks: Readonly<Record<number, { label: string | null; wallet: string | null }>>,
  protector: TargetWalletProtector,
  viewer: string | null
): ViewerRole {
  if (viewer === null) return "UNLISTED_VIEWER";
  if (viewer === mission.creatorWalletNormalized) return "CREATOR";
  if (protector.matchesHmac(viewer, mission.targetWalletHmac)) return "TARGET";
  if (mission.status === "ACTIVE" && viewer === mission.currentHolderWalletNormalized) return "HOLDER";
  if (
    invitation &&
    invitation.candidateWalletNormalized !== null &&
    sameWallet(viewer, invitation.candidateWalletNormalized)
  ) {
    if (invitation.status === "INVITED" || invitation.status === "ACCEPTED") return "INVITEE";
    if (invitation.status === "COMPLETED") return "PARTICIPANT";
  }
  if (
    route.some((hop) => sameWallet(viewer, hop.current_holder) || sameWallet(viewer, hop.recipient)) ||
    Object.values(finalizedBridgeMarks).some((bridge) => sameWallet(viewer, bridge.wallet))
  ) {
    return "PARTICIPANT";
  }
  return "UNLISTED_VIEWER";
}

function derivePrimaryAction(
  status: MissionStatus,
  activity: MissionActivity,
  viewerRole: ViewerRole,
  invitation: InvitationSummary | null,
  currentSequence: number,
  viewerIsCurrentHolder: boolean,
  hasActiveIntent: boolean,
  activeIntentStale: boolean,
  activeIntentHasBroadcast: boolean
): PrimaryAction | null {
  if (status === "CANCELLED") return null;
  if (status === "ARRIVED") {
    return ["CREATOR", "HOLDER", "PARTICIPANT", "TARGET"].includes(viewerRole) ? "START_NEW_ROUTE" : "VIEW_ROUTE";
  }
  if (activity === "STALLED") {
    return ["CREATOR", "HOLDER", "PARTICIPANT"].includes(viewerRole) ? "REROUTE" : "VIEW_ROUTE";
  }
  if (viewerIsCurrentHolder) {
    if (!invitation) return "CREATE_INVITATION";
    if (invitation.status === "EXPIRED" && invitation.sequence === currentSequence + 1) return "CREATE_INVITATION";
    if (invitation.status === "ACCEPTED" && (!hasActiveIntent || (activeIntentStale && !activeIntentHasBroadcast))) return "PASS_1_NIM";
    return "WAIT";
  }
  if (viewerRole === "INVITEE") {
    return invitation?.status === "ACCEPTED" ? "WAIT" : null;
  }
  return viewerRole === "UNLISTED_VIEWER" ? null : "VIEW_ROUTE";
}

export function composeMissionView(input: {
  mission: MissionRecord;
  invitation: InvitationRecord | null;
  route: PublicHop[];
  protector: TargetWalletProtector;
  viewer: string | null;
  hasActiveIntent: boolean;
  activeIntentStale?: boolean;
  activeIntentHasBroadcast?: boolean;
  finalizedBridgeMarks?: Readonly<Record<number, { label: string | null; wallet: string | null }>>;
  now?: number;
}): MissionView {
  const now = input.now ?? Date.now();
  const activity = missionActivity(input.mission, now);
  const finalizedBridgeMarks = input.finalizedBridgeMarks ?? {};
  const viewerRole = deriveViewerRole(input.mission, input.invitation, input.route, finalizedBridgeMarks, input.protector, input.viewer);
  const revealBridgeMarks = viewerRole !== "UNLISTED_VIEWER";
  const invitation = input.invitation === null
    ? null
    : toInvitationSummary(input.invitation, !viewerSeesFullInvitation(input.mission, input.invitation, input.viewer));
  const viewerIsCurrentHolder = sameWallet(input.viewer, input.mission.currentHolderWalletNormalized);
  const primaryAction = derivePrimaryAction(
    input.mission.status,
    activity,
    viewerRole,
    invitation,
    input.mission.currentSequence,
    viewerIsCurrentHolder,
    input.hasActiveIntent,
    input.activeIntentStale ?? false,
    input.activeIntentHasBroadcast ?? false
  );

  return {
    mission_id: input.mission.id,
    status: input.mission.status,
    activity,
    target_label: input.mission.targetLabel,
    target_consent_confirmed: input.mission.targetConsentConfirmed,
    mission_note: input.mission.missionNote,
    sequence: input.mission.currentSequence,
    finalized_hop_count: input.mission.finalizedHopCount,
    current_holder: {
      display_label: currentHolderLabel(input.mission, viewerRole),
      wallet_fingerprint:
        input.mission.status === "ARRIVED" && !viewerIsCurrentHolder
          ? "private"
          : walletFingerprint(input.mission.currentHolderWalletNormalized),
      is_viewer: viewerIsCurrentHolder,
    },
    invitation,
    route: input.route.map((hop) => toRouteEntry(hop, input.mission, input.viewer, finalizedBridgeMarks, revealBridgeMarks)),
    route_following_available: input.mission.status !== "CANCELLED",
    stalled_restart_available: activity === "STALLED",
    viewer_role: viewerRole,
    primary_action: primaryAction,
  };
}
