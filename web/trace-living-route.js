(() => {
  "use strict";
  document.body.classList.add("trace-living-route");
  const screen = document.querySelector("#screen");
  if (!screen) return;
  let queued = false;

  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  function routeFrame() {
    if (screen.querySelector(".tlr-route-frame")) return;
    const targetEl = screen.querySelector(".target-title");
    const holderEl = screen.querySelector(".holder-chip");
    if (!targetEl || !holderEl) return;
    const target = (targetEl.textContent || "").trim();
    if (!target) return;
    const holder = (holderEl.querySelector("strong")?.textContent || "Current holder").trim();
    const routeCount = screen.querySelectorAll(".route-step").length;

    const frame = make("section", "tlr-route-frame");
    frame.setAttribute("aria-label", "Destination and current route frontier");
    frame.append(make("div", "tlr-eyebrow", "This route has one destination"));

    const destination = make("div", "tlr-destination");
    destination.append(make("span", "tlr-node", "◎"));
    const dcopy = make("div");
    dcopy.append(make("strong", "", target), make("small", "", "ARRIVED ends the mission when this destination becomes the verified holder."));
    destination.append(dcopy);
    frame.append(destination);

    const frontier = make("div", "tlr-frontier");
    frontier.append(make("span", "tlr-node", "→"));
    const fcopy = make("div");
    fcopy.append(make("strong", "", holder), make("small", "", "Current verified route frontier. Pending approval or broadcast does not move it."));
    frontier.append(fcopy);
    frame.append(frontier);

    const distance = make("div", "tlr-distance");
    distance.append(make("span", "", routeCount ? `${routeCount} verified handoff${routeCount === 1 ? "" : "s"} recorded` : "No verified handoff yet"), make("b", "", "Only FINAL extends the route"));
    frame.append(distance);

    const card = targetEl.closest(".hero-card,.card,.route-card") || screen.firstElementChild;
    card?.prepend(frame);
  }

  function invitationDestination() {
    if (screen.querySelector(".tlr-invite-destination")) return;
    const hero = screen.querySelector(".hero-card");
    const title = hero?.querySelector("h1");
    if (!hero || !title || !/bridge|closer|route/i.test(title.textContent || "")) return;
    const note = make("div", "tlr-route-frame tlr-invite-destination");
    note.append(make("div", "tlr-eyebrow", "Destination-bound request"));
    const row = make("div", "tlr-destination");
    row.append(make("span", "tlr-node", "◎"));
    const copy = make("div");
    copy.append(make("strong", "", "This mission ends at one intended person"), make("small", "", "You are being asked to move a private introduction closer, not to continue an endless relay."));
    row.append(copy); note.append(row);
    const buttons = hero.querySelector(".button-row");
    (buttons || hero).before(note);
  }

  function apply() { queued = false; routeFrame(); invitationDestination(); }
  function schedule() { if (queued) return; queued = true; requestAnimationFrame(apply); }
  new MutationObserver(schedule).observe(screen,{childList:true,subtree:true});
  addEventListener("popstate",schedule);
  schedule();
})();
