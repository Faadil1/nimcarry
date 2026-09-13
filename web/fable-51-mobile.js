(() => {
  "use strict";

  document.body.classList.add("f51-ui");

  const screen = document.querySelector("#screen");
  if (!screen) return;

  let scheduled = false;

  function orbit() {
    const hero = screen.querySelector(".hero-card");
    if (!hero || hero.querySelector(".f51-orbit")) return;
    const kicker = hero.querySelector(".kicker");
    if (!kicker || !/Destination-bound human routing/i.test(kicker.textContent || "")) return;

    const visual = document.createElement("div");
    visual.className = "f51-orbit";
    visual.setAttribute("aria-hidden", "true");
    visual.innerHTML = `
      <span class="f51-orbit-label a">CONSENT</span>
      <span class="f51-orbit-label b">FINAL ONLY</span>
      <span class="f51-orbit-label c">ARRIVED</span>
      <span class="f51-orbit-core"><strong>1 NIM</strong><small>custody baton</small></span>
    `;

    const primer = hero.querySelector(".wi-problem-first");
    const headline = hero.querySelector("h1");
    (primer || headline)?.after(visual);
  }

  function routeMeta() {
    const card = screen.querySelector(".hero-card, .form-card, .route-card");
    if (!card || card.querySelector(".f51-route-meta")) return;
    const path = location.pathname;
    if (!(path === "/create" || /^\/i\//.test(path) || /^\/mission\//.test(path))) return;

    const meta = document.createElement("div");
    meta.className = "f51-route-meta";
    meta.setAttribute("aria-label", "NimCarry route guarantees");
    meta.innerHTML = "<span>Private route</span><span>FINAL-only custody</span>";

    const flow = card.querySelector(".wi-flow");
    if (flow) flow.after(meta);
    else card.prepend(meta);
  }

  function tagScreenContext() {
    const path = location.pathname;
    let context = "home";
    if (path === "/create") context = "create";
    else if (/^\/i\//.test(path)) context = "invite";
    else if (/\/pass$/.test(path)) context = "pass";
    else if (/\/route$/.test(path)) context = "route";
    else if (/^\/mission\//.test(path)) context = "mission";
    document.body.dataset.f51Context = context;
  }

  function labelPrimaryActions() {
    screen.querySelectorAll(".button.primary").forEach((button) => {
      if (button.dataset.f51Action === "1") return;
      button.dataset.f51Action = "1";
      button.setAttribute("data-haptic", "true");
    });
  }

  function apply() {
    scheduled = false;
    tagScreenContext();
    orbit();
    routeMeta();
    labelPrimaryActions();
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
