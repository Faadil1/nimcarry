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
      "First-time destination",
      "No separate NimCarry signup.",
      "NimCarry uses Nimiq wallet identity instead of an email/password account. The destination must have a Nimiq address before the mission starts because ARRIVED is verified against that private destination wallet. If they are new to Nimiq, set up a wallet first, then paste the NQ… address here.",
      `${link(NIMIQ_WALLET_URL, "Create Nimiq wallet", "button secondary")}${link(NIMIQ_PAY_URL, "Get Nimiq Pay", "button ghost")}`,
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
      "New to Nimiq?",
      "You can still accept this route.",
      "You do not need a NimCarry account. Create or connect a Nimiq wallet in Nimiq Pay, then reopen this same private invitation. Your wallet is bound to the mission only when you choose Accept as bridge.",
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
    helper.innerHTML = `Recipient has no wallet yet? No problem. Send the private invite, have them set up Nimiq Pay, then reopen the same invite. ${link(NIMIQ_PAY_URL, "Nimiq Pay setup", "button ghost")}`;
    card.appendChild(helper);
  }

  function enhanceWalletError() {
    if (!notice) return;
    const text = notice.textContent || "";
    if (!/No Nimiq account was shared by Nimiq Pay\./i.test(text)) return;
    notice.textContent = "No Nimiq wallet is available yet. Set one up in Nimiq Pay, then return to this same page. NimCarry does not require a separate account.";
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
