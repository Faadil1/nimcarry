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
    if (buttons) buttons.before(stage);
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

    const accept = hero.querySelector("#accept");
    const decline = hero.querySelector("#decline");
    if (accept) text(accept, "Accept the letter");
    if (decline) text(decline, "Not this time");

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
  }

  function pass() {
    if (!/^\/mission\/[^/]+\/pass$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.clv2Pass === "1") return;
    hero.dataset.clv2Pass = "1";
    hero.classList.add("clv2-seal-handoff");

    text(hero.querySelector(".kicker"), "Seal the handover");
    text(hero.querySelector("h1"), "Pass the letter only when it can be proven.");
    const warning = hero.querySelector(".warning");
    text(
      warning,
      "The letter stays in your hands until NimCarry independently verifies the handover as FINAL. Approval and broadcast alone never move it."
    );

    const send = hero.querySelector("#send");
    if (send) text(send, "Seal & pass 1 NIM");

    if (send && !hero.querySelector(".clv2-ready-seal")) {
      const seal = el("div", "clv2-ready-seal");
      seal.setAttribute("aria-hidden", "true");
      seal.append(el("span", "clv2-ready-seal-disc"), el("small", "", "ready to hand over"));
      send.closest(".button-row")?.before(seal);
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
    }

    if (arrived) {
      card.classList.add("clv2-arrived");
      card.classList.toggle("clv2-target-arrival", isTargetViewer);

      const h1 = card.querySelector("h1");
      if (h1) text(h1, isTargetViewer ? "A letter has been carried to you." : "The letter arrived.");

      let close = card.querySelector(".clv2-arrival-close");
      if (!close) {
        close = el("section", "clv2-arrival-close");
        close.append(
          el("span", "clv2-broken-seal"),
          el("span", "clv2-arrival-kicker"),
          el("strong", "clv2-arrival-title"),
          el("p", "clv2-arrival-line"),
          el("small", "clv2-arrival-proof")
        );
        const buttons = card.querySelector(":scope > .button-row");
        if (buttons) buttons.before(close);
        else card.append(close);
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

  function inviteDialog() {
    const dialog = document.querySelector("#invite-dialog");
    if (!dialog || dialog.dataset.clv2Dialog === "1") return;
    dialog.dataset.clv2Dialog = "1";
    text(dialog.querySelector(".dialog-kicker"), "Choose the next carrier");
    text(dialog.querySelector("h2"), "Who can carry this one step closer?");
    text(dialog.querySelector("#invite-confirm"), "Prepare private letter");
  }

  function humanizeRecoverableErrors() {
    const notice = document.querySelector("#notice");
    if (!notice || notice.hidden) return;
    const current = clean(notice.textContent);
    if (!/INVALID_UUID|ROUTE_VIEW_CAPABILITY_(?:INVALID|REQUIRED)|MISSION_NOT_FOUND/.test(current)) return;
    notice.dataset.systemMessage = current;
    text(notice, "This link can’t open a verified letter. Nothing has moved. Reopen it from the person or mission that shared access.");
  }

  function apply() {
    globalChrome();
    inviteDialog();
    home();
    createMission();
    invitation();
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