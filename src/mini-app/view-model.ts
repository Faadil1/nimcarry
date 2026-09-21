export const FIVE_SCREEN_IDS = [
  "MISSION_HOME",
  "CREATE_MISSION",
  "BRIDGE_INVITATION",
  "PASS_1_NIM",
  "ROUTE_ARRIVAL",
] as const;

export type MiniAppScreenId = (typeof FIVE_SCREEN_IDS)[number];
export type UiMissionStatus = "ACTIVE" | "ARRIVED" | "CANCELLED";
export type UiMissionActivity = "ACTIVE" | "STALLED" | "TERMINAL";
export type UiInvitationStatus = "INVITED" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "WITHDRAWN" | "COMPLETED";
export type UiPrimaryAction = "SHARE_CLAIM" | "SEND_1_NIM" | "CREATE_INVITATION" | "WAIT" | "PASS_1_NIM" | "REROUTE" | "VIEW_ROUTE" | "START_NEW_ROUTE" | null;

export interface UiWalletRef {
  display_label: string | null;
  wallet_fingerprint: string;
  is_viewer?: boolean;
}

export interface UiInvitationSummary {
  invitation_id: string;
  sequence: number;
  status: UiInvitationStatus;
  candidate_label: string | null;
  candidate_display_label?: string | null;
  candidate_wallet_fingerprint?: string | null;
  accepted_wallet_fingerprint?: string | null;
  why_you?: string | null;
  expires_at: string;
  pass_deadline_at: string | null;
}

/** Participant-safe route shape emitted by the active Mission HTTP branch. */
export interface BackendRouteEntry {
  sequence: number;
  current_holder: { display_label?: string | null; wallet_fingerprint: string; is_viewer?: boolean };
  recipient: { display_label?: string | null; wallet_fingerprint: string; is_viewer?: boolean };
  status: "READY" | "PENDING" | "CONFIRMED" | "CANCELLED" | "INVALID";
  tx_hash: string | null;
  confirmed_at: string | null;
}

/** Small display-only route shape used by the Mini App UI. */
export interface UiRouteEntry {
  sequence: number;
  from: Omit<UiWalletRef, "is_viewer">;
  to: Omit<UiWalletRef, "is_viewer">;
  finalized_at: string;
  tx_hash_short: string;
}

export interface UiMissionView {
  mission_id: string;
  status: UiMissionStatus;
  activity?: UiMissionActivity;
  target_label: string;
  mission_note: string;
  sequence: number;
  finalized_hop_count: number;
  current_holder: UiWalletRef;
  invitation: UiInvitationSummary | null;
  route: BackendRouteEntry[] | UiRouteEntry[];
  viewer_role: "CREATOR" | "HOLDER" | "PARTICIPANT" | "INVITEE" | "TARGET" | "UNLISTED_VIEWER";
  primary_action: UiPrimaryAction;
  arrived_at?: string | null;
}

export interface MissionHomeModel {
  eyebrow: string;
  headline: string;
  body: string;
  primaryAction: UiPrimaryAction;
  primaryLabel: string | null;
  statusLabel: string;
}

export function deriveMissionHomeModel(mission: UiMissionView | null): MissionHomeModel {
  if (!mission) {
    return {
      eyebrow: "Destination-bound human routing",
      headline: "Get this to someone you cannot reach directly.",
      body: "One human bridge at a time. One verified 1 NIM handoff at a time.",
      primaryAction: null,
      primaryLabel: "Create a mission",
      statusLabel: "No mission yet",
    };
  }

  if (mission.status === "ARRIVED") {
    return {
      eyebrow: "Mission reached",
      headline: "It made it.",
      body: `${mission.finalized_hop_count} independently verified ${mission.finalized_hop_count === 1 ? "delivery" : "deliveries"} reached ${mission.target_label}.`,
      primaryAction: mission.primary_action === "START_NEW_ROUTE" ? "START_NEW_ROUTE" : "VIEW_ROUTE",
      primaryLabel: mission.primary_action === "START_NEW_ROUTE" ? "Start your own mission" : "View completed route",
      statusLabel: "ARRIVED",
    };
  }

  if (mission.status === "CANCELLED") {
    return {
      eyebrow: "Mission closed",
      headline: "This route was cancelled before its first handoff.",
      body: "No later holder was reassigned and no finalized path was rewritten.",
      primaryAction: null,
      primaryLabel: null,
      statusLabel: "CANCELLED",
    };
  }

  const activity = mission.activity ?? "ACTIVE";
  const primaryLabel = actionLabel(mission.primary_action);
  return {
    eyebrow: `${mission.finalized_hop_count} verified ${mission.finalized_hop_count === 1 ? "delivery" : "deliveries"}`,
    headline: mission.target_label,
    body: mission.mission_note,
    primaryAction: mission.primary_action,
    primaryLabel,
    statusLabel: activity === "STALLED" ? "STALLED — custody unchanged" : "ACTIVE",
  };
}

export function actionLabel(action: UiPrimaryAction): string | null {
  switch (action) {
    case "SHARE_CLAIM": return "Share private claim";
    case "SEND_1_NIM": return "Send 1 NIM";
    case "CREATE_INVITATION": return "Add an introducer";
    case "WAIT": return "Waiting for response";
    case "PASS_1_NIM": return "Pass 1 NIM";
    case "REROUTE": return "Choose another bridge";
    case "VIEW_ROUTE": return "View route";
    case "START_NEW_ROUTE": return "Start your own mission";
    case null: return null;
  }
}

export function screenForPath(pathname: string): MiniAppScreenId {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/create") return "CREATE_MISSION";
  if (/^\/i\/[A-Za-z0-9_-]+$/.test(path)) return "BRIDGE_INVITATION";
  if (/^\/mission\/[^/]+\/pass$/.test(path)) return "PASS_1_NIM";
  if (/^\/mission\/[^/]+\/route$/.test(path)) return "ROUTE_ARRIVAL";
  return "MISSION_HOME";
}

export function assertParticipantSafeMission(view: unknown): void {
  const serialized = JSON.stringify(view).toLowerCase();
  const forbidden = [
    "target_wallet",
    "targetwallet",
    "target_wallet_ciphertext",
    "targetwallethmac",
    "invite_token_hash",
    "signaturehex",
    "private_key",
    "mnemonic",
  ];
  const leaked = forbidden.find((key) => serialized.includes(key));
  if (leaked) throw new Error(`Unsafe mission DTO contains forbidden field marker: ${leaked}`);
}

function txShort(hash: string | null): string {
  if (!hash) return "verified tx";
  return hash.length > 14 ? `${hash.slice(0, 7)}…${hash.slice(-5)}` : hash;
}

/** Normalizes the active backend route DTO and keeps only CONFIRMED/FINAL-safe entries. */
export function normalizeRouteEntries(entries: BackendRouteEntry[] | UiRouteEntry[]): UiRouteEntry[] {
  return entries
    .flatMap((entry) => {
      if ("current_holder" in entry) {
        if (entry.status !== "CONFIRMED" || entry.confirmed_at === null) return [];
        return [{
          sequence: entry.sequence,
          from: { display_label: entry.current_holder.display_label ?? null, wallet_fingerprint: entry.current_holder.wallet_fingerprint },
          to: { display_label: entry.recipient.display_label ?? null, wallet_fingerprint: entry.recipient.wallet_fingerprint },
          finalized_at: entry.confirmed_at,
          tx_hash_short: txShort(entry.tx_hash),
        } satisfies UiRouteEntry];
      }
      return [{
        sequence: entry.sequence,
        from: { display_label: entry.from.display_label ?? null, wallet_fingerprint: entry.from.wallet_fingerprint },
        to: { display_label: entry.to.display_label ?? null, wallet_fingerprint: entry.to.wallet_fingerprint },
        finalized_at: entry.finalized_at,
        tx_hash_short: entry.tx_hash_short,
      } satisfies UiRouteEntry];
    })
    .sort((a, b) => a.sequence - b.sequence);
}

export const safeRouteEntries = normalizeRouteEntries;
