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

    // Fresh-user hierarchy: outcome first, then the human flow, then the NIM mechanism.
    // A tester remembered the baton but could not explain what NimCarry was for, so the
    // first screen must answer the job-to-be-done before introducing custody mechanics.
    setText(hero.querySelector("h1"), "Get introduced to someone you can’t reach directly.");
    setText(
      hero.querySelector(".wi-problem-first"),
      "NimCarry helps trusted people carry your introduction from person to person until it reaches them."
    );
    setText(
      hero.querySelector(".lede"),
      "Create a mission → invite a trusted bridge → follow the route until it arrives."
    );

    // Keep the approved memory sentence as brand texture, below the explanatory copy.
    setText(hero.querySelector(".hc-script"), "People move opportunity forward.");

    // Explain the NIM mechanism only after the user understands the outcome and route.
    setText(
      hero.querySelector(".hc-home-caption"),
      "Exactly 1 NIM acts as the custody baton underneath the route. Only verified FINAL moves custody."
    );
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
