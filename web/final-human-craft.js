(() => {
  "use strict";

  document.body.classList.add("final-human-craft");
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
  const art = (src, cls) => {
    const img = document.createElement("img");
    img.src = src;
    img.className = cls;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.decoding = "async";
    return img;
  };

  function removeLegacyHomeNoise(hero) {
    hero.querySelectorAll(".promise-strip,.wi-scenario,.wi-baton-note,.tw-thesis-line,.mp-audience,.mp-use-cases,.tw-orbit,.tw-route-instrument").forEach((node) => node.remove());
  }

  function home() {
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.hcHome === "1") return;
    const kicker = clean(hero.querySelector(".kicker")?.textContent);
    if (!/destination-bound human routing/i.test(kicker)) return;
    hero.dataset.hcHome = "1";
    hero.classList.add("hc-home");
    removeLegacyHomeNoise(hero);

    const h1 = hero.querySelector("h1");
    if (h1) h1.textContent = "People move opportunity forward.";
    const primer = hero.querySelector(".wi-problem-first");
    if (primer) primer.textContent = "Warm introductions, referrals and opportunities disappear after the first handoff.";
    const lede = hero.querySelector(".lede");
    if (lede) lede.textContent = "Move a warm introduction, referral or opportunity toward one specific person through people who can open the next door.";

    const proof = el("div", "hc-home-proofline");
    ["One destination", "Real people", "Only FINAL moves custody"].forEach((text) => proof.append(el("span", "", text)));

    const useCases = el("div", "hc-use-cases");
    ["Warm introductions", "Referrals", "Opportunities", "Community access"].forEach((text) => useCases.append(el("span", "", text)));

    const story = el("aside", "hc-home-story");
    story.setAttribute("aria-label", "NimCarry human route story");
    story.append(
      el("span", "hc-paper-tag", "Human route"),
      art("/craft-human-route.svg", "hc-home-art"),
      el("p", "hc-script", "Different paths. Same human world."),
      el("p", "hc-home-caption", "The introduction is the valuable thing. Exactly 1 NIM is only the verifiable custody baton underneath the human route.")
    );

    const buttons = hero.querySelector(".button-row");
    if (lede && buttons) lede.after(proof, buttons, useCases, story);
    else hero.append(proof, useCases, story);
  }

  function createMission() {
    if (location.pathname !== "/create") return;
    const card = screen.querySelector(".form-card");
    if (!card || card.dataset.hcCreate === "1") return;
    card.dataset.hcCreate = "1";

    const layout = el("div", "hc-create-layout");
    const preview = el("aside", "hc-create-preview");
    preview.setAttribute("aria-label", "Mission preview");
    preview.append(el("span", "hc-paper-tag", "One destination"), el("h3", "", "A real reason to reach one real person."), el("p", "", "Build the human outcome first. Nimiq Pay supplies the verified baton only when a consenting bridge actually carries it."));

    const slip = el("div", "hc-destination-slip");
    slip.append(el("span", "hc-pin"));
    const copy = el("span");
    const name = el("strong", "", "Your destination");
    const meta = el("small", "", "Private until the route reaches them");
    copy.append(name, meta); slip.append(copy);

    const types = el("div", "hc-preview-type");
    ["Introduction", "Referral", "Opportunity", "Community"].forEach((text) => types.append(el("span", "", text)));
    const note = el("div", "hc-hand-note");
    const noteTitle = el("strong", "", "Why this route matters");
    const noteText = el("span", "", "The note gives each bridge the human reason to keep the introduction moving.");
    note.append(noteTitle, noteText);
    preview.append(slip, types, note);

    card.parentNode.insertBefore(layout, card);
    layout.append(card, preview);

    const target = card.querySelector('input[name="target_label"]');
    const missionNote = card.querySelector('textarea[name="mission_note"]');
    const sync = () => {
      name.textContent = clean(target?.value) || "Your destination";
      noteText.textContent = clean(missionNote?.value) || "The note gives each bridge the human reason to keep the introduction moving.";
    };
    target?.addEventListener("input", sync);
    missionNote?.addEventListener("input", sync);
    sync();
  }

  function person(label, detail, tone = "") {
    const wrap = el("div", `hc-person ${tone}`.trim());
    wrap.append(el("span", "hc-person-face"), el("strong", "", label), el("small", "", detail));
    return wrap;
  }

  function invitation() {
    if (!/^\/i\/[A-Za-z0-9_-]+$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.hcInvite === "1") return;
    hero.dataset.hcInvite = "1";
    hero.classList.add("hc-invitation");

    const destination = clean(hero.querySelector(".lede strong")?.textContent) || "one private destination";
    const whyCard = [...hero.querySelectorAll(".card")].find((card) => /WHY YOU/i.test(clean(card.textContent)));
    const whyText = clean(whyCard?.querySelector("p")?.textContent) || "Your relationship can move this introduction one trusted step closer.";

    const context = el("section", "hc-invite-context");
    context.setAttribute("aria-label", "Human invitation context");
    context.append(person("Current holder", "Asked for your help"), el("span", "hc-invite-arrow", "→"), person("You", "Proposed bridge", "to"));

    const note = el("div", "hc-hand-note hc-invite-note");
    note.append(el("strong", "", `Why you? ${whyText}`), el("span", "", `This route has one destination: ${destination}. Accepting means you consent to participate — it does not move funds.`));

    // The wallet-onboarding card contains its own .button-row. Always anchor to the
    // actual Accept/Decline action row; otherwise moving onboarding after its own
    // descendant creates a HierarchyRequestError and can interrupt invitation UX.
    const buttons = hero.querySelector("#accept")?.closest(".button-row");
    const onboarding = hero.querySelector(".wallet-onboarding-card");
    const lifecycle = hero.querySelector(".wi-lifecycle");
    if (lifecycle) lifecycle.after(context, note);
    else (whyCard || buttons || hero).before(context, note);
    if (buttons && onboarding && !onboarding.contains(buttons)) buttons.after(onboarding);
  }

  function mission() {
    if (!/^\/mission\/[^/]+$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.hcMission === "1") return;
    hero.dataset.hcMission = "1";
    const target = clean(hero.querySelector(".target-title")?.textContent) || "Destination";
    const holder = clean(hero.querySelector(".holder-chip strong")?.textContent) || "Current holder";
    const route = el("section", "hc-mission-route");
    const from = el("div", "from"); from.append(el("strong", "", holder), el("small", "", "last verified holder"));
    const to = el("div", "to"); to.append(el("strong", "", target), el("small", "", "one intended destination"));
    route.append(from, el("span", "hc-route-dash"), to);
    const chip = hero.querySelector(".holder-chip");
    if (chip) chip.before(route); else hero.append(route);
  }

  function pass() {
    if (!/^\/mission\/[^/]+\/pass$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.hcPass === "1") return;
    hero.dataset.hcPass = "1";
    hero.classList.add("hc-pass");

    // The old three-metric transaction strip belonged to the previous visual direction.
    // The selected direction treats this moment as a human custody ritual instead.
    hero.querySelector(".promise-strip")?.remove();
    hero.querySelector(".wi-baton-proof")?.remove();
    const warning = hero.querySelector(".warning");
    if (warning) warning.textContent = "Once a transaction hash exists, the handoff becomes a verification state. NimCarry keeps the last verified holder authoritative until the backend independently confirms FINALity.";

    const image = art("/craft-baton-handoff.svg", "hc-pass-art");
    const ritual = el("section", "hc-pass-ritual");
    [
      ["1", "Confirm the person", "Make sure the accepted bridge in front of you is the person receiving custody."],
      ["2", "Hand off exactly 1 NIM", "The baton records who is carrying the introduction next. It is not a reward."],
      ["3", "Wait for FINAL", "Approval or broadcast is not custody. The route moves only after independent FINALity."],
    ].forEach(([n, title, copy]) => {
      const row = el("div", "hc-pass-step");
      const body = el("span"); body.append(el("strong", "", title), el("small", "", copy));
      row.append(el("b", "", n), body); ritual.append(row);
    });
    const rule = el("div", "hc-proof-rule");
    rule.append(el("span", "hc-stamp ochre", "Approval ≠ custody"), el("span", "hc-stamp", "FINAL = custody"));
    const lede = hero.querySelector(".lede");
    (lede || hero.querySelector("h1") || hero).after(image);
    const ladder = hero.querySelector(".wi-proof-ladder");
    if (ladder) ladder.before(ritual); else image.after(ritual);
    (ladder || ritual).after(rule);
  }

  function route() {
    if (!/^\/mission\/[^/]+\/route$/.test(location.pathname)) return;
    const card = screen.querySelector(".route-card");
    if (!card || card.dataset.hcRoute === "1") return;
    card.dataset.hcRoute = "1";
    const status = clean(card.querySelector(".status-pill")?.textContent);
    if (/ARRIVED/i.test(status)) card.classList.add("hc-route-arrived");

    const steps = [...card.querySelectorAll(".route-step")];
    steps.forEach((step, index) => {
      const strong = step.querySelector("strong");
      if (!strong || step.querySelector(".hc-route-person")) return;
      const avatar = el("span", `hc-route-person${index === steps.length - 1 ? " destination" : ""}`);
      avatar.setAttribute("aria-hidden", "true");
      strong.before(avatar);
    });

    const heading = el("div", "hc-route-heading");
    const copy = el("span");
    copy.append(el("strong", "", /ARRIVED/i.test(status) ? "The introduction reached its person." : "A finite human route in progress."), el("span", "", `${steps.length} verified handoff${steps.length === 1 ? "" : "s"}. Pending activity never rewrites the verified path.`));
    heading.append(copy, el("span", `hc-stamp${/ARRIVED/i.test(status) ? "" : " ochre"}`, /ARRIVED/i.test(status) ? "ARRIVED" : "VERIFIED PATH"));
    const split = card.querySelector(".split");
    (split || card.firstElementChild || card).after(heading);

    if (/ARRIVED/i.test(status)) {
      const moment = el("section", "hc-arrived-moment");
      moment.append(el("span", "hc-stamp", "Human outcome reached"), art("/craft-arrival.svg", "hc-arrival-art"), el("h3", "", "It arrived because people carried it."), el("p", "", "The receipt proves only the finalized route the authorized view can safely reveal. The private destination and full wallet data stay protected."));
      const receipt = card.querySelector(".wi-receipt");
      if (receipt) receipt.before(moment); else card.append(moment);
    }
  }

  function inviteSlip() {
    const link = screen.querySelector(".invite-link");
    const card = link?.closest(".card");
    if (!card || card.dataset.hcSlip === "1") return;
    card.dataset.hcSlip = "1";
    card.querySelector(".kicker")?.after(el("span", "hc-stamp coral", "PRIVATE HUMAN HANDOFF"));
  }

  function apply() {
    queued = false;
    home();
    createMission();
    invitation();
    mission();
    pass();
    route();
    inviteSlip();
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  }
  new MutationObserver(schedule).observe(screen, { childList:true, subtree:true });
  addEventListener("popstate", schedule);
  schedule();
})();
