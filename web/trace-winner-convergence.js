(() => {
  "use strict";

  document.body.classList.add("trace-winner");
  const screen = document.querySelector("#screen");
  if (!screen) return;
  let scheduled = false;

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function cleanText(el) {
    return (el?.textContent || "").trim();
  }

  function addHomeThesis() {
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.querySelector(".tw-thesis-line")) return;
    const kicker = cleanText(hero.querySelector(".kicker"));
    if (!/Destination-bound human routing/i.test(kicker)) return;

    const line = node("div", "tw-thesis-line");
    line.setAttribute("aria-label", "NimCarry route rule");
    line.append(
      node("b", "", "One destination"),
      node("span", "", "→"),
      node("b", "", "Human bridges"),
      node("span", "", "→"),
      node("b", "", "FINAL arrival")
    );
    const promise = hero.querySelector(".promise-strip");
    (promise || hero.querySelector(".button-row") || hero).before(line);
  }

  function addMissionInstrument() {
    if (!/^\/mission\/[^/]+$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.querySelector(".tw-route-instrument")) return;

    const target = cleanText(hero.querySelector(".target-title"));
    const holder = cleanText(hero.querySelector(".holder-chip strong"));
    const verifiedLabel = cleanText(hero.querySelector(".kicker"));
    const status = cleanText(hero.querySelector(".status-pill"));
    if (!target || !holder) return;

    const instrument = node("section", "tw-route-instrument");
    instrument.setAttribute("aria-label", "Destination and verified route frontier");
    instrument.append(node("div", "tw-route-label", "One destination · one verified frontier"));

    const destination = node("div", "tw-route-row destination");
    destination.append(node("span", "tw-route-node", "◎"));
    const dcopy = node("span", "tw-route-copy");
    dcopy.append(node("strong", "", target), node("small", "", status === "ARRIVED" ? "Destination reached. This route is complete." : "Every verified handoff exists only to move this introduction closer."));
    destination.append(dcopy, node("span", "tw-route-tag", status === "ARRIVED" ? "ARRIVED" : "DESTINATION"));

    const frontier = node("div", "tw-route-row frontier");
    frontier.append(node("span", "tw-route-node", "→"));
    const fcopy = node("span", "tw-route-copy");
    fcopy.append(node("strong", "", holder), node("small", "", "Last independently verified holder. Approval or pending broadcast cannot move this frontier."));
    frontier.append(fcopy, node("span", "tw-route-tag", "CURRENT"));

    const rule = node("div", "tw-route-rule");
    rule.append(node("span", "", verifiedLabel || "Verified route"), node("b", "", "Only FINAL changes custody"));
    instrument.append(destination, frontier, rule);

    hero.classList.add("tw-mission-instrumented");
    const note = hero.querySelector(".mission-note");
    (note || hero.querySelector(".holder-chip") || hero).after(instrument);
  }

  function addInvitationRouteCue() {
    if (!/^\/i\/[A-Za-z0-9_-]+$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.querySelector(".tw-invite-rule")) return;
    const target = cleanText(hero.querySelector(".lede strong")) || "Private destination";

    const cue = node("div", "tw-invite-rule");
    cue.setAttribute("aria-label", "Finite destination-bound invitation");
    cue.append(
      node("span", "tw-invite-dot", "◎"),
      node("strong", "", target),
      node("span", "", "One destination"),
      node("b", "", "You are the proposed next bridge"),
      node("em", "", "Accept ≠ payment")
    );
    const why = hero.querySelector(".card");
    (why || hero.querySelector(".warning") || hero).before(cue);
  }

  function tagProofObject() {
    const receipt = screen.querySelector(".wi-receipt");
    if (receipt) receipt.dataset.twProofObject = "1";
    const proof = screen.querySelector(".wi-proof-ladder");
    if (proof) proof.setAttribute("aria-label", "Approval to FINAL custody proof ladder");
  }

  function apply() {
    scheduled = false;
    addHomeThesis();
    addMissionInstrument();
    addInvitationRouteCue();
    tagProofObject();
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
