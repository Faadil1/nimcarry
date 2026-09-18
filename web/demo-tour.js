(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  if (params.get("demo") !== "1" || params.get("tour") !== "1") return;

  const DEMO_KEY = "carryone.demo";
  const META_KEY = "nimcarry.demoTour";
  const notice = document.querySelector("#notice");
  const screen = document.querySelector("#screen");
  const inviteDialog = document.querySelector("#invite-dialog");
  if (!screen) return;

  if (params.get("reset") === "1") {
    localStorage.removeItem(DEMO_KEY);
    sessionStorage.removeItem(META_KEY);
    params.delete("reset");
    history.replaceState({}, "", `${location.pathname}?${params.toString()}`);
  }

  const readMeta = () => {
    try { return JSON.parse(sessionStorage.getItem(META_KEY) || "{}"); } catch { return {}; }
  };
  const writeMeta = (value) => sessionStorage.setItem(META_KEY, JSON.stringify(value));
  const readDemo = () => {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "null"); } catch { return null; }
  };
  const writeDemo = (value) => localStorage.setItem(DEMO_KEY, JSON.stringify(value));
  const showNotice = (text) => {
    if (!notice) return;
    notice.textContent = text;
    notice.hidden = !text;
    notice.classList.remove("error");
  };
  const sameText = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const tourPath = (path) => {
    const url = new URL(path, location.origin);
    url.searchParams.set("demo", "1");
    url.searchParams.set("tour", "1");
    return `${url.pathname}${url.search}${url.hash}`;
  };

  function prefillCreate() {
    const form = screen.querySelector("#create-form");
    if (!form || form.dataset.demoTour === "1") return;
    form.dataset.demoTour = "1";
    const targetLabel = form.elements.target_label;
    const targetWallet = form.elements.target_wallet;
    const missionNote = form.elements.mission_note;
    const creator = form.elements.creator_display_label;
    const consent = form.elements.target_consent_confirmed;
    if (targetLabel && !targetLabel.value) targetLabel.value = "Nimiq Community Lead";
    if (targetWallet && !targetWallet.value) targetWallet.value = "NQDEMO_TARGET_0001";
    if (missionNote && !missionNote.value) missionNote.value = "I want this idea to reach someone who can connect it to the right Nimiq builders.";
    if (creator && !creator.value) creator.value = "Faadil";
    if (consent) consent.checked = true;
  }

  function captureCreate(event) {
    const form = event.target.closest?.("#create-form");
    if (!form) return;
    const data = new FormData(form);
    writeMeta({
      ...readMeta(),
      targetLabel: String(data.get("target_label") || "Destination"),
      targetWallet: String(data.get("target_wallet") || ""),
      creatorLabel: String(data.get("creator_display_label") || "You"),
      startedAt: Date.now(),
    });
  }

  function prefillInvite() {
    if (!inviteDialog?.open || inviteDialog.dataset.demoTourFilled === "1") return;
    inviteDialog.dataset.demoTourFilled = "1";
    const demo = readDemo();
    const meta = readMeta();
    const hops = Number(demo?.mission?.finalized_hop_count || 0);
    const label = inviteDialog.querySelector("#candidate-label");
    const why = inviteDialog.querySelector("#why-you");
    const wallet = inviteDialog.querySelector("#candidate-wallet");

    if (hops === 0) {
      if (label) label.value = "Bridge B";
      if (why) why.value = "You know someone closer to the destination.";
      if (wallet) wallet.value = "NQDEMO_BRIDGE_0001";
    } else {
      if (label) label.value = meta.targetLabel || demo?.mission?.target_label || "Destination";
      if (why) why.value = "You are the destination this route was trying to reach.";
      if (wallet) wallet.value = meta.targetWallet || "NQDEMO_TARGET_0001";
    }
  }

  function captureInvite(event) {
    const button = event.target.closest?.("#invite-confirm");
    if (!button) return;
    writeMeta({
      ...readMeta(),
      pendingCandidate: {
        label: document.querySelector("#candidate-label")?.value?.trim() || "Bridge",
        wallet: document.querySelector("#candidate-wallet")?.value?.trim() || "",
      },
    });
    if (inviteDialog) delete inviteDialog.dataset.demoTourFilled;
  }

  function prefillAcceptanceMark() {
    const field = screen.querySelector("#candidate-display-label");
    if (!field || field.dataset.demoTourFilled === "1") return;
    field.dataset.demoTourFilled = "1";
    const meta = readMeta();
    const candidate = meta.pendingCandidate || {};
    if (!field.value) field.value = candidate.label || "Bridge B";
  }

  function enhanceInviteCard() {
    const link = screen.querySelector(".invite-link");
    if (!link || screen.querySelector("#demo-tour-open-invite")) return;
    const raw = (link.textContent || "").trim();
    if (!raw) return;
    let url;
    try { url = new URL(raw, location.origin); } catch { return; }
    url.searchParams.set("demo", "1");
    url.searchParams.set("tour", "1");
    link.textContent = url.toString();

    const row = link.closest(".card")?.querySelector(".button-row");
    if (!row) return;
    const open = document.createElement("button");
    open.id = "demo-tour-open-invite";
    open.type = "button";
    open.className = "button primary";
    open.textContent = "Open demo invite";
    open.addEventListener("click", () => { location.href = url.toString(); });
    row.prepend(open);
  }

  function keepTourBrowserOnly() {
    document.querySelectorAll('a[href^="nimiqpay://"]').forEach((link) => {
      link.hidden = true;
      link.setAttribute("aria-hidden", "true");
      link.tabIndex = -1;
    });
  }

  function autoOpenNextInvite() {
    const meta = readMeta();
    if (!meta.autoOpenNextInvite) return;
    const demo = readDemo();
    if (!demo?.mission || demo.mission.status === "ARRIVED") return;
    const path = location.pathname.replace(/\/+$/, "");
    const expected = `/mission/${encodeURIComponent(demo.mission.mission_id)}`;
    if (path !== expected) return;
    const button = screen.querySelector("#invite-button");
    if (!button) return;

    const nextMeta = { ...meta };
    delete nextMeta.autoOpenNextInvite;
    writeMeta(nextMeta);
    button.click();
  }

  async function simulatePass(event) {
    const button = event.target.closest?.("#send");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const stored = readDemo();
    if (!stored?.mission || !stored?.invitation) {
      showNotice("Demo state is incomplete. Restart the guided demo.");
      return;
    }

    const meta = readMeta();
    const candidate = meta.pendingCandidate || {};
    const mission = stored.mission;
    const invitation = stored.invitation;
    const previous = mission.current_holder || { display_label: meta.creatorLabel || "Previous holder", wallet_fingerprint: "NQ…DEMO" };
    const nextSequence = Number(mission.sequence || 0) + 1;
    const targetReached = Boolean(
      (candidate.wallet && meta.targetWallet && sameText(candidate.wallet, meta.targetWallet)) ||
      (candidate.label && meta.targetLabel && sameText(candidate.label, meta.targetLabel))
    );

    button.disabled = true;
    showNotice("DEMO — wallet approved. Verifying independent finality…");
    await new Promise((resolve) => setTimeout(resolve, 450));

    invitation.status = "COMPLETED";
    mission.invitation = invitation;
    mission.sequence = nextSequence;
    mission.finalized_hop_count = Number(mission.finalized_hop_count || 0) + 1;
    mission.route = [...(mission.route || []), {
      sequence: nextSequence,
      from: {
        display_label: previous.display_label || "Previous holder",
        wallet_fingerprint: previous.wallet_fingerprint || "NQ…OLD",
      },
      to: {
        display_label: candidate.label || invitation.candidate_label || (targetReached ? meta.targetLabel : "Bridge"),
        wallet_fingerprint: candidate.wallet ? `${candidate.wallet.slice(0, 7)}…${candidate.wallet.slice(-5)}` : "NQ…DEMO",
      },
      finalized_at: new Date().toISOString(),
      tx_hash_short: targetReached ? "demo-B…C" : "demo-A…B",
    }];
    mission.current_holder = {
      display_label: candidate.label || invitation.candidate_label || (targetReached ? meta.targetLabel : "Bridge"),
      wallet_fingerprint: candidate.wallet ? `${candidate.wallet.slice(0, 7)}…${candidate.wallet.slice(-5)}` : "NQ…DEMO",
      is_viewer: false,
    };

    if (targetReached) {
      mission.status = "ARRIVED";
      mission.activity = "TERMINAL";
      mission.primary_action = "VIEW_ROUTE";
    } else {
      mission.status = "ACTIVE";
      mission.activity = "ACTIVE";
      mission.primary_action = "CREATE_INVITATION";
    }

    writeDemo({ mission, invitation });
    showNotice(targetReached ? "DEMO FINAL — destination reached. ARRIVED." : "DEMO FINAL — custody moved to Bridge B.");
    await new Promise((resolve) => setTimeout(resolve, 300));
    history.pushState({}, "", tourPath(`/mission/${encodeURIComponent(mission.mission_id)}/route`));
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function enhanceRoute() {
    const routeCard = screen.querySelector(".route-card");
    if (!routeCard || routeCard.dataset.demoTour === "1") return;
    routeCard.dataset.demoTour = "1";
    const demo = readDemo();
    if (!demo?.mission || demo.mission.status === "ARRIVED") return;
    const row = routeCard.querySelector(":scope > .button-row");
    if (!row || row.querySelector("#demo-tour-continue")) return;
    const button = document.createElement("button");
    button.id = "demo-tour-continue";
    button.type = "button";
    button.className = "button primary";
    button.textContent = "Continue demo to destination";
    button.addEventListener("click", () => {
      writeMeta({ ...readMeta(), autoOpenNextInvite: true });
      history.pushState({}, "", tourPath(`/mission/${encodeURIComponent(demo.mission.mission_id)}`));
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    row.prepend(button);
  }

  function addTourBadge() {
    if (document.querySelector("#demo-tour-badge")) return;
    const banner = document.querySelector("#demo-banner");
    if (!banner) return;
    const badge = document.createElement("span");
    badge.id = "demo-tour-badge";
    badge.textContent = " · GUIDED 1→5 TOUR";
    banner.appendChild(badge);
  }

  function enhance() {
    addTourBadge();
    prefillCreate();
    autoOpenNextInvite();
    prefillInvite();
    prefillAcceptanceMark();
    enhanceInviteCard();
    keepTourBrowserOnly();
    enhanceRoute();
  }

  document.addEventListener("submit", captureCreate, true);
  document.addEventListener("click", captureInvite, true);
  document.addEventListener("click", simulatePass, true);
  new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
  enhance();
})();
