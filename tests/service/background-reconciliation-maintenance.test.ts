import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync("src/index.ts", "utf8");
const coordinatorSource = readFileSync("src/mission/coordinator.ts", "utf8");
const relaySource = readFileSync("src/service/canonical-relay-service.ts", "utf8");

describe("server-owned background reconciliation wiring", () => {
  it("discovers active relay intents without creating a payment path", () => {
    expect(relaySource).toContain("getPendingReconciliationBatonIds");
    expect(relaySource).toContain('hop.status === "PENDING" || hop.status === "INCLUDED"');
    const start = relaySource.indexOf("getPendingReconciliationBatonIds");
    const end = relaySource.indexOf("\n  hasRecordedBroadcast", start);
    const helper = relaySource.slice(start, end);
    expect(helper).not.toContain("recordBroadcast(");
    expect(helper).not.toContain("initiatePass(");
  });

  it("sweeps unresolved intents and stranded FINAL projections through the canonical reconcile path", () => {
    expect(coordinatorSource).toContain("async reconcilePending()");
    expect(coordinatorSource).toContain("this.relay.getPendingReconciliationBatonIds()");
    expect(coordinatorSource).toContain("getFinalizedProjectionBatonIds()");
    expect(coordinatorSource).toContain("getRecoverableInvalidBroadcastBatonIds()");
    expect(coordinatorSource).toContain("MAX_INVALID_BROADCAST_REPAIR_ATTEMPTS");
    expect(coordinatorSource).toContain("invalidBroadcastRepairAttempts");
    expect(coordinatorSource).toContain("projectionSettled");
    expect(coordinatorSource).toContain("await this.reconcile(missionId)");
    const start = coordinatorSource.indexOf("async reconcilePending()");
    const end = coordinatorSource.indexOf("\n  private async applyNextFinalizedHop", start);
    const helper = coordinatorSource.slice(start, end);
    expect(helper).not.toContain("authorizePass");
    expect(helper).not.toContain("recordBroadcast");
    expect(helper).toContain("invalidRepairCandidates");
  });

  it("runs reconciliation independently from invitation expiry maintenance", () => {
    expect(indexSource).toContain("reconcile: () => coordinator.reconcilePending()");
    expect(indexSource).toContain("CARRY_ONE_RECONCILE_INTERVAL_MS");
    expect(indexSource).toContain("15_000");
    expect(indexSource).toContain("const firstRun = setTimeout(run, 1_000)");
    expect(indexSource).toContain("const timer = setInterval(run, intervalMs)");
  });
});
