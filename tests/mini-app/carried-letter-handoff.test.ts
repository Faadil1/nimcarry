import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("web/app.js", "utf8");
const v2 = readFileSync("web/carried-letter-v2.js", "utf8");
const css = readFileSync("web/carried-letter-v2.css", "utf8");

describe("NimCarry V2 warm-wax handoff ceremony", () => {
  it("exposes UI-only handoff phases without changing the transaction contract", () => {
    expect(app).toContain('new CustomEvent("nimcarry:handoff-phase"');
    expect(app).toContain('handoffEvent("authorization-requested"');
    expect(app).toContain('handoffEvent("authorized"');
    expect(app).toContain('handoffEvent("wallet-approval-opened"');
    expect(app).toContain('handoffEvent(txHash ? "provider-reference-returned" : "broadcast-unproven"');
    expect(app).toContain('handoffEvent("broadcast-claim-recorded"');
    expect(app).toContain('handoffEvent("verification-pending"');
    expect(app).toContain('handoffEvent("verification-status"');
    expect(app).toContain('handoffEvent("final"');
    expect(app).toContain('sendBasicTransactionWithData({ recipient: intent.recipient, value: ONE_NIM, fee: 0, data: intent.recipient_data })');
  });

  it("does not offer a 1 NIM send from an expired or unaccepted pass screen", () => {
    expect(app).toContain('const passReady = inv?.status === "ACCEPTED" && !passWindowExpired');
    expect(app).toContain("This pass can’t be reused.");
    expect(app).toContain("No new payment should be requested from this screen.");
    expect(app).toContain('id="mission-return"');
  });

  it("keeps FINAL as the only successful exit while handing long verification to the background reconciler", () => {
    expect(app).toContain('status === "FINAL" || status === "CONFIRMED" || result?.mission?.status === "ARRIVED"');
    expect(app).toContain("return { pending: true }");
    expect(app).toContain('handoffEvent("verification-continues-in-background"');
    expect(app).toContain("You can safely close this screen; do not send again.");
  });

  it("turns authorization, provider reference, independent verification and finality into distinct human states", () => {
    expect(v2).toContain("Authorized, not carried.");
    expect(v2).toContain("Approved, not yet on the record.");
    expect(v2).toContain("Nimiq Pay returned a transaction reference. NimCarry is checking the independent record.");
    expect(v2).toContain("A recorded reference is not delivery. The bridge never receives the 1 NIM.");
    expect(v2).toContain("The wax is still warm.");
    expect(v2).toContain("The postmark landed. The destination received the verified 1 NIM delivery.");
    expect(v2).toContain("The bridge never takes custody. Only FINAL proves direct delivery to the destination.");
    expect(v2).not.toContain("The handover reached the record. NimCarry is now waiting for independent finality.");
  });

  it("makes unproven or delayed states explicit without turning the bridge into a holder", () => {
    expect(v2).toContain("The bridge never receives the 1 NIM.");
    expect(v2).toContain("Delivery still unproven.");
    expect(v2).toContain("The bridge never received the 1 NIM and no arrival is claimed.");
    expect(v2).toContain("NimCarry will not guess.");
  });

  it("keeps demo deterministic, slow enough to read, and visibly off-chain", () => {
    expect(app).toContain("setTimeout(r, 2500)");
    expect(app).toContain('handoffEvent("verification-pending", { demo: true');
    expect(app).toContain('handoffEvent("final", { demo: true');
    expect(v2).toContain("Practice wax sets on a timer. No real chain write is happening.");
    expect(v2).toContain("PRACTICE · NOT ON RECORD");
  });

  it("keeps the V2 renderer presentation-only", () => {
    expect(v2).not.toContain("fetch(");
    expect(v2).not.toContain("sendBasicTransactionWithData");
    expect(v2).not.toContain("nimiq.sign");
    expect(v2).not.toContain("localStorage.setItem");
    expect(v2).not.toContain("sessionStorage.setItem");
  });

  it("provides reduced-motion parity for wax and postmark", () => {
    expect(css).toContain("@keyframes clv2-wax-gloss");
    expect(css).toContain("@keyframes clv2-postmark-strike");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain("animation:none!important");
  });
});