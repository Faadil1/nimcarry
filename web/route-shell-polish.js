(() => {
  "use strict";

  const screen = document.querySelector("#screen");
  if (!screen) return;

  let scheduled = false;
  let lastPath = null;

  function cleanPath() {
    return location.pathname.replace(/\/+$/, "") || "/";
  }

  function polishCreateSurface(path) {
    if (path !== "/create") return;
    const card = screen.querySelector(".form-card");
    if (!card) return;

    const kicker = card.querySelector(".kicker");
    if (kicker) kicker.textContent = "STEP 1 · CREATE THE LINK";

    const lede = card.querySelector(".lede");
    if (lede) {
      lede.textContent = "You don’t need their Nimiq address. Leave it blank and you’ll get a private link to send them.";
    }

    const consent = card.querySelector(".checkline span");
    if (consent) {
      consent.textContent = "I confirm this address belongs to this person and they expect it.";
    }
  }

  function polishInvitationSurface(path) {
    if (!/^\/i\/[A-Za-z0-9_-]+$/.test(path)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero) return;
    const kicker = hero.querySelector(".kicker");
    if (kicker && /Bridge Invitation/i.test(kicker.textContent || "")) {
      kicker.textContent = "STEP 3 OF 5 · ACCEPT BRIDGE";
    }
  }

  function polishPassSurface(path) {
    if (!/\/pass$/.test(path)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero) return;

    const kicker = hero.querySelector(".kicker");
    if (kicker) kicker.textContent = "STEP 4 OF 5 · PASS 1 NIM";

    const headline = hero.querySelector("h1");
    if (headline && /One verified handoff/i.test(headline.textContent || "")) {
      headline.textContent = "Pass the 1 NIM baton.";
    }
  }

  function polishRouteSurface(path) {
    if (!/\/route$/.test(path)) return;
    const card = screen.querySelector(".route-card");
    if (!card) return;
    const kicker = card.querySelector(".kicker");
    if (kicker && /Route \/ Arrival/i.test(kicker.textContent || "")) {
      kicker.textContent = "STEP 5 OF 5 · ROUTE / ARRIVAL";
    }
  }

  function polishGuidedTour() {
    const params = new URLSearchParams(location.search);
    if (params.get("demo") !== "1" || params.get("tour") !== "1") return;
    const shortcut = screen.querySelector("#wi-preview-receipt");
    if (shortcut) {
      shortcut.hidden = true;
      shortcut.setAttribute("aria-hidden", "true");
      shortcut.tabIndex = -1;
    }
  }

  function preserveBrandChrome(path) {
    if (path === lastPath) return;
    lastPath = path;
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  function apply() {
    scheduled = false;
    const path = cleanPath();
    polishCreateSurface(path);
    polishInvitationSurface(path);
    polishPassSurface(path);
    polishRouteSurface(path);
    polishGuidedTour();
    preserveBrandChrome(path);
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
