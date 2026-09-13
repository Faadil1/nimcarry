(() => {
  "use strict";
  document.body.classList.add("trace-proof-object");
  const screen = document.querySelector("#screen");
  if (!screen) return;
  let queued = false;

  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  function classify(text) {
    const value = String(text || "").toLowerCase();
    if (/arrived|final|finalized|verified/.test(value)) return ["final", "Verified state", "This state is backed by the product's currently rendered verified evidence."];
    if (/pending|waiting|broadcast|approv|verify/.test(value)) return ["pending", "Not custody yet", "Approval, submission or a pending transaction does not change the verified holder."];
    if (/error|failed|blocked|expired|refused|not.broadcast/.test(value)) return ["blocked", "Fail-closed", "NimCarry preserves the last verified holder when the next handoff cannot be proven."];
    return ["neutral", "Current evidence", "The interface distinguishes what is known from what still requires verification."];
  }

  function addProofState() {
    const card = screen.querySelector(".hero-card,.route-card,.form-card");
    if (!card || card.querySelector(".po-proof-card")) return;
    const evidenceText = [
      screen.querySelector(".status-pill")?.textContent,
      screen.querySelector(".warning")?.textContent,
      screen.querySelector(".notice")?.textContent,
      screen.querySelector(".wi-finality-note")?.textContent,
      card.querySelector(".kicker")?.textContent,
    ].filter(Boolean).join(" ");
    const [state,label,copy] = classify(evidenceText);
    const proof = make("section", "po-proof-card");
    proof.dataset.state = state;
    proof.setAttribute("aria-label", "Current proof state");
    const head = make("div", "po-proof-head");
    head.append(make("span", "po-proof-dot"), make("strong", "", label));
    proof.append(head, make("p", "po-proof-copy", copy));
    const rule = make("div", "po-proof-rule");
    rule.append(make("span", "", "Authority rule"), make("b", "", "Only FINAL changes custody"));
    proof.append(rule);
    const buttons = card.querySelector(".button-row");
    (buttons || card).before(proof);
  }

  function receiptShareCue() {
    const receipt = screen.querySelector(".wi-receipt");
    if (!receipt || receipt.querySelector(".po-receipt-cue")) return;
    const cue = make("p", "wi-receipt-statement po-receipt-cue", "Shareable proof should reveal the route outcome and finalized handoffs while keeping the private destination and full wallet data protected.");
    const actions = receipt.querySelector(".button-row");
    (actions || receipt).before(cue);
  }

  function apply() { queued = false; addProofState(); receiptShareCue(); }
  function schedule() { if (queued) return; queued = true; requestAnimationFrame(apply); }
  new MutationObserver(schedule).observe(screen,{childList:true,subtree:true});
  addEventListener("popstate",schedule);
  schedule();
})();
