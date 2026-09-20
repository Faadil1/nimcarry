import { classifyNimiqAccounts, getNimiqProvider, isBasicNimiqAccountType, isHtlcNimiqAccountType, nimiqAddressKey } from "/nimiq-provider.js";

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
  els.network.textContent = state.demo ? "LOCAL DEMO" : "NIMIQ PAY / TESTNET";

  const walletKey = (value) => String(value ?? "").replace(/\s+/g, "").toUpperCase();
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const short = (value) => {
    const text = String(value ?? "");
    return text.length > 16 ? `${text.slice(0, 7)}…${text.slice(-5)}` : text || "unknown";
  };
  const notice = (message, error = false) => {
    els.notice.textContent = message;
    els.notice.classList.toggle("error", error);
    els.notice.hidden = !message;
  };
  const setBusy = (value) => { state.busy = value; document.querySelectorAll("button").forEach((button) => { if (button.dataset.busyLock === "1") button.disabled = value; }); };
  const passDiagnostic = (phase, details = {}) => console.info("[NimCarry pass diagnostic]", phase, details);
  const handoffEvent = (phase, details = {}) => {
    dispatchEvent(new CustomEvent("nimcarry:handoff-phase", { detail: { phase, ...details } }));
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
  const navigate = (path) => { history.pushState({}, "", preserveModePath(path)); route(); };
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

  function demoLoad() { try { return JSON.parse(localStorage.getItem("carryone.demo") || "null"); } catch { return null; } }
  function demoSave(value) { localStorage.setItem("carryone.demo", JSON.stringify(value)); }
  function demoMission() { const existing = demoLoad(); return existing?.mission ? existing : null; }

  async function loadMission(missionId) {
    if (state.demo) {
      const demo = demoMission(); state.mission = demo?.mission || null; state.invitation = demo?.invitation || null; return state.mission;
    }
    const viewToken = extractViewToken(missionId);
    const mission = await api(`/missions/${encodeURIComponent(missionId)}`, { viewToken });
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

    return holderWaitingForAcceptance || acceptedBridgeWaitingForFinal;
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
      const bridgeCompletedIntroduction =
        previousMission?.viewer_role === "INVITEE" &&
        previousMission?.status === "ACTIVE" &&
        latest?.status === "ARRIVED";

      if (bridgeCompletedIntroduction) {
        notice(`FINAL verified. ${latest?.target_label || "The destination"} received the 1 NIM. Your bridge step is complete.`);
      } else if (invitationStatus === "ACCEPTED" && latest?.current_holder?.is_viewer === true) {
        notice("Bridge accepted the invitation. The handoff is ready.");
      } else if (invitationStatus === "DECLINED") {
        notice("Bridge declined the invitation. The letter stayed with you.");
      } else if (previousFingerprint) {
        notice("Mission status updated.");
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

  function route() {
    notice("");
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (!/^\/mission\/[^/]+$/.test(path)) stopMissionWatch();
    if (path === "/create") return renderCreate();
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

  async function renderHome() {
    const missionId = missionIdFromPath();
    if (missionId) { try { await loadMission(missionId); } catch (error) { notice(error.message, true); } }
    else if (state.demo) { const demo = demoMission(); state.mission = demo?.mission || null; state.invitation = demo?.invitation || null; }

    if (!state.mission) {
      els.screen.innerHTML = `<section class="hero-card"><div class="kicker">Destination-bound human routing</div><h1>Get this to someone you can’t reach directly.</h1><p class="lede">One person at a time. A verified 1 NIM handoff records each human bridge without turning the route into a game.</p><div class="promise-strip"><div class="promise orange"><span>01</span><strong>Invite</strong><span>No surprise bridges</span></div><div class="promise green"><span>02</span><strong>Pass 1 NIM</strong><span>Wallet-approved</span></div><div class="promise violet"><span>03</span><strong>Verify</strong><span>FINAL changes custody</span></div></div><div class="button-row"><button id="create-button" class="button primary">Create a mission</button></div></section>`;
      document.querySelector("#create-button").addEventListener("click", () => navigate("/create")); els.screen.focus(); return;
    }

    const m = state.mission;
    const activity = m.status === "ARRIVED" || m.status === "CANCELLED" ? "TERMINAL" : (m.activity || "ACTIVE");
    const action = m.primary_action || derivePrimaryAction(m);
    const hasVerifiedPath = Array.isArray(m.route) && m.route.length > 0;
    const holderSummary = hasVerifiedPath
      ? ""
      : `<div class="holder-chip"><span class="avatar">→</span><span><small>Current holder</small><strong>${esc(m.current_holder?.display_label || m.current_holder?.wallet_fingerprint || "Private participant")}</strong></span></div>`;
    els.screen.innerHTML = `<section class="hero-card" data-mission-status="${esc(m.status || "")}" data-mission-activity="${esc(activity || "")}" data-primary-action="${esc(action || "")}" data-finalized-hop-count="${esc(m.finalized_hop_count || 0)}" data-invitation-status="${esc(m.invitation?.status || "")}" data-invitation-expires-at="${esc(m.invitation?.expires_at || "")}" data-pass-deadline-at="${esc(m.invitation?.pass_deadline_at || "")}" data-accepted-display-label="${esc(m.invitation?.candidate_display_label || "")}"><div class="meta-row"><div class="kicker">${esc(m.finalized_hop_count || 0)} verified bridge${Number(m.finalized_hop_count || 0) === 1 ? "" : "s"}</div><span class="status-pill ${m.status === "ARRIVED" ? "arrived" : activity === "STALLED" ? "stalled" : ""}">${esc(m.status === "ACTIVE" ? activity : m.status)}</span></div><h1 class="target-title">${esc(m.status === "ARRIVED" ? "It made it." : m.target_label)}</h1><p class="mission-note">${esc(m.mission_note)}</p>${holderSummary}${activity === "STALLED" ? `<div class="warning" style="margin-top:14px">This route is waiting on its current bridge. Custody has not changed. A new route can be started, but this baton is never clawed back.</div>` : ""}<div class="button-row">${homeButtons(action, m)}</div></section><section class="stack"><div class="route-card"><div class="split"><h2>Verified path</h2><span>${esc(m.finalized_hop_count || 0)} FINAL</span></div>${routeMarkup(m.route || [], { markCurrentHolder: m.status === "ACTIVE" })}</div></section>`;
    wireHomeButtons(action, m);
    startMissionWatch(m);
    els.screen.focus();
  }

  function derivePrimaryAction(m) {
    if (m.status === "ARRIVED") return "VIEW_ROUTE";
    const status = m.invitation?.status;
    if (!status || ["DECLINED", "EXPIRED", "WITHDRAWN", "COMPLETED"].includes(status)) return "CREATE_INVITATION";
    if (status === "INVITED") return "WAIT";
    if (status === "ACCEPTED") return "PASS_1_NIM";
    return null;
  }
  function homeButtons(action, m) {
    if (m.status === "ARRIVED") return `<button id="route-button" class="button green">View completed route</button><button id="new-button" class="button ghost">Start your own mission</button>`;
    if (action === "CREATE_INVITATION" || action === "REROUTE") return `<button id="invite-button" class="button primary">${action === "REROUTE" ? "Choose another bridge" : "Choose next bridge"}</button><button id="route-button" class="button ghost">Follow route</button>`;
    if (action === "WAIT" && m.viewer_role === "INVITEE" && m.invitation?.status === "ACCEPTED") return `<button class="button primary" disabled>Accepted — waiting for FINAL</button><button id="route-button" class="button ghost">Follow route</button>`;
    if (action === "WAIT" && m.invitation?.status === "ACCEPTED") return `<button data-busy-lock="1" id="recheck-button" class="button primary">Recheck existing handoff</button><button id="route-button" class="button ghost">Follow route</button>`;
    if (action === "WAIT") return `<button class="button primary" disabled>Waiting for response</button><button id="route-button" class="button ghost">Follow route</button>`;
    if (action === "PASS_1_NIM") return `<button id="pass-button" class="button primary">Pass 1 NIM</button><button id="route-button" class="button ghost">Follow route</button>`;
    return `<button id="route-button" class="button ghost">View route</button>`;
  }

  async function recheckExistingHandoff(missionId) {
    if (state.busy) return;
    setBusy(true);
    notice("Rechecking the existing handoff on TESTNET…");
    try {
      const result = await api(`/missions/${encodeURIComponent(missionId)}/reconcile`, { method: "POST", body: {} });
      const status = String(result?.hop?.status || result?.mission?.status || "PENDING").toUpperCase();
      const final = status === "FINAL" || status === "CONFIRMED" || result?.mission?.status === "ARRIVED";
      notice(final
        ? "Existing handoff verified FINAL. No second payment was requested."
        : "Existing handoff is not FINAL yet. No second payment was requested.");
      await renderHome();
    } catch (error) {
      notice(`${error?.message || String(error)} — no second payment was requested.`, true);
    } finally {
      setBusy(false);
    }
  }

  function wireHomeButtons(action, m) {
    document.querySelector("#route-button")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(m.mission_id)}/route`));
    document.querySelector("#new-button")?.addEventListener("click", () => navigate("/create"));
    document.querySelector("#pass-button")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(m.mission_id)}/pass`));
    document.querySelector("#invite-button")?.addEventListener("click", () => openInviteDialog(m));
    document.querySelector("#recheck-button")?.addEventListener("click", () => recheckExistingHandoff(m.mission_id));
  }

  async function renderCreate() {
    els.screen.innerHTML = `<button class="back-link" id="back">← Back</button><section class="form-card"><div class="kicker">Screen 2 / 5 · Create Mission</div><h2>Who should this reach?</h2><p class="lede">For Cycle II, use a known, consenting Nimiq destination. The destination wallet is stored privately and never shown in normal route views.</p><form id="create-form" class="form-grid"><label>Target label<input name="target_label" maxlength="60" required placeholder="Nimiq builder" /></label><label>Private target wallet<input name="target_wallet" required autocomplete="off" placeholder="NQ…" /></label><label>Why should this reach them?<textarea name="mission_note" maxlength="180" required placeholder="I want this idea to reach someone who can connect it to…"></textarea></label><label>Creator display label (optional)<input name="creator_display_label" maxlength="60" placeholder="Faadil" /></label><label class="checkline"><input name="target_consent_confirmed" type="checkbox" required /><span>I confirm this target is known to me and has consented to be the destination for this Cycle II mission.</span></label><button data-busy-lock="1" class="button primary" type="submit">Create mission</button></form></section>`;
    document.querySelector("#back").addEventListener("click", () => history.back()); document.querySelector("#create-form").addEventListener("submit", createMission); els.screen.focus();
  }

  async function createMission(event) {
    event.preventDefault(); if (state.busy) return; setBusy(true); notice("Creating mission…");
    const form = new FormData(event.currentTarget); const input = Object.fromEntries(form.entries());
    try {
      if (state.demo) {
        const mission = { mission_id: `demo-${Date.now()}`, status: "ACTIVE", activity: "ACTIVE", target_label: input.target_label, mission_note: input.mission_note, sequence: 0, finalized_hop_count: 0, current_holder: { display_label: input.creator_display_label || "You", wallet_fingerprint: "NQ…DEMO", is_viewer: true }, invitation: null, route: [], viewer_role: "HOLDER", primary_action: "CREATE_INVITATION" };
        demoSave({ mission, invitation: null }); state.mission = mission; navigate(`/mission/${mission.mission_id}`); return;
      }
      const auth = await signedAuth("CREATE_MISSION");
      const mission = await api("/missions", { method: "POST", body: { ...input, target_consent_confirmed: true, visibility: "UNLISTED", auth } });
      state.mission = mission; navigate(`/mission/${encodeURIComponent(mission.mission_id || mission.id)}`);
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
        created = { invitation_id: `invite-${Date.now()}`, mission_id: mission.mission_id, sequence, status: "INVITED", candidate_label: candidateLabel || null, why_you: whyYou || null, invite_url: `${location.origin}/i/${token}`, invite_token: token };
        const stored = demoLoad(); stored.invitation = created; stored.mission.invitation = created; stored.mission.primary_action = "WAIT"; demoSave(stored); state.invitation = created; state.mission = stored.mission;
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
    const deeplink = `nimiqpay://miniapp?url=${encodeURIComponent(inviteUrl)}`; notice("Private invitation ready.");
    const card = document.createElement("div"); card.className = "card"; card.dataset.invitationStatus = esc(created.status || "INVITED"); card.dataset.invitationExpiresAt = esc(created.expires_at || ""); card.innerHTML = `<div class="kicker">Private invite</div><div class="invite-link">${esc(inviteUrl)}</div><div class="button-row"><button class="button secondary" id="copy-invite">Copy link</button><a class="button green" id="open-nimiq" href="${esc(deeplink)}">Open in Nimiq Pay</a></div>`; els.screen.appendChild(card);
    document.querySelector("#copy-invite").addEventListener("click", async () => { await navigator.clipboard.writeText(inviteUrl); notice("Invite link copied."); });
  }

  async function renderInvitation() {
    const token = inviteTokenFromPath(); state.inviteToken = token; let invitation;
    try { if (state.demo) invitation = demoLoad()?.invitation || { mission_id: "demo", invitation_id: "demo-invite", sequence: 1, status: "INVITED", target_label: state.mission?.target_label || "Destination", mission_note: state.mission?.mission_note || "Move this closer.", why_you: "You know someone closer to the destination.", finalized_hop_count: 0 }; else invitation = await api(`/i/${encodeURIComponent(token)}`); state.invitation = invitation; }
    catch (error) { notice(error.message, true); }
    if (!invitation) { els.screen.innerHTML = `<section class="card"><h2>Invitation unavailable</h2><p>This private invite is invalid, expired, or not yet served by the backend.</p></section>`; return; }

    if (invitation.status === "ACCEPTED") {
      const missionId = invitation.mission_id;
      const deadline = invitation.pass_deadline_at ? new Date(invitation.pass_deadline_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
      els.screen.innerHTML = `<section class="hero-card"><div class="kicker">Bridge accepted</div><h1 class="target-title">You already accepted this handoff.</h1><p class="lede">There is nothing else to approve on this invitation link. The sender can now deliver the 1 NIM directly to the destination${deadline ? ` before ${esc(deadline)}` : ""}.</p><div class="warning" style="margin-top:14px">Opening this link again never creates a second acceptance. The bridge never receives the 1 NIM.</div><div class="button-row">${missionId ? `<button id="accepted-follow" class="button primary">Follow this mission</button>` : ""}<button id="accepted-home" class="button ghost">NimCarry home</button></div></section>`;
      document.querySelector("#accepted-follow")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(missionId)}`));
      document.querySelector("#accepted-home")?.addEventListener("click", () => navigate("/"));
      els.screen.focus();
      return;
    }

    if (["DECLINED", "EXPIRED", "WITHDRAWN", "COMPLETED"].includes(invitation.status)) {
      els.screen.innerHTML = `<section class="hero-card"><div class="kicker">Invitation closed</div><h1 class="target-title">This bridge invitation is no longer actionable.</h1><p class="lede">Status: <strong>${esc(invitation.status)}</strong>. Reopening this private link cannot create another handoff.</p><div class="button-row"><button id="closed-home" class="button primary">NimCarry home</button></div></section>`;
      document.querySelector("#closed-home")?.addEventListener("click", () => navigate("/"));
      els.screen.focus();
      return;
    }

    const deeplink = `nimiqpay://miniapp?url=${encodeURIComponent(location.href)}`;
    els.screen.innerHTML = `<section class="hero-card"><div class="kicker">Screen 3 / 5 · Bridge Invitation</div><h1 class="target-title">You were chosen as the next bridge.</h1><p class="lede">Target: <strong>${esc(invitation.target_label || state.mission?.target_label || "Private destination")}</strong></p><div class="card" style="margin-top:16px"><div class="kicker">Why you</div><p>${esc(invitation.why_you || "The current holder thinks you can move this one person closer.")}</p></div><label class="acceptance-display-field">How should this letter remember you? <span>(optional)</span><input id="candidate-display-label" maxlength="60" autocomplete="name" placeholder="Your name or initials" /><small>Shown only inside authorized mission context. The Nimiq authorization — not this name — is the consent proof.</small></label><div class="warning" style="margin-top:14px">Accepting does not move funds. The current holder sends exactly 1 NIM only after you accept.</div><div class="button-row"><button data-busy-lock="1" id="accept" class="button primary">Accept as bridge</button><button data-busy-lock="1" id="decline" class="button ghost">Decline</button><a class="button green" href="${esc(deeplink)}">Open in Nimiq Pay</a></div></section>`;
    document.querySelector("#accept").addEventListener("click", () => acceptInvitation(invitation, token)); document.querySelector("#decline").addEventListener("click", () => declineInvitation(invitation, token)); els.screen.focus();
  }

  async function acceptInvitation(invitation, token) {
    const candidateDisplayLabel = document.querySelector("#candidate-display-label")?.value?.trim() || undefined;
    setBusy(true); notice("Binding your wallet to this invitation…");
    try {
      if (state.demo) {
        const stored = demoLoad();
        stored.invitation.status = "ACCEPTED";
        stored.invitation.candidate_display_label = candidateDisplayLabel || null;
        stored.mission.invitation = stored.invitation;
        stored.mission.primary_action = "PASS_1_NIM";
        demoSave(stored);
        notice("Demo bridge accepted. The signature mark is presentation only; no wallet or network write occurred.");
        return;
      }
      const auth = await signedAuth("ACCEPT_INVITATION", { missionId: invitation.mission_id, invitationId: invitation.invitation_id, sequence: invitation.sequence });
      await api(`/i/${encodeURIComponent(token)}/accept`, { method: "POST", body: { auth, candidate_display_label: candidateDisplayLabel } });
      notice("Accepted. Stay here — Faadil can now send the 1 NIM directly to the destination. Your bridge step is complete once FINAL lands.");
    } catch (error) { notice(error.message, true); } finally { setBusy(false); }
  }

  async function declineInvitation(invitation, token) {
    setBusy(true);
    try {
      if (state.demo) { const stored = demoLoad(); stored.invitation.status = "DECLINED"; stored.mission.invitation = stored.invitation; stored.mission.primary_action = "REROUTE"; demoSave(stored); notice("Demo invitation declined. Custody stayed with the current holder."); return; }
      await api(`/i/${encodeURIComponent(token)}/decline`, { method: "POST", body: {} }); notice("Declined. No funds moved and custody did not change.");
    } catch (error) { notice(error.message, true); } finally { setBusy(false); }
  }

  async function renderPass() {
    const missionId = missionIdFromPath();
    try { await loadMission(missionId); } catch (error) { notice(error.message, true); }
    const m = state.mission;
    const inv = m?.invitation || state.invitation;
    const passDeadline = inv?.pass_deadline_at ? Date.parse(inv.pass_deadline_at) : NaN;
    const passWindowExpired = Number.isFinite(passDeadline) && Date.now() >= passDeadline;
    const passReady = inv?.status === "ACCEPTED" && !passWindowExpired;

    if (!passReady) {
      const bridge = inv?.candidate_label || inv?.candidate_display_label || "This bridge";
      const expired = inv?.status === "EXPIRED" || passWindowExpired;
      els.screen.innerHTML = `<button class="back-link" id="back">← Mission Home</button><section class="hero-card"><div class="kicker">Handoff window closed</div><h1 class="target-title">${expired ? "This pass can’t be reused." : "This bridge isn’t ready to receive."}</h1><p class="lede">${expired ? `${esc(bridge)} accepted earlier, but that authorization window has expired.` : "The next bridge must accept before a 1 NIM pass can be authorized."}</p><div class="warning" style="margin-top:16px">No new payment should be requested from this screen. Custody stays with the last verified holder until a fresh supported handoff reaches FINAL.</div><div class="button-row"><button id="mission-return" class="button primary">Return to mission</button><button id="route-return" class="button ghost">Check verified route</button></div></section>`;
      document.querySelector("#back")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(missionId)}`));
      document.querySelector("#mission-return")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(missionId)}`));
      document.querySelector("#route-return")?.addEventListener("click", () => navigate(`/mission/${encodeURIComponent(missionId)}/route`));
      els.screen.focus();
      return;
    }

    els.screen.innerHTML = `<button class="back-link" id="back">← Mission Home</button><section class="hero-card"><div class="kicker">Screen 4 / 5 · Send 1 NIM</div><h1 class="target-title">Bridge accepted. Deliver directly.</h1><p class="lede">Via <strong>${esc(inv?.candidate_label || inv?.candidate_display_label || inv?.accepted_wallet_fingerprint || "Accepted bridge")}</strong> → recipient <strong>${esc(m?.target_label || "Destination")}</strong></p><div class="promise-strip"><div class="promise orange"><span>Value</span><strong>1 NIM</strong><span>100,000 Luna</span></div><div class="promise green"><span>Requested fee</span><strong>0</strong><span>Wallet/network may still refuse</span></div><div class="promise violet"><span>Custody</span><strong>FINAL</strong><span>Never mempool-only</span></div></div><div class="warning" style="margin-top:16px">After a transaction hash is recorded, Carry One will not offer reroute/cancel. The backend must reconcile the claim independently.</div><div class="button-row"><button data-busy-lock="1" id="send" class="button primary">Authorize + Pass 1 NIM</button></div></section>`;
    document.querySelector("#back").addEventListener("click", () => navigate(`/mission/${encodeURIComponent(missionId)}`));
    document.querySelector("#send").addEventListener("click", () => executePass(missionId, inv));
    els.screen.focus();
  }

  async function executePass(missionId, invitation) {
    if (!invitation?.invitation_id) return notice("INVITATION_REQUIRED: no accepted invitation is available for this pass.", true);
    setBusy(true);
    let passPhase = "start";
    try {
      if (state.demo) {
        handoffEvent("verification-pending", { demo: true, status: "PENDING" });
        notice("Demo: simulated direct-delivery verification in progress…");
        await new Promise((r) => setTimeout(r, 2500));
        const stored = demoLoad();
        const bridgeLabel = stored.invitation?.candidate_display_label || stored.invitation?.candidate_label || "Bridge";
        const targetLabel = stored.mission.target_label || "Destination";
        stored.invitation.status = "COMPLETED";
        stored.mission.invitation = stored.invitation;
        stored.mission.sequence = Number(stored.mission.sequence || 0) + 1;
        stored.mission.finalized_hop_count = Number(stored.mission.finalized_hop_count || 0) + 1;
        stored.mission.route = [...(stored.mission.route || []), {
          sequence: stored.mission.sequence,
          from: { display_label: stored.mission.current_holder?.display_label || "Sender", wallet_fingerprint: stored.mission.current_holder?.wallet_fingerprint || "NQ…SENDER" },
          via: { display_label: bridgeLabel, wallet_fingerprint: "NQ…BRIDGE" },
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
        notice(`Demo FINAL: 1 NIM delivered directly to ${targetLabel} via ${bridgeLabel}. No real NIM moved.`);
        await new Promise((r) => setTimeout(r, 500));
        navigate(`/mission/${encodeURIComponent(missionId)}/route`);
        return;
      }
      const sequence = Number(invitation.sequence || state.mission?.sequence + 1 || 1);
      handoffEvent("authorization-requested", { status: "AUTHORIZATION_REQUESTED" });
      notice("Authorizing canonical pass intent…");
       passPhase = "authorize"; passDiagnostic("authorize_started", { sequence });
       const auth = await signedAuth("AUTHORIZE_PASS", { missionId, invitationId: invitation.invitation_id, sequence });
       passPhase = "pass_intent";
      const intent = await api(`/missions/${encodeURIComponent(missionId)}/pass-intent`, { method: "POST", body: { invitation_id: invitation.invitation_id, auth } });
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
      notice("Transaction claimed. Waiting for independent FINAL verification…");
      passPhase = "finality_verification";
      await pollFinality(missionId);
      handoffEvent("final", { status: "FINAL" });
      await new Promise((r) => setTimeout(r, 500));
      navigate(`/mission/${encodeURIComponent(missionId)}/route`);
    } catch (error) {
      const classification = passFailureClass(passPhase, error);
      passDiagnostic("pass_failed", { phase: passPhase, classification });
      handoffEvent("error", { classification });
      notice(error.message, true);
    } finally { setBusy(false); }
  }

  async function pollFinality(missionId) {
    const deadline = Date.now() + 90000;
    let transientFailures = 0;
    while (Date.now() < deadline) {
      try {
        const result = await api(`/missions/${encodeURIComponent(missionId)}/reconcile`, { method: "POST", body: {} });
        transientFailures = 0;
        const status = result?.hop?.status || result?.status || result?.mission?.status;
        handoffEvent("verification-status", { status: String(status || "PENDING") });
        if (status === "FINAL" || status === "CONFIRMED" || result?.mission?.status === "ARRIVED") return result;
      } catch (error) {
        const message = String(error?.message || error || "");
        const retryable = /VERIFICATION_DELAYED|Load failed|Failed to fetch|network|transport|timeout|temporar|connection|offline|unavailable/i.test(message);
        if (!retryable) throw error;
        transientFailures += 1;
        handoffEvent("verification-delayed", { status: "PENDING", transient_failures: transientFailures });
        notice("Verification temporarily unavailable — retrying the independent chain check. Custody has not changed yet. Do not resend 1 NIM.");
      }
      await new Promise((resolve) => setTimeout(resolve, 1800));
    }
    handoffEvent("verification-delayed", { status: "PENDING" });
    throw new Error("VERIFICATION_STILL_PENDING: transaction may still finalize. Re-open this mission to continue reconciliation; do not reroute.");
  }

  async function renderRoute() {
    const missionId = missionIdFromPath(); try { await loadMission(missionId); } catch (error) { notice(error.message, true); }
    const m = state.mission; if (!m) { els.screen.innerHTML = `<section class="card"><h2>Route unavailable</h2><p>Authorized route data could not be loaded.</p></section>`; return; }
    const routeAction = m.primary_action || derivePrimaryAction(m);
    els.screen.innerHTML = `<button class="back-link" id="back">← Mission Home</button><section class="route-card" data-viewer-role="${esc(m.viewer_role || "UNLISTED_VIEWER")}" data-route-status="${esc(m.status)}" data-primary-action="${esc(routeAction || "")}" data-invitation-status="${esc(m.invitation?.status || "")}"><div class="meta-row"><div class="kicker">Screen 5 / 5 · Route / Arrival</div><span class="status-pill ${m.status === "ARRIVED" ? "arrived" : ""}">${esc(m.status)}</span></div><h1 class="target-title">${esc(m.status === "ARRIVED" ? "It made it." : `Toward ${m.target_label}`)}</h1><p class="lede">Only finalized handoffs appear here. Full participant wallets and the private destination wallet are never rendered.</p>${routeMarkup(m.route || [])}<div class="button-row"><button id="refresh" class="button ghost">Refresh verified route</button>${m.status === "ARRIVED" ? `<button id="new" class="button green">Start your own mission</button>` : ""}</div></section>`;
    document.querySelector("#back").addEventListener("click", () => navigate(`/mission/${encodeURIComponent(missionId)}`)); document.querySelector("#refresh").addEventListener("click", () => renderRoute()); document.querySelector("#new")?.addEventListener("click", () => navigate("/create")); els.screen.focus();
  }

  function routeMarkup(route, options = {}) {
    if (!Array.isArray(route) || route.length === 0) return `<div class="empty-route">No FINAL handoff yet. The path starts only after independent verification.</div>`;
    const ordered = route.slice().sort((a, b) => Number(a.sequence) - Number(b.sequence));
    const lastSequence = Number(ordered.at(-1)?.sequence);
    return `<div class="route">${ordered.map((entry) => {
      const bridgeMark = entry.via?.display_label || null;
      const recipient = entry.to?.display_label || entry.to?.wallet_fingerprint || "Destination";
      const who = bridgeMark || "Verified bridge";
      const isCurrentHolder = options.markCurrentHolder === true && Number(entry.sequence) === lastSequence;
      const currentHolderMark = isCurrentHolder ? " · Current holder" : "";
      return `<div class="route-step" data-carrier-mark="${esc(bridgeMark || "")}" data-current-holder="${isCurrentHolder ? "true" : "false"}"><div class="rail"><span class="dot"></span></div><div><strong class="${bridgeMark ? "carrier-mark" : ""}">${esc(who)}</strong><small>Bridge · delivered to ${esc(recipient)} · ${esc(entry.tx_hash_short || "verified tx")} · ${esc(entry.finalized_at ? new Date(entry.finalized_at).toLocaleString() : "FINAL")}${currentHolderMark}</small></div></div>`;
    }).join("")}</div>`;
  }

  route();
})();
