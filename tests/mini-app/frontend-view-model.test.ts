import { describe, expect, it } from "vitest";
import { CANONICAL_SCREEN_IDS, assertParticipantSafeMission, deriveMissionHomeModel, normalizeRouteEntries, safeRouteEntries, screenForPath, type UiMissionView } from "../../src/mini-app/view-model.js";

function mission(overrides: Partial<UiMissionView> = {}): UiMissionView {
  return {
    mission_id: "mission-1",
    status: "ACTIVE",
    activity: "ACTIVE",
    target_label: "Nimiq builder",
    mission_note: "Route this idea through people who can move it closer.",
    sequence: 0,
    finalized_hop_count: 0,
    current_holder: { display_label: "Faadil", wallet_fingerprint: "NQ…1234", is_viewer: true },
    invitation: null,
    route: [],
    viewer_role: "HOLDER",
    primary_action: "CREATE_INVITATION",
    ...overrides,
  };
}

describe("five-screen Mini App view contract", () => {
  it("models Destination Claim as a first-class canonical screen", () => {
    expect(CANONICAL_SCREEN_IDS).toEqual([
      "MISSION_HOME",
      "CREATE_MISSION",
      "DESTINATION_CLAIM",
      "BRIDGE_INVITATION",
      "PASS_1_NIM",
      "ROUTE_ARRIVAL",
    ]);
    expect(screenForPath("/c/private-claim-token")).toBe("DESTINATION_CLAIM");
  });
  it("maps route paths deterministically to the five screens", () => {
    expect(screenForPath("/")).toBe("MISSION_HOME");
    expect(screenForPath("/mission/abc")).toBe("MISSION_HOME");
    expect(screenForPath("/create")).toBe("CREATE_MISSION");
    expect(screenForPath("/i/abcdefghijklmnopqrstuvwxyzABCDEFGH")).toBe("BRIDGE_INVITATION");
    expect(screenForPath("/mission/abc/pass")).toBe("PASS_1_NIM");
    expect(screenForPath("/mission/abc/route")).toBe("ROUTE_ARRIVAL");
  });
  it("renders STALLED as display-only, never as a custody mutation", () => {
    const m = mission({ activity: "STALLED", sequence: 3, finalized_hop_count: 3, current_holder: { display_label: null, wallet_fingerprint: "NQ…HOLD" } });
    const model = deriveMissionHomeModel(m);
    expect(model.statusLabel).toContain("STALLED");
    expect(m.sequence).toBe(3);
    expect(m.current_holder.wallet_fingerprint).toBe("NQ…HOLD");
  });
  it("turns ARRIVED into a route-view terminal CTA, not another pass", () => {
    const model = deriveMissionHomeModel(mission({ status: "ARRIVED", finalized_hop_count: 5, primary_action: "VIEW_ROUTE" }));
    expect(model.headline).toBe("It made it.");
    expect(model.primaryAction).toBe("VIEW_ROUTE");
    expect(model.primaryLabel).toBe("View completed route");
  });
  it("fails closed if a participant-safe mission DTO leaks target-wallet markers", () => {
    expect(() => assertParticipantSafeMission(mission())).not.toThrow();
    expect(() => assertParticipantSafeMission({ ...mission(), target_wallet: "NQ SECRET" })).toThrow(/forbidden field marker/);
  });
  it("orders display route entries only by canonical sequence", () => {
    const route = safeRouteEntries([
      { sequence: 2, from: { display_label: null, wallet_fingerprint: "B" }, to: { display_label: null, wallet_fingerprint: "C" }, finalized_at: "2026-09-05T00:02:00Z", tx_hash_short: "tx2" },
      { sequence: 1, from: { display_label: null, wallet_fingerprint: "A" }, to: { display_label: null, wallet_fingerprint: "B" }, finalized_at: "2026-09-05T00:01:00Z", tx_hash_short: "tx1" },
    ]);
    expect(route.map((entry) => entry.sequence)).toEqual([1, 2]);
  });
  it("normalizes the active backend route, preserves authorized marks, and excludes non-final hops", () => {
    const route = normalizeRouteEntries([
      { sequence: 2, current_holder: { display_label: "Bridge B", wallet_fingerprint: "B" }, recipient: { display_label: "Target", wallet_fingerprint: "C" }, status: "PENDING", tx_hash: "b".repeat(64), confirmed_at: null },
      { sequence: 1, current_holder: { display_label: null, wallet_fingerprint: "A" }, recipient: { display_label: "Bridge B", wallet_fingerprint: "B" }, status: "CONFIRMED", tx_hash: "a".repeat(64), confirmed_at: "2026-09-07T12:00:00Z" },
    ]);
    expect(route).toHaveLength(1);
    expect(route[0]).toMatchObject({
      sequence: 1,
      from: { display_label: null, wallet_fingerprint: "A" },
      to: { display_label: "Bridge B", wallet_fingerprint: "B" },
    });
  });
});
