import { describe, expect, it } from "vitest";
import {
  BroadcastCapabilityError,
  MemoryBroadcastCapabilityStore,
  type BroadcastCapabilityBinding,
} from "../../src/service/broadcast-capability.js";

const binding: BroadcastCapabilityBinding = {
  missionId: "00000000-0000-4000-8000-000000000001",
  invitationId: "00000000-0000-4000-8000-000000000002",
  sequence: 1,
  intentNonce: "nonce-1",
  holderWallet: "NQ00 HOLDER",
};

function reasonOf(run: () => void): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BroadcastCapabilityError);
    return (error as BroadcastCapabilityError).reason;
  }
  throw new Error("Expected BroadcastCapabilityError");
}

describe("MemoryBroadcastCapabilityStore", () => {
  it("can validate a correctly bound capability without consuming it", () => {
    const store = new MemoryBroadcastCapabilityStore();
    const issued = store.issue(binding, { now: 1_000, ttlMs: 10_000 });

    expect(() => store.assert(issued.token, binding, 2_000)).not.toThrow();
    expect(() => store.assert(issued.token, binding, 2_001)).not.toThrow();
    expect(() => store.consume(issued.token, binding, 2_002)).not.toThrow();
  });

  it("consumes a correctly bound capability exactly once", () => {
    const store = new MemoryBroadcastCapabilityStore();
    const issued = store.issue(binding, { now: 1_000, ttlMs: 10_000 });

    expect(() => store.consume(issued.token, binding, 2_000)).not.toThrow();
    expect(reasonOf(() => store.consume(issued.token, binding, 2_001))).toBe("BROADCAST_CAPABILITY_REPLAY");
  });

  it("rejects a token bound to different mission state", () => {
    const store = new MemoryBroadcastCapabilityStore();
    const issued = store.issue(binding, { now: 1_000, ttlMs: 10_000 });

    expect(reasonOf(() => store.consume(issued.token, { ...binding, sequence: 2 }, 2_000))).toBe(
      "BROADCAST_CAPABILITY_BINDING_MISMATCH"
    );
  });

  it("rejects expired and unknown capabilities fail-closed", () => {
    const store = new MemoryBroadcastCapabilityStore();
    const issued = store.issue(binding, { now: 1_000, ttlMs: 100 });

    expect(reasonOf(() => store.consume(issued.token, binding, 1_100))).toBe("BROADCAST_CAPABILITY_EXPIRED");
    expect(reasonOf(() => store.consume("x".repeat(43), binding, 1_101))).toBe("BROADCAST_CAPABILITY_NOT_FOUND");
  });
});
