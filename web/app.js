import { classifyNimiqAccounts, getNimiqProvider, isBasicNimiqAccountType, isHtlcNimiqAccountType, nimiqAddressKey } from "/nimiq-provider.js";
import { arrowSvg, bindDrop, confettiMarkup, dropMarkup, letterMarkup, phaseMarkup, referenceFor, setGround, setPhase } from "/nc-ui.js";

(() => {
  "use strict";

  const ONE_NIM = 100000;
  const els = {
    screen: document.querySelector("#screen"),
    notice: document.querySelector("#notice"),
    demoBanner: document.querySelector("#demo-banner"),
    network: document.querySelector("#network-label"),
    brandHome: document.querySelector("#brand-home"),
    walletDialog: document.querySelector("#wallet-dialog"),
    walletOptions: document.querySelector("#wallet-options"),
    walletForm: document.querySelector("#wallet-form"),
    inviteDialog: document.querySelector("#invite-dialog"),
    inviteForm: document.querySelector("#invite-form"),
  };

  const query = new URLSearchParams(location.search);
  const tour = query.get("demo") === "1" && query.get("tour") === "1";
  if (query.get("demo") === "1" && query.get("reset") === "1") {
    localStorage.removeItem("carryone.demo");
    query.delete("reset");
    history.replaceState({}, "", `${location.pathname}${query.toString() ? `?${query}` : ""}`);
  }
  const state = {
    demo: query.get("demo") === "1",
    apiBase: (query.get("api") || sessionStorage.getItem("carryone.apiBase") || "").replace(/\/$/, ""),
    mission: null,
    invitation: null,
    inviteToken: null,
    selectedWallet: null,
    busy: false,
  };

  const MISSION_WATCH_INTERVAL_MS = 3000;
  let missionWatchTimer = null;
  let missionWatchMissionId = null;
  let missionWatchFingerprint = "";
  let missionWatchInFlight = false;

  // Persist only opaque mission locators across a full mini-app close. Route-view
  // bearer capabilities remain session-scoped and are never written to localStorage.
  const RECENT_MISSIONS_KEY = "nimcarry.recentMissions.v1";
  const RECENT_MISSION_LIMIT = 5;

  function recentMissionIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_MISSIONS_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((value) => String(value || "").trim())
        .filter((value, index, all) => /^[0-9a-f-]{36}$/i.test(value) && all.indexOf(value) === index)
        .slice(0, RECENT_MISSION_LIMIT);
    } catch {
      return [];
    }
  }

  function rememberMissionLocator(missionId) {
    if (state.demo) return;
    const id = String(missionId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    try {
      const next = [id, ...recentMissionIds().filter((existing) => existing !== id)].slice(0, RECENT_MISSION_LIMIT);
      localStorage.setItem(RECENT_MISSIONS_KEY, JSON.stringify(next));
    } catch {
      // Recovery is an enhancement. A storage failure must never block the mission.
    }
  }

  async function runProviderDiagnostic() {
    els.network.textContent = "PROVIDER CHECK";
    els.screen.innerHTML = '<section class="card"><div class="kicker">Read-only provider diagnostic</div><h1>Checking Nimiq Pay…</h1><p id="provider-check-status" role="status" aria-live="polite">Waiting for window.nimiq.</p><div id="provider-check-accounts"></div></section>';
    const status = document.querySelector("#provider-check-status");
    const accounts = document.querySelector("#provider-check-accounts");
    try {
      const nimiq = await provider();
      const listed = await nimiq.listAccounts();
      if (!Array.isArray(listed)) throw new Error("listAccounts() returned a non-array result.");
      status.textContent = "Provider initialized; read-only network preflight running.";
      accounts.innerHTML = listed.length
        ? `<ul>${listed.map((account) => `<li>Account fingerprint: <code>${esc(short(account))}</code></li>`).join("")}</ul>`
        : "<p>No accounts were shared by Nimiq Pay.</p>";
      const safeErrorClass = (error) => {
        const message = String(error?.message || "").toLowerCase();
        if (/consensus|sync/.test(message)) return "CONSENSUS_SYNC_FAILURE";
        if (/block|height/.test(message)) return "BLOCK_HEIGHT_FAILURE";
        if (/timeout/.test(message)) return "PROVIDER_TIMEOUT";
        if (/network|transport|connection/.test(message)) return "PROVIDER_TRANSPORT_FAILURE";
        return "PROVIDER_READ_FAILURE";
      };
      const hasConsensus = typeof nimiq.isConsensusEstablished === "function";
      const hasBlockNumber = typeof nimiq.getBlockNumber === "function";
      let consensus = "unavailable";
      let blockNumber = "unavailable";
      let blockAvailable = false;
      if (hasConsensus) { try { consensus = String(await nimiq.isConsensusEstablished()); } catch (error) { consensus = `error (${safeErrorClass(error)})`; } }
      if (hasBlockNumber) { try { const result = await nimiq.getBlockNumber(); blockAvailable = Number.isFinite(Number(result)); blockNumber = blockAvailable ? String(Number(result)) : "unavailable"; } catch (error) { blockNumber = `error (${safeErrorClass(error)})`; } }
      let planned = {};
      try { planned = JSON.parse(sessionStorage.getItem("carryone.plannedTransaction") || "{}"); } catch { planned = {}; }
      const dataBytes = Number(planned.data_utf8_bytes);
      const dataLengthAvailable = Number.isFinite(dataBytes);
      accounts.insertAdjacentHTML("beforeend", `<ul><li>provider initialized: true</li><li>account count: ${listed.length}</li><li>consensus_established: ${esc(consensus)}</li><li>block_number_available: ${blockAvailable}</li><li>block height: ${esc(blockNumber)}</li><li>method availability: isConsensusEstablished=${hasConsensus}, getBlockNumber=${hasBlockNumber}</li><li>planned recipient present: ${Boolean(planned.recipient_present)}</li><li>planned value_luna: ${esc(planned.value_luna ?? "unavailable")}</li><li>planned fee_luna: ${esc(planned.fee_luna ?? "unavailable")}</li><li>planned data UTF-8 bytes available: ${dataLengthAvailable}</li><li>planned data UTF-8 bytes &lt;= 64: ${dataLengthAvailable && dataBytes <= 64}</li><li>planned opaque commitment: ${Boolean(planned.opaque_commitment_present)}</li><li>validityStartHeight available: ${blockAvailable}</li></ul>`);
    } catch (error) {
      status.textContent = `Provider diagnostic error: ${/sync|consensus/i.test(String(error?.message || "")) ? "CONSENSUS_SYNC_FAILURE" : "PROVIDER_READ_FAILURE"}`;
      status.classList.add("error");
    }
  }

  if (state.apiBase) sessionStorage.setItem("carryone.apiBase", state.apiBase);
  els.demoBanner.hidden = !state.demo;
  els.network.textContent = state.demo ? "PRACTICE" : "NIMIQ PAY / TESTNET";

  const walletKey = (value) => String(value ?? "").replace(/\s+/g, "").toUpperCase();
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const short = (value) => {
    const text = String(value ?? "");
    return text.length > 16 ? `${text.slice(0, 7)}…${text.slice(-5)}` : text || "unknown";
  };
  // Access errors read as plain language; the raw code stays in data-system-message for the
  // recovery classifier. Submission errors stay verbatim: the duplicate-send guard reads them.
  const HUMAN_ACCESS_ERROR = /INVALID_UUID|ROUTE_VIEW_CAPABILITY_(?:INVALID|REQUIRED|EXPIRED)|MISSION_NOT_FOUND/;
  const notice = (message, error = false) => {
    delete els.notice.dataset.systemMessage;
    if (error && HUMAN_ACCESS_ERROR.test(String(message || ""))) {
      els.notice.dataset.systemMessage = message;
      els.notice.textContent = "This link can’t open this payment. Nothing was sent. Reopen it from the original link, or restore access below.";
    } else {
      els.notice.textContent = message;
    }
    els.notice.classList.toggle("error", error);
    els.notice.hidden = !message;
  };
  const setBusy = (value) => { state.busy = value; document.querySelectorAll("button").forEach((button) => { if (button.dataset.busyLock === "1") button.disabled = value; }); };
  const passDiagnostic = (phase, details = {}) => console.info("[NimCarry pass diagnostic]", phase, details);
  const handoffEvent = (phase, details = {}) => {
    dispatchEvent(new CustomEvent("nimcarry:handoff-phase", { detail: { phase, ...details } }));
    setPhase(phase);
    const letter = document.querySelector(".nc-letter");
    if (letter && ["authorization-requested", "wallet-approval-opened", "verification-pending", "broadcast-claim-recorded"].includes(phase)) letter.dataset.state = "sending";
    if (letter && phase === "final") letter.dataset.state = "arrived";
    if (letter && phase === "error") letter.dataset.state = "opened";
  };
  const passFailureClass = (phase, error) => {
    const message = String(error?.message || "").toLowerCase();
    if (phase === "account_sync" || /sync.{0,24}account|account.{0,24}sync/.test(message)) return "account_sync";
    if (phase === "transaction_submission" && /transport|network|timeout|provider|sync/.test(message)) return "provider_transport_or_sync";
    if (phase === "pass_intent" || phase === "transaction_construction" || /recipient|fee|data|transaction/.test(message)) return "transaction_construction_or_contract";
    return phase;
  };
  const preserveModePath = (path) => {
    const url = new URL(path, location.origin);
    if (state.demo) url.searchParams.set("demo", "1");
    if (query.get("tour") === "1") url.searchParams.set("tour", "1");
    return `${url.pathname}${url.search}${url.hash}`;
  };
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Screen changes morph the letter between screens where the browser supports it.
  const navigate = (path) => {
    history.pushState({}, "", preserveModePath(path));
    if (typeof document.startViewTransition === "function" && !reducedMotion()) {
      try { document.startViewTransition(() => route()); return; } catch { /* fall through */ }
    }
    route();
  };
  els.brandHome.addEventListener("click", () => navigate(state.mission?.mission_id ? `/mission/${encodeURIComponent(state.mission.mission_id)}` : "/"));
  addEventListener("popstate", route);

  function apiPath(path) { return `${state.apiBase}${path}`; }
  function sameOriginApi(path) {
    try { return new URL(apiPath(path), location.origin).origin === location.origin; }
    catch { return false; }
  }
  async function api(path, { method = "GET", body, viewToken } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (viewToken) headers.Authorization = `Bearer ${viewToken}`;
    const profileToken = localStorage.getItem("nimcarry.userToken");
    if (sameOriginApi(path) && profileToken && /^[A-Za-z0-9_-]{32,}$/.test(profileToken)) {
      headers["X-NimCarry-User-Token"] = profileToken;
    }
    const response = await fetch(apiPath(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let payload = null;
    if (text) { try { payload = JSON.parse(text); } catch { payload = { error: "INVALID_JSON_RESPONSE", message: "Backend returned non-JSON content." }; } }
    if (!response.ok) throw new Error(`${payload?.error || `HTTP_${response.status}`}: ${payload?.message || response.statusText}`);
    return payload;
  }

  async function provider() {
    passDiagnostic("provider_init_requested");
    const nimiq = await getNimiqProvider();
    if (!nimiq || typeof nimiq.listAccounts !== "function") throw new Error("Nimiq Pay provider does not expose listAccounts().");
    passDiagnostic("provider_ready", { has_list_accounts: true, has_sign: typeof nimiq.sign === "function", has_send_basic_transaction_with_data: typeof nimiq.sendBasicTransactionWithData === "function" });
    return nimiq;
  }

  async function recoverCreatorSession(missionId, expectedFingerprint) {
    if (!missionId || !expectedFingerprint) throw new Error("RECOVERY_INPUT_REQUIRED: existing mission and A fingerprint are required.");
    const nimiq = await provider();
    const accounts = await nimiq.listAccounts();
    if (!Array.isArray(accounts) || accounts.length === 0) throw new Error("RECOVERY_NO_ACCOUNTS: Nimiq Pay shared no accounts.");
    const normalizedExpected = expectedFingerprint.replace(/\s+/g, "").toUpperCase();
    const wallet = accounts.find((account) => short(account).replace(/\s+/g, "").toUpperCase() === normalizedExpected);
    if (!wallet) throw new Error("RECOVERY_WRONG_WALLET: the selected Nimiq Pay session does not contain creator wallet A.");
    const challenge = await api("/auth/challenge", { method: "POST", body: { wallet, action: "VIEW_ROUTE", mission_id: missionId } });
    const challengeId = challenge?.challenge_id || challenge?.id;
    const message = challenge?.canonical_message || challenge?.message;
    if (!challengeId || !message) throw new Error("VIEW_ROUTE_CHALLENGE_CONTRACT_MISMATCH");
    const signed = await nimiq.sign(message);
    if (!signed?.publicKey || !signed?.signature) throw new Error("VIEW_ROUTE_SIGNATURE_CONTRACT_MISMATCH");
    const view = await api(`/missions/${encodeURIComponent(missionId)}/view`, { method: "POST", body: { challenge_id: challengeId, public_key: signed.publicKey, signature: signed.signature } });
    if (!view?.view_token) throw new Error("VIEW_ROUTE_CAPABILITY_CONTRACT_MISMATCH");
    sessionStorage.setItem(`carryone.view.${missionId}`, view.view_token);
    rememberMissionLocator(missionId);
    navigate(`/mission/${encodeURIComponent(missionId)}`);
  }

  async function chooseWallet() {
    const nimiq = await provider();
    passDiagnostic("account_sync_requested");
    const accounts = await nimiq.listAccounts();
    if (!Array.isArray(accounts) || accounts.length === 0) throw new Error("No Nimiq account was shared by Nimiq Pay.");
    passDiagnostic("account_sync_succeeded", { account_count: accounts.length });
    if (accounts.length === 1) { state.selectedWallet = accounts[0]; return accounts[0]; }
    els.walletOptions.innerHTML = accounts.map((account, index) => `<label class="wallet-option"><input type="radio" name="wallet" value="${esc(account)}" ${index === 0 ? "checked" : ""}/><span>${esc(short(account))}</span></label>`).join("");
    els.walletDialog.showModal();
    const result = await new Promise((resolve) => {
      const handler = () => { els.walletDialog.removeEventListener("close", handler); resolve(els.walletDialog.returnValue); };
      els.walletDialog.addEventListener("close", handler);
    });
    if (result === "cancel") throw new Error("Wallet selection cancelled.");
    const selected = els.walletForm.elements.wallet?.value;
    if (!selected) throw new Error("Choose a Nimiq account to continue.");
    state.selectedWallet = selected;
    return selected;
  }

  async function assertAuthorizedPaymentAccounts(intent) {
    const nimiq = await provider();
    passDiagnostic("payment_source_preflight_requested");
    const accounts = await nimiq.listAccounts();
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error("PAYMENT_SOURCE_UNAVAILABLE: Nimiq Pay shared no account for this 1 NIM pass. No payment was requested.");
    }

    const uniqueAccounts = [];
    const seen = new Set();
    for (const account of accounts) {
      const key = walletKey(account);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      uniqueAccounts.push(account);
    }

    const allowed = Array.isArray(intent?.authorized_payment_wallets) && intent.authorized_payment_wallets.length
      ? intent.authorized_payment_wallets
      : [intent?.expected_sender].filter(Boolean);
    const allowedKeys = new Set(allowed.map(walletKey));
    const expectedKey = walletKey(intent?.expected_sender);
    if (!expectedKey || !allowedKeys.has(expectedKey)) {
      throw new Error("PAYMENT_SOURCE_CONTRACT_MISMATCH: pass intent does not authorize its canonical holder.");
    }

    const classified = await classifyNimiqAccounts(uniqueAccounts);
    const basicAccounts = classified.filter((account) => isBasicNimiqAccountType(account.type));
    const htlcAccounts = classified.filter((account) => isHtlcNimiqAccountType(account.type));
    const unknownAccounts = classified.filter(
      (account) => !isBasicNimiqAccountType(account.type) && !isHtlcNimiqAccountType(account.type)
    );

    if (!basicAccounts.some((account) => walletKey(account.address) === expectedKey)) {
      throw new Error("PAYMENT_SOURCE_HOLDER_MISSING: the canonical holder basic wallet is no longer available in this Nimiq Pay session. No payment was requested.");
    }

    const unauthorizedBasic = basicAccounts.filter((account) => !allowedKeys.has(walletKey(account.address)));
    const unauthorizedHtlc = htlcAccounts.filter(
      (account) => !account.sender || !allowedKeys.has(nimiqAddressKey(account.sender))
    );
    const unsafeAccounts = [...unauthorizedBasic, ...unauthorizedHtlc, ...unknownAccounts];
    if (unsafeAccounts.length > 0) {
      throw new Error(
        `PAYMENT_SOURCE_UNVERIFIED: Nimiq Pay exposes ${unsafeAccounts.map((account) => `${short(account.address)} (${account.type}${account.type === "htlc" ? `, sender=${account.sender ? short(account.sender) : "unresolved"}` : ""})`).join(", ")} that is not a verified basic wallet or a verified wallet's HTLC rail in this pass snapshot. NimCarry stopped before requesting 1 NIM. Link the basic wallet to your profile, then authorize a fresh pass.`
      );
    }

    passDiagnostic("payment_source_preflight_completed", {
      exposed_account_count: classified.length,
      basic_account_count: basicAccounts.length,
      authorized_basic_account_count: basicAccounts.filter((account) => allowedKeys.has(walletKey(account.address))).length,
      verified_htlc_rail_count: htlcAccounts.length,
      multiwallet_verified: basicAccounts.length > 1,
    });
    return nimiq;
  }

  async function signedAuth(action, bindings = {}) {
    const wallet = await chooseWallet();
    const challenge = await api("/auth/challenge", { method: "POST", body: { wallet, action, mission_id: bindings.missionId ?? null, invitation_id: bindings.invitationId ?? null, sequence: bindings.sequence ?? 0 } });
    const challengeId = challenge.challenge_id || challenge.id;
    const message = challenge.canonical_message || challenge.message;
    if (!challengeId || !message) throw new Error("AUTH_CONTRACT_MISMATCH: challenge response is missing id/message.");
    const nimiq = await provider();
    const signed = await nimiq.sign(message);
    return { challenge_id: challengeId, wallet, public_key: signed.publicKey, signature: signed.signature };
  }

  function extractViewToken(missionId) {
    const url = new URL(location.href);
    const fromUrl = url.searchParams.get("view");
    if (fromUrl) {
      sessionStorage.setItem(`carryone.view.${missionId}`, fromUrl);
      url.searchParams.delete("view");
      history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    return sessionStorage.getItem(`carryone.view.${missionId}`) || undefined;
  }

  function missionIdFromPath() {
    const match = location.pathname.match(/^\/mission\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
  function inviteTokenFromPath() {
    const match = location.pathname.match(/^\/i\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }
  function destinationClaimTokenFromPath() {
    const match = location.pathname.match(/^\/c\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }
  const claimStorageKey = (missionId) => `nimcarry.claim.${missionId}`;

  function demoLoad() { try { return JSON.parse(localStorage.getItem("carryone.demo") || "null"); } catch { return null; } }
  function demoSave(value) { localStorage.setItem("carryone.demo", JSON.stringify(value)); }
  function demoMission() { const existing = demoLoad(); return existing?.mission ? existing : null; }

  async function loadMission(missionId) {
    if (state.demo) {
      const demo = demoMission(); state.mission = demo?.mission || null; state.invitation = demo?.invitation || null; return state.mission;
    }
    const viewToken = extractViewToken(missionId);
    const mission = await api(`/missions/${encodeURIComponent(missionId)}`, { viewToken });
    rememberMissionLocator(mission?.mission_id || missionId);
    state.mission = mission; state.invitation = mission?.invitation || null; return mission;
  }

  function missionWatchKey(mission) {
    return JSON.stringify([
      mission?.status || "",
      mission?.activity || "",
      mission?.primary_action || "",
      mission?.finalized_hop_count || 0,
      mission?.current_holder?.wallet_fingerprint || "",
      mission?.invitation?.status || "",
      mission?.invitation?.candidate_display_label || "",
      mission?.invitation?.pass_deadline_at || "",
      mission?.destination_claim?.status || "",
      mission?.target_wallet_bound ? "BOUND" : "UNBOUND",
    ]);
  }

  function stopMissionWatch() {
    if (missionWatchTimer !== null) clearInterval(missionWatchTimer);
    missionWatchTimer = null;
    missionWatchMissionId = null;
    missionWatchFingerprint = "";
    missionWatchInFlight = false;
  }

  function canWatchMission(mission) {
    if (state.demo || !mission?.mission_id) return false;
    const exactMissionPath = `/mission/${encodeURIComponent(mission.mission_id)}`;
    if (location.pathname.replace(/\/+$/, "") !== exactMissionPath) return false;
    if (mission.status !== "ACTIVE") return false;

    const invitationStatus = String(mission.invitation?.status || "").toUpperCase();
    const holderWaitingForAcceptance =
      mission.current_holder?.is_viewer === true && invitationStatus === "INVITED";
    const acceptedBridgeWaitingForFinal =
      mission.viewer_role === "INVITEE" && invitationStatus === "ACCEPTED";
    const senderWaitingForFinal =
      mission.current_holder?.is_viewer === true &&
      mission.primary_action === "WAIT";
    const senderWaitingForClaim =
      mission.current_holder?.is_viewer === true &&
      mission.primary_action === "SHARE_CLAIM";
    // The recipient sees the payment land without refreshing.
    const recipientWaitingForPayment = mission.viewer_role === "TARGET";

    return holderWaitingForAcceptance || acceptedBridgeWaitingForFinal || senderWaitingForFinal || senderWaitingForClaim || recipientWaitingForPayment;
  }

  async function refreshWatchedMission() {
    if (!missionWatchMissionId || missionWatchInFlight || state.busy || document.visibilityState === "hidden") return;
    missionWatchInFlight = true;
    try {
      const previousMission = state.mission;
      const latest = await loadMission(missionWatchMissionId);
      const nextFingerprint = missionWatchKey(latest);
      if (nextFingerprint === missionWatchFingerprint) return;

      const previousFingerprint = missionWatchFingerprint;
      missionWatchFingerprint = nextFingerprint;
      const invitationStatus = String(latest?.invitation?.status || "").toUpperCase();
      const backgroundArrival =
        previousMission?.status === "ACTIVE" &&
        latest?.status === "ARRIVED";
      const bridgeCompletedIntroduction =
        backgroundArrival && previousMission?.viewer_role === "INVITEE";

      if (backgroundArrival) {
        handoffEvent("final", { status: "FINAL", background: true });
        notice(bridgeCompletedIntroduction
          ? `Confirmed on Nimiq. ${latest?.target_label || "The recipient"} received the 1 NIM. Your part is done.`
          : previousMission?.viewer_role === "TARGET"
            ? "It arrived in your wallet. Confirmed on the Nimiq network."
            : `It arrived. ${latest?.target_label || "The recipient"} received 1 NIM, confirmed on Nimiq.`);
      } else if (
        previousMission?.destination_claim?.status !== "CLAIMED" &&
        latest?.destination_claim?.status === "CLAIMED" &&
        latest?.current_holder?.is_viewer === true
      ) {
        notice(`${latest?.target_label || "They"} opened your link and chose a wallet. You can send now.`);
      } else if (invitationStatus === "ACCEPTED" && latest?.current_holder?.is_viewer === true) {
        notice(latest?.target_wallet_bound
          ? "Your introducer said yes. You can send now."
          : `Your introducer said yes. ${latest?.target_label || "The recipient"} still needs to open your link.`);
      } else if (invitationStatus === "DECLINED") {
        notice("They declined the introduction. Nothing was sent.");
      } else if (previousFingerprint) {
        notice("Updated.");
      }
      await renderHome();
    } catch (error) {
      // Live reflection is convenience-only. A failed read must never mutate
      // the mission or replace an otherwise usable screen with an error.
      console.info("[NimCarry mission watch] read refresh unavailable");
    } finally {
      missionWatchInFlight = false;
    }
  }

  function startMissionWatch(mission) {
    stopMissionWatch();
    if (!canWatchMission(mission)) return;
    missionWatchMissionId = mission.mission_id;
    missionWatchFingerprint = missionWatchKey(mission);
    missionWatchTimer = setInterval(refreshWatchedMission, MISSION_WATCH_INTERVAL_MS);
  }

  addEventListener("focus", () => { void refreshWatchedMission(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshWatchedMission();
  });

  function screenMode(path) {
    if (path === "/create") return "create";
    if (/^\/c\/[A-Za-z0-9_-]+$/.test(path)) return "claim";
    if (/^\/i\/[A-Za-z0-9_-]+$/.test(path)) return "invitation";
    if (/^\/mission\/[^/]+\/pass$/.test(path)) return "pass";
    if (/^\/mission\/[^/]+\/route$/.test(path)) return "route";
    if (/^\/mission\/[^/]+$/.test(path)) return "mission";
    return "home";
  }

  function route() {
    notice("");
    const path = location.pathname.replace(/\/+$/, "") || "/";
    els.screen.dataset.screen = screenMode(path);
    if (!/^\/mission\/[^/]+$/.test(path)) stopMissionWatch();
    if (path === "/create") return renderCreate();
    if (/^\/c\/[A-Za-z0-9_-]+$/.test(path)) return renderDestinationClaim();
    if (/^\/i\/[A-Za-z0-9_-]+$/.test(path)) return renderInvitation();
    if (/^\/mission\/[^/]+\/pass$/.test(path)) return renderPass();
    if (/^\/mission\/[^/]+\/route$/.test(path)) return renderRoute();
    return renderHome();
  }

  if (query.get("provider-check") === "1") {
    runProviderDiagnostic();
    return;
  }

  const recoveryMissionId = query.get("recover-mission");
  if (recoveryMissionId) {
    els.screen.innerHTML = '<section class="card"><div class="kicker">Creator session recovery</div><h1>Restoring mission access…</h1><p id="recovery-status" role="status" aria-live="polite">Checking creator wallet A in Nimiq Pay.</p></section>';
    recoverCreatorSession(recoveryMissionId, query.get("recover-wallet"))
      .catch((error) => { const status = document.querySelector("#recovery-status"); status.textContent = `Recovery error: ${error?.message || String(error)}`; status.classList.add("error"); });
    return;
  }

  // ---------- practice guide (demo + tour) ----------
  const GUIDE = {
    1: ["Step 1 of 5", "Write a payment link for someone. No wallet needed in practice."],
    2: ["Step 2 of 5", "Type their name and a note. Watch the letter fill in."],
    3: ["Step 3 of 5", "The link is sealed. Now play the other person: open it as them."],
    4: ["Step 4 of 5", "They chose a wallet. Drag the seal onto them to send 1 NIM."],
    5: ["Done", "It arrived. In the real app, this is confirmed on the Nimiq network."],
  };
  function renderGuide(step, action = "") {
    document.querySelector("#demo-tour-guide")?.remove();
    if (!tour || !GUIDE[step]) return;
    const [label, text] = GUIDE[step];
    const guide = document.createElement("aside");
    guide.id = "demo-tour-guide";
    guide.className = `nc-guide${step === 5 ? " demo-tour-complete" : ""}`;
    guide.dataset.step = String(step);
    guide.innerHTML = `<span class="nc-guide__step">${step === 5 ? "✓" : step}</span><p><b>${esc(label)}</b>${esc(text)}</p>${action}`;
    els.screen.prepend(guide);
    return guide;
  }

  function actionsHtml(parts) { return parts.filter(Boolean).join(""); }
  function bigButton(id, label, extra = "") {
    return `<button id="${id}" class="button primary big" ${extra}>${esc(label)}<span class="nc-arrow">${arrowSvg()}</span></button>`;
  }
  function scene({ ground, cls = "", attrs = "", copy, object = "", actions = "" }) {
    setGround(ground);
    return `<section class="nc-scene hero-card ${cls}" ${attrs}><div class="nc-copy nc-in">${copy}</div><div class="nc-object">${object}</div><div class="nc-actions nc-in">${actions}</div></section>`;
  }
  const firstName = (value, fallback) => String(value || "").trim() || fallback;
  // The sender's display name: the current holder while active, the first hop's holder once arrived.
  const senderOf = (m) => String((m?.status === "ARRIVED" ? m?.route?.[0]?.current_holder?.display_label : m?.current_holder?.display_label) || m?.creator_display_label || "").trim();

  async function renderHome() {
    const missionId = missionIdFromPath();
    if (missionId) { try { await loadMission(missionId); } catch (error) { notice(error.message, true); } }
    else if (state.demo) { state.mission = null; state.invitation = null; }

    if (!state.mission) {
      const marquee = `<div class="nc-marquee" aria-hidden="true"><div class="nc-marquee__track">${Array.from({ length: 2 }, () => "<span>No address needed</span><span>✶</span><span>They choose their wallet</span><span>✶</span><span>You see it arrive</span><span>✶</span><span>A Nimiq Pay mini app</span><span>✶</span>").join("")}</div></div>`;
      els.screen.innerHTML = marquee + scene({
        ground: "forest",
        cls: "nc-home",
        copy: `<h1 class="nc-giant">Send NIM<br>with a <em>link.</em></h1><p class="nc-lede">Write their name and seal it. They open the link and choose their own wallet. You watch it arrive.</p>`,
        object: letterMarkup({ to: "David", from: "you", note: "no address needed!", state: "sealed" }),
        actions: actionsHtml([
          bigButton("create-button", "Write a payment link"),
          state.demo ? "" : `<a class="button ghost" href="/?demo=1&amp;tour=1&amp;reset=1">Try it without a wallet</a>`,
        ]),
      });
      document.querySelector("#create-button").addEventListener("click", () => navigate("/create"));
      renderGuide(1);
      els.screen.focus(); return;
    }

    const m = state.mission;
    const activity = m.status === "ARRIVED" || m.status === "CANCELLED" ? "TERMINAL" : (m.activity || "ACTIVE");
    const action = m.primary_action || derivePrimaryAction(m);
    const to = firstName(m.target_label, "them");
    const reference = referenceFor(m.mission_id);
    const from = senderOf(m);
    const attrs = `data-mission-status="${esc(m.status || "")}" data-mission-activity="${esc(activity || "")}" data-primary-action="${esc(action || "")}" data-finalized-hop-count="${esc(m.finalized_hop_count || 0)}" data-target-wallet-bound="${m.target_wallet_bound ? "true" : "false"}" data-destination-claim-status="${esc(m.destination_claim?.status || "")}" data-invitation-status="${esc(m.invitation?.status || "")}" data-invitation-expires-at="${esc(m.invitation?.expires_at || "")}" data-pass-deadline-at="${esc(m.invitation?.pass_deadline_at || "")}" data-accepted-display-label="${esc(m.invitation?.candidate_display_label || "")}"`;
    const letter = (letterState, extra = {}) => letterMarkup({ to: m.target_label, from, note: m.mission_note, state: letterState, reference, ...extra });
    const view = missionScene(m, { action, activity, to, letter });
    els.screen.innerHTML = scene({ ...view, attrs });
    if (view.after) els.screen.insertAdjacentHTML("beforeend", view.after);
    wireHomeButtons(action, m);
    if (view.guide) renderGuide(view.guide, view.guideAction || "");
    document.querySelector("#demo-open-claim")?.addEventListener("click", () => navigate(`/c/${encodeURIComponent(demoClaimToken(m.mission_id))}`));
    startMissionWatch(m);
    els.screen.focus();
  }

  function missionScene(m, { action, activity, to, letter }) {
    const invitation = m.invitation;
    const candidate = firstName(invitation?.candidate_display_label || invitation?.candidate_label, "your introducer");
    const routeLink = `<button id="route-button" class="button link">View details</button>`;
    const status = (text) => `<p class="nc-status"><span class="nc-dot"></span>${esc(text)}</p>`;

    if (m.status === "ARRIVED") {
      return {
        ground: "arrived",
        cls: "nc-arrived hc-arrived-moment",
        copy: `<h1 class="nc-giant">It <em>arrived.</em></h1><p class="nc-lede"><strong>${esc(to)}</strong> received 1 NIM. Confirmed on the Nimiq network.</p>`,
        object: confettiMarkup() + letter("arrived", { date: m.arrived_at ? new Date(m.arrived_at).toLocaleDateString() : "" }),
        actions: actionsHtml([`<button id="route-button" class="button primary big">See the receipt<span class="nc-arrow">${arrowSvg()}</span></button>`, `<button id="new-button" class="button ghost">Send another</button>`]),
      };
    }
    if (m.status === "CANCELLED") {
      return { ground: "paper", copy: `<p class="nc-kicker">Closed</p><h1 class="nc-giant nc-giant--m">Nothing<br>was sent.</h1><p class="nc-lede">This payment link was closed before anything moved.</p>`, object: letter("draft"), actions: `<button id="new-button" class="button primary">Write a new link</button>` };
    }
    if (activity === "STALLED") {
      return { ground: "paper", copy: `<p class="nc-kicker">Waiting</p><h1 class="nc-giant nc-giant--m">It’s gone<br><em>quiet.</em></h1><p class="nc-lede">The introduction hasn’t moved for a while. Nothing was sent. You can ask someone else or send directly.</p>`, object: letter("sealed"), actions: actionsHtml([homeButtons(action, m), routeLink]) };
    }

    // The recipient, after choosing their wallet.
    if (m.viewer_role === "TARGET") {
      const sender = firstName(senderOf(m), "The sender");
      return {
        ground: "ochre",
        copy: `<p class="nc-kicker">Your wallet is chosen</p><h1 class="nc-giant nc-giant--m">You’re<br><em>all set.</em></h1><p class="nc-lede">${esc(sender)} can now send you 1 NIM. It lands in the wallet you chose, and this page updates by itself.</p>`,
        object: letter("opened"),
        actions: actionsHtml([status(`Waiting for ${sender} to send`), routeLink]),
      };
    }

    // An introducer who accepted.
    if (m.viewer_role === "INVITEE") {
      return {
        ground: "indigo",
        copy: `<p class="nc-kicker">Introduction</p><h1 class="nc-giant nc-giant--m">You said<br><em>yes.</em></h1><p class="nc-lede">The sender pays ${esc(to)} directly. You never hold the NIM. Your part is done once it’s confirmed.</p>`,
        object: letter("opened"),
        actions: actionsHtml([homeButtons(action, m), routeLink]),
      };
    }

    if (action === "SHARE_CLAIM") {
      return {
        ground: "vermilion",
        cls: "nc-sealed",
        copy: `<p class="nc-kicker">Link ready</p><h1 class="nc-giant">Sealed.<br>Now send it<br>to <em>${esc(to)}.</em></h1>${status(`Waiting for ${to} to open it`)}`,
        object: letter("sealed"),
        actions: actionsHtml([homeButtons(action, m), routeLink]),
        guide: 3,
        guideAction: state.demo ? `<button id="demo-open-claim" class="button">Open it as ${esc(to)}</button>` : "",
      };
    }
    if (action === "SEND_1_NIM" || action === "PASS_1_NIM") {
      const who = action === "PASS_1_NIM" ? candidate : to;
      return {
        ground: "forest",
        copy: `<p class="nc-kicker">${action === "PASS_1_NIM" ? "Introduction accepted" : "Link opened"}</p><h1 class="nc-giant"><em>${esc(who)}</em><br>${action === "PASS_1_NIM" ? "said yes." : "opened it."}</h1><p class="nc-lede">${action === "PASS_1_NIM" ? `Now send 1 NIM straight to ${esc(to)}’s wallet.` : "They chose their own wallet. Seal it with 1 NIM."}</p>`,
        object: letter("opened"),
        actions: actionsHtml([homeButtons(action, m), routeLink]),
        guide: 4,
      };
    }
    if (action === "WAIT" && invitation?.status === "INVITED") {
      return {
        ground: "indigo",
        copy: `<p class="nc-kicker">Introduction asked</p><h1 class="nc-giant nc-giant--m">Waiting for<br><em>${esc(candidate)}.</em></h1><p class="nc-lede">Nothing moves until they say yes. They never hold the NIM.</p>`,
        object: letter("sealed"),
        actions: actionsHtml([status(`Waiting for ${candidate}`), homeButtons(action, m), routeLink]),
      };
    }
    if (action === "WAIT") {
      return {
        ground: "night",
        copy: `<p class="nc-kicker">Sending</p><h1 class="nc-giant">On its<br><em>way.</em></h1><p class="nc-lede">Confirming on the Nimiq network. No action needed, and please don’t send again.</p>`,
        object: letter("sending"),
        actions: actionsHtml([status("Confirming on Nimiq"), homeButtons(action, m), routeLink]),
      };
    }
    if (action === "CREATE_INVITATION" || action === "REROUTE") {
      const declined = invitation?.status === "DECLINED";
      return {
        ground: "paper",
        copy: `<p class="nc-kicker">${declined ? "They said no" : "Introduction"}</p><h1 class="nc-giant nc-giant--m">${declined ? "Ask someone<br><em>else?</em>" : "Ask for an<br><em>introduction.</em>"}</h1><p class="nc-lede">${declined ? "Nothing was sent. You can ask another person or send directly." : `Someone who knows ${esc(to)} can say yes to introducing you. The NIM still goes straight to ${esc(to)}.`}</p>`,
        object: letter("sealed"),
        actions: actionsHtml([homeButtons(action, m), routeLink]),
      };
    }
    return { ground: "paper", copy: `<h1 class="nc-giant nc-giant--m">${esc(to)}</h1><p class="nc-lede">${esc(m.mission_note || "")}</p>`, object: letter("sealed"), actions: actionsHtml([homeButtons(action, m)]) };
  }

  function derivePrimaryAction(m) {
    if (m.status === "ARRIVED") return "VIEW_ROUTE";
    if (!m.target_wallet_bound) return "SHARE_CLAIM";
    const status = m.invitation?.status;
    if (!status && (!m.destination_claim || m.destination_claim?.status === "CLAIMED")) return "SEND_1_NIM";
    if (!status || ["DECLINED", "EXPIRED", "WITHDRAWN", "COMPLETED"].includes(status)) return "CREATE_INVITATION";
    if (status === "INVITED") return "WAIT";
    if (status === "ACCEPTED") return "PASS_1_NIM";
    return null;
  }
  function homeButtons(action, m) {
    const to = firstName(m.target_label, "them");
    if (m.status === "ARRIVED") return "";
    if (action === "SHARE_CLAIM") {
      const introduction = m.invitation
        ? `<button class="button ghost" disabled>${m.invitation.status === "ACCEPTED" ? "Introducer said yes" : "Introduction asked"}</button>`
        : `<button id="invite-button" class="button ghost">Ask someone to introduce you</button>`;
      return `${bigButton("claim-share-button", `Send ${to} the link`)}${introduction}`;
    }
    if (action === "SEND_1_NIM") return `${bigButton("pass-button", `Send 1 NIM to ${to}`)}<button id="invite-button" class="button link">Ask for an introduction instead</button>`;
    if (action === "CREATE_INVITATION" || action === "REROUTE") return `${bigButton("invite-button", action === "REROUTE" ? "Ask someone else" : "Ask someone to introduce you")}<button id="pass-button" class="button ghost">Send directly instead</button>`;
    if (action === "WAIT" && m.viewer_role === "INVITEE" && m.invitation?.status === "ACCEPTED") return `<button class="button primary" disabled>Accepted — waiting for the payment</button>`;
    if (action === "WAIT" && m.invitation?.status === "INVITED") return "";
    if (action === "WAIT") return `<button class="button primary" disabled>Checking the payment — no action needed</button>`;
    if (action === "PASS_1_NIM") return bigButton("pass-button", `Send 1 NIM to ${to}`);
    return "";
  }

  function wireHomeButtons(action, m) {
    document.querySelector("#route-button")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(m.mission_id)}/route`));
    document.querySelector("#new-button")?.addEventListener("click", () => navigate("/create"));
    document.querySelector("#pass-button")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(m.mission_id)}/pass`));
    document.querySelector("#invite-button")?.addEventListener("click", () => openInviteDialog(m));
    document.querySelector("#claim-share-button")?.addEventListener("click", () => shareDestinationClaim(m));
  }

  const demoClaimToken = (missionId) => `practice-${String(missionId || "").replace(/[^A-Za-z0-9_-]/g, "")}`;

  async function shareDestinationClaim(mission) {
    if (state.demo) {
      notice(`Practice: in the real app this opens your share sheet so you can send the link to ${mission.target_label || "them"}.`);
      return;
    }
    let claimUrl = sessionStorage.getItem(claimStorageKey(mission.mission_id));
    if (!claimUrl) {
      setBusy(true);
      notice("Creating a fresh link. The previous one will stop working…");
      try {
        const auth = await signedAuth("CREATE_DESTINATION_CLAIM", { missionId: mission.mission_id });
        const refreshed = await api(`/missions/${encodeURIComponent(mission.mission_id)}/destination-claim`, {
          method: "POST",
          body: { auth },
        });
        claimUrl = refreshed?.destination_claim_url || null;
        if (!claimUrl) throw new Error("DESTINATION_CLAIM_CONTRACT_MISMATCH: fresh claim link was not returned.");
        sessionStorage.setItem(claimStorageKey(mission.mission_id), claimUrl);
        state.mission = {
          ...state.mission,
          destination_claim: refreshed.claim || state.mission?.destination_claim || null,
        };
        notice("Fresh link created. The previous one no longer works.");
      } catch (error) {
        notice(error.message, true);
        return;
      } finally {
        setBusy(false);
      }
    }
    const shareData = {
      title: `NimCarry delivery for ${mission.target_label || "you"}`,
      text: `${mission.target_label || "Hi"}, open this private link to receive NIM from me.`,
      url: claimUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        notice("Link shared.");
        return;
      }
      await navigator.clipboard.writeText(claimUrl);
      notice("Link copied. Send it only to the person it’s for.");
    } catch (error) {
      if (/cancel|abort/i.test(String(error?.message || error || ""))) return;
      notice("Could not share automatically. Copy the link and send it only to the person it’s for.", true);
    }
  }

  async function renderCreate() {
    setGround("paper");
    const practice = tour ? { name: "David", note: "your share of dinner!", from: "Faadil" } : { name: "", note: "", from: "" };
    els.screen.innerHTML = `<button class="back-link" id="back">${arrowSvg("left")} Back</button><form id="create-form" class="nc-scene nc-scene--form" novalidate>
<div class="nc-copy nc-in"><p class="nc-kicker">New payment link</p><label class="nc-name-field"><span class="nc-giant nc-giant--m">For</span><input name="target_label" maxlength="60" required autocomplete="off" placeholder="Their name" aria-label="Their name" value="${esc(practice.name)}" /></label><p class="nc-lede">You don’t need their Nimiq address. They choose their own wallet when they open your link.</p></div>
<div class="nc-object">${letterMarkup({ to: practice.name, from: practice.from, note: practice.note, state: "draft" })}</div>
<div class="nc-actions nc-in">
<label class="nc-note-field">Note on the letter<textarea name="mission_note" maxlength="180" required rows="2" placeholder="your share of dinner!">${esc(practice.note)}</textarea></label>
<details class="nc-more"><summary>More options</summary><div>
<label>Your name <span>(shown on the letter)</span><input name="creator_display_label" maxlength="60" placeholder="Faadil" value="${esc(practice.from)}" /></label>
<label>Their Nimiq address <span>(optional)</span><input id="target-wallet-input" name="target_wallet" autocomplete="off" placeholder="NQ… leave blank if you don’t know it" /><small>Leave it blank and they choose their own wallet when they open your link.</small></label>
<label id="target-consent-row" class="checkline" hidden><input name="target_consent_confirmed" type="checkbox" /><span>I confirm this address belongs to this person and they expect it.</span></label>
</div></details>
<button data-busy-lock="1" class="button primary big" type="submit">Seal the link<span class="nc-arrow">${arrowSvg()}</span></button>
<p class="nc-kicker">Nothing is sent yet.</p>
</div></form>`;
    const form = document.querySelector("#create-form");
    const targetWalletInput = document.querySelector("#target-wallet-input");
    const consentRow = document.querySelector("#target-consent-row");
    const consentInput = consentRow?.querySelector('input[name="target_consent_confirmed"]');
    const syncConsent = () => {
      const hasWallet = Boolean(targetWalletInput?.value?.trim());
      if (consentRow) consentRow.hidden = !hasWallet;
      if (consentInput) {
        consentInput.required = hasWallet;
        if (!hasWallet) consentInput.checked = false;
      }
    };
    // The letter fills in as they type.
    const syncLetter = () => {
      const name = form.elements.target_label.value.trim();
      const nameNode = form.querySelector("[data-letter-name]");
      if (nameNode) { nameNode.textContent = name || "Their name"; nameNode.classList.toggle("is-empty", !name); }
      const only = form.querySelector("[data-letter-only]");
      if (only) only.textContent = (name || "them").toUpperCase();
      const noteNode = form.querySelector("[data-letter-note]");
      if (noteNode) noteNode.textContent = form.elements.mission_note.value;
      const from = form.elements.creator_display_label.value.trim();
      const fromLine = form.querySelector("[data-letter-from]");
      const fromName = form.querySelector("[data-letter-from-name]");
      if (fromName) fromName.textContent = from;
      if (fromLine) fromLine.hidden = !from;
    };
    targetWalletInput?.addEventListener("input", syncConsent);
    form.addEventListener("input", syncLetter);
    syncConsent();
    document.querySelector("#back").addEventListener("click", () => history.back());
    form.addEventListener("submit", createMission);
    renderGuide(2);
    if (!tour) form.elements.target_label.focus({ preventScroll: true });
    els.screen.focus();
  }

  async function createMission(event) {
    event.preventDefault(); if (state.busy) return;
    const formElement = event.currentTarget;
    if (!formElement.reportValidity()) return;
    setBusy(true); notice("Sealing your payment link…");
    const form = new FormData(formElement); const input = Object.fromEntries(form.entries());
    try {
      if (state.demo) {
        const knownWallet = Boolean(String(input.target_wallet || "").trim());
        const creator = String(input.creator_display_label || "").trim() || "You";
        const mission = { mission_id: `demo-${Date.now()}`, status: "ACTIVE", activity: "ACTIVE", target_label: input.target_label, mission_note: input.mission_note, target_consent_confirmed: knownWallet, target_wallet_bound: knownWallet, destination_claim: knownWallet ? null : { status: "PENDING", expires_at: new Date(Date.now() + 86400000).toISOString(), claimed_at: null }, sequence: 0, finalized_hop_count: 0, creator_display_label: creator, current_holder: { display_label: creator, wallet_fingerprint: "NQ…DEMO", is_viewer: true }, invitation: null, route: [], viewer_role: "HOLDER", primary_action: knownWallet ? "SEND_1_NIM" : "SHARE_CLAIM" };
        demoSave({ mission, invitation: null }); state.mission = mission; notice(""); navigate(`/mission/${mission.mission_id}`); return;
      }
      const auth = await signedAuth("CREATE_MISSION");
      const targetWallet = String(input.target_wallet || "").trim();
      const missionBody = {
        target_label: input.target_label,
        mission_note: input.mission_note,
        creator_display_label: input.creator_display_label || undefined,
        visibility: "UNLISTED",
        auth,
      };
      if (targetWallet) {
        missionBody.target_wallet = targetWallet;
        missionBody.target_consent_confirmed = input.target_consent_confirmed === "on";
      }
      const mission = await api("/missions", { method: "POST", body: missionBody });
      const missionId = mission.mission_id || mission.id;
      if (mission.destination_claim_url) {
        sessionStorage.setItem(claimStorageKey(missionId), mission.destination_claim_url);
      }
      rememberMissionLocator(missionId);
      state.mission = mission;
      navigate(`/mission/${encodeURIComponent(missionId)}`);
      if (mission.destination_claim_url) {
        notice(`Link ready for ${mission.target_label || input.target_label}. Send it only to them.`);
      }
    } catch (error) { notice(error.message, true); } finally { setBusy(false); }
  }

  async function openInviteDialog(mission) {
    els.inviteForm.reset(); els.inviteDialog.showModal();
    const result = await new Promise((resolve) => { const handler = () => { els.inviteDialog.removeEventListener("close", handler); resolve(els.inviteDialog.returnValue); }; els.inviteDialog.addEventListener("close", handler); });
    if (result === "cancel") return;
    const candidateLabel = document.querySelector("#candidate-label").value.trim(); const whyYou = document.querySelector("#why-you").value.trim(); const candidateWallet = document.querySelector("#candidate-wallet").value.trim();
    try {
      const sequence = Number(mission.sequence ?? mission.current_sequence ?? 0) + 1;
      const existingInvitation = mission.invitation || state.invitation;
      const recoveringExpiredCurrentSequence = existingInvitation?.status === "EXPIRED"
        && Boolean(existingInvitation.invitation_id || existingInvitation.id)
        && Number(existingInvitation.sequence) === sequence;
      notice(recoveringExpiredCurrentSequence ? "Reissuing private invitation…" : "Creating private invitation…"); let created;
      if (state.demo) {
        const token = `demo_${crypto.getRandomValues(new Uint32Array(8)).join("")}`.slice(0, 48);
        created = { invitation_id: `invite-${Date.now()}`, mission_id: mission.mission_id, sequence, status: "INVITED", candidate_label: candidateLabel || null, why_you: whyYou || null, target_label: mission.target_label, mission_note: mission.mission_note, invite_url: `${location.origin}/i/${token}`, invite_token: token };
        const stored = demoLoad(); stored.invitation = created; stored.mission.invitation = created; stored.mission.primary_action = stored.mission.target_wallet_bound ? "WAIT" : "SHARE_CLAIM"; demoSave(stored); state.invitation = created; state.mission = stored.mission;
      } else {
        const invitationId = existingInvitation?.invitation_id || existingInvitation?.id;
        const auth = await signedAuth("CREATE_INVITATION", { missionId: mission.mission_id, invitationId: recoveringExpiredCurrentSequence ? invitationId : undefined, sequence });
        const path = recoveringExpiredCurrentSequence
          ? `/missions/${encodeURIComponent(mission.mission_id)}/invitations/${encodeURIComponent(invitationId)}/reissue`
          : `/missions/${encodeURIComponent(mission.mission_id)}/invitations`;
        created = await api(path, { method: "POST", body: { candidate_label: candidateLabel || null, candidate_wallet: candidateWallet || null, why_you: whyYou || null, auth } });
      }
      if (!state.demo) {
        state.invitation = created;
        state.mission = { ...state.mission, invitation: created, primary_action: "WAIT" };
        startMissionWatch(state.mission);
      }
      renderInviteCreated(created);
    } catch (error) { notice(error.message, true); }
  }

  function renderInviteCreated(created) {
    const inviteUrl = created.invite_url || (created.invite_token ? `${location.origin}/i/${created.invite_token}` : null);
    if (!inviteUrl) return notice("Invitation created, but the backend did not return a one-time invite URL.", true);
    const deeplink = `nimiqpay://miniapp?url=${encodeURIComponent(inviteUrl)}`; notice("Introduction link ready. Send it to the person who can introduce you.");
    document.querySelector(".nc-invite-created")?.remove();
    const card = document.createElement("div"); card.className = "card nc-invite-created"; card.dataset.invitationStatus = esc(created.status || "INVITED"); card.dataset.invitationExpiresAt = esc(created.expires_at || ""); const practiceOpen = state.demo && created.invite_token ? `<a class="button primary" id="demo-tour-open-invite" href="${esc(preserveModePath(`/i/${created.invite_token}`))}">Open it as ${esc(created.candidate_label || "them")}</a>` : "";
    card.innerHTML = `<div class="kicker">Private introduction link</div><div class="invite-link">${esc(inviteUrl)}</div><div class="button-row">${practiceOpen}<button class="button secondary" id="copy-invite">Copy link</button>${state.demo ? "" : `<a class="button ghost" id="open-nimiq" href="${esc(deeplink)}">Open in Nimiq Pay</a>`}</div>`;
    (document.querySelector(".nc-actions") || els.screen).appendChild(card);
    document.querySelector("#copy-invite").addEventListener("click", async () => { await navigator.clipboard.writeText(inviteUrl); notice("Introduction link copied."); });
  }

  function demoClaimPayload(token) {
    const stored = demoLoad();
    const mission = stored?.mission;
    if (!mission || demoClaimToken(mission.mission_id) !== token) return null;
    return {
      claim: mission.destination_claim || { status: mission.target_wallet_bound ? "CLAIMED" : "PENDING", expires_at: new Date(Date.now() + 86400000).toISOString() },
      mission: { mission_id: mission.mission_id, target_label: mission.target_label, mission_note: mission.mission_note, status: mission.status, target_wallet_bound: mission.target_wallet_bound },
      sender_label: mission.creator_display_label || null,
    };
  }

  function claimClosedScene(title, body) {
    els.screen.innerHTML = scene({ ground: "paper", copy: `<p class="nc-kicker">Private payment link</p><h1 class="nc-giant nc-giant--m">${title}</h1><p class="nc-lede">${esc(body)}</p>`, actions: `<button id="claim-home" class="button primary">NimCarry home</button>` });
    document.querySelector("#claim-home")?.addEventListener("click", () => navigate("/"));
    els.screen.focus();
  }

  async function renderDestinationClaim() {
    const token = destinationClaimTokenFromPath();
    if (!token) return navigate("/");
    let payload;
    try {
      payload = state.demo ? demoClaimPayload(token) : await api(`/c/${encodeURIComponent(token)}`);
      if (!payload) throw new Error("PRACTICE_LINK_UNAVAILABLE: start a new practice link from the home screen.");
    } catch (error) {
      notice(error.message, true);
      return claimClosedScene("This link doesn’t<br><em>work anymore.</em>", "It may have expired or been replaced. Nothing was sent. Ask the sender for a new link.");
    }

    const claim = payload?.claim;
    const mission = payload?.mission;
    const targetLabel = mission?.target_label || "Destination";
    if (!claim || !mission?.mission_id) {
      notice("DESTINATION_CLAIM_CONTRACT_MISMATCH: claim response is incomplete.", true);
      return;
    }
    const sender = String(payload?.sender_label || "").trim();

    if (claim.status === "CLAIMED" || mission.target_wallet_bound) {
      els.screen.innerHTML = scene({ ground: "ochre", copy: `<p class="nc-kicker">Your wallet is chosen</p><h1 class="nc-giant nc-giant--m">You’re<br><em>all set.</em></h1><p class="nc-lede">${esc(sender || "The sender")} can now pay ${esc(targetLabel)} directly. It lands in the wallet you chose.</p>`, object: letterMarkup({ to: targetLabel, from: sender, note: mission.mission_note, state: "opened", reference: referenceFor(mission.mission_id) }), actions: `<button id="claim-home" class="button ghost">NimCarry home</button>` });
      document.querySelector("#claim-home")?.addEventListener("click", () => navigate("/"));
      els.screen.focus();
      return;
    }

    if (claim.status !== "PENDING") {
      return claimClosedScene("This link can’t<br><em>be used.</em>", "Nothing was sent and no wallet was connected. Ask the sender for a new link.");
    }

    const expiresAt = claim.expires_at ? new Date(claim.expires_at).toLocaleString() : "soon";
    const deeplink = `nimiqpay://miniapp?url=${encodeURIComponent(location.href)}`;
    els.screen.innerHTML = scene({
      ground: "ochre",
      cls: "nc-claim",
      attrs: `data-destination-claim-status="${esc(claim.status)}"`,
      copy: `<p class="nc-kicker">${state.demo ? `Practice · you are ${esc(targetLabel)} now` : "For you only"}</p><h1 class="nc-giant">${esc(sender || "Someone")} sent<br>you <em>1 NIM.</em></h1><p class="nc-lede">This payment is for <strong>${esc(targetLabel)}</strong>. Choose the Nimiq wallet where it should land. It’s free, and the sender can’t change it after.</p>`,
      object: letterMarkup({ to: targetLabel, from: sender, note: mission.mission_note || "", state: "incoming", reference: referenceFor(mission.mission_id) }),
      actions: actionsHtml([
        bigButton("claim-destination", "Receive in my wallet", 'data-busy-lock="1"'),
        state.demo ? "" : `<a class="button ghost" href="${esc(deeplink)}">Open in Nimiq Pay</a>`,
        `<button id="claim-home" class="button link">This isn’t for me</button>`,
        `<p class="nc-kicker">Link expires ${esc(expiresAt)}</p>`,
      ]),
    });
    document.querySelector("#claim-destination")?.addEventListener("click", () => acceptDestinationClaim(token, mission.mission_id));
    document.querySelector("#claim-home")?.addEventListener("click", () => navigate("/"));
    renderGuide(3);
    els.screen.focus();
  }

  async function acceptDestinationClaim(token, missionId) {
    if (state.busy) return;
    setBusy(true);
    notice("Connecting your wallet…");
    try {
      if (state.demo) {
        const stored = demoLoad();
        if (!stored?.mission) throw new Error("PRACTICE_LINK_UNAVAILABLE: start a new practice link from the home screen.");
        stored.mission.target_wallet_bound = true;
        stored.mission.target_consent_confirmed = true;
        stored.mission.destination_claim = { ...(stored.mission.destination_claim || {}), status: "CLAIMED", claimed_at: new Date().toISOString() };
        stored.mission.primary_action = "SEND_1_NIM";
        demoSave(stored);
        state.mission = stored.mission;
        notice(`Practice: ${stored.mission.target_label || "They"} chose a wallet. You’re the sender again.`);
        navigate(`/mission/${encodeURIComponent(missionId)}`);
        return;
      }
      const auth = await signedAuth("CLAIM_DESTINATION", { missionId, sequence: 0 });
      const claimed = await api(`/c/${encodeURIComponent(token)}/claim`, { method: "POST", body: { auth } });
      if (!claimed?.mission?.mission_id || !claimed?.view_token) {
        throw new Error("DESTINATION_CLAIM_CONTRACT_MISMATCH: signed claim did not return mission access.");
      }
      sessionStorage.setItem(`carryone.view.${claimed.mission.mission_id}`, claimed.view_token);
      rememberMissionLocator(claimed.mission.mission_id);
      state.mission = claimed.mission;
      state.invitation = claimed.mission.invitation || null;
      notice("Wallet connected. Nothing was sent yet. The sender can now pay you directly.");
      navigate(`/mission/${encodeURIComponent(claimed.mission.mission_id)}`);
    } catch (error) {
      notice(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function renderInvitation() {
    const token = inviteTokenFromPath(); state.inviteToken = token; let invitation;
    try { if (state.demo) invitation = demoLoad()?.invitation || { mission_id: "demo", invitation_id: "demo-invite", sequence: 1, status: "INVITED", target_label: state.mission?.target_label || "Destination", mission_note: state.mission?.mission_note || "Move this closer.", why_you: "You know someone closer to the destination.", finalized_hop_count: 0 }; else invitation = await api(`/i/${encodeURIComponent(token)}`); state.invitation = invitation; }
    catch (error) { notice(error.message, true); }
    if (!invitation) { claimClosedScene("This introduction<br><em>isn’t available.</em>", "The link is invalid or expired."); return; }
    const to = invitation.target_label || state.mission?.target_label || (state.demo ? demoLoad()?.mission?.target_label : "") || "someone";

    if (invitation.status === "ACCEPTED") {
      const missionId = invitation.mission_id;
      const deadline = invitation.pass_deadline_at ? new Date(invitation.pass_deadline_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
      els.screen.innerHTML = scene({ ground: "indigo", copy: `<p class="nc-kicker">Introduction</p><h1 class="nc-giant nc-giant--m">You already<br><em>said yes.</em></h1><p class="nc-lede">Nothing else to approve. The sender now pays ${esc(to)} directly${deadline ? ` before ${esc(deadline)}` : ""}. You never hold the NIM, and opening this link again changes nothing.</p>`, object: letterMarkup({ to, note: invitation.mission_note || "", state: "sealed" }), actions: actionsHtml([missionId ? bigButton("accepted-follow", "Follow this payment") : "", `<button id="accepted-home" class="button ghost">NimCarry home</button>`]) });
      document.querySelector("#accepted-follow")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(missionId)}`));
      document.querySelector("#accepted-home")?.addEventListener("click", () => navigate("/"));
      els.screen.focus();
      return;
    }

    if (["DECLINED", "EXPIRED", "WITHDRAWN", "COMPLETED"].includes(invitation.status)) {
      els.screen.innerHTML = scene({ ground: "paper", copy: `<p class="nc-kicker">Introduction closed</p><h1 class="nc-giant nc-giant--m">This link is<br><em>closed.</em></h1><p class="nc-lede">Status: <strong>${esc(invitation.status)}</strong>. Opening it again can’t create another introduction.</p>`, actions: `<button id="closed-home" class="button primary">NimCarry home</button>` });
      document.querySelector("#closed-home")?.addEventListener("click", () => navigate("/"));
      els.screen.focus();
      return;
    }

    const deeplink = `nimiqpay://miniapp?url=${encodeURIComponent(location.href)}`;
    els.screen.innerHTML = scene({
      ground: "indigo",
      cls: "nc-invitation",
      copy: `<p class="nc-kicker">You were asked to introduce</p><h1 class="nc-giant">Can you<br>introduce them<br>to <em>${esc(to)}?</em></h1><div class="card"><div class="kicker">Why you</div><p>${esc(invitation.why_you || "They think you know this person.")}</p></div>`,
      object: letterMarkup({ to, note: invitation.mission_note || "", state: "sealed" }),
      actions: `<label class="acceptance-display-field">Your name on the letter <span>(optional)</span><input id="candidate-display-label" maxlength="60" autocomplete="name" placeholder="Your name or initials" /><small>Saying yes never moves money. The sender pays ${esc(to)} directly; you never hold the NIM.</small></label>${bigButton("accept", "Yes, I’ll introduce", 'data-busy-lock="1"')}<button data-busy-lock="1" id="decline" class="button ghost">Not this time</button>${state.demo ? "" : `<a class="button link" href="${esc(deeplink)}">Open in Nimiq Pay</a>`}`,
    });
    document.querySelector("#accept").addEventListener("click", () => acceptInvitation(invitation, token)); document.querySelector("#decline").addEventListener("click", () => declineInvitation(invitation, token)); els.screen.focus();
  }

  async function acceptInvitation(invitation, token) {
    const candidateDisplayLabel = document.querySelector("#candidate-display-label")?.value?.trim() || undefined;
    setBusy(true); notice("Confirming with your wallet…");
    try {
      if (state.demo) {
        const stored = demoLoad();
        stored.invitation.status = "ACCEPTED";
        stored.invitation.candidate_display_label = candidateDisplayLabel || null;
        stored.mission.invitation = stored.invitation;
        // Practice mirrors the real rule: sending waits until the recipient has opened the link.
        stored.mission.primary_action = stored.mission.target_wallet_bound ? "PASS_1_NIM" : "SHARE_CLAIM";
        demoSave(stored);
        state.mission = stored.mission;
        notice("Practice: introduction accepted. Nothing was signed or sent.");
        navigate(`/mission/${encodeURIComponent(stored.mission.mission_id)}`);
        return;
      }
      const auth = await signedAuth("ACCEPT_INVITATION", { missionId: invitation.mission_id, invitationId: invitation.invitation_id, sequence: invitation.sequence });
      await api(`/i/${encodeURIComponent(token)}/accept`, { method: "POST", body: { auth, candidate_display_label: candidateDisplayLabel } });
      notice("Accepted. Stay here — the sender can now pay the recipient directly. Your part is done once it’s confirmed on Nimiq.");
    } catch (error) { notice(error.message, true); } finally { setBusy(false); }
  }

  async function declineInvitation(invitation, token) {
    setBusy(true);
    try {
      if (state.demo) { const stored = demoLoad(); stored.invitation.status = "DECLINED"; stored.mission.invitation = stored.invitation; stored.mission.primary_action = "REROUTE"; demoSave(stored); notice("Practice: introduction declined. Nothing moved."); return; }
      await api(`/i/${encodeURIComponent(token)}/decline`, { method: "POST", body: {} }); notice("Declined. Nothing was sent.");
    } catch (error) { notice(error.message, true); } finally { setBusy(false); }
  }

  async function renderPass() {
    const missionId = missionIdFromPath();
    try { await loadMission(missionId); } catch (error) { notice(error.message, true); }
    const m = state.mission;
    const inv = m?.invitation || state.invitation;
    const directClaimReady =
      !inv &&
      m?.target_wallet_bound === true &&
      (!m?.destination_claim || m?.destination_claim?.status === "CLAIMED");
    const passDeadline = inv?.pass_deadline_at ? Date.parse(inv.pass_deadline_at) : NaN;
    const passWindowExpired = Number.isFinite(passDeadline) && Date.now() >= passDeadline;
    const introducedReady = m?.target_wallet_bound === true && inv?.status === "ACCEPTED" && !passWindowExpired;
    const passReady = directClaimReady || introducedReady;
    const to = firstName(m?.target_label, "them");

    if (!passReady) {
      let title = "Not ready<br><em>yet.</em>";
      let body = `${to} hasn’t opened your link yet. Once they choose their wallet, you can send.`;
      if (inv) {
        const bridge = inv?.candidate_label || inv?.candidate_display_label || "Your introducer";
        const expired = inv?.status === "EXPIRED" || passWindowExpired;
        title = expired ? "This window<br><em>closed.</em>" : "Not ready<br><em>yet.</em>";
        body = expired
          ? `${bridge} said yes earlier, but that sending window has expired. Nothing was sent.`
          : `${bridge} needs to say yes before you can send.`;
      }
      els.screen.innerHTML = `<button class="back-link" id="back">${arrowSvg("left")} Back</button>` + scene({ ground: "paper", copy: `<p class="nc-kicker">Nothing to send yet</p><h1 class="nc-giant nc-giant--m">${title}</h1><p class="nc-lede">${esc(body)} No payment is requested from this screen.</p>`, object: m ? letterMarkup({ to: m.target_label, note: m.mission_note, state: "sealed", reference: referenceFor(m.mission_id) }) : "", actions: `<button id="mission-return" class="button primary">Back to the payment</button><button id="route-return" class="button ghost">View details</button>` });
      document.querySelector("#back")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(missionId)}`));
      document.querySelector("#mission-return")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(missionId)}`));
      document.querySelector("#route-return")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(missionId)}/route`));
      els.screen.focus();
      return;
    }

    const via = directClaimReady ? `${to} chose it` : `Chosen by ${to}`;
    const introducer = inv ? (inv?.candidate_display_label || inv?.candidate_label || "your introducer") : "";
    els.screen.innerHTML = `<button class="back-link" id="back">${arrowSvg("left")} Back</button>` + scene({
      ground: "night",
      cls: "nc-send",
      attrs: `data-delivery-mode="${directClaimReady ? "direct" : "introduced"}"`,
      copy: `<p class="nc-kicker">Send${introducer ? ` · introduced by ${esc(introducer)}` : ""}</p><h1 class="nc-giant">Seal it<br>with <em>1 NIM.</em></h1><p class="nc-lede">Drag the seal onto ${esc(to)}. It goes straight to the wallet they chose.</p>`,
      object: letterMarkup({ to: m?.target_label, from: senderOf(m), note: m?.mission_note, state: "opened", reference: referenceFor(missionId) }),
      actions: `${dropMarkup(to)}${phaseMarkup()}<div class="nc-facts"><div><span>Amount</span><b>1 NIM</b></div><div><span>Wallet</span><b>${esc(via)}</b></div><div><span>Fee requested</span><b>0</b></div></div><button data-busy-lock="1" id="send" class="button link">Or tap here to send 1 NIM to ${esc(to)}</button><p class="nc-kicker">Once it’s sent, NimCarry blocks a second send. You can close the app while it confirms.</p>`,
    });
    document.querySelector("#back").addEventListener("click", () => navigate(`/mission/${encodeURIComponent(missionId)}`));
    const sendButton = document.querySelector("#send");
    sendButton.addEventListener("click", () => executePass(missionId, inv || null));
    // The drag goes through the same #send click, so the duplicate-send guard always sees it.
    const resetDrop = bindDrop(document.querySelector("#nc-drop"), () => sendButton.click());
    addEventListener("nimcarry:handoff-phase", function onPhase(event) {
      if (event.detail?.phase === "error") resetDrop();
      if (!document.contains(sendButton)) removeEventListener("nimcarry:handoff-phase", onPhase);
    });
    renderGuide(4);
    els.screen.focus();
  }

  async function executePass(missionId, invitation) {
    setBusy(true);
    let passPhase = "start";
    try {
      if (state.demo) {
        handoffEvent("verification-pending", { demo: true, status: "PENDING" });
        notice("Practice: simulating confirmation on the Nimiq network…");
        await new Promise((r) => setTimeout(r, 1800));
        const stored = demoLoad();
        const bridgeLabel = stored.invitation ? (stored.invitation.candidate_display_label || stored.invitation.candidate_label || "Introducer") : null;
        const targetLabel = stored.mission.target_label || "Destination";
        if (stored.invitation) {
          stored.invitation.status = "COMPLETED";
          stored.mission.invitation = stored.invitation;
        }
        stored.mission.sequence = Number(stored.mission.sequence || 0) + 1;
        stored.mission.finalized_hop_count = Number(stored.mission.finalized_hop_count || 0) + 1;
        stored.mission.route = [...(stored.mission.route || []), {
          sequence: stored.mission.sequence,
          current_holder: { display_label: stored.mission.creator_display_label || stored.mission.current_holder?.display_label || "Sender", wallet_fingerprint: stored.mission.current_holder?.wallet_fingerprint || "NQ…SENDER" },
          from: { display_label: stored.mission.current_holder?.display_label || "Sender", wallet_fingerprint: stored.mission.current_holder?.wallet_fingerprint || "NQ…SENDER" },
          via: bridgeLabel ? { display_label: bridgeLabel, wallet_fingerprint: "NQ…BRIDGE" } : null,
          to: { display_label: targetLabel, wallet_fingerprint: "NQ…TARGET" },
          finalized_at: new Date().toISOString(),
          tx_hash_short: "demo…final",
        }];
        stored.mission.current_holder = { display_label: targetLabel, wallet_fingerprint: "NQ…TARGET", is_viewer: false };
        stored.mission.status = "ARRIVED";
        stored.mission.activity = "TERMINAL";
        stored.mission.arrived_at = new Date().toISOString();
        stored.mission.primary_action = "START_NEW_ROUTE";
        demoSave(stored);
        state.mission = stored.mission;
        handoffEvent("final", { demo: true, status: "ARRIVED" });
        notice(`Practice: 1 NIM delivered to ${targetLabel}${bridgeLabel ? `, introduced by ${bridgeLabel}` : ""}. No real NIM moved.`);
        await new Promise((r) => setTimeout(r, 500));
        navigate(`/mission/${encodeURIComponent(missionId)}/route`);
        return;
      }
      const invitationId = invitation?.invitation_id || null;
      const sequence = Number(invitation?.sequence ?? (Number(state.mission?.sequence || 0) + 1));
      handoffEvent("authorization-requested", { status: "AUTHORIZATION_REQUESTED", direct_claim: !invitationId });
      notice(invitationId ? "Authorizing introduced direct delivery…" : "Authorizing direct destination delivery…");
      passPhase = "authorize"; passDiagnostic("authorize_started", { sequence, invitation_present: Boolean(invitationId) });
      const authBindings = { missionId, sequence };
      if (invitationId) authBindings.invitationId = invitationId;
      const auth = await signedAuth("AUTHORIZE_PASS", authBindings);
      passPhase = "pass_intent";
      const intentBody = { auth };
      if (invitationId) intentBody.invitation_id = invitationId;
      const intent = await api(`/missions/${encodeURIComponent(missionId)}/pass-intent`, { method: "POST", body: intentBody });
      if (!intent?.recipient || Number(intent.value_luna) !== ONE_NIM || !intent.recipient_data) throw new Error("PASS_INTENT_CONTRACT_MISMATCH: recipient/value/opaque data required.");
       if (!String(intent.recipient_data).startsWith("co:v1:")) throw new Error("OPAQUE_COMMITMENT_REQUIRED: refusing clear-text/legacy recipient data.");
       if (!intent.expected_sender || walletKey(auth.wallet) !== walletKey(intent.expected_sender)) {
         throw new Error("WRONG_WALLET_SELECTION: the signed Nimiq identity is not the canonical holder for this pass.");
       }
       passDiagnostic("pass_intent_received", {
         value_luna: Number(intent.value_luna),
         fee_luna: Number(intent.fee_luna),
         recipient_present: true,
         opaque_commitment_present: true,
         authorized_payment_wallet_count: Array.isArray(intent.authorized_payment_wallets) ? intent.authorized_payment_wallets.length : 1,
       });
      handoffEvent("authorized", { status: "AUTHORIZED" });
      passPhase = "payment_source_preflight";
      const nimiq = await assertAuthorizedPaymentAccounts(intent);
      handoffEvent("wallet-approval-opened", { status: "AWAITING_WALLET" });
      notice("Open Nimiq Pay and approve exactly 1 NIM…");
       passPhase = "transaction_submission"; passDiagnostic("wallet_approval_opened", { value_luna: ONE_NIM, fee_luna: 0, opaque_commitment_present: true });
       const txHash = await nimiq.sendBasicTransactionWithData({ recipient: intent.recipient, value: ONE_NIM, fee: 0, data: intent.recipient_data });
       passDiagnostic("wallet_call_returned", { transaction_hash_present: Boolean(txHash) });
       handoffEvent(txHash ? "provider-reference-returned" : "broadcast-unproven", { status: txHash ? "REFERENCE_RETURNED" : "UNPROVEN" });
      const intentId = intent.intent_id || intent.id; if (!intentId || !txHash) throw new Error("PASS_BROADCAST_CONTRACT_MISMATCH: missing intent id or transaction hash.");
      await api(`/missions/${encodeURIComponent(missionId)}/pass-intent/${encodeURIComponent(intentId)}/broadcast`, { method: "POST", body: { tx_hash: txHash } });
      handoffEvent("broadcast-claim-recorded", { status: "PENDING" });
      handoffEvent("verification-pending", { status: "PENDING" });
      notice("1 NIM submitted to the destination. NimCarry is checking independent FINAL in the background…");
      passPhase = "finality_verification";
      const verification = await pollFinality(missionId);
      if (verification.final) {
        handoffEvent("final", { status: "FINAL" });
        await new Promise((r) => setTimeout(r, 500));
        navigate(`/mission/${encodeURIComponent(missionId)}/route`);
      } else {
        handoffEvent("verification-backgrounded", { status: "PENDING" });
        navigate(`/mission/${encodeURIComponent(missionId)}`);
        notice("Destination payment submitted — finalizing in the background. You can safely close this page. Do not resend 1 NIM.");
      }
    } catch (error) {
      const classification = passFailureClass(passPhase, error);
      passDiagnostic("pass_failed", { phase: passPhase, classification });
      handoffEvent("error", { classification });
      notice(error.message, true);
    } finally { setBusy(false); }
  }

  async function pollFinality(missionId) {
    try {
      const result = await api(`/missions/${encodeURIComponent(missionId)}/reconcile`, { method: "POST", body: {} });
      const status = result?.hop?.status || result?.status || result?.mission?.status;
      const final = status === "FINAL" || status === "CONFIRMED" || result?.mission?.status === "ARRIVED";
      handoffEvent("verification-status", { status: String(status || "PENDING") });
      return { final, result };
    } catch (error) {
      const message = String(error?.message || error || "");
      const retryable = /VERIFICATION_DELAYED|Load failed|Failed to fetch|network|transport|timeout|temporar|connection|offline|unavailable/i.test(message);
      if (!retryable) throw error;
      handoffEvent("verification-delayed", { status: "PENDING", background: true });
      notice("Verification is temporarily unavailable. NimCarry will keep checking in the background. Do not resend 1 NIM.");
      return { final: false, result: null };
    }
  }

  async function renderRoute() {
    const missionId = missionIdFromPath(); try { await loadMission(missionId); } catch (error) { notice(error.message, true); }
    const m = state.mission;
    if (!m) { claimClosedScene("Details<br><em>unavailable.</em>", "This payment couldn’t be loaded. Re-open it from the link or the home screen."); return; }
    const routeAction = m.primary_action || derivePrimaryAction(m);
    const arrived = m.status === "ARRIVED";
    const to = firstName(m.target_label, "them");
    const receipt = `<section class="route-card" data-viewer-role="${esc(m.viewer_role || "UNLISTED_VIEWER")}" data-route-status="${esc(m.status)}" data-primary-action="${esc(routeAction || "")}" data-invitation-status="${esc(m.invitation?.status || "")}"><div class="meta-row"><div class="kicker">${arrived ? "Receipt" : "So far"}</div><span class="status-pill ${arrived ? "arrived" : ""}">${esc(m.status)}</span></div>${routeMarkup(m.route || [])}<p class="nc-kicker">Only payments confirmed on Nimiq appear here. Full wallet addresses are never shown.</p><div class="button-row"><button id="refresh" class="button ghost">Check again</button></div></section>`;
    els.screen.innerHTML = `<button class="back-link" id="back">${arrowSvg("left")} Back</button>` + scene({
      ground: arrived ? "arrived" : "paper",
      cls: arrived ? "nc-arrived hc-arrived-moment" : "",
      copy: arrived
        ? `<h1 class="nc-giant">It <em>arrived.</em></h1><p class="nc-lede"><strong>${esc(to)}</strong> received 1 NIM. Confirmed on the Nimiq network.</p>`
        : `<p class="nc-kicker">Payment details</p><h1 class="nc-giant nc-giant--m">For<br><em>${esc(to)}.</em></h1><p class="nc-lede">Nothing counts until the Nimiq network confirms it.</p>`,
      object: (arrived ? confettiMarkup() : "") + letterMarkup({ to: m.target_label, from: senderOf(m), note: m.mission_note, state: arrived ? "arrived" : "sealed", reference: referenceFor(m.mission_id), date: m.arrived_at ? new Date(m.arrived_at).toLocaleDateString() : "" }),
      actions: receipt + (arrived ? `<div class="button-row">${bigButton("new", "Send another")}</div>` : ""),
    });
    document.querySelector("#back").addEventListener("click", () => navigate(`/mission/${encodeURIComponent(missionId)}`)); document.querySelector("#refresh").addEventListener("click", () => renderRoute()); document.querySelector("#new")?.addEventListener("click", () => navigate("/create"));
    if (arrived) renderGuide(5, `<a class="button" href="/?demo=1&amp;tour=1&amp;reset=1">Start again</a>`);
    els.screen.focus();
  }

  function routeMarkup(route, options = {}) {
    if (!Array.isArray(route) || route.length === 0) return `<div class="empty-route">Nothing confirmed yet.</div>`;
    const ordered = route.slice().sort((a, b) => Number(a.sequence) - Number(b.sequence));
    const lastSequence = Number(ordered.at(-1)?.sequence);
    return `<div class="route">${ordered.map((entry) => {
      const bridgeMark = entry.via?.display_label || null;
      const recipient = entry.to?.display_label || entry.to?.wallet_fingerprint || "Destination";
      const who = bridgeMark ? `Introduced by ${bridgeMark}` : "Sent directly";
      const isCurrentHolder = options.markCurrentHolder === true && Number(entry.sequence) === lastSequence;
      const currentHolderMark = isCurrentHolder ? " · Current holder" : "";
      return `<div class="route-step" data-carrier-mark="${esc(bridgeMark || "")}" data-current-holder="${isCurrentHolder ? "true" : "false"}"><div class="rail"><span class="dot"></span></div><div><strong class="${bridgeMark ? "carrier-mark" : ""}">${esc(who)}</strong><small>1 NIM to ${esc(recipient)} · ${esc(entry.tx_hash_short || "verified tx")} · ${esc(entry.finalized_at ? new Date(entry.finalized_at).toLocaleString() : "confirmed")}${currentHolderMark}</small></div></div>`;
    }).join("")}</div>`;
  }

  route();
})();
