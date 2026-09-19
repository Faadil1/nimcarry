(() => {
  "use strict";

  const NIMIQ_PAY_URL = "https://www.nimiq.com/nimiq-pay/";
  const NIMIQ_WALLET_URL = "https://www.nimiq.com/wallet/";
  const screen = document.querySelector("#screen");
  const notice = document.querySelector("#notice");

  if (!screen) return;

  function link(href, label, className = "button ghost") {
    return `<a class="${className}" href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
  }

  function onboardingCard(id, kicker, title, body, actions) {
    const card = document.createElement("div");
    card.id = id;
    card.className = "card wallet-onboarding-card";
    card.innerHTML = `<div class="kicker">${kicker}</div><h3>${title}</h3><p>${body}</p><div class="button-row">${actions}</div>`;
    return card;
  }

  function enhanceCreateMission() {
    const form = document.querySelector("#create-form");
    if (!form || document.querySelector("#wallet-onboarding-create")) return;

    const card = onboardingCard(
      "wallet-onboarding-create",
      "Protocol step",
      "Your NimCarry profile and your Nimiq wallet are different things.",
      "You can be a NimCarry user with just your name and email. A Nimiq wallet is required only when you create or accept custody, pass the 1 NIM baton, or become the verified destination. This mission still needs a known Nimiq destination because ARRIVED is verified against that private wallet.",
      `${link(NIMIQ_WALLET_URL, "Create Nimiq wallet", "button secondary")}${link(NIMIQ_PAY_URL, "Open Nimiq Pay", "button ghost")}`,
    );

    form.parentElement?.insertBefore(card, form);
  }

  function enhanceInvitation() {
    const accept = document.querySelector("#accept");
    if (!accept || document.querySelector("#wallet-onboarding-invite")) return;

    const buttons = accept.closest(".button-row");
    const hero = accept.closest(".hero-card");
    if (!buttons || !hero) return;

    const card = onboardingCard(
      "wallet-onboarding-invite",
      "Human first",
      "You can join NimCarry before you have Nimiq.",
      "A name + email NimCarry profile does not move funds and does not create custody. When you choose Accept as bridge, connect or create a Nimiq wallet in Nimiq Pay; that signed wallet authorization is what can bind you to the protocol.",
      `${link(NIMIQ_PAY_URL, "Set up Nimiq Pay", "button secondary")}${link(NIMIQ_WALLET_URL, "Create wallet", "button ghost")}`,
    );

    hero.insertBefore(card, buttons);
  }

  function enhanceCreatedInvite() {
    const copy = document.querySelector("#copy-invite");
    const card = copy?.closest(".card");
    if (!copy || !card || card.querySelector("#wallet-onboarding-share")) return;

    const helper = document.createElement("div");
    helper.id = "wallet-onboarding-share";
    helper.className = "warning";
    helper.style.marginTop = "14px";
    helper.innerHTML = `Recipient has no Nimiq wallet yet? They can still create a NimCarry profile from the invite first, then connect Nimiq Pay before accepting custody. ${link(NIMIQ_PAY_URL, "Nimiq Pay setup", "button ghost")}`;
    card.appendChild(helper);
  }

  function enhanceWalletError() {
    if (!notice) return;
    const text = notice.textContent || "";
    if (!/No Nimiq account was shared by Nimiq Pay\./i.test(text)) return;
    notice.textContent = "No Nimiq wallet is available yet. Your NimCarry profile can exist without one; set up a wallet in Nimiq Pay only when you are ready for a custody action.";
  }

  function enhance() {
    enhanceCreateMission();
    enhanceInvitation();
    enhanceCreatedInvite();
    enhanceWalletError();
  }

  const observer = new MutationObserver(enhance);
  observer.observe(screen, { childList: true, subtree: true });
  if (notice) observer.observe(notice, { childList: true, characterData: true, subtree: true });
  enhance();
})();
