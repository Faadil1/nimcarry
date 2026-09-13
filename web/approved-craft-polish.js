(() => {
  "use strict";
  const screen = document.querySelector("#screen");
  if (!screen) return;
  let queued = false;

  const art = (src, className) => {
    const img = document.createElement("img");
    img.src = src;
    img.className = className;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.decoding = "async";
    return img;
  };

  function homeArt() {
    const manifesto = screen.querySelector(".cf-home-manifesto");
    if (!manifesto || manifesto.querySelector(".cf-home-art")) return;
    const route = manifesto.querySelector(".cf-human-route");
    const image = art("/craft-human-route.svg", "cf-home-art");
    if (route) {
      route.classList.add("cf-route-accessible-copy");
      route.after(image);
    } else manifesto.append(image);
  }

  function passArt() {
    const card = screen.querySelector(".cf-pass");
    if (!card || card.querySelector(".cf-pass-art")) return;
    const image = art("/craft-baton-handoff.svg", "cf-pass-art");
    const ritual = card.querySelector(".cf-pass-ritual");
    if (ritual) ritual.before(image);
    else (card.querySelector(".lede") || card.querySelector("h1") || card).after(image);
  }

  function arrivalArt() {
    const moment = screen.querySelector(".cf-arrived-moment");
    if (!moment || moment.querySelector(".cf-arrival-art")) return;
    const image = art("/craft-arrival.svg", "cf-arrival-art");
    const stamp = moment.querySelector(".cf-stamp");
    if (stamp) stamp.after(image);
    else moment.prepend(image);
  }

  function routePeople() {
    screen.querySelectorAll(".cf-route .route-step").forEach((step, index, list) => {
      if (step.querySelector(".cf-route-person")) return;
      const strong = step.querySelector("strong");
      if (!strong) return;
      const avatar = document.createElement("span");
      avatar.className = `cf-route-person${index === list.length - 1 ? " destination" : ""}`;
      avatar.setAttribute("aria-hidden", "true");
      strong.before(avatar);
    });
  }

  function inviteComposition() {
    const invite = screen.querySelector(".cf-invitation");
    if (!invite || invite.dataset.cfPolished === "1") return;
    invite.dataset.cfPolished = "1";
    const note = invite.querySelector(".cf-torn-note");
    if (note) note.classList.add("cf-invite-note");
    const route = invite.querySelector(".cf-invite-route");
    if (route) route.classList.add("cf-invite-people-art");
  }

  function markArrivedGrid() {
    const route = screen.querySelector(".cf-route");
    if (!route) return;
    const arrived = /ARRIVED/i.test(route.querySelector(".status-pill")?.textContent || "");
    route.classList.toggle("cf-route-arrived", arrived);
  }

  function apply() {
    queued = false;
    homeArt();
    passArt();
    arrivalArt();
    routePeople();
    inviteComposition();
    markArrivedGrid();
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  }
  new MutationObserver(schedule).observe(screen, { childList: true, subtree: true });
  addEventListener("popstate", schedule);
  schedule();
})();
