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
  const practiceHandoffEvent = (phase, status) => {
    window.dispatchEvent(new CustomEvent("nimcarry:handoff-phase", {
      detail: { phase, status, demo: true, tour: true },
    }));
  };
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
    open.textContent = "Open practice invite";
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
    practiceHandoffEvent("verification-pending", "PENDING");
    showNotice("PRACTICE — warm wax. Simulating the wait before a verified handoff…");
    await new Promise((resolve) => setTimeout(resolve, 2200));

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
    practiceHandoffEvent("final", "FINAL");
    showNotice(targetReached ? "PRACTICE POSTMARK — destination reached. ARRIVED." : "PRACTICE POSTMARK — the simulated holder changed.");
    await new Promise((resolve) => setTimeout(resolve, 850));
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
    button.textContent = "Carry practice letter to destination";
    button.addEventListener("click", () => {
      writeMeta({ ...readMeta(), autoOpenNextInvite: true });
      history.pushState({}, "", tourPath(`/mission/${encodeURIComponent(demo.mission.mission_id)}`));
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    row.prepend(button);
  }

  function practiceStep() {
    const demo = readDemo();
    const path = location.pathname;
    if (path === "/" || path === "/create") return 1;
    if (/^\/i\//.test(path)) return 3;
    if (/\/pass\/?$/.test(path)) return 4;
    if (/\/route\/?$/.test(path)) return demo?.mission?.status === "ARRIVED" ? 5 : 4;
    if (/^\/mission\//.test(path)) {
      const status = String(demo?.invitation?.status || "");
      if (status === "ACCEPTED") return 4;
      if (Number(demo?.mission?.finalized_hop_count || 0) > 0) return 2;
      return 2;
    }
    return 1;
  }

  function practiceStepCopy(step) {
    return {
      1: ["WRITE", "Write the human reason. No wallet or chain write."],
      2: ["CHOOSE", "Pick one carrier. They still have to consent."],
      3: ["CONSENT", "Practice acceptance is local only; no Nimiq signature is created."],
      4: ["HANDOFF", "Warm wax and postmark are simulated. No NIM moves."],
      5: ["ARRIVAL", "Practice complete. The receipt and postmarks are simulated artifacts."],
    }[step];
  }

  function renderTourGuide() {
    const banner = document.querySelector("#demo-banner");
    if (!banner) return;

    banner.dataset.guided = "1";

    let guide = document.querySelector("#demo-tour-guide");
    if (!guide) {
      guide = document.createElement("section");
      guide.id = "demo-tour-guide";
      guide.className = "demo-tour-guide";
      guide.setAttribute("aria-label", "Guided practice progress");
      banner.insertAdjacentElement("afterend", guide);
    }

    const step = practiceStep();
    const [label, detail] = practiceStepCopy(step);
    guide.dataset.step = String(step);
    guide.innerHTML = `
      <div class="demo-tour-guide-head">
        <span>PRACTICE DESK</span>
        <strong>${step}/5 · ${label}</strong>
        <small>${detail}</small>
      </div>
      <div class="demo-tour-progress" aria-hidden="true">
        ${["Write","Choose","Consent","Handoff","Arrival"].map((name, index) =>
          `<span class="${index + 1 < step ? "done" : index + 1 === step ? "current" : ""}"><b>${index + 1}</b>${name}</span>`
        ).join("")}
      </div>`;
  }

  function enhancePracticeActions() {
    const send = screen.querySelector("#send");
    if (send && send.dataset.demoTourCopy !== "1") {
      send.dataset.demoTourCopy = "1";
      send.textContent = "Run practice handoff";
      const disclosure = screen.querySelector(".clv2-pass-disclosure");
      if (disclosure && !screen.querySelector(".demo-tour-no-nim")) {
        const note = document.createElement("p");
        note.className = "demo-tour-no-nim";
        note.textContent = "Practice only — this button never calls Nimiq Pay and never moves 1 NIM.";
        disclosure.before(note);
      }
    }

    const accept = screen.querySelector("#accept");
    if (accept && accept.dataset.demoTourCopy !== "1") {
      accept.dataset.demoTourCopy = "1";
      accept.textContent = "Practice: accept the letter";
    }
  }

  function renderPracticeCompletion() {
    const demo = readDemo();
    if (demo?.mission?.status !== "ARRIVED" || !/\/route\/?$/.test(location.pathname)) return;
    const card = screen.querySelector(".route-card");
    if (!card || card.querySelector(".demo-tour-complete")) return;
    const complete = document.createElement("section");
    complete.className = "demo-tour-complete";
    complete.setAttribute("role", "status");
    complete.innerHTML = `
      <span>PRACTICE COMPLETE</span>
      <strong>You just rehearsed the full Carried Letter loop.</strong>
      <p>Write → choose → consent → simulated handoff → ARRIVED. No wallet approval, NIM transfer or chain finality occurred in this guided practice.</p>`;
    const receipt = card.querySelector(".clv2-carried-receipt");
    if (receipt) receipt.before(complete);
    else card.appendChild(complete);
  }

  function enhance() {
    renderTourGuide();
    enhancePracticeActions();
    renderPracticeCompletion();
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
