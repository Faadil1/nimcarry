(() => {
  "use strict";

  const screen = document.querySelector("#screen");
  if (!screen) return;

  let queued = false;
  const setText = (node, text) => {
    if (node && node.textContent !== text) node.textContent = text;
  };

  function applyHeroClarity() {
    queued = false;
    const hero = screen.querySelector(".hero-card");
    if (!hero) return;

    const kicker = String(hero.querySelector(".kicker")?.textContent || "").trim();
    if (!/destination-bound human routing/i.test(kicker)) return;

    setText(hero.querySelector("h1"), "Get a warm introduction to someone you can’t reach directly.");
    setText(hero.querySelector(".wi-problem-first"), "Warm introductions often disappear after the first handoff.");
    setText(
      hero.querySelector(".lede"),
      "Choose one destination. Invite a trusted bridge. Exactly 1 NIM becomes the custody baton, and only verified FINAL moves the route forward."
    );

    // Keep the approved memory sentence, but move it out of the explanatory H1.
    setText(hero.querySelector(".hc-script"), "People move opportunity forward.");
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(applyHeroClarity);
  }

  new MutationObserver(schedule).observe(screen, { childList: true, subtree: true });
  addEventListener("popstate", schedule);
  schedule();
})();
