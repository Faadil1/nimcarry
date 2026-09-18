import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const html = readFileSync("web/index.html", "utf8");
const js = readFileSync("web/app.js", "utf8");
const provider = readFileSync("web/nimiq-provider.js", "utf8");
const sdk = readFileSync("web/vendor/nimiq-mini-app-sdk.js", "utf8");
const compat = readFileSync("web/http-compat.js", "utf8");
const demoUx = readFileSync("web/demo-ux.js", "utf8");
const winning = readFileSync("web/winning-intelligence.js", "utf8");
const finalHuman = readFileSync("web/final-human-craft.js", "utf8");
const finalHumanCss = readFileSync("web/final-human-craft.css", "utf8");
const favicon = readFileSync("web/favicon.svg", "utf8");
const mark = readFileSync("web/nimcarry-mark.svg", "utf8");
const manifest = readFileSync("web/manifest.webmanifest", "utf8");
const css = readFileSync("web/styles.css", "utf8");

describe("static Mini App skeleton", () => {
  it("ships a mobile-first app shell without external UI/script dependencies", () => {
    expect(html).toContain('name="viewport"');
    expect(html).toContain('src="/http-compat.js"');
    expect(html.indexOf('src="/http-compat.js"')).toBeLessThan(html.indexOf('src="/app.js"'));
    expect(html).toContain('src="/demo-ux.js"');
    expect(html.indexOf('src="/app.js"')).toBeLessThan(html.indexOf('src="/demo-ux.js"'));
    expect(html).toContain('src="/winning-intelligence.js"');
    expect(html).toContain('src="/final-human-craft.js"');
    expect(html.indexOf('src="/winning-intelligence.js"')).toBeLessThan(html.indexOf('src="/final-human-craft.js"'));
    expect(html).toContain('href="/styles.css"');
    expect(html).toContain('href="/winning-intelligence.css"');
    expect(html).toContain('href="/final-human-craft.css"');
    expect(html).toContain('href="/favicon.svg"');
    expect(html).not.toContain('src="/living-route.js"');
    expect(html).not.toContain('src="/trace-winner-convergence.js"');
    expect(html).not.toContain('src="/mature-positioning.js"');
    expect(html).not.toContain('src="/approved-craft-fidelity.js"');
    expect(html).not.toMatch(/https:\/\/.*\.(?:js|css)/);
  });
  it("implements the real wallet challenge/sign/send boundary and explicit fee 0", () => {
    expect(js).toContain('nimiq.sign(message)');
    expect(js).toContain('sendBasicTransactionWithData');
    expect(js).toContain('value: ONE_NIM, fee: 0');
    expect(js).toContain('co:v1:');
    expect(js).toContain('intent.expected_sender');
    expect(js).toContain('WRONG_WALLET_SELECTION');
  });
  it("traces pass provider phases without logging wallet or transaction secrets", () => {
    expect(js).toContain('passDiagnostic("account_sync_requested")');
    expect(js).toContain('passDiagnostic("wallet_approval_opened"');
    expect(js).toContain('passDiagnostic("wallet_call_returned"');
    expect(js).toContain('passDiagnostic("pass_failed"');
    expect(js).toContain('const classification = passFailureClass(passPhase, error)');
    expect(js).toContain('passDiagnostic("pass_failed", { phase: passPhase, classification })');
    expect(js).toContain('handoffEvent("error", { classification })');
    expect(js).not.toContain('console.info("[NimCarry pass diagnostic]", error');
  });
  it("ships an isolated read-only provider diagnostic behind provider-check=1", () => {
    expect(js).toContain('query.get("provider-check") === "1"');
    expect(js).toContain("Waiting for window.nimiq.");
    expect(js).toContain("await nimiq.listAccounts()");
    expect(js).toContain("Account fingerprint:");
    expect(js).toContain("runProviderDiagnostic();");
    expect(js).toContain('return;');
    const diagnosticStart = js.indexOf("async function runProviderDiagnostic");
    const diagnosticEnd = js.indexOf("\n  }", diagnosticStart);
    const diagnostic = diagnosticStart >= 0 && diagnosticEnd >= 0 ? js.slice(diagnosticStart, diagnosticEnd) : "";
    expect(diagnostic).not.toContain("fetch(");
    expect(diagnostic).not.toContain("sendBasicTransactionWithData");
    expect(diagnostic).not.toContain("sign(");
  });
  it("runs the read-only network preflight after account listing without any send call", () => {
    expect(js).toContain("await nimiq.listAccounts()");
    expect(js).toContain("await nimiq.isConsensusEstablished()");
    expect(js).toContain("await nimiq.getBlockNumber()");
    expect(js.indexOf("await nimiq.listAccounts()")).toBeLessThan(js.indexOf("await nimiq.isConsensusEstablished()"));
    expect(js.indexOf("await nimiq.isConsensusEstablished()")).toBeLessThan(js.indexOf("await nimiq.getBlockNumber()"));
    const diagnosticStart = js.indexOf("async function runProviderDiagnostic");
    const diagnosticEnd = js.indexOf("\n  }", diagnosticStart);
    const diagnostic = js.slice(diagnosticStart, diagnosticEnd);
    expect(diagnostic).not.toContain("sendBasicTransactionWithData(");
    expect(diagnostic).not.toContain("sign(");
  });
  it("shows only the sanitized planned transaction contract", () => {
    expect(js).toContain("planned recipient present");
    expect(js).toContain("planned data UTF-8 bytes &lt;= 64");
    expect(js).toContain("validityStartHeight available");
    expect(compat).toContain("data_utf8_bytes");
    expect(compat).toContain("opaque_commitment_present");
    expect(compat).not.toContain("sessionStorage.setItem(\"carryone.plannedTransaction\", plannedData");
  });
  it("uses the Mini App SDK initializer as the shared provider boundary", () => {
    expect(html).toContain('<script type="module" src="/http-compat.js"></script>');
    expect(html).toContain('<script type="module" src="/app.js"></script>');
    expect(provider).toContain('import { init } from "/vendor/nimiq-mini-app-sdk.js"');
    expect(provider).toContain("init({ timeout: 6000 })");
    expect(js).toContain('import { getNimiqProvider } from "/nimiq-provider.js"');
    expect(compat).toContain('import { getNimiqProvider } from "/nimiq-provider.js"');
    expect(js).not.toContain("window.nimiq.listAccounts");
    expect(compat).not.toContain("window.nimiq.sign");
    expect(sdk).toContain("function init(options)");
  });
  it("ships creator-session recovery without opening create, invite, pass, or send paths", () => {
    expect(js).toContain('query.get("recover-mission")');
    expect(js).toContain('query.get("recover-wallet")');
    expect(js).toContain('action: "VIEW_ROUTE"');
    expect(js).toContain("/missions/${encodeURIComponent(missionId)}/view");
    expect(js).toContain("sessionStorage.setItem(`carryone.view.${missionId}`, view.view_token)");
    expect(js).toContain("RECOVERY_WRONG_WALLET");
    expect(js).toContain("navigate(`/mission/${encodeURIComponent(missionId)}`)");
    const recoveryStart = js.indexOf("async function recoverCreatorSession");
    const recoveryEnd = js.indexOf("\n  }", recoveryStart);
    const recovery = recoveryStart >= 0 && recoveryEnd >= 0 ? js.slice(recoveryStart, recoveryEnd) : "";
    expect(recovery).not.toContain("CREATE_MISSION");
    expect(recovery).not.toContain("CREATE_INVITATION");
    expect(recovery).not.toContain("AUTHORIZE_PASS");
    expect(recovery).not.toContain("sendBasicTransactionWithData");
  });
  it("stores route-following capabilities in session storage and strips view tokens from the URL", () => {
    expect(js).toContain('sessionStorage.setItem(`carryone.view.${missionId}`, fromUrl)');
    expect(js).toContain('url.searchParams.delete("view")');
    expect(js).toContain('headers.Authorization = `Bearer ${viewToken}`');
    expect(compat).toContain('sessionStorage.setItem(viewStorageKey(missionId), token)');
    expect(compat).toContain('headers.set("Authorization", `Bearer ${token}`)');
  });
  it("adapts nested UI signatures to the active flat Mission HTTP envelope", () => {
    expect(compat).toContain("challenge_id: auth.challenge_id");
    expect(compat).toContain("public_key: auth.public_key");
    expect(compat).toContain("signature: auth.signature");
    expect(compat).not.toContain("challenge_id: auth.wallet");
  });
  it("uses the hardened route-view capability boundary and never restores X-Wallet spoofing", () => {
    expect(compat).toContain('action: "VIEW_ROUTE"');
    expect(compat).toContain('/view`, requestUrl.origin');
    expect(compat).toContain("mintRouteViewAfterAcceptance");
    expect(compat).not.toContain('headers.set("X-Wallet"');
    expect(compat).not.toContain("X-Wallet only");
  });
  it("adapts broadcast claims to the capability-bound endpoint", () => {
    expect(compat).toContain('path = `/missions/${encodeURIComponent(missionId)}/broadcast`');
    expect(compat).toContain("invitation_id: pass.invitationId");
    expect(compat).toContain("broadcast_capability: pass.broadcastCapability");
    expect(compat).toContain("BROADCAST_CAPABILITY_MISSING");
    expect(compat).toContain('hop: { status: "FINAL", sequence: expected }');
  });
  it("adds Idempotency-Key to browser mutations and keeps broadcast retries stable", () => {
    expect(compat).toContain('headers.set("Idempotency-Key", randomToken("browser"))');
    expect(compat).toContain('headers.set("Idempotency-Key", pass.broadcastRetryKey)');
    expect(compat).toContain('broadcastRetryKey: randomToken("broadcast")');
    expect(compat).toContain('if (path === "/auth/challenge") return false');
    expect(compat).toContain('/reconcile$/.test(path)');
  });
  it("normalizes invitation ids so real acceptance uses the canonical invitation binding", () => {
    expect(compat).toContain("invitation_id: invitation.invitation_id || invitation.id");
  });
  it("reissues only the expired current-sequence invitation and creates fresh sequences normally", () => {
    expect(js).toContain('existingInvitation?.status === "EXPIRED"');
    expect(js).toContain('Number(existingInvitation.sequence) === sequence');
    expect(js).toContain('/invitations/${encodeURIComponent(invitationId)}/reissue');
    expect(js).toContain('const path = recoveringExpiredCurrentSequence');
    expect(js).toContain('`/missions/${encodeURIComponent(mission.mission_id)}/invitations`');
    expect(js).toContain('invitationId: recoveringExpiredCurrentSequence ? invitationId : undefined');
    expect(js).not.toContain('sendBasicTransactionWithData({ recipient: candidateWallet');
  });
  it("keeps the UI lifecycle contract aligned with the mission primary action", () => {
    expect(js).toContain('existingInvitation?.status === "EXPIRED"');
    expect(js).toContain('const path = recoveringExpiredCurrentSequence');
  });
  it("keeps demo mode explicit and visually distinct from real mode", () => {
    expect(html).toContain("DEMO MODE — no wallet or network writes");
    expect(js).toContain('query.get("demo") === "1"');
  });
  it("preserves route-view capability when Home opens the pass screen", () => {
    expect(js).toContain('document.querySelector("#pass-button")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(m.mission_id)}/pass`))');
    expect(js).toContain('sessionStorage.getItem(`carryone.view.${missionId}`) || undefined');
    expect(js).toContain('const viewToken = extractViewToken(missionId)');
  });
  it("makes successful demo acceptance visibly return to Mission Home", () => {
    expect(demoUx).toContain('query.get("demo") !== "1"');
    expect(demoUx).toContain('stored?.invitation?.status !== "ACCEPTED"');
    expect(demoUx).toContain('history.pushState({}, "", `/mission/${encodeURIComponent(missionId)}?demo=1`)');
    expect(demoUx).toContain('new PopStateEvent("popstate")');
  });
  it("ships the final human-craft browser, install and social identity", () => {
    expect(favicon).toContain('<svg');
    expect(favicon).toContain('aria-label="NimCarry"');
    expect(mark).toContain("NimCarry");
    expect(mark).toContain("#183f36");
    expect(mark).toContain("#a94f37");
    expect(mark).toContain("#c4933f");
    expect(html).toContain('src="/nimcarry-mark.svg"');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(manifest).toContain('"short_name": "NimCarry"');
    expect(manifest).toContain("People move opportunity forward");
    expect(html).toContain('property="og:title"');
    expect(html).toContain('/social-card.svg');
  });
  it("keeps route progress and finality truthful in the final product language", () => {
    expect(winning).toContain('node("div", "wi-flow")');
    expect(winning).toContain("Only FINAL handoffs count.");
    expect(winning).toContain("A pending transaction never changes the current holder or the verified route.");
    expect(finalHuman).toContain("A finite human route in progress.");
    expect(finalHuman).toContain("Pending activity never rewrites the verified path.");
    expect(finalHuman).not.toContain("sendBasicTransactionWithData");
    expect(finalHumanCss).toContain("hc-route-arrived");
    expect(finalHumanCss).toContain("hc-route-person");
  });
  it("makes ARRIVED a human outcome plus privacy-safe proof rather than a transaction toast", () => {
    expect(winning).toContain("Each displayed handoff was independently finalized before custody moved.");
    expect(winning).toContain("Private destination and full participant wallet data stay hidden from this receipt.");
    expect(finalHuman).toContain("It arrived because people carried it.");
    expect(finalHuman).toContain("craft-arrival.svg");
    expect(finalHumanCss).toContain("hc-arrived-moment");
    expect(finalHumanCss).toContain("wi-receipt");
  });
  it("honors reduced-motion in both base and final identity CSS", () => {
    expect(css).toContain("prefers-reduced-motion:reduce");
    expect(finalHumanCss).toContain("prefers-reduced-motion:reduce");
  });
});
