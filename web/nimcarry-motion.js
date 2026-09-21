(() => {
  "use strict";

  const screen = document.querySelector("#screen");
  if (!screen) return;

  document.body.classList.add("nimcarry-motion-v1");

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const FLOW_KEY = "nimcarry.motion.flow-index.v1";
  let queued = false;
  let resizeTimer = 0;

  function visibleCard() {
    return screen.querySelector(":scope > .hero-card, :scope > .form-card, :scope > .route-card, :scope > .card");
  }

  function markScreenEntrance() {
    if (reduceMotion) return;
    const card = visibleCard();
    if (!card || card.dataset.ncMotionEnter === "1") return;
    card.dataset.ncMotionEnter = "1";
    card.classList.add("nc-motion-enter");
  }

  function stepCircle(step) {
    return step?.querySelector("b") || null;
  }

  function placeGlider(flow, step, animate = true) {
    const circle = stepCircle(step);
    const glider = flow.querySelector(".nc-flow-glider");
    if (!circle || !glider) return;

    const flowRect = flow.getBoundingClientRect();
    const rect = circle.getBoundingClientRect();
    const x = rect.left - flowRect.left + (rect.width - 31) / 2;
    const y = rect.top - flowRect.top + (rect.height - 31) / 2;

    if (!animate) glider.style.transition = "none";
    flow.style.setProperty("--nc-glider-x", `${x}px`);
    flow.style.setProperty("--nc-glider-y", `${y}px`);

    if (!animate) {
      void glider.offsetWidth;
      glider.style.removeProperty("transition");
    }
  }

  function enhanceFlow() {
    const flow = screen.querySelector(".wi-flow");
    if (!flow || flow.dataset.ncMotionFlow === "1") return;

    const steps = [...flow.querySelectorAll(".wi-flow-step")];
    const current = steps.findIndex((step) => step.classList.contains("current"));
    if (current < 0) return;

    flow.dataset.ncMotionFlow = "1";
    const glider = document.createElement("span");
    glider.className = "nc-flow-glider";
    glider.setAttribute("aria-hidden", "true");
    flow.prepend(glider);

    let previous = Number.parseInt(sessionStorage.getItem(FLOW_KEY) || "", 10);
    if (!Number.isInteger(previous) || previous < 0 || previous >= steps.length) previous = current;

    placeGlider(flow, steps[previous], false);
    sessionStorage.setItem(FLOW_KEY, String(current));

    requestAnimationFrame(() => {
      requestAnimationFrame(() => placeGlider(flow, steps[current], previous !== current));
    });
  }

  function emphasizeClaimAction() {
    if (reduceMotion) return;
    const action = screen.querySelector(
      '[data-destination-claim-status="PENDING"] #claim-destination, [data-primary-action="SHARE_CLAIM"] #claim-share-button'
    );
    if (!action || action.dataset.ncMotionEmphasis === "1") return;
    action.dataset.ncMotionEmphasis = "1";
    action.classList.add("nc-motion-emphasis");
  }

  function animateNotice() {
    if (reduceMotion) return;
    const notice = document.querySelector("#notice");
    if (!notice || notice.hidden) return;
    const signature = notice.textContent?.trim() || "";
    if (!signature || notice.dataset.ncMotionNotice === signature) return;
    notice.dataset.ncMotionNotice = signature;
    notice.classList.remove("nc-motion-notice");
    void notice.offsetWidth;
    notice.classList.add("nc-motion-notice");
  }

  function animateRoute() {
    if (reduceMotion) return;
    [...screen.querySelectorAll(".route-step")].forEach((step, index) => {
      if (step.dataset.ncMotionRoute === "1") return;
      step.dataset.ncMotionRoute = "1";
      step.style.setProperty("--nc-route-index", String(index));
      step.classList.add("nc-motion-route-step");
    });
  }

  function animateFinal() {
    if (reduceMotion) return;
    screen.querySelectorAll(".status-pill.arrived,.clv2-postmark,.clv2-arrival-close").forEach((node) => {
      if (node.dataset.ncMotionFinal === "1") return;
      node.dataset.ncMotionFinal = "1";
      node.classList.add("nc-motion-final");
    });
  }

  function apply() {
    markScreenEntrance();
    enhanceFlow();
    emphasizeClaimAction();
    animateNotice();
    animateRoute();
    animateFinal();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  }

  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "data-primary-action", "data-destination-claim-status"],
  });

  addEventListener("popstate", schedule);
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const flow = screen.querySelector(".wi-flow");
      const current = flow?.querySelector(".wi-flow-step.current");
      if (flow && current) placeGlider(flow, current, false);
    }, 90);
  });

  schedule();
})();
