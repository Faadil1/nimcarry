(() => {
  "use strict";

  document.body.classList.add("mature-positioning");
  const screen = document.querySelector("#screen");
  if (!screen) return;
  let scheduled = false;

  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  };

  function enhanceHomePositioning() {
    const hero = screen.querySelector(".hero-card");
    if (!hero) return;
    const kicker = hero.querySelector(".kicker");
    if (!kicker || !/Destination-bound human routing/i.test(kicker.textContent || "")) return;

    const primer = hero.querySelector(".wi-problem-first");
    if (primer) primer.textContent = "Warm introductions, referrals and opportunities disappear after the first handoff.";

    const scenarioCopy = hero.querySelector(".wi-scenario span:not(.wi-scenario-label)");
    if (scenarioCopy) {
      scenarioCopy.textContent = "Reach one specific person through people who already know the next trusted bridge — for an introduction, referral, opportunity or community connection.";
    }

    const batonCopy = hero.querySelector(".wi-baton-note span");
    if (batonCopy) {
      batonCopy.textContent = "No stake, wager, prize pool or referral reward. The 1 NIM transaction records who carries the route next.";
    }

    if (hero.querySelector(".mp-audience")) return;
    const audience = node("section", "mp-audience");
    audience.setAttribute("aria-label", "Common NimCarry use cases");
    audience.append(node("p", "mp-audience-line", "For Nimiq Pay users who already rely on people to open doors."));

    const cases = node("div", "mp-use-cases");
    ["Warm introductions", "Referrals", "Opportunities", "Community access"].forEach((label) => {
      cases.append(node("span", "mp-use-case", label));
    });
    audience.append(cases);

    const thesis = hero.querySelector(".tw-thesis-line");
    if (thesis) thesis.after(audience);
    else {
      const lede = hero.querySelector(".lede");
      (lede || hero.querySelector("h1") || hero).after(audience);
    }
  }

  function enhanceInvitationPositioning() {
    if (!/^\/i\/[A-Za-z0-9_-]+$/.test(location.pathname)) return;
    const hero = screen.querySelector(".hero-card");
    if (!hero) return;

    const lifecycle = hero.querySelector(".wi-lifecycle");
    if (lifecycle) {
      const strong = lifecycle.querySelector("strong");
      if (strong) strong.textContent = "What are you actually agreeing to?";
    }

    const why = [...hero.querySelectorAll(".card")].find((card) => /WHY YOU/i.test(card.textContent || ""));
    if (why && !why.dataset.mpMatured) {
      why.dataset.mpMatured = "1";
      const text = why.querySelector("p") || why.lastElementChild;
      if (text && /closer|destination|know/i.test(text.textContent || "")) {
        text.textContent = "You were chosen because your relationship or context can move this specific introduction one trusted step closer.";
      }
    }
  }

  function enhancePrivateSharePositioning() {
    const note = screen.querySelector(".wi-private-note");
    if (!note) return;
    note.textContent = "A real bridge enters because they are relevant to this specific route — not because of a referral reward or public growth loop.";
  }

  function enhanceArrivedPositioning() {
    const receipt = screen.querySelector(".wi-receipt");
    if (!receipt || receipt.querySelector(".mp-arrived-purpose")) return;
    const statement = receipt.querySelector(".wi-receipt-statement");
    if (!statement) return;
    const purpose = node("p", "mp-arrived-purpose", "The outcome is the introduction arriving — not the token moving.");
    statement.before(purpose);
  }

  function apply() {
    scheduled = false;
    enhanceHomePositioning();
    enhanceInvitationPositioning();
    enhancePrivateSharePositioning();
    enhanceArrivedPositioning();
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
