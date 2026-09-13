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
    if (!hero || hero.querySelector(".tw-thesis")) return;
    const kicker = cleanText(hero.querySelector(".kicker"));
    if (!/Destination-bound human routing/i.test(kicker)) return;

    const thesis = node("div", "tw-thesis");
    [
      ["One destination", "The route exists to reach one intended person."],
      ["Human bridges", "Each bridge chooses whether to carry it closer."],
      ["FINAL only", "Exactly 1 NIM changes custody only after independent finality."],
    ].forEach(([title, copy]) => {
      const item = node("div", "tw-thesis-item");
      item.append(node("b", "", title), node("span", "", copy));
      thesis.append(item);
    });
    const buttons = hero.querySelector(".button-row");
    (buttons || hero).before(thesis);
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

    const note = hero.querySelector(".mission-note");
    (note || hero.querySelector(".holder-chip") || hero).after(instrument);
  }

  function addInvitationRouteCue() {
    if (!/^\/i\/[A-Za-z0-9_-]+$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.querySelector(".tw-route-instrument")) return;
    const target = cleanText(hero.querySelector(".lede strong")) || "Private destination";

    const instrument = node("section", "tw-route-instrument");
    instrument.setAttribute("aria-label", "Your place in this destination-bound route");
    instrument.append(node("div", "tw-route-label", "Why this is not an open-ended payment chain"));

    const destination = node("div", "tw-route-row destination");
    destination.append(node("span", "tw-route-node", "◎"));
    const dcopy = node("span", "tw-route-copy");
    dcopy.append(node("strong", "", target), node("small", "", "The mission has one intended destination and ends when it arrives."));
    destination.append(dcopy, node("span", "tw-route-tag", "DESTINATION"));

    const frontier = node("div", "tw-route-row frontier");
    frontier.append(node("span", "tw-route-node", "+"));
    const fcopy = node("span", "tw-route-copy");
    fcopy.append(node("strong", "", "You are the proposed next bridge"), node("small", "", "Accepting is consent to participate. No funds or custody move on acceptance."));
    frontier.append(fcopy, node("span", "tw-route-tag", "YOUR CHOICE"));

    const rule = node("div", "tw-route-rule");
    rule.append(node("span", "", "Decline keeps custody where it is"), node("b", "", "Accept ≠ payment"));
    instrument.append(destination, frontier, rule);

    const why = hero.querySelector(".card");
    (why || hero.querySelector(".warning") || hero).before(instrument);
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
