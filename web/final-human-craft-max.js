(() => {
  "use strict";
  const screen = document.querySelector("#screen");
  if (!screen) return;
  let queued = false;

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const clean = (value) => String(value || "").trim();
  const setText = (node, text) => {
    if (node && clean(node.textContent) !== text) node.textContent = text;
  };
  const findCard = (root, pattern) => [...root.querySelectorAll(".card")].find((card) => pattern.test(clean(card.textContent)));
  const moveInto = (parent, node) => {
    if (parent && node && node.parentElement !== parent) parent.append(node);
  };

  function disclosure(node, summaryText, className) {
    if (!node) return null;
    let details = node.parentElement?.tagName === "DETAILS" && node.parentElement.classList.contains(className)
      ? node.parentElement
      : null;
    if (!details) {
      details = el("details", `hc-progressive ${className}`);
      details.append(el("summary", "", summaryText));
      node.before(details);
      details.append(node);
    }
    if (!details.dataset.responsiveInit) {
      details.open = matchMedia("(min-width: 700px)").matches;
      details.dataset.responsiveInit = "1";
    }
    return details;
  }

  function home() {
    const hero = screen.querySelector(".hc-home");
    if (!hero) return;

    const kicker = hero.querySelector(".kicker");
    const primer = hero.querySelector(".wi-problem-first");
    const h1 = hero.querySelector("h1");
    const lede = hero.querySelector(".lede");
    const proof = hero.querySelector(".hc-home-proofline");
    const buttons = [...hero.querySelectorAll(".button-row")].find((row) => /Create a mission/i.test(clean(row.textContent)));
    const cases = hero.querySelector(".hc-use-cases");
    const story = hero.querySelector(".hc-home-story");
    if (!h1 || !lede || !story) return;

    setText(primer, "Warm introductions disappear after the first handoff.");
    setText(lede, "Move one warm introduction toward one person through trusted human bridges.");

    const proofLabels = ["One destination", "Consenting bridges", "FINAL moves custody"];
    [...(proof?.children || [])].forEach((node, index) => setText(node, proofLabels[index] || clean(node.textContent)));
    const caseLabels = ["Introductions", "Referrals", "Opportunities", "Community"];
    [...(cases?.children || [])].forEach((node, index) => setText(node, caseLabels[index] || clean(node.textContent)));

    const secondary = buttons ? [...buttons.querySelectorAll(".button")].find((button) => /ARRIVED|receipt/i.test(clean(button.textContent))) : null;
    setText(secondary, "Preview receipt");

    setText(story.querySelector(".hc-script"), "Different paths. One human outcome.");
    setText(story.querySelector(".hc-home-caption"), "A trusted bridge makes the introduction. Exactly 1 NIM goes directly to the destination.");

    let stage = hero.querySelector(".hc-max-home-stage");
    let copy = stage?.querySelector(".hc-max-home-copy");
    let storyWrap = stage?.querySelector(".hc-max-home-story");
    if (!stage) {
      stage = el("div", "hc-max-home-stage");
      copy = el("div", "hc-max-home-copy");
      storyWrap = el("div", "hc-max-home-story");
      stage.append(copy, storyWrap);
      hero.append(stage);
    }

    let values = hero.querySelector(".hc-max-value-strip");
    if (!values) {
      values = el("div", "hc-max-value-strip");
      [
        ["Real people", "Relationships carry it."],
        ["One destination", "One intended person."],
        ["FINAL only", "Verified delivery arrives."],
      ].forEach(([title, body]) => {
        const value = el("div", "hc-max-value");
        value.append(el("strong", "", title), el("span", "", body));
        values.append(value);
      });
    }
    const more = disclosure(values, "Why it is verifiable", "hc-home-more");

    // Reparent each node only once. Re-appending already-composed controls on every
    // MutationObserver pass creates a perpetual mutation loop that can interrupt
    // real pointer clicks even though programmatic browser clicks still succeed.
    [kicker, primer, h1, lede, proof, buttons, cases, more].filter(Boolean).forEach((node) => moveInto(copy, node));
    moveInto(storyWrap, story);
    hero.dataset.hcMax = "1";
  }

  function createMission() {
    const card = screen.querySelector(".hc-create-layout .form-card");
    if (!card) return;

    if (!card.querySelector(".hc-max-dossier-label")) {
      const label = el("div", "hc-max-dossier-label");
      label.append(el("b", "", "Mission dossier"), el("span", "", "private · destination-bound"));
      const grid = card.querySelector(".form-grid");
      (grid || card.firstElementChild || card).before(label);
    }

    const intro = findCard(card, /FIRST-TIME DESTINATION/i);
    if (intro) {
      const heading = intro.querySelector("h2,h3,strong");
      if (heading && /No separate NimCarry signup/i.test(clean(heading.textContent))) setText(heading, "No separate NimCarry signup.");
      const body = [...intro.querySelectorAll("p")].find((node) => /wallet identity|email\/password|destination must/i.test(clean(node.textContent)));
      setText(body, "Use a Nimiq wallet as identity — no email/password account. The destination wallet stays private.");
      disclosure(intro, "First time? Set up a Nimiq wallet", "hc-create-help");
    }

    const preview = screen.querySelector(".hc-create-preview");
    if (preview) {
      const introCopy = [...preview.querySelectorAll(":scope > p")][0];
      setText(introCopy, "Human outcome first. 1 NIM is delivered only to the intended destination.");
      const note = preview.querySelector(".hc-hand-note span");
      setText(note, "Give the bridge one clear reason to make the introduction.");
      disclosure(preview, "Preview the mission card", "hc-create-preview-more");
    }
  }

  function invitation() {
    const hero = screen.querySelector(".hc-invitation");
    if (!hero) return;

    let envelope = hero.querySelector(".hc-max-envelope-kicker");
    if (!envelope) envelope = el("div", "hc-max-envelope-kicker", "private human handoff");

    const stepKicker = [...hero.querySelectorAll(".kicker")].find((node) => /STEP 3 OF 5/i.test(clean(node.textContent)));
    const h1 = hero.querySelector("h1");
    const lede = hero.querySelector(".lede");
    const whyCard = findCard(hero, /WHY YOU/i);
    const whyCopy = whyCard ? [...whyCard.querySelectorAll("p")][0] : null;
    setText(whyCopy, "You can move this introduction one trusted step closer.");

    const warning = [...hero.querySelectorAll(".warning")].find((node) => /Accepting does not move funds|current holder sends/i.test(clean(node.textContent)));
    if (warning && !warning.querySelector("a,button")) setText(warning, "Accepting confirms the introduction. The bridge never receives the 1 NIM.");

    const context = hero.querySelector(".hc-invite-context");
    const note = hero.querySelector(".hc-invite-note");
    if (note) {
      setText(note.querySelector("strong"), "Accept = consent, not payment.");
      setText(note.querySelector("span"), "One private destination. The sender pays that destination directly after your consent.");
    }

    const onboarding = hero.querySelector(".wallet-onboarding-card");
    let walletHelp = null;
    if (onboarding) {
      const title = onboarding.querySelector("h2,h3");
      if (title) setText(title, "No NimCarry account needed.");
      const paragraphs = [...onboarding.querySelectorAll("p")];
      const mainCopy = paragraphs.find((node) => /do not need a NimCarry account|Create or connect a Nimiq wallet/i.test(clean(node.textContent)));
      setText(mainCopy, "Connect a Nimiq wallet in Nimiq Pay, then reopen this private invitation.");
      paragraphs.forEach((node) => {
        const text = clean(node.textContent);
        if (/Accept → no funds move/i.test(text)) setText(node, "Accept → no funds move yet.");
        if (/Decline → custody stays/i.test(text)) setText(node, "Decline → no delivery is opened.");
        if (/verified handoff/i.test(text)) setText(node, "FINAL → direct delivery is proven ARRIVED.");
      });
      walletHelp = disclosure(onboarding, "Need a Nimiq wallet?", "hc-wallet-help");
    }

    const actions = [...hero.querySelectorAll(".button-row")].find((row) => /Accept as bridge|Decline/i.test(clean(row.textContent)));

    let grid = hero.querySelector(".hc-max-invite-grid");
    let primary = grid?.querySelector(".hc-max-invite-primary");
    let support = grid?.querySelector(".hc-max-invite-support");
    if (!grid) {
      grid = el("div", "hc-max-invite-grid");
      primary = el("div", "hc-max-invite-primary");
      support = el("div", "hc-max-invite-support");
      grid.append(primary, support);
      const flow = hero.querySelector(".wi-flow");
      (flow || hero.firstElementChild || hero).after(grid);
    }

    [envelope, stepKicker, h1, lede, whyCard, context, warning, actions].filter(Boolean).forEach((node) => moveInto(primary, node));
    [note, walletHelp].filter(Boolean).forEach((node) => moveInto(support, node));
    hero.dataset.hcMax = "1";
  }

  function pass() {
    const hero = screen.querySelector(".hc-pass");
    if (!hero) return;

    const stepKicker = [...hero.querySelectorAll(".kicker")].find((node) => /STEP 4 OF 5/i.test(clean(node.textContent)));
    const h1 = hero.querySelector("h1");
    const lede = hero.querySelector(".lede");
    const image = hero.querySelector(".hc-pass-art");
    const ritual = hero.querySelector(".hc-pass-ritual");
    const steps = [...hero.querySelectorAll(".hc-pass-step")];
    const concise = [
      "The bridge has already consented to make the introduction.",
      "Exactly 1 NIM goes directly to the mission destination, never to the bridge.",
      "Approval is not delivery. Only independent FINAL proves ARRIVED.",
    ];
    steps.forEach((step, index) => setText(step.querySelector("small"), concise[index] || clean(step.querySelector("small")?.textContent)));

    const warning = [...hero.querySelectorAll(".warning")].find((node) => /transaction hash|verification state|FINALity/i.test(clean(node.textContent)));
    if (warning && !warning.querySelector("a,button")) setText(warning, "Approval is not delivery. Only independent FINAL proves the destination received the 1 NIM.");

    const actions = [...hero.querySelectorAll(".button-row")].find((row) => /Send|Pass|NIM/i.test(clean(row.textContent)));
    const rule = hero.querySelector(".hc-proof-rule");
    const ladder = hero.querySelector(".wi-proof-ladder");
    const proofDetails = ladder ? disclosure(ladder, "Why FINAL matters", "hc-proof-details") : null;

    let note = hero.querySelector(".hc-max-ritual-note");
    if (!note) note = el("p", "hc-max-ritual-note", "The human outcome is the reason for the route. 1 NIM only records verified custody.");
    else setText(note, "The human outcome is the reason for the route. 1 NIM only records verified custody.");

    let stage = hero.querySelector(".hc-max-pass-stage");
    let left = stage?.querySelector(".hc-max-pass-story");
    let right = stage?.querySelector(".hc-max-pass-actions");
    if (!stage) {
      stage = el("div", "hc-max-pass-stage");
      left = el("div", "hc-max-pass-story");
      right = el("div", "hc-max-pass-actions");
      stage.append(left, right);
      const flow = hero.querySelector(".wi-flow");
      (flow || hero.firstElementChild || hero).after(stage);
    }

    [stepKicker, h1, lede, image].filter(Boolean).forEach((node) => moveInto(left, node));
    [ritual, warning, actions, rule, note, proofDetails].filter(Boolean).forEach((node) => moveInto(right, node));
    hero.dataset.hcMax = "1";
  }

  function route() {
    const card = screen.querySelector(".route-card");
    if (!card) return;
    const status = clean(card.querySelector(".status-pill")?.textContent);

    // Carried Letter V2 owns the route artifact. Once V2 has converged the
    // legacy route chrome, never recreate the old motto outside the card.
    // Removing any stray copies also makes repeated observer passes idempotent.
    if (card.classList.contains("clv2-route") || card.dataset.clv2Route === "1") {
      screen.querySelectorAll(".hc-max-route-motto").forEach((node) => node.remove());
      return;
    }

    let motto = card.querySelector(".hc-max-route-motto");
    const mottoText = /ARRIVED/i.test(status) ? "Human to human. The introduction made it." : "Different people. One destination. One verified path.";
    if (!motto) {
      motto = el("p", "hc-max-route-motto", mottoText);
      const heading = card.querySelector(".hc-route-heading");
      (heading || card.querySelector(".split") || card).after(motto);
    } else setText(motto, mottoText);

    const headingCopy = card.querySelector(".hc-route-heading span span");
    if (headingCopy && /verified handoff|Pending activity/i.test(clean(headingCopy.textContent))) {
      const count = card.querySelectorAll(".route-step").length;
      setText(headingCopy, `${count} verified handoff${count === 1 ? "" : "s"}. Pending activity never rewrites the path.`);
    }
    const lede = card.querySelector(".lede");
    if (lede && /Only finalized handoffs|Full participant wallets|private destination wallet/i.test(clean(lede.textContent))) {
      setText(lede, "Only finalized handoffs appear here. Private wallet data stays hidden.");
    }
    const arrivedCopy = card.querySelector(".hc-arrived-moment p");
    if (arrivedCopy) setText(arrivedCopy, "Only finalized handoffs are shown. Private wallet data stays hidden.");
  }

  function stripResidualExperimentChrome() {
    screen.querySelectorAll(".tw-orbit,.tw-thesis-line,.tw-route-instrument,.mp-audience,.mp-use-cases").forEach((node) => node.remove());
  }

  function apply() {
    queued = false;
    stripResidualExperimentChrome();
    home();
    createMission();
    invitation();
    pass();
    route();
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  }
  new MutationObserver(schedule).observe(screen, { childList: true, subtree: true });
  addEventListener("popstate", schedule);
  schedule();
})();
