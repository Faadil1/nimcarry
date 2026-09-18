(() => {
  "use strict";

  document.body.classList.add("carried-letter-v2");
  const screen = document.querySelector("#screen");
  if (!screen) return;

  const query = new URLSearchParams(location.search);
  const isDemo = query.get("demo") === "1";
  if (isDemo) document.body.classList.add("carried-letter-v2-demo");

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const text = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };
  const clean = (value) => String(value || "").trim();

  function syncScreenMode() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    let mode = "home";
    if (path === "/create") mode = "create";
    else if (/^\/i\/[A-Za-z0-9_-]+$/.test(path)) mode = "invitation";
    else if (/^\/mission\/[^/]+\/pass$/.test(path)) mode = "pass";
    else if (/^\/mission\/[^/]+\/route$/.test(path)) mode = "route";
    else if (/^\/mission\/[^/]+$/.test(path)) mode = "mission";
    screen.dataset.clv2Screen = mode;
  }

  function setLabelText(label, value) {
    if (!label) return;
    const first = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && clean(node.textContent));
    if (first) first.textContent = value;
    else label.prepend(document.createTextNode(value));
  }

  function globalChrome() {
    const brandSmall = document.querySelector(".brand small");
    text(brandSmall, "A private introduction · carried by people");

    const banner = document.querySelector("#demo-banner");
    if (banner && isDemo) {
      banner.hidden = false;
      text(banner, "PRACTICE DESK — simulated route · no wallet or network writes");
    }

    const footer = document.querySelector(".footer");
    if (footer && footer.dataset.clv2Footer !== "1") {
      footer.dataset.clv2Footer = "1";
      const spans = footer.querySelectorAll("span");
      text(spans[0], "A private introduction, carried by people.");
      text(spans[1], isDemo ? "Practice route · nothing written to chain" : "Verified on Nimiq Pay · TESTNET");
    }
  }

  function letterStage() {
    const stage = el("section", "clv2-letter-stage");
    stage.setAttribute("aria-label", "A private introduction carried from person to person");

    const paper = el("div", "clv2-envelope");
    paper.setAttribute("aria-hidden", "true");
    const flap = el("span", "clv2-envelope-flap");
    const address = el("div", "clv2-address");
    address.append(
      el("small", "", "TO"),
      el("strong", "", "someone you can’t reach"),
      el("span", "", "private until it arrives")
    );
    const seal = el("span", "clv2-seal");
    paper.append(flap, address, seal);

    const chain = el("div", "clv2-human-chain");
    [
      ["You", "write it"],
      ["Someone you trust", "carries it"],
      ["The intended person", "receives it"],
    ].forEach(([name, role], index) => {
      const person = el("div", `clv2-chain-person${index === 2 ? " destination" : ""}`);
      person.append(el("span", "clv2-chain-mark"), el("strong", "", name), el("small", "", role));
      chain.append(person);
      if (index < 2) chain.append(el("span", "clv2-chain-line", "→"));
    });

    const caption = el("p", "clv2-stage-caption", "The introduction is the thing being carried. The network only proves when it truly changes hands.");
    stage.append(paper, chain, caption);
    return stage;
  }

  function home() {
    if (location.pathname !== "/") return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.clv2Home === "1") return;

    const kicker = clean(hero.querySelector(".kicker")?.textContent);
    if (!/destination-bound human routing|private introduction/i.test(kicker)) return;
    hero.dataset.clv2Home = "1";
    hero.classList.add("clv2-home");

    hero.querySelectorAll(
      ".promise-strip,.hc-home-proofline,.hc-use-cases,.hc-home-story,.wi-scenario,.wi-baton-note,.tw-thesis-line,.mp-audience,.mp-use-cases,.tw-orbit,.tw-route-instrument"
    ).forEach((node) => node.remove());

    text(hero.querySelector(".kicker"), "Private introduction · carried by people");
    text(hero.querySelector("h1"), "Get introduced to someone you can’t reach directly.");
    text(
      hero.querySelector(".wi-problem-first"),
      "Warm introductions disappear after the first handoff. NimCarry gives the introduction a visible, consent-based route."
    );
    text(
      hero.querySelector(".lede"),
      "You write it. Someone you trust carries it to someone they trust — until it reaches the one person it was always for."
    );

    const buttons = hero.querySelector(".button-row");
    const create = hero.querySelector("#create-button");
    if (create) text(create, "Write a letter");

    const stage = letterStage();
    const desktopStorySlot = hero.querySelector(".hc-max-home-story");
    if (desktopStorySlot) desktopStorySlot.append(stage);
    else if (buttons) buttons.before(stage);
    else hero.append(stage);

    if (buttons && !hero.querySelector(".clv2-practice-link")) {
      const practice = document.createElement("a");
      practice.className = "clv2-practice-link";
      practice.href = "/?demo=1&tour=1&reset=1";
      practice.textContent = "Watch a letter travel — practice mode →";
      buttons.after(practice);
    }

    if (!hero.querySelector(".clv2-record-disclosure")) {
      const details = el("details", "clv2-record-disclosure");
      const summary = el("summary", "", "How does a handoff become real?");
      const copy = el(
        "p",
        "",
        "An independent record — the Nimiq network — verifies every handover before it counts. The letter never moves on a promise."
      );
      details.append(summary, copy);
      hero.append(details);
    }
  }

  function createMission() {
    if (location.pathname !== "/create") return;
    const card = screen.querySelector(".form-card");
    if (!card || card.dataset.clv2Create === "1") return;
    card.dataset.clv2Create = "1";
    card.classList.add("clv2-write-letter");

    text(card.querySelector(".kicker"), "Write the letter");
    text(card.querySelector("h2"), "Who is this for?");
    text(
      card.querySelector(".lede"),
      "Choose one person who has agreed to be the destination. Their address stays sealed from every carrier."
    );

    const targetLabel = card.querySelector('input[name="target_label"]');
    const targetWallet = card.querySelector('input[name="target_wallet"]');
    const missionNote = card.querySelector('textarea[name="mission_note"]');
    const creatorLabel = card.querySelector('input[name="creator_display_label"]');

    targetLabel?.closest("label")?.classList.add("clv2-compose-human");
    missionNote?.closest("label")?.classList.add("clv2-compose-human");
    creatorLabel?.closest("label")?.classList.add("clv2-compose-human", "clv2-compose-signoff");
    targetWallet?.closest("label")?.classList.add("clv2-compose-technical");

    if (!card.querySelector(".clv2-compose-sheet")) {
      const sheet = el("section", "clv2-compose-sheet");
      sheet.setAttribute("aria-hidden", "true");
      sheet.append(
        el("span", "clv2-compose-sheet-kicker", "PRIVATE LETTER"),
        el("strong", "", "One person. One destination."),
        el("p", "", "Write the human reason first. Delivery details stay sealed underneath."),
        el("span", "clv2-compose-mini-seal")
      );
      const form = card.querySelector("#create-form");
      if (form) form.before(sheet);
    }
    setLabelText(targetLabel?.closest("label"), "Who is the letter for?");
    setLabelText(targetWallet?.closest("label"), "Private destination address");
    setLabelText(missionNote?.closest("label"), "What should they know?");
    setLabelText(creatorLabel?.closest("label"), "Your name (optional)");

    const consent = card.querySelector('input[name="target_consent_confirmed"]')?.closest("label")?.querySelector("span");
    text(consent, "I confirm this person has agreed to be the destination for this letter.");

    const submit = card.querySelector('#create-form button[type="submit"]');
    text(submit, "Seal the letter");

    if (targetWallet && !card.querySelector(".clv2-private-note")) {
      const note = el(
        "p",
        "clv2-private-note",
        "Sealed from every carrier. This address is used privately to know when the letter has truly arrived."
      );
      targetWallet.closest("label")?.after(note);
    }

    if (targetWallet && !card.querySelector(".clv2-delivery-caption")) {
      const caption = el("small", "clv2-delivery-caption", "Delivery detail · required by the real route, hidden from carriers.");
      targetWallet.closest("label")?.before(caption);
    }

    if (submit && !card.querySelector(".clv2-create-truth")) {
      const truth = el("small", "clv2-create-truth", "Sealing creates the private mission. It does not move the 1 NIM handoff.");
      submit.before(truth);
    }
  }

  function invitation() {
    if (!/^\/i\/[A-Za-z0-9_-]+$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.clv2Invitation === "1") return;
    hero.dataset.clv2Invitation = "1";
    hero.classList.add("clv2-invitation");

    text(hero.querySelector(".kicker"), "A private letter reached you");
    const h1 = hero.querySelector("h1");
    if (h1) text(h1, "You were chosen to carry this.");

    const destinationLine = hero.querySelector(".lede");
    const destinationStrong = destinationLine?.querySelector("strong");
    if (destinationLine && destinationStrong) {
      const firstText = [...destinationLine.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (firstText) firstText.textContent = "Trying to reach: ";
    }
    const whyCard = [...hero.querySelectorAll(".card")].find((node) => /why you/i.test(node.querySelector(".kicker")?.textContent || ""));
    if (whyCard) text(whyCard.querySelector(".kicker"), "Why you were chosen");

    const accept = hero.querySelector("#accept");
    const decline = hero.querySelector("#decline");
    if (accept) text(accept, "Accept the letter");
    if (decline) text(decline, "Not this time");

    const signatureField = hero.querySelector(".acceptance-display-field");
    if (signatureField) signatureField.classList.add("clv2-sign-the-back");

    const actionRow = accept?.closest(".button-row");
    if (actionRow && !hero.querySelector(".clv2-consent-truth")) {
      const note = el("details", "clv2-consent-truth");
      note.append(
        el("summary", "", "What does accepting mean?"),
        el(
          "p",
          "",
          "Nimiq Pay authorization is the consent proof. Accepting joins you to this route; it does not move the letter or 1 NIM."
        )
      );
      actionRow.before(note);
    }
  }

  function humanDeadline(value) {
    const raw = clean(value);
    if (!raw) return null;
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) return null;
    const remaining = at.getTime() - Date.now();
    if (remaining <= 0) return "expired";
    const minutes = Math.ceil(remaining / 60000);
    if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? "" : "s"} left`;
    const hours = Math.ceil(minutes / 60);
    return `about ${hours} hour${hours === 1 ? "" : "s"} left`;
  }

  function missionStateCopy(hero) {
    const missionStatus = clean(hero.dataset.missionStatus).toUpperCase();
    const activity = clean(hero.dataset.missionActivity).toUpperCase();
    const invitationStatus = clean(hero.dataset.invitationStatus).toUpperCase();
    const inviteWindow = humanDeadline(hero.dataset.invitationExpiresAt);
    const passWindow = humanDeadline(hero.dataset.passDeadlineAt);

    if (missionStatus === "CANCELLED") {
      return {
        kind: "closed",
        stamp: "CLOSED · NOTHING MOVED",
        title: "This letter was closed before a verified handoff.",
        body: "No later holder was assigned and no verified route history was rewritten.",
        rule: "Closed is not carried.",
      };
    }
    if (activity === "STALLED") {
      return {
        kind: "stalled",
        stamp: "WAITING HERE",
        title: "The letter is still with its last verified holder.",
        body: "The route may be quiet, but NimCarry does not guess progress. Choose the next supported action from this mission.",
        rule: "Silence never moves custody.",
      };
    }
    if (invitationStatus === "EXPIRED") {
      return {
        kind: "expired",
        stamp: "INVITATION EXPIRED",
        title: "The invitation timed out. The letter stayed here.",
        body: "No verified handoff occurred. The current holder can prepare the next invitation without rewriting the route.",
        rule: "Expiry closes an invitation, not custody.",
      };
    }
    if (invitationStatus === "DECLINED") {
      return {
        kind: "declined",
        stamp: "DECLINED · NOTHING MOVED",
        title: "They chose not to carry it.",
        body: "That answer is final for this invitation. The letter stayed with the current verified holder, who can choose someone else.",
        rule: "Decline is consent respected.",
      };
    }
    if (invitationStatus === "WITHDRAWN") {
      return {
        kind: "withdrawn",
        stamp: "INVITATION WITHDRAWN",
        title: "This invitation was closed before a handoff.",
        body: "No verified holder changed. The route can continue from the same current holder.",
        rule: "Withdrawal never rewrites the verified path.",
      };
    }
    if (invitationStatus === "INVITED") {
      return {
        kind: "waiting",
        stamp: "AWAITING A HUMAN",
        title: "The letter is waiting for an answer.",
        body: inviteWindow && inviteWindow !== "expired"
          ? `The invitation is still open — ${inviteWindow}. No NIM moves unless this person explicitly accepts.`
          : "The invitation is still open. No NIM moves unless this person explicitly accepts.",
        rule: "Invitation is not custody.",
      };
    }
    if (invitationStatus === "ACCEPTED") {
      return {
        kind: "accepted",
        stamp: "ACCEPTED · NOT CARRIED",
        title: "They chose to carry it. The handoff has not happened yet.",
        body: passWindow && passWindow !== "expired"
          ? `The consent is on record and the handoff window has ${passWindow}. The 1 NIM seal still belongs to the current holder until FINAL.`
          : "The consent is on record. The 1 NIM seal still belongs to the current holder until FINAL.",
        rule: "Consent enables the handoff; FINAL completes it.",
      };
    }
    return null;
  }

  function mission() {
    if (!/^\/mission\/[^/]+$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.clv2Mission === "1") return;
    hero.dataset.clv2Mission = "1";
    hero.classList.add("clv2-mission");

    const holder = clean(hero.querySelector(".holder-chip strong")?.textContent) || "the last verified holder";
    const route = el("section", "clv2-letter-back");
    route.setAttribute("aria-label", "Verified carrier line");
    route.append(
      el("span", "clv2-letter-back-label", "BACK OF THE LETTER"),
      el("strong", "", "Who has it now"),
      el("p", "", holder),
      el("small", "", "Only independently verified handoffs are inked onto this letter.")
    );
    const chip = hero.querySelector(".holder-chip");
    if (chip) chip.after(route);
    else hero.append(route);

    const acceptedLabel = clean(hero.dataset.acceptedDisplayLabel);
    const invitationStatus = clean(hero.dataset.invitationStatus).toUpperCase();
    if (invitationStatus === "ACCEPTED" && acceptedLabel && !hero.querySelector(".clv2-signed-back")) {
      const signed = el("section", "clv2-signed-back");
      signed.setAttribute("aria-label", `${acceptedLabel} accepted this invitation`);
      signed.append(
        el("span", "clv2-signed-kicker", "SIGNED AFTER NIMIQ AUTHORIZATION"),
        el("strong", "clv2-ink-signature", acceptedLabel),
        el("small", "", "This ink is the human mark on the letter. The signed Nimiq authorization — not the ink — is the consent proof. Custody has not moved.")
      );
      route.after(signed);
    }

    const finalizedCount = Number(hero.dataset.finalizedHopCount || 0);
    const primaryAction = clean(hero.dataset.primaryAction).toUpperCase();
    const invitationStatusForStart = clean(hero.dataset.invitationStatus).toUpperCase();
    if (
      finalizedCount === 0 &&
      primaryAction === "CREATE_INVITATION" &&
      !invitationStatusForStart &&
      !hero.querySelector(".clv2-first-carrier")
    ) {
      const first = el("section", "clv2-first-carrier");
      first.append(
        el("span", "clv2-first-carrier-kicker", "LETTER SEALED"),
        el("strong", "", "Who do you trust to carry it first?"),
        el("p", "", "Choose one person who can move the introduction closer. They still have to say yes before any handoff can begin.")
      );
      const buttons = hero.querySelector(".button-row");
      if (buttons) buttons.before(first);
      else hero.append(first);
      const inviteButton = hero.querySelector("#invite-button");
      if (inviteButton) text(inviteButton, "Choose first carrier");
    }

    const stateCopy = missionStateCopy(hero);
    if (stateCopy && !hero.querySelector(".clv2-route-state")) {
      const panel = el("section", "clv2-route-state");
      panel.dataset.kind = stateCopy.kind;
      panel.setAttribute("role", "status");
      panel.append(
        el("span", "clv2-route-state-stamp", stateCopy.stamp),
        el("strong", "clv2-route-state-title", stateCopy.title),
        el("p", "clv2-route-state-body", stateCopy.body),
        el("small", "clv2-route-state-rule", stateCopy.rule)
      );
      const buttons = hero.querySelector(".button-row");
      if (buttons) buttons.before(panel);
      else hero.append(panel);
    }

    const legacyWarning = [...hero.querySelectorAll(".warning")].find((node) => /route is waiting on its current bridge/i.test(node.textContent || ""));
    if (legacyWarning) legacyWarning.hidden = true;
  }

  function pass() {
    if (!/^\/mission\/[^/]+\/pass$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero) return;

    // Legacy craft observers may run after the first V2 pass. Remove their
    // duplicate explanatory chrome on every reconciliation, not only once.
    hero.querySelectorAll(
      ".hc-pass-art,.hc-pass-ritual,.hc-proof-rule,.hc-max-ritual-note,.hc-proof-details,.wi-proof-ladder"
    ).forEach((node) => node.remove());
    const warning = hero.querySelector(".warning");
    if (warning) warning.hidden = true;

    if (hero.dataset.clv2Pass === "1") return;
    hero.dataset.clv2Pass = "1";
    hero.classList.add("clv2-seal-handoff");

    text(hero.querySelector(".kicker"), "Seal the handover");
    text(hero.querySelector("h1"), "Pass the letter only when it can be proven.");

    const accepted = clean(hero.querySelector(".lede strong")?.textContent) || "accepted carrier";

    const send = hero.querySelector("#send");
    if (send) text(send, "Seal & pass 1 NIM");

    if (send && !hero.querySelector(".clv2-handoff-manifest")) {
      const manifest = el("section", "clv2-handoff-manifest");
      manifest.setAttribute("aria-label", "Handoff slip");
      const seal = el("span", "clv2-manifest-seal");
      seal.setAttribute("aria-hidden", "true");
      const copy = el("div", "clv2-manifest-copy");
      copy.append(
        el("span", "clv2-manifest-kicker", "HANDOFF SLIP"),
        el("strong", "", accepted),
        el("p", "", "Exactly 1 NIM carries custody to this person only after independent FINAL."),
        el("small", "", "Approval can open the handoff. Broadcast can make it observable. Neither changes the holder.")
      );
      const facts = el("div", "clv2-manifest-facts");
      [
        ["SEAL", "1 NIM"],
        ["RECIPIENT", accepted],
        ["HOLDER CHANGES", "ONLY AT FINAL"],
      ].forEach(([label, value]) => {
        const fact = el("span", "clv2-manifest-fact");
        fact.append(el("small", "", label), el("b", "", value));
        facts.append(fact);
      });
      manifest.append(seal, copy, facts);
      send.closest(".button-row")?.before(manifest);
    }

    if (send && !hero.querySelector(".clv2-pass-disclosure")) {
      const details = el("details", "clv2-pass-disclosure");
      details.append(
        el("summary", "", "Why 1 NIM?"),
        el("p", "", "It is the custody seal, not a reward, stake or fee. The human introduction is the reason for the route; Nimiq only gives each finalized handoff a verifiable record.")
      );
      send.closest(".button-row")?.after(details);
    }
  }

  function ensureHandoffScene() {
    const hero = screen.querySelector(".clv2-seal-handoff");
    if (!hero) return null;
    let scene = hero.querySelector(".clv2-wax-scene");
    if (scene) return scene;

    scene = el("section", "clv2-wax-scene");
    scene.hidden = true;
    scene.setAttribute("role", "status");
    scene.setAttribute("aria-live", "polite");

    const object = el("div", "clv2-wax-object");
    const wax = el("span", "clv2-wax-disc");
    const postmark = el("span", "clv2-postmark", isDemo ? "PRACTICE · NOT ON RECORD" : "FINAL · VERIFIED · TESTNET");
    object.append(wax, postmark);

    const copy = el("div", "clv2-wax-copy");
    copy.append(
      el("span", "clv2-wax-kicker", "HANDOVER"),
      el("h2", "clv2-wax-title", "Ready to verify."),
      el("p", "clv2-wax-body", "The letter is still with the last verified holder."),
      el("small", "clv2-wax-truth", "Approval is not custody. Broadcast is not custody. Only FINAL changes the holder.")
    );
    scene.append(object, copy);

    const ready = hero.querySelector(".clv2-ready-seal");
    if (ready) ready.after(scene);
    else hero.querySelector(".button-row")?.before(scene);
    return scene;
  }

  function phaseCopy(phase, status) {
    if (phase === "authorization-requested") {
      return {
        mode: "warm",
        kicker: "AUTHORIZE",
        title: "Authorize the handover.",
        body: "Nimiq Pay is binding this exact handover to you. Nothing has moved yet.",
        truth: "The letter is still yours.",
      };
    }
    if (phase === "authorized") {
      return {
        mode: "warm",
        kicker: "AUTHORIZED · NOT CARRIED",
        title: "Authorized, not carried.",
        body: "Your intent is locked. NimCarry still has no proof that the 1 NIM seal reached the record.",
        truth: "The letter is still yours.",
      };
    }
    if (phase === "wallet-approval-opened") {
      return {
        mode: "warm",
        kicker: "NIMIQ PAY",
        title: "Approve the seal transfer.",
        body: "Nimiq Pay is asking to send exactly 1 NIM. Approval still does not move custody.",
        truth: "The letter is still yours.",
      };
    }
    if (phase === "broadcast-unproven") {
      return {
        mode: "warm",
        kicker: "APPROVED · UNPROVEN",
        title: "Approved, not yet on the record.",
        body: "NimCarry did not receive a transaction reference it can independently verify.",
        truth: "The letter is still yours.",
      };
    }
    if (phase === "provider-reference-returned") {
      return {
        mode: "warm",
        kicker: "REFERENCE RETURNED · NOT FINAL",
        title: "The wax is still warm.",
        body: "Nimiq Pay returned a transaction reference. NimCarry is checking the independent record.",
        truth: "The letter is still yours until independent verification reaches FINAL.",
      };
    }
    if (phase === "broadcast-claim-recorded") {
      return {
        mode: "warm",
        kicker: "REFERENCE RECORDED · VERIFYING",
        title: "The wax is still warm.",
        body: "NimCarry recorded the transaction reference and is checking it independently against the authorized handover.",
        truth: "A recorded reference is not custody. The letter is still yours.",
      };
    }
    if (phase === "verification-pending") {
      return {
        mode: "warm",
        kicker: isDemo ? "PRACTICE VERIFICATION" : "VERIFYING",
        title: "The wax is still warm.",
        body: isDemo
          ? "Practice wax sets on a timer. No real chain write is happening."
          : "The handover is being checked independently. No countdown can make it FINAL.",
        truth: "Custody is unchanged.",
      };
    }
    if (phase === "verification-status") {
      if (/FINAL|CONFIRMED|ARRIVED/i.test(String(status || ""))) {
        return {
          mode: "final",
          kicker: isDemo ? "PRACTICE POSTMARK" : "FINAL · VERIFIED",
          title: "Carried.",
          body: "The postmark landed. The verified holder has changed.",
          truth: isDemo ? "Practice only — not on the record." : "This is the only moment custody moves.",
        };
      }
      if (/INCLUDED/i.test(String(status || ""))) {
        return {
          mode: "warm",
          kicker: "SEEN ON THE RECORD · NOT FINAL",
          title: "Seen, not settled.",
          body: "The handover is included but has not earned its postmark yet.",
          truth: "The letter is still yours.",
        };
      }
      return {
        mode: "warm",
        kicker: "VERIFYING",
        title: "The wax is still warm.",
        body: "NimCarry has a transaction reference, but the independent record has not confirmed it yet.",
        truth: "The letter is still yours.",
      };
    }
    if (phase === "verification-delayed") {
      return {
        mode: "warm",
        kicker: "VERIFICATION DELAYED",
        title: "Still warm. Still yours.",
        body: "Verification is taking longer than usual. NimCarry will not guess.",
        truth: "Do not reroute while this handover may still finalize.",
      };
    }
    if (phase === "final") {
      return {
        mode: "final",
        kicker: isDemo ? "PRACTICE POSTMARK" : "FINAL · VERIFIED",
        title: "Carried.",
        body: "The postmark landed. The verified holder has changed.",
        truth: isDemo ? "Practice only — not on the record." : "This is the only moment custody moves.",
      };
    }
    if (phase === "error") {
      return {
        mode: "error",
        kicker: "NO VERIFIED POSTMARK",
        title: "Nothing moved.",
        body: "This handover did not become a verified custody change.",
        truth: "The letter remains with the last verified holder.",
      };
    }
    return null;
  }

  function renderHandoffPhase(event) {
    const phase = String(event?.detail?.phase || "");
    const status = String(event?.detail?.status || "");
    const model = phaseCopy(phase, status);
    if (!model) return;

    const scene = ensureHandoffScene();
    if (!scene) return;
    scene.hidden = false;
    scene.dataset.phase = phase;
    scene.classList.remove("is-warm", "is-final", "is-error");
    scene.classList.add(`is-${model.mode}`);

    text(scene.querySelector(".clv2-wax-kicker"), model.kicker);
    text(scene.querySelector(".clv2-wax-title"), model.title);
    text(scene.querySelector(".clv2-wax-body"), model.body);
    text(scene.querySelector(".clv2-wax-truth"), model.truth);

    if (model.mode !== "error") {
      const ready = screen.querySelector(".clv2-ready-seal");
      if (ready) ready.hidden = true;
    }
  }

  function enhanceCarriedReceipt(card, arrived, isTargetViewer) {
    if (!arrived) return;
    const receipt = card.querySelector(".wi-receipt");
    if (!receipt || receipt.dataset.clv2Receipt === "1") return;
    receipt.dataset.clv2Receipt = "1";
    receipt.classList.add("clv2-carried-receipt");
    receipt.setAttribute("aria-label", isDemo ? "Practice carried letter receipt" : "Carried letter receipt");

    text(
      receipt.querySelector(".wi-receipt-eyebrow"),
      isDemo ? "PRACTICE CARRIED LETTER · NOT ON RECORD" : "CARRIED LETTER RECEIPT"
    );
    text(receipt.querySelector(".wi-receipt-head h2"), "ARRIVED");

    const statement = receipt.querySelector(".wi-receipt-statement");
    text(
      statement,
      "Every handoff shown here was independently finalized before custody moved. This authorized view never reveals full wallet addresses or private destination data."
    );

    const copyButton = receipt.querySelector(".button-row button");
    if (copyButton) text(copyButton, isDemo ? "Copy practice receipt" : "Copy carried-letter receipt");

    const band = el("div", "clv2-receipt-privacy-band");
    band.append(
      el("span", "", isTargetViewer ? "OPENED BY THE INTENDED DESTINATION" : "PRIVACY-SAFE PROVENANCE"),
      el("small", "", isDemo ? "Practice artifact · simulated handoffs only" : "FINAL handoffs only · scoped to this authorized view")
    );
    const summary = receipt.querySelector(".wi-receipt-summary");
    if (summary) summary.before(band);
    else receipt.prepend(band);
  }

  function route() {
    if (!/^\/mission\/[^/]+\/route$/.test(location.pathname)) return;
    const unavailable = screen.querySelector(".card");
    const unavailableTitle = clean(unavailable?.querySelector("h2")?.textContent);
    if (/route unavailable/i.test(unavailableTitle) && unavailable?.dataset.clv2Error !== "1") {
      unavailable.dataset.clv2Error = "1";
      unavailable.classList.add("clv2-no-letter");
      text(unavailable.querySelector("h2"), "There’s no letter here.");
      text(
        unavailable.querySelector("p"),
        "This link can’t open a verified route. Nothing has moved, and no private route data is being guessed."
      );
      return;
    }

    const card = screen.querySelector(".route-card");
    if (!card) return;

    const status = clean(card.querySelector(".status-pill")?.textContent);
    const arrived = /ARRIVED/i.test(status);
    const viewerRole = clean(card.dataset.viewerRole).toUpperCase();
    const isTargetViewer = arrived && viewerRole === "TARGET";

    if (card.dataset.clv2Route !== "1") {
      card.dataset.clv2Route = "1";
      card.classList.add("clv2-route");

      // Converge older route embellishments into one artifact world.
      card.querySelectorAll(".hc-route-heading,.hc-max-route-motto,.cf-route-heading").forEach((node) => node.remove());

      const steps = [...card.querySelectorAll(".route-step")];
      const metaKicker = card.querySelector(".meta-row .kicker");
      text(metaKicker, "BACK OF THE LETTER · VERIFIED JOURNEY");
      const lede = card.querySelector(".lede");
      text(
        lede,
        steps.length
          ? "Every mark below exists because a handoff reached independent FINAL. Pending activity never writes on this letter."
          : "This side stays blank until the first handoff reaches independent FINAL."
      );

      const ledger = el("section", "clv2-route-ledger-head");
      ledger.setAttribute("aria-label", "Verified journey legend");
      ledger.append(
        el("span", "clv2-route-ledger-kicker", isDemo ? "PRACTICE LETTER BACK" : "LETTER BACK"),
        el("strong", "", steps.length ? `${steps.length} verified handoff${steps.length === 1 ? "" : "s"}` : "No verified handoff yet"),
        el("small", "", isDemo ? "Simulated practice marks · not on record" : "Only FINAL handoffs earn a postmark")
      );
      const routeList = card.querySelector(".route");
      if (routeList) routeList.before(ledger);
      else {
        const buttons = card.querySelector(":scope > .button-row");
        if (buttons) buttons.before(ledger);
        else card.append(ledger);
      }

      steps.forEach((step, index) => {
        step.classList.add("clv2-route-postmark-step");
        step.dataset.sequence = String(index + 1);
        const copy = step.querySelector(":scope > div:last-child");
        if (copy && !step.querySelector(".clv2-hop-stamp")) {
          const stamp = el("span", "clv2-hop-stamp", isDemo ? `PRACTICE ${String(index + 1).padStart(2, "0")}` : `FINAL ${String(index + 1).padStart(2, "0")}`);
          copy.prepend(stamp);
        }
      });
    }

    if (arrived) {
      card.classList.add("clv2-arrived");
      card.classList.toggle("clv2-target-arrival", isTargetViewer);

      const h1 = card.querySelector("h1");
      if (h1) text(h1, isTargetViewer ? "A letter has been carried to you." : "The letter arrived.");

      let close = card.querySelector(".clv2-arrival-close");
      if (!close) {
        // Reuse the already-tested ARRIVED landmark instead of hiding or
        // duplicating it. The judge flow and assistive technologies keep the
        // same stable .hc-arrived-moment surface while V2 changes its language.
        close = card.querySelector(".hc-arrived-moment");
        if (close) {
          close.replaceChildren();
          close.classList.add("clv2-arrival-close");
        } else {
          close = el("section", "clv2-arrival-close");
          const buttons = card.querySelector(":scope > .button-row");
          if (buttons) buttons.before(close);
          else card.append(close);
        }
        close.append(
          el("span", "clv2-broken-seal"),
          el("span", "clv2-arrival-kicker"),
          el("strong", "clv2-arrival-title"),
          el("div", "clv2-arrival-line"),
          el("small", "clv2-arrival-proof")
        );
      }

      text(close.querySelector(".clv2-arrival-kicker"), isTargetViewer ? "FOR YOU · ARRIVED" : "DESTINATION REACHED");
      text(close.querySelector(".clv2-arrival-title"), isTargetViewer ? "This was meant for you." : "It reached the intended person.");
      text(
        close.querySelector(".clv2-arrival-line"),
        isTargetViewer ? "People chose to carry it until it reached you." : "No one was paid. Everyone chose."
      );
      text(
        close.querySelector(".clv2-arrival-proof"),
        isDemo
          ? "Practice arrival — simulated and visibly off-chain."
          : "The seal opens only because the final handoff was independently verified."
      );
    }

    enhanceCarriedReceipt(card, arrived, isTargetViewer);
  }

  function invitationUnavailable() {
    if (!/^\/i\/[A-Za-z0-9_-]+$/.test(location.pathname)) return;
    const card = screen.querySelector(".card");
    const title = clean(card?.querySelector("h2")?.textContent);
    if (!card || !/invitation unavailable/i.test(title) || card.dataset.clv2Unavailable === "1") return;
    card.dataset.clv2Unavailable = "1";
    card.classList.add("clv2-unavailable-letter");
    text(card.querySelector("h2"), "This letter can’t be opened.");
    text(
      card.querySelector("p"),
      "The private invitation may have expired, been withdrawn, or no longer be recognized. Nothing moved because an invitation is never custody."
    );
    const actions = el("div", "button-row");
    const homeLink = document.createElement("a");
    homeLink.className = "button ghost";
    homeLink.href = "/";
    homeLink.textContent = "Back to NimCarry";
    actions.append(homeLink);
    card.append(actions);
  }

  function inviteDialog() {
    const dialog = document.querySelector("#invite-dialog");
    if (!dialog || dialog.dataset.clv2Dialog === "1") return;
    dialog.dataset.clv2Dialog = "1";
    dialog.classList.add("clv2-invite-dialog");
    text(dialog.querySelector(".dialog-kicker"), "Address the next handoff");
    text(dialog.querySelector("h2"), "Who do you trust to carry this one step closer?");

    const candidate = dialog.querySelector("#candidate-label");
    const why = dialog.querySelector("#why-you");
    const wallet = dialog.querySelector("#candidate-wallet");
    setLabelText(candidate?.closest("label"), "Their name or label");
    setLabelText(why?.closest("label"), "Why them?");
    setLabelText(wallet?.closest("label"), "Known Nimiq address (optional)");

    if (why && !dialog.querySelector(".clv2-why-helper")) {
      const helper = el("small", "clv2-why-helper", "Give them enough context to choose freely. This is not an obligation.");
      why.closest("label")?.append(helper);
    }
    if (wallet && !dialog.querySelector(".clv2-wallet-helper")) {
      const helper = el("small", "clv2-wallet-helper", "Only add this if you already know it. Otherwise their Nimiq identity binds when they accept.");
      wallet.closest("label")?.append(helper);
    }

    text(dialog.querySelector("#invite-confirm"), "Seal private invitation");
  }

  function inviteCreatedCard() {
    const link = screen.querySelector(".invite-link");
    const card = link?.closest(".card");
    if (!link || !card || card.dataset.clv2InviteReady === "1") return;
    card.dataset.clv2InviteReady = "1";
    card.classList.add("clv2-invite-ready");
    text(card.querySelector(".kicker"), "SEALED INVITATION");

    const copy = el("div", "clv2-invite-ready-copy");
    copy.append(
      el("strong", "", "Hand this private link to one person."),
      el("p", "", "They can accept or decline. Until they accept — and a later handoff reaches FINAL — the letter stays with its verified holder.")
    );
    link.before(copy);

    const copyButton = card.querySelector("#copy-invite");
    const openNimiq = card.querySelector("#open-nimiq");
    if (copyButton) text(copyButton, "Copy sealed invite");
    if (openNimiq) text(openNimiq, "Open letter in Nimiq Pay");
  }

  function humanizeRecoverableErrors() {
    const notice = document.querySelector("#notice");
    if (!notice || notice.hidden) return;
    const current = clean(notice.dataset.systemMessage || notice.textContent);
    if (!/INVALID_UUID|ROUTE_VIEW_CAPABILITY_(?:INVALID|REQUIRED|EXPIRED)|MISSION_NOT_FOUND/.test(current)) return;
    notice.dataset.systemMessage = current;
    text(notice, "This link can’t open a verified letter. Nothing has moved. Restore authorized access or reopen it from the mission that shared access.");
  }

  function apply() {
    syncScreenMode();
    globalChrome();
    inviteDialog();
    inviteCreatedCard();
    home();
    createMission();
    invitation();
    invitationUnavailable();
    mission();
    pass();
    route();
    humanizeRecoverableErrors();
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  }

  addEventListener("nimcarry:handoff-phase", renderHandoffPhase);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  addEventListener("popstate", schedule);
  schedule();
})();