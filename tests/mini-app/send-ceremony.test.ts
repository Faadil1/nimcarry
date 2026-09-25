import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("web/app.js", "utf8");
const ui = readFileSync("web/nc-ui.js", "utf8");
const css = readFileSync("web/nimcarry.css", "utf8");

describe("NimCarry send ceremony (wax seal)", () => {
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
    expect(app).toContain('const introducedReady = m?.target_wallet_bound === true && inv?.status === "ACCEPTED" && !passWindowExpired');
    expect(app).toContain("const passReady = directClaimReady || introducedReady");
    expect(app).toContain("This window<br><em>closed.</em>");
    expect(app).toContain("No payment is requested from this screen.");
    expect(app).toContain('id="mission-return"');
    // The not-ready branch renders no send button and no drop zone.
    const notReady = app.slice(app.indexOf("if (!passReady) {"), app.indexOf("const via = directClaimReady"));
    expect(notReady).not.toContain('id="send"');
    expect(notReady).not.toContain("dropMarkup(");
  });

  it("routes the drag gesture through the same #send click the duplicate-send guard intercepts", () => {
    expect(app).toContain("bindDrop(document.querySelector(\"#nc-drop\"), () => sendButton.click())");
    expect(app).not.toMatch(/bindDrop\([^)]*executePass/);
    expect(ui).toContain('knob.addEventListener("pointerdown"');
    expect(ui).toContain('if (event.key === "Enter" || event.key === " ")');
  });

  it("keeps confirmation on the Nimiq network as the only success signal", () => {
    expect(app).toContain('status === "FINAL" || status === "CONFIRMED" || result?.mission?.status === "ARRIVED"');
    expect(app).toContain('handoffEvent("verification-backgrounded"');
    expect(app).toContain("You can safely close this page. Do not resend 1 NIM.");
    // The letter only shows the ARRIVED postmark on the final event or an ARRIVED mission.
    expect(app).toContain('if (letter && phase === "final") letter.dataset.state = "arrived";');
    expect(app).not.toContain("VERIFICATION_STILL_PENDING");
  });

  it("turns each send phase into a distinct plain-language state", () => {
    for (const phase of ["authorization-requested", "wallet-approval-opened", "broadcast-unproven", "verification-pending", "verification-delayed", "verification-backgrounded", "final"]) {
      expect(ui).toContain(`"${phase}"`);
    }
    expect(ui).toContain("don’t send again");
    expect(ui).toContain("Confirmed on the Nimiq network.");
  });

  it("keeps practice deterministic, readable and visibly off-chain", () => {
    expect(app).toContain("setTimeout(r, 1800)");
    expect(app).toContain('handoffEvent("verification-pending", { demo: true');
    expect(app).toContain('handoffEvent("final", { demo: true');
    expect(app).toContain("No real NIM moved.");
  });

  it("keeps the shared UI module presentation-only", () => {
    expect(ui).not.toContain("fetch(");
    expect(ui).not.toContain("sendBasicTransactionWithData");
    expect(ui).not.toContain(".sign(");
    expect(ui).not.toContain("localStorage");
    expect(ui).not.toContain("sessionStorage");
  });

  it("provides reduced-motion parity for the seal, stamps and transitions", () => {
    expect(css).toContain("@keyframes nc-slam");
    expect(css).toContain("@media (prefers-reduced-motion:reduce)");
    expect(css).toContain("animation:none!important");
    expect(app).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
  });
});
