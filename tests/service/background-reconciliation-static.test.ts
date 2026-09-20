import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const index = readFileSync("src/index.ts", "utf8");
const relay = readFileSync("src/service/canonical-relay-service.ts", "utf8");

describe("automatic finality reconciliation maintenance", () => {
  it("keeps unresolved durable intents discoverable after the browser is gone", () => {
    expect(relay).toContain("listReconciliationCandidates()");
    expect(relay).toContain('hop.status === "PENDING" || hop.status === "INCLUDED"');
    expect(index).toContain("relayService.listReconciliationCandidates()");
  });

  it("reconciles candidates server-side on startup and on a non-overlapping timer", () => {
    expect(index).toContain("reconcilePending?: () => Promise<number>");
    expect(index).toContain("await coordinator.reconcile(missionId)");
    expect(index).toContain("CARRY_ONE_RECONCILIATION_INTERVAL_MS ?? 5_000");
    expect(index).toContain("let inFlight = false");
    expect(index).toContain("void run();");
    expect(index).toContain("setInterval(() => void run(), intervalMs)");
  });

  it("treats verification transport failures as retryable rather than a resend signal", () => {
    expect(index).toContain("durable intent remains authoritative");
    expect(index).toContain("will be retried on the");
    expect(index).not.toContain("sendBasicTransactionWithData");
  });
});
