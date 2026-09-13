(() => {
  "use strict";

  document.body.classList.add("approved-craft");
  const screen = document.querySelector("#screen");
  if (!screen) return;
  let scheduled = false;

  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  };
  const clean = (value) => String(value || "").trim();

  function person(label, detail = "Human bridge", tone = "") {
    const wrap = node("div", `cf-person${tone ? ` ${tone}` : ""}`);
    const portrait = node("span", "cf-person-portrait");
    portrait.setAttribute("aria-hidden", "true");
    wrap.append(portrait, node("strong", "", label), node("small", "", detail));
    return wrap;
  }

  function humanRoute({ origin = "You", middle = "Trusted bridge", destination = "Destination", destinationDetail = "One intended person" } = {}) {
    const route = node("section", "cf-human-route");
    route.setAttribute("aria-label", `Human route from ${origin} through ${middle} to ${destination}`);
    route.append(
      person(origin, "Starts the introduction"),
      person(middle, "Consents to carry it"),
      person(destination, destinationDetail),
      node("span", "cf-baton")
    );
    return route;
  }

  function addHomeCraft() {
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.cfHome === "1") return;
    const kicker = clean(hero.querySelector(".kicker")?.textContent);
    if (!/Destination-bound human routing/i.test(kicker)) return;
    hero.dataset.cfHome = "1";
    hero.classList.add("cf-home");

    const headline = hero.querySelector("h1");
    if (headline) headline.textContent = "People move opportunity forward.";
    const lede = hero.querySelector(".lede");
    if (lede) lede.textContent = "Turn a warm introduction, referral or opportunity into one finite human route toward the person you actually need to reach.";

    const manifesto = node("aside", "cf-home-manifesto");
    const label = node("span", "cf-paper-label", "Human route");
    const line = node("div", "cf-home-line");
    line.append("One destination. ", node("em", "", "Real people."), " A route you can follow.");
    const caption = node("p", "cf-home-caption", "NimCarry keeps the people primary. Exactly 1 NIM is the custody baton that records who carries the introduction next — only after FINAL.");
    const route = humanRoute({ origin: "Creator", middle: "Bridge", destination: "Person to reach", destinationDetail: "Route ends here" });
    const note = node("div", "cf-torn-note");
    note.append(node("strong", "", "Warm introductions should not disappear into DMs."), node("span", "", "Each consenting handoff leaves one truthful, privacy-safe route consequence."));
    manifesto.append(label, line, caption, route, note);

    const buttons = hero.querySelector(".button-row");
    if (buttons) buttons.before(manifesto);
    else hero.append(manifesto);
  }

  function addCreateCraft() {
    if (location.pathname !== "/create") return;
    const formCard = screen.querySelector(".form-card");
    if (!formCard || formCard.dataset.cfCreate === "1") return;
    formCard.dataset.cfCreate = "1";
    formCard.classList.add("cf-create");

    const layout = node("div", "cf-create-layout");
    const preview = node("aside", "cf-mission-preview");
    preview.setAttribute("aria-label", "Live mission preview");
    preview.append(node("span", "cf-paper-label", "Mission preview"), node("h3", "", "One person. One reason to reach them."), node("p", "", "The route exists for the human outcome first. Nimiq supplies the verifiable custody baton underneath."));

    const destination = node("div", "cf-preview-destination");
    const pin = node("span", "cf-preview-pin");
    pin.append(node("span", "", "•"));
    const destinationCopy = node("span");
    const destinationName = node("strong", "", "Your destination");
    const destinationMeta = node("small", "", "Private until the route reaches them");
    destinationCopy.append(destinationName, destinationMeta);
    destination.append(pin, destinationCopy);

    const note = node("div", "cf-torn-note");
    const noteTitle = node("strong", "", "Why it matters");
    const noteCopy = node("span", "", "Your message becomes the reason trusted people choose to carry this route.");
    note.append(noteTitle, noteCopy);

    const principles = node("div", "cf-preview-principles");
    ["One destination", "Explicit consent", "FINAL = custody"].forEach((text) => principles.append(node("span", "", text)));
    preview.append(destination, note, principles);

    formCard.parentNode.insertBefore(layout, formCard);
    layout.append(formCard, preview);

    const target = formCard.querySelector('input[name="target_label"]');
    const missionNote = formCard.querySelector('textarea[name="mission_note"]');
    const update = () => {
      destinationName.textContent = clean(target?.value) || "Your destination";
      noteCopy.textContent = clean(missionNote?.value) || "Your message becomes the reason trusted people choose to carry this route.";
    };
    target?.addEventListener("input", update);
    missionNote?.addEventListener("input", update);
    update();
  }

  function addInvitationCraft() {
    if (!/^\/i\/[A-Za-z0-9_-]+$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.cfInvite === "1") return;
    hero.dataset.cfInvite = "1";
    hero.classList.add("cf-invitation");

    const destination = clean(hero.querySelector(".lede strong")?.textContent) || "Private destination";
    const whyCard = [...hero.querySelectorAll(".card")].find((card) => /WHY YOU/i.test(clean(card.textContent)));
    const whyText = clean(whyCard?.querySelector("p")?.textContent) || "Your relationship can move this introduction one trusted step closer.";

    const route = node("section", "cf-invite-route");
    route.setAttribute("aria-label", "Invitation relationship context");
    const from = person("Current holder", "Asked for your help");
    const to = person("You", "Proposed next bridge");
    route.append(from, node("span", "cf-invite-arrow", "→"), to);

    const note = node("div", "cf-torn-note");
    note.append(node("strong", "", `Why you? ${whyText}`), node("span", "", `The route has one destination: ${destination}. Accepting is consent to participate — not consent to a payment.`));

    const rule = hero.querySelector(".tw-invite-rule");
    if (rule) rule.before(route, note);
    else (whyCard || hero.querySelector(".button-row") || hero).before(route, note);
  }

  function addMissionCraft() {
    if (!/^\/mission\/[^/]+$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.cfMission === "1") return;
    hero.dataset.cfMission = "1";
    hero.classList.add("cf-mission");

    const target = clean(hero.querySelector(".target-title")?.textContent) || "Destination";
    const holder = clean(hero.querySelector(".holder-chip strong")?.textContent) || "Current holder";
    const note = node("div", "cf-torn-note");
    note.append(node("strong", "", "The people are the route."), node("span", "", `${holder} is the last verified frontier. Every next bridge exists only to move this introduction toward ${target}.`));
    const instrument = hero.querySelector(".tw-route-instrument");
    if (instrument) instrument.after(note);
  }

  function addPassCraft() {
    if (!/^\/mission\/[^/]+\/pass$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.dataset.cfPass === "1") return;
    hero.dataset.cfPass = "1";
    hero.classList.add("cf-pass");

    const ritual = node("section", "cf-pass-ritual");
    ritual.setAttribute("aria-label", "One NIM custody baton handoff");
    const baton = node("span", "cf-pass-baton");
    baton.setAttribute("aria-hidden", "true");
    const copy = node("span");
    copy.append(node("strong", "", "Pass the baton, not a reward."), node("span", "", "The accepted bridge receives exactly 1 NIM. Approval can start the attempt; only independently verified FINAL moves custody."));
    ritual.append(baton, copy);

    const lede = hero.querySelector(".lede");
    (lede || hero.querySelector("h1") || hero).after(ritual);

    const proof = hero.querySelector(".wi-proof-ladder");
    if (proof && !hero.querySelector(".cf-proof-rule")) {
      const stampRow = node("div", "cf-proof-rule");
      stampRow.style.marginTop = "10px";
      stampRow.append(node("span", "cf-stamp pending", "Approval ≠ custody"), node("span", "cf-stamp", "FINAL = custody"));
      proof.after(stampRow);
    }
  }

  function addRouteCraft() {
    if (!/^\/mission\/[^/]+\/route$/.test(location.pathname)) return;
    const routeCard = screen.querySelector(".route-card");
    if (!routeCard || routeCard.dataset.cfRoute === "1") return;
    routeCard.dataset.cfRoute = "1";
    routeCard.classList.add("cf-route");

    const status = clean(routeCard.querySelector(".status-pill")?.textContent);
    const steps = routeCard.querySelectorAll(".route-step").length;
    const heading = node("div", "cf-route-heading");
    const copy = node("span");
    copy.append(node("strong", "", status === "ARRIVED" ? "A human route that reached its person." : "A finite human route in progress."), node("span", "", `${steps} verified handoff${steps === 1 ? "" : "s"}. Pending activity never rewrites the verified path.`));
    heading.append(copy, node("span", `cf-stamp${status === "ARRIVED" ? "" : " pending"}`, status === "ARRIVED" ? "ARRIVED" : "VERIFIED PATH"));
    const split = routeCard.querySelector(".split");
    (split || routeCard.firstElementChild || routeCard).after(heading);

    if (status === "ARRIVED" && !routeCard.querySelector(".cf-arrived-moment")) {
      const moment = node("section", "cf-arrived-moment");
      moment.append(node("span", "cf-stamp", "Human outcome reached"), node("h3", "", "The introduction arrived."), node("p", "", "People made the route possible. The receipt below proves only the finalized path that the authorized view can safely reveal."));
      const receipt = routeCard.querySelector(".wi-receipt");
      if (receipt) receipt.before(moment);
      else routeCard.append(moment);
    }
  }

  function decorateInviteSlip() {
    const link = screen.querySelector(".invite-link");
    const card = link?.closest(".card");
    if (!card || card.dataset.cfSlip === "1") return;
    card.dataset.cfSlip = "1";
    card.classList.add("cf-private-slip");
    const kicker = card.querySelector(".kicker");
    if (kicker) kicker.after(node("span", "cf-stamp coral", "PRIVATE HANDOFF"));
  }

  function preserveMaturity() {
    screen.querySelectorAll(".cf-torn-note").forEach((note, index) => {
      if (index > 2) note.remove();
    });
  }

  function apply() {
    scheduled = false;
    addHomeCraft();
    addCreateCraft();
    addInvitationCraft();
    addMissionCraft();
    addPassCraft();
    addRouteCraft();
    decorateInviteSlip();
    preserveMaturity();
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
