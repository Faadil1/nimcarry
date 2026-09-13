(() => {
  "use strict";
  document.body.classList.add("trace-human-relay");
  const screen = document.querySelector("#screen");
  if (!screen) return;
  let queued = false;

  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  function invitationContext() {
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.querySelector(".hr-why-card")) return;
    const title = hero.querySelector("h1");
    if (!title || !/bridge|closer|route/i.test(title.textContent || "")) return;

    const context = make("div", "hr-human-context");
    const avatar = make("span", "hr-avatar", "↗");
    const copy = make("div");
    copy.append(make("strong", "", "A person chose you as the next bridge"), make("small", "", "This is a request to carry one specific introduction one person closer."));
    context.append(avatar, copy, make("span", "hr-arrow", "→"));

    const why = make("div", "hr-why-card");
    why.append(make("span", "", "Before you accept"), make("strong", "", "You are joining a destination-bound route, not an open-ended payment chain."), make("p", "", "Accepting gives consent to participate. It does not move funds or custody by itself."));

    const contract = make("div", "hr-consent-contract");
    contract.append(make("strong", "", "Your choice stays explicit"));
    [["✓","Accept","Join the route. No NIM moves yet."],["—","Decline","The current holder keeps custody and can choose another bridge."]].forEach(([symbol,label,copyText], index) => {
      const row = make("div", `hr-consent-row${index ? " hr-decline" : ""}`);
      row.append(make("b", "", symbol), make("span", "", `${label} — ${copyText}`));
      contract.append(row);
    });
    const buttons = hero.querySelector(".button-row");
    (buttons || hero).before(context, why, contract);
  }

  function missionContext() {
    const holder = screen.querySelector(".holder-chip");
    if (!holder || screen.querySelector(".hr-mission-context")) return;
    const target = screen.querySelector(".target-title")?.textContent?.trim();
    if (!target) return;
    const context = make("div", "hr-human-context hr-mission-context");
    const avatar = make("span", "hr-avatar", "◎");
    const copy = make("div");
    copy.append(make("strong", "", `Destination: ${target}`), make("small", "", "Every verified handoff exists only to move this introduction closer to this destination."));
    context.append(avatar, copy, make("span", "hr-arrow", "→"));
    holder.before(context);
  }

  function apply() {
    queued = false;
    invitationContext();
    missionContext();
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  }
  new MutationObserver(schedule).observe(screen, {childList:true,subtree:true});
  addEventListener("popstate", schedule);
  schedule();
})();
