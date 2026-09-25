import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const html = readFileSync("web/index.html", "utf8");
const js = readFileSync("web/app.js", "utf8");
const provider = readFileSync("web/nimiq-provider.js", "utf8");
const sdk = readFileSync("web/vendor/nimiq-mini-app-sdk.js", "utf8");
const compat = readFileSync("web/http-compat.js", "utf8");
const recoveryUx = readFileSync("web/nimiq-recovery-ux.js", "utf8");
const favicon = readFileSync("web/favicon.svg", "utf8");
const mark = readFileSync("web/nimcarry-mark.svg", "utf8");
const manifest = readFileSync("web/manifest.webmanifest", "utf8");
const css = readFileSync("web/nimcarry.css", "utf8");

describe("static Mini App skeleton", () => {
  it("ships a mobile-first app shell without external UI/script dependencies", () => {
    expect(html).toContain('name="viewport"');
    expect(html).toContain('<body class="nimcarry" data-ground="forest">');
    expect(html).toContain('src="/http-compat.js"');
    expect(html.indexOf('src="/http-compat.js"')).toBeLessThan(html.indexOf('src="/app.js"'));
    // One stylesheet and only the scripts that carry logic.
    expect(html.match(/rel="stylesheet"/g)?.length).toBe(1);
    expect(html).toContain('href="/nimcarry.css"');
    for (const removed of ["demo-ux", "demo-tour", "winning-intelligence", "final-human-craft", "carried-letter-v2", "route-shell-polish", "hero-copy-clarity", "nimcarry-motion", "wallet-onboarding", "styles.css"]) {
      expect(html).not.toContain(removed);
    }
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('href="/fonts/fraunces.woff2"');
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
  it("allows only the frozen verified same-profile wallet set before a 1 NIM payment", () => {
    expect(js).toContain("assertAuthorizedPaymentAccounts");
    expect(js).toContain("authorized_payment_wallets");
    expect(js).toContain("PAYMENT_SOURCE_UNVERIFIED");
    expect(js).toContain("NimCarry stopped before requesting 1 NIM");
    expect(js).toContain('headers["X-NimCarry-User-Token"] = profileToken');
    expect(js).toContain("sameOriginApi(path)");
    const executeStart = js.indexOf("async function executePass");
    const executeEnd = js.indexOf("\n  async function pollFinality", executeStart);
    const executePass = js.slice(executeStart, executeEnd);
    expect(executePass).toContain('signedAuth("AUTHORIZE_PASS"');
    expect(executePass).toContain("walletKey(auth.wallet)");
    expect(executePass).toContain("assertAuthorizedPaymentAccounts(intent)");
    expect(js).toContain("payment_rail_snapshot_requested");
    expect(js).toContain("/pass-intent/payment-rails");
    expect(js).toContain("FROZEN_BEFORE_PAYMENT");
    expect(html).toContain("already verified on the same NimCarry profile");
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
    expect(js).toContain('from "/nimiq-provider.js"');
    expect(js).toContain("getNimiqProvider");
    expect(js).toContain("classifyNimiqAccounts");
expect(js).toContain("You already<br><em>said yes.</em>");
    expect(js).toContain("opening this link again changes nothing");
expect(js).toContain('replace(/\\s+/g, "").toUpperCase()');
    expect(js).toContain("isHtlcNimiqAccountType");
    expect(compat).toContain('import { getNimiqProvider } from "/nimiq-provider.js"');
    expect(provider).toContain('const ACCOUNT_TYPES_URL = "/network/account-types"');
    expect(provider).toContain("export async function classifyNimiqAccounts");
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
  it("persists only non-secret mission locators so a full app close can resume safely", () => {
    expect(js).toContain('const RECENT_MISSIONS_KEY = "nimcarry.recentMissions.v1"');
    expect(js).toContain("function rememberMissionLocator(missionId)");
    expect(js).toContain("localStorage.setItem(RECENT_MISSIONS_KEY, JSON.stringify(next))");
    expect(js).toContain("rememberMissionLocator(mission?.mission_id || missionId)");
    expect(js).toContain("rememberMissionLocator(missionId)");
    expect(js).not.toContain('localStorage.setItem(`carryone.view.${missionId}`');
    expect(recoveryUx).toContain('const RECENT_MISSIONS_KEY = "nimcarry.recentMissions.v1"');
    expect(recoveryUx).toContain("persistentMissionIds");
    expect(recoveryUx).toContain("knownMissionIds");
    expect(recoveryUx).toContain("Resume without creating a new mission");
    expect(recoveryUx).toContain("It never sends NIM a second time.");
    expect(recoveryUx).toContain("/route-access-recovery.html");
  });
  it("adapts nested UI signatures to the active flat Mission HTTP envelope", () => {
    expect(compat).toContain("challenge_id: auth.challenge_id");
    expect(compat).toContain("public_key: auth.public_key");
    expect(compat).toContain("signature: auth.signature");
    expect(compat).not.toContain("challenge_id: auth.wallet");
  });
  it("uses the hardened route-view capability boundary and never restores X-Wallet spoofing", () => {
    expect(compat).toContain("activateBridgeContinuationAfterAcceptance");
    expect(compat).toContain("acceptedInvitation?.view_token");
    expect(compat).not.toContain("mintRouteViewAfterAcceptance");
    expect(compat).not.toContain('headers.set("X-Wallet"');
    expect(compat).not.toContain("X-Wallet only");
  });
  it("adapts broadcast claims to the capability-bound endpoint", () => {
    expect(compat).toContain('path = `/missions/${encodeURIComponent(missionId)}/broadcast`');
    expect(compat).toContain("if (pass.invitationId) body.invitation_id = pass.invitationId");
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
    expect(html).toContain("PRACTICE MODE — nothing is signed or sent");
    expect(js).toContain('els.network.textContent = state.demo ? "PRACTICE"');
    expect(js).toContain('query.get("demo") === "1"');
  });
  it("backgrounds an already-recorded handoff without offering a second payment", () => {
    expect(js).not.toContain("Recheck existing handoff");
    expect(js).not.toContain("async function recheckExistingHandoff");
    expect(js).toContain("Checking the payment — no action needed");
    expect(js).toContain("Confirming on the Nimiq network. No action needed, and please don’t send again.");
    expect(js).toContain('data-target-wallet-bound="${m.target_wallet_bound ? "true" : "false"}"');
    expect(js).toContain('data-destination-claim-status="${esc(m.destination_claim?.status || "")}"');
    expect(js).toContain("finalizing in the background");
    expect(js).toContain("You can safely close this page. Do not resend 1 NIM.");
    expect(js).toContain("/reconcile");
    expect(js).not.toContain("VERIFICATION_STILL_PENDING");
    expect(js).not.toContain("Date.now() + 90000");
  });
  it("keeps the accepted bridge in one continuous session until FINAL", () => {
    expect(js).toContain('mission.viewer_role === "INVITEE" && invitationStatus === "ACCEPTED"');
    expect(js).toContain("Accepted — waiting for the payment");
    expect(js).toContain("received the 1 NIM. Your part is done.");
    expect(js).toContain("Your part is done once it’s confirmed on Nimiq.");
    expect(js).not.toContain("You now carry this letter — choose the next bridge.");
    expect(compat).toContain("activateBridgeContinuationAfterAcceptance");
    expect(compat).toContain("acceptedInvitation?.view_token");
    const helperStart = compat.indexOf("async function activateBridgeContinuationAfterAcceptance");
    const helperEnd = compat.indexOf("\n  window.fetch", helperStart);
    const helper = compat.slice(helperStart, helperEnd);
    expect(helper).not.toContain("nimiq.sign");
    expect(helper).not.toContain("VIEW_ROUTE");
  });

  it("reflects bridge acceptance on the sender mission with read-only polling", () => {
    expect(js).toContain("MISSION_WATCH_INTERVAL_MS = 3000");
    expect(js).toContain("async function refreshWatchedMission");
    expect(js).toContain('const invitationStatus = String(mission.invitation?.status || "").toUpperCase()');
    expect(js).toContain('mission.current_holder?.is_viewer === true && invitationStatus === "INVITED"');
    expect(js).toContain('mission.primary_action === "WAIT"');
    expect(js).toContain("senderWaitingForFinal");
    expect(js).toContain("Your introducer said yes. You can send now.");
    expect(js).toContain("still needs to open your link.");
    expect(js).toContain("It arrived.");
    expect(js).toContain('const recipientWaitingForPayment = mission.viewer_role === "TARGET"');
    expect(js).toContain('addEventListener("focus", () => { void refreshWatchedMission(); })');
    expect(js).toContain('document.addEventListener("visibilitychange"');
    const start = js.indexOf("async function refreshWatchedMission");
    const end = js.indexOf("\n  function startMissionWatch", start);
    const watcher = start >= 0 && end >= 0 ? js.slice(start, end) : "";
    expect(watcher).toContain("await loadMission(missionWatchMissionId)");
    expect(watcher).not.toContain("sendBasicTransactionWithData");
    expect(watcher).not.toContain("AUTHORIZE_PASS");
    expect(watcher).not.toContain('method: "POST"');
  });

  it("lets each lifecycle state choose its own screen, color and action", () => {
    expect(js).toContain("function missionScene(m, { action, activity, to, letter })");
    expect(js).toContain('if (m.status === "ARRIVED") {');
    expect(js).toContain('if (action === "SHARE_CLAIM") {');
    expect(js).toContain('if (action === "SEND_1_NIM" || action === "PASS_1_NIM") {');
    expect(js).toContain('if (m.viewer_role === "TARGET") {');
    expect(js).toContain('if (m.viewer_role === "INVITEE") {');
    expect(js).toContain('ground: "vermilion"');
    expect(js).toContain('ground: "night"');
  });

  it("preserves route-view capability when Home opens the pass screen", () => {
    expect(js).toContain('document.querySelector("#pass-button")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(m.mission_id)}/pass`))');
    expect(js).toContain('sessionStorage.getItem(`carryone.view.${missionId}`) || undefined');
    expect(js).toContain('const viewToken = extractViewToken(missionId)');
  });
  it("makes successful practice acceptance visibly return to the payment", () => {
    const start = js.indexOf("async function acceptInvitation");
    const accept = js.slice(start, js.indexOf("async function declineInvitation", start));
    expect(accept).toContain("if (state.demo) {");
    expect(accept).toContain('navigate(`/mission/${encodeURIComponent(stored.mission.mission_id)}`)');
    expect(accept).toContain('stored.mission.target_wallet_bound ? "PASS_1_NIM" : "SHARE_CLAIM"');
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
    expect(manifest).toContain("Send NIM with a private link");
    expect(html).toContain('property="og:title"');
    expect(html).toContain('/social-card.svg');
  });
  it("keeps the receipt and finality truthful in the product language", () => {
    expect(js).toContain("Only payments confirmed on Nimiq appear here. Full wallet addresses are never shown.");
    expect(js).toContain("Nothing counts until the Nimiq network confirms it.");
    expect(js).toContain("Nothing confirmed yet.");
  });
  it("propagates only server-authorized finalized carrier marks into route and receipt UI", () => {
    expect(compat).toContain("entry.current_holder?.display_label || null");
    expect(compat).toContain("entry.bridge?.display_label || null");
    expect(compat).toContain("entry.recipient?.display_label || null");
    expect(js).toContain('data-carrier-mark="${esc(bridgeMark || "")}"');
    expect(js).toContain('class="${bridgeMark ? "carrier-mark" : ""}"');
    expect(js).toContain("const bridgeMark = entry.via?.display_label || null;");
  });

  it("makes ARRIVED a human outcome plus privacy-safe proof rather than a transaction toast", () => {
    expect(js).toContain("It <em>arrived.</em>");
    expect(js).toContain("received 1 NIM. Confirmed on the Nimiq network.");
    expect(js).toContain("confettiMarkup()");
    expect(js).toContain('state: arrived ? "arrived" : "sealed"');
  });
  it("keeps the finality-state UI responsive across mobile, tablet and desktop layouts", () => {
    expect(css).toContain(".app-shell{position:relative;width:100%;max-width:1280px");
    expect(css).toContain(".button-row{display:flex;flex-wrap:wrap");
    expect(css).toContain("@media (min-width:640px)");
    expect(css).toContain("@media (min-width:980px)");
    expect(css).toContain('grid-template-areas:"copy object" "actions object"');
    expect(css).toContain("@media (prefers-reduced-motion:reduce)");
  });

  it("keeps private claim bearer links session-only and safely reissues lost links", () => {
    expect(js).toContain('const claimStorageKey = (missionId) => `nimcarry.claim.${missionId}`');
    expect(js).toContain("sessionStorage.setItem(claimStorageKey(missionId), mission.destination_claim_url)");
    expect(js).not.toContain("localStorage.setItem(claimStorageKey");
    expect(js).toContain('signedAuth("CREATE_DESTINATION_CLAIM"');
    expect(js).toContain('/destination-claim');
    expect(js).toContain("The previous one no longer works.");
    expect(js).toContain('claim.status !== "PENDING"');
    expect(js).toContain("This link can’t<br><em>be used.</em>");
  });

  it("honors reduced-motion across the whole stylesheet", () => {
    expect(css).toContain("@media (prefers-reduced-motion:reduce)");
    expect(css).toContain("::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}");
  });
});
