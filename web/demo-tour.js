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
  const setText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };
  const TOUR_STEPS = [
    ["WRITE", "Write the private letter"],
    ["FIRST CARRIER", "Choose one trusted person"],
    ["POSTMARK", "Verify the first handoff"],
    ["DESTINATION", "Carry it to the intended person"],
    ["RECEIPT", "Open the privacy-safe proof"],
  ];

  function currentTourStep() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const demo = readDemo();
    const hops = Number(demo?.mission?.finalized_hop_count || 0);
    if (demo?.mission?.status === "ARRIVED") return 5;
    if (/\/pass$/.test(path)) return hops > 0 ? 4 : 3;
    if (/^\/i\//.test(path)) return hops > 0 ? 4 : 2;
    if (/\/route$/.test(path)) return hops > 0 ? 3 : 1;
    if (path === "/create") return 1;
    if (/^\/mission\//.test(path)) return hops > 0 ? 4 : 2;
    return 1;
  }

  function ensureGuideRail() {
    let rail = document.querySelector("#demo-tour-rail");
    if (!rail) {
      rail = document.createElement("nav");
      rail.id = "demo-tour-rail";
      rail.className = "clv2-demo-tour-rail";
      rail.setAttribute("aria-label", "Guided practice letter progress");
      const list = document.createElement("ol");
      TOUR_STEPS.forEach(([short, label], index) => {
        const item = document.createElement("li");
        item.dataset.step = String(index + 1);
        item.title = label;
        const number = document.createElement("span");
        number.textContent = String(index + 1).padStart(2, "0");
        const name = document.createElement("strong");
        name.textContent = short;
        item.append(number, name);
        list.append(item);
      });
      rail.append(list);
      const banner = document.querySelector("#demo-banner");
      if (banner) banner.after(rail);
    }
    const active = currentTourStep();
    rail?.querySelectorAll("li").forEach((item) => {
      const step = Number(item.dataset.step || 0);
      item.classList.toggle("is-active", step === active);
      item.classList.toggle("is-done", step < active);
      if (step === active) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
  }

  function ensureDemoBrief() {
    if (location.pathname !== "/") return;
    const hero = screen.querySelector(".clv2-home");
    if (!hero || hero.querySelector(".clv2-demo-brief")) return;
    const brief = document.createElement("section");
    brief.className = "clv2-demo-brief";
    brief.innerHTML = "<span>PRACTICE LETTER</span><strong>Two people. Two simulated postmarks. One arrival.</strong><small>No wallet approval, NIM transfer or network write happens in this walkthrough.</small>";
    const actions = hero.querySelector(".button-row");
    if (actions) actions.before(brief);
    else hero.append(brief);
  }

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
    if (missionNote && !missionNote.value) missionNote.value = "I’m looking for a warm introduction to share NimCarry with the Nimiq community.";
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
      if (label) label.value = "Maya";
      if (why) why.value = "You know the Nimiq community and can carry this introduction one step closer.";
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
    if (!field.value) field.value = candidate.label || "Maya";
  }

  function frameInvitation() {
    if (!/^\/i\/[A-Za-z0-9_-]+$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero) return;
    const demo = readDemo();
    const meta = readMeta();
    const hops = Number(demo?.mission?.finalized_hop_count || 0);
    const isDestination = hops > 0;
    const h1 = hero.querySelector("h1");
    const lede = hero.querySelector(".lede");
    const whyCard = [...hero.querySelectorAll(".card")].find((node) => /why/i.test(node.querySelector(".kicker")?.textContent || ""));
    const markLabel = hero.querySelector(".acceptance-display-field");
    const accept = hero.querySelector("#accept");
    const decline = hero.querySelector("#decline");

    if (isDestination) {
      setText(h1, "A letter has been carried to you.");
      if (lede) lede.innerHTML = `Intended for: <strong>${String(meta.targetLabel || demo?.mission?.target_label || "Private destination").replace(/[&<>"']/g, "")}</strong>`;
      setText(whyCard?.querySelector(".kicker"), "Why it was carried here");
      if (markLabel) {
        const first = [...markLabel.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
        if (first) first.textContent = "How should the arrival receipt remember you? ";
      }
      setText(accept, "Receive the letter");
      setText(decline, "Not for me");
    } else {
      setText(h1, "You were chosen to carry this letter.");
      setText(whyCard?.querySelector(".kicker"), "Why you were chosen");
      setText(accept, "Carry this letter");
      setText(decline, "Not this time");
    }
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
    open.textContent = "Open sealed practice invite";
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
    window.dispatchEvent(new CustomEvent("nimcarry:handoff-phase", { detail: { phase: "verification-pending", status: "PENDING", demo: true } }));
    showNotice("PRACTICE — warm wax. Simulated verification is running; custody has not moved.");
    await new Promise((resolve) => setTimeout(resolve, 900));

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
    window.dispatchEvent(new CustomEvent("nimcarry:handoff-phase", { detail: { phase: "final", status: "FINAL", demo: true } }));
    showNotice(targetReached ? "PRACTICE POSTMARK — the letter arrived." : "PRACTICE POSTMARK — the letter is now carried by Maya.");
    await new Promise((resolve) => setTimeout(resolve, 500));
    history.pushState({}, "", tourPath(`/mission/${encodeURIComponent(mission.mission_id)}/route`));
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function enhanceRoute() {
    const routeCard = screen.querySelector(".route-card");
    if (!routeCard) return;
    const demo = readDemo();
    if (!demo?.mission) return;

    if (demo.mission.status === "ARRIVED") {
      if (!routeCard.querySelector(".clv2-demo-finish")) {
        const finish = document.createElement("section");
        finish.className = "clv2-demo-finish";
        finish.innerHTML = "<span>PRACTICE COMPLETE</span><strong>2 simulated postmarks · 0 wallet writes</strong><small>The real product requires Nimiq Pay authorization and independent FINAL verification before custody can move.</small>";
        const receipt = routeCard.querySelector(".wi-receipt");
        if (receipt) receipt.before(finish);
        else routeCard.append(finish);
      }
      return;
    }

    if (routeCard.dataset.demoTour === "1") return;
    routeCard.dataset.demoTour = "1";
    const row = routeCard.querySelector(":scope > .button-row");
    if (!row || row.querySelector("#demo-tour-continue")) return;
    const button = document.createElement("button");
    button.id = "demo-tour-continue";
    button.type = "button";
    button.className = "button primary";
    button.textContent = "Carry the letter to its destination";
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
    badge.textContent = " · CARRIED LETTER WALKTHROUGH";
    banner.appendChild(badge);
  }

  function enhance() {
    addTourBadge();
    ensureGuideRail();
    ensureDemoBrief();
    prefillCreate();
    autoOpenNextInvite();
    prefillInvite();
    prefillAcceptanceMark();
    frameInvitation();
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
