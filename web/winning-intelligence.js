(() => {
  "use strict";

  const screen = document.querySelector("#screen");
  if (!screen) return;

  const query = new URLSearchParams(location.search);
  const demo = query.get("demo") === "1";
  let scheduled = false;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function addProblemFirstPrimer() {
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.wiProblem === "1") return;
    const kicker = hero.querySelector(".kicker");
    const headline = hero.querySelector("h1");
    if (!kicker || !headline || !/Destination-bound human routing/i.test(kicker.textContent || "")) return;

    hero.dataset.wiProblem = "1";
    const primer = node("p", "wi-problem-first", "Warm introductions disappear after the first handoff.");
    headline.before(primer);

    const example = node("div", "wi-scenario");
    const label = node("span", "wi-scenario-label", "Example");
    const copy = node("span", "", "Get an idea to a person you cannot DM directly through people who already know the next bridge.");
    example.append(label, copy);
    const buttons = hero.querySelector(".button-row");
    (buttons || hero).before(example);

    const baton = node("div", "wi-baton-note");
    baton.append(
      node("strong", "", "1 NIM goes to the destination — not the bridge."),
      node("span", "", "The bridge supplies the trusted introduction. After consent, the sender delivers exactly 1 NIM directly to the intended person.")
    );
    (buttons || hero).before(baton);

    if (demo && !hero.querySelector("#wi-preview-receipt")) {
      const preview = node("button", "button ghost", "Preview ARRIVED receipt");
      preview.id = "wi-preview-receipt";
      preview.type = "button";
      preview.addEventListener("click", seedArrivedDemo);
      buttons?.appendChild(preview);
    }
  }

  function routeProgressIndex(card, path) {
    if (path === "/create") return 0;
    if (/^\/c\//.test(path)) return 2;
    if (/^\/i\//.test(path)) return 2;
    if (/\/pass$/.test(path)) return 3;

    const status = String(
      card.dataset.missionStatus ||
      card.dataset.routeStatus ||
      card.querySelector(".status-pill")?.textContent ||
      ""
    ).trim().toUpperCase();

    const invitationStatus = String(card.dataset.invitationStatus || "").trim().toUpperCase();
    const primaryAction = String(card.dataset.primaryAction || "").trim().toUpperCase();
    const destinationClaimStatus = String(card.dataset.destinationClaimStatus || "").trim().toUpperCase();
    const targetWalletBound = String(card.dataset.targetWalletBound || "").trim().toLowerCase() === "true";
    const directClaimFlow = !invitationStatus && targetWalletBound && destinationClaimStatus === "CLAIMED";

    if (status === "ARRIVED") return 4;
    if (/\/route$/.test(path)) {
      if (primaryAction === "PASS_1_NIM" || primaryAction === "SEND_1_NIM" || invitationStatus === "ACCEPTED") return 3;
      if (invitationStatus === "INVITED") return 2;
      if (primaryAction === "SHARE_CLAIM" || primaryAction === "CREATE_INVITATION" || primaryAction === "REROUTE") return 1;
      return 3;
    }

    if (/^\/mission\//.test(path)) {
      // Mission Home is state-driven. Direct Claim stays on the direct send
      // lane even while an existing send is being reconciled in WAIT.
      if (directClaimFlow && primaryAction === "WAIT") return 3;
      if (primaryAction === "PASS_1_NIM" || primaryAction === "SEND_1_NIM" || invitationStatus === "ACCEPTED") return 3;
      if (invitationStatus === "INVITED") return 2;
      return 1;
    }

    return -1;
  }

  function addFiveVerbPath() {
    if (screen.querySelector(".wi-flow")) return;
    const card = screen.querySelector(".hero-card, .form-card, .route-card");
    if (!card) return;
    const path = location.pathname;
    const current = routeProgressIndex(card, path);
    if (current < 0) return;

    // The payment link is the default journey. The introducer lane is shown
    // only once a mission actually uses an introduction.
    const bridgeFlow =
      !/^\/c\//.test(path) &&
      (
        String(card.dataset.invitationStatus || "").trim() !== "" ||
        ["CREATE_INVITATION", "REROUTE", "PASS_1_NIM"].includes(String(card.dataset.primaryAction || "").toUpperCase())
      );
    const labels = bridgeFlow
      ? ["Create", "Introduce", "Accept", "Send", "Arrived"]
      : ["Create", "Share link", "They open it", "Send", "Arrived"];
    const flow = node("div", "wi-flow");
    flow.setAttribute("aria-label", "NimCarry five-step route");
    labels.forEach((label, index) => {
      const item = node("span", `wi-flow-step${index <= current ? " reached" : ""}${index === current ? " current" : ""}`);
      item.append(node("b", "", String(index + 1)), node("span", "", label));
      flow.appendChild(item);
    });
    card.prepend(flow);
  }

  function addPassProof() {
    const card = screen.querySelector(".hero-card");
    if (!card || card.dataset.wiPass === "1") return;
    const kicker = card.querySelector(".kicker");
    if (!kicker || !/Pass 1 NIM/i.test(kicker.textContent || "")) return;
    card.dataset.wiPass = "1";

    screen.querySelectorAll(".warning").forEach((warning) => {
      warning.textContent = warning.textContent.replace(/Carry One/g, "NimCarry");
    });

    const baton = node("div", "wi-baton-proof");
    baton.append(
      node("strong", "", "The 1 NIM is direct delivery."),
      node("span", "", "It is not paid to the bridge. The accepted bridge makes the human connection; the sender pays the destination directly.")
    );

    const ladder = node("div", "wi-proof-ladder");
    [
      ["01", "Bridge consent", "The bridge agrees to make the introduction."],
      ["02", "Direct payment", "The sender authorizes exactly 1 NIM to the destination."],
      ["03", "Independent FINAL", "Only then does NimCarry mark the delivery ARRIVED."],
    ].forEach(([n, title, copy]) => {
      const item = node("div", "wi-proof-step");
      item.append(node("span", "wi-proof-number", n), node("strong", "", title), node("small", "", copy));
      ladder.appendChild(item);
    });

    const buttons = card.querySelector(".button-row");
    (buttons || card).before(baton, ladder);
  }

  function addInvitationLifecycle() {
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.wiInvite === "1") return;
    const title = hero.querySelector("h1");
    if (!title || !/next bridge/i.test(title.textContent || "")) return;
    hero.dataset.wiInvite = "1";

    const lifecycle = node("div", "wi-lifecycle");
    lifecycle.append(
      node("strong", "", "What happens if you act?"),
      node("span", "", "Accept → no funds move yet."),
      node("span", "", "Decline → no delivery is opened."),
      node("span", "", "Accept → the sender can deliver 1 NIM directly to the destination; FINAL proves ARRIVED.")
    );
    const buttons = hero.querySelector(".button-row");
    (buttons || hero).before(lifecycle);
  }

  function enhancePrivateInviteSharing() {
    const inviteLink = screen.querySelector(".invite-link");
    if (!inviteLink) return;
    const card = inviteLink.closest(".card");
    if (!card || card.dataset.wiShare === "1") return;
    card.dataset.wiShare = "1";

    const note = node("p", "wi-private-note", "This private invite is the acquisition loop: one real bridge enters because they are needed for the mission, not because of a referral reward.");
    inviteLink.before(note);

    const row = card.querySelector(".button-row");
    if (!row) return;
    const share = node("button", "button ghost", "Share privately");
    share.type = "button";
    share.addEventListener("click", async () => {
      const url = (inviteLink.textContent || "").trim();
      try {
        if (navigator.share) await navigator.share({ title: "NimCarry bridge invitation", text: "You were chosen as the next human bridge for a private NimCarry mission.", url });
        else await navigator.clipboard.writeText(url);
      } catch (error) {
        if (error?.name !== "AbortError") console.warn("NimCarry private share failed", error);
      }
    });
    row.appendChild(share);
  }

  function buildRouteReceipt() {
    const routeCard = screen.querySelector(".route-card");
    if (!routeCard || routeCard.dataset.wiReceipt === "1") return;
    const status = routeCard.querySelector(".status-pill");
    if (!status) return;

    if (!/ARRIVED/i.test(status.textContent || "")) {
      routeCard.dataset.wiReceipt = "pending";

      // A zero-hop route has no `.route` element. The previous fallback used
      // `routeCard.after(note)`, which placed the note outside the card. When
      // the screen re-rendered, the enhancer could not find that detached note
      // and appended another one. Remove any stale detached copies first, then
      // keep the single canonical note inside the current route card.
      screen.querySelectorAll(".wi-finality-note").forEach((note) => {
        if (!routeCard.contains(note)) note.remove();
      });

      if (!routeCard.querySelector(".wi-finality-note")) {
        const note = node("div", "wi-finality-note");
        note.append(node("strong", "", "Only FINAL delivery counts."), node("span", "", "A pending transaction never proves that the destination received the 1 NIM."));
        const route = routeCard.querySelector(".route");
        const buttons = routeCard.querySelector(":scope > .button-row");
        if (route) route.after(note);
        else if (buttons) routeCard.insertBefore(note, buttons);
        else routeCard.appendChild(note);
      }
      return;
    }

    // If a pending route becomes ARRIVED without a full page replacement,
    // remove the pending-only note before composing the verified receipt.
    screen.querySelectorAll(".wi-finality-note").forEach((note) => note.remove());

    routeCard.dataset.wiReceipt = "1";
    const steps = [...routeCard.querySelectorAll(".route-step")];
    const receipt = node("section", "wi-receipt");
    receipt.setAttribute("aria-label", "Verified Route Receipt");

    const head = node("div", "wi-receipt-head");
    const left = node("div", "");
    left.append(node("span", "wi-receipt-eyebrow", demo ? "DEMO RECEIPT" : "VERIFIED ROUTE RECEIPT"), node("h2", "", "ARRIVED"));
    head.append(left, node("span", "wi-arrived-seal", "✓"));
    receipt.appendChild(head);

    const summary = node("div", "wi-receipt-summary");
    summary.append(
      receiptMetric(String(steps.length), steps.length === 1 ? "verified delivery" : "verified deliveries"),
      receiptMetric("1 NIM", "direct to destination"),
      receiptMetric("FINAL", "arrival proof")
    );
    receipt.appendChild(summary);

    const routeList = node("div", "wi-receipt-route");
    if (steps.length === 0) {
      routeList.appendChild(node("p", "", "No finalized hop details are visible in this authorized view."));
    } else {
      steps.forEach((step) => {
        const item = node("div", "wi-receipt-hop");
        const carrierMark = step.dataset.carrierMark || "";
        const who = (step.querySelector("strong")?.textContent || "Direct delivery").trim();
        const detail = (step.querySelector("small")?.textContent || "FINAL").trim();
        item.append(node("strong", carrierMark ? "wi-carrier-mark" : "", who), node("small", "", detail));
        routeList.appendChild(item);
      });
    }
    receipt.appendChild(routeList);

    const statement = node("p", "wi-receipt-statement", "Each displayed row is a destination delivery that reached independent FINAL. When an introducer appears, they supplied consent and context — never custody. Private destination wallet data stays hidden from this receipt.");
    receipt.appendChild(statement);

    const actions = node("div", "button-row");
    const copy = node("button", "button ghost", "Copy receipt summary");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      const lines = [
        "NimCarry — ARRIVED",
        `${steps.length} verified FINAL handoff${steps.length === 1 ? "" : "s"}`,
        "1 NIM custody baton per handoff",
        ...steps.map((step) => `${(step.querySelector("strong")?.textContent || "Direct delivery").trim()} — ${(step.querySelector("small")?.textContent || "FINAL").trim()}`),
      ];
      try { await navigator.clipboard.writeText(lines.join("\n")); } catch (error) { console.warn("NimCarry receipt copy failed", error); }
    });
    actions.appendChild(copy);
    receipt.appendChild(actions);

    const existingButtons = routeCard.querySelector(":scope > .button-row");
    if (existingButtons) routeCard.insertBefore(receipt, existingButtons);
    else routeCard.appendChild(receipt);
  }

  function receiptMetric(value, label) {
    const metric = node("div", "wi-receipt-metric");
    metric.append(node("strong", "", value), node("span", "", label));
    return metric;
  }

  function seedArrivedDemo() {
    const now = Date.now();
    const missionId = `demo-arrived-${now}`;
    const mission = {
      mission_id: missionId,
      status: "ARRIVED",
      activity: "TERMINAL",
      target_label: "A person you could not reach directly",
      mission_note: "A warm introduction carried one verified human bridge at a time.",
      sequence: 2,
      finalized_hop_count: 2,
      current_holder: { display_label: "Destination", wallet_fingerprint: "NQ…DEST", is_viewer: false },
      invitation: { invitation_id: `demo-invite-${now}`, mission_id: missionId, sequence: 2, status: "COMPLETED", candidate_label: "Destination" },
      route: [
        {
          sequence: 1,
          from: { display_label: "Creator", wallet_fingerprint: "NQ…A" },
          to: { display_label: "Bridge B", wallet_fingerprint: "NQ…B" },
          finalized_at: new Date(now - 45_000).toISOString(),
          tx_hash_short: "demo-A…B",
        },
        {
          sequence: 2,
          from: { display_label: "Bridge B", wallet_fingerprint: "NQ…B" },
          to: { display_label: "Destination", wallet_fingerprint: "NQ…C" },
          finalized_at: new Date(now - 10_000).toISOString(),
          tx_hash_short: "demo-B…C",
        },
      ],
      viewer_role: "OBSERVER",
      primary_action: "VIEW_ROUTE",
    };
    localStorage.setItem("carryone.demo", JSON.stringify({ mission, invitation: mission.invitation }));
    history.pushState({}, "", `/mission/${encodeURIComponent(missionId)}/route?demo=1`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function apply() {
    scheduled = false;
    addProblemFirstPrimer();
    addFiveVerbPath();
    addPassProof();
    addInvitationLifecycle();
    enhancePrivateInviteSharing();
    buildRouteReceipt();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  new MutationObserver(schedule).observe(screen, { childList: true, subtree: true });
  addEventListener("popstate", schedule);
  schedule();
})();
