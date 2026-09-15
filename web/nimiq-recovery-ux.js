(() => {
  "use strict";

  const notice = document.querySelector("#notice");
  if (!notice) return;

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const missionId = () => {
    const match = location.pathname.match(/^\/mission\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  };
  const missionPath = () => {
    const id = missionId();
    return id ? `/mission/${encodeURIComponent(id)}` : "/";
  };
  const routePath = () => `${missionPath()}/route`;
  const providerCheckPath = () => {
    const url = new URL(location.href);
    url.pathname = "/";
    url.searchParams.set("provider-check", "1");
    return `${url.pathname}${url.search}`;
  };

  function classify(message) {
    const text = String(message || "");
    const lower = text.toLowerCase();
    const onPass = /\/mission\/[^/]+\/pass\/?$/.test(location.pathname);

    if (/verification_still_pending|verification delayed|still pending/.test(lower)) {
      return {
        kind: "pending",
        eyebrow: "Verification still running",
        title: "Do not resend the baton.",
        body: "A submitted handoff may still finalize. NimCarry keeps the last verified holder authoritative until FINAL is independently observed.",
        primary: ["Check verified route", routePath()],
        secondary: ["Back to mission", missionPath()],
        rule: "Pending is not custody · FINAL is custody",
      };
    }

    if (/wallet selection cancelled|user.{0,12}(cancel|reject|declin)|cancelled by user|canceled by user/.test(lower)) {
      return {
        kind: "cancelled",
        eyebrow: "Nothing moved",
        title: "The handoff was cancelled.",
        body: "No verified custody change was recorded. When you are ready, you can return to the pass and choose the correct Nimiq Pay account.",
        primary: ["Try the handoff again", location.pathname],
        secondary: ["Back to mission", missionPath()],
        rule: "Cancel = no custody change",
      };
    }

    if (/wrong_wallet_selection|no nimiq account|shared no accounts|choose a nimiq account/.test(lower)) {
      return {
        kind: "account",
        eyebrow: "Account check",
        title: "Use the current holder wallet.",
        body: "Open Nimiq Pay, confirm the account that currently holds the route, then return here. NimCarry refuses to move custody from a different wallet.",
        primary: ["Retry account check", location.pathname],
        secondary: ["Provider check", providerCheckPath()],
        rule: "The verified holder must be the sender",
      };
    }

    if (/pass_intent_contract_mismatch|opaque_commitment_required|transaction_construction|recipient|fee_luna|recipient_data/.test(lower)) {
      return {
        kind: "blocked",
        eyebrow: "Handoff blocked safely",
        title: "NimCarry refused to prepare this pass.",
        body: "The canonical handoff data was incomplete or unsafe. No custody change is claimed. Return to the mission instead of forcing a transaction.",
        primary: ["Back to mission", missionPath()],
        secondary: ["Provider check", providerCheckPath()],
        rule: "Unsafe transaction data fails closed",
      };
    }

    if (onPass && /bad request|http_?400|network|transport|timeout|provider|sync|transaction|broadcast|submission|recheck|failed|failure|unavailable/.test(lower)) {
      return {
        kind: "ambiguous",
        eyebrow: "Submission not proven",
        title: "Don’t send a second baton yet.",
        body: "Nimiq Pay did not return enough evidence for NimCarry to prove this handoff. NimCarry checks the chain independently; the route stays with the last verified holder unless FINAL is observed.",
        primary: ["Check verified route", routePath()],
        secondary: ["Run provider check", providerCheckPath()],
        rule: "Approval ≠ broadcast ≠ FINAL",
      };
    }

    if (/nimiq pay provider|provider_read_failure|provider_timeout|consensus_sync_failure|listaccounts/.test(lower)) {
      return {
        kind: "provider",
        eyebrow: "Nimiq Pay connection",
        title: "The wallet connection is not ready.",
        body: "Keep the route where it is. Re-open Nimiq Pay, let it finish syncing, then retry. No verified custody change is claimed while the provider is unavailable.",
        primary: ["Run provider check", providerCheckPath()],
        secondary: ["Back to mission", missionPath()],
        rule: "Provider uncertainty cannot move custody",
      };
    }

    return null;
  }

  function removePanel() {
    document.querySelector("#nimiq-recovery-panel")?.remove();
  }

  function render() {
    const isError = notice.classList.contains("error") && !notice.hidden;
    const message = notice.textContent?.trim() || "";
    if (!isError || !message) {
      removePanel();
      return;
    }

    const recovery = classify(message);
    if (!recovery) {
      removePanel();
      return;
    }

    let panel = document.querySelector("#nimiq-recovery-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "nimiq-recovery-panel";
      panel.className = "nimiq-recovery-panel";
      panel.setAttribute("aria-live", "polite");
      notice.insertAdjacentElement("afterend", panel);
    }

    panel.dataset.kind = recovery.kind;
    panel.innerHTML = `
      <div class="nr-stamp">ROUTE SAFE</div>
      <div class="nr-copy">
        <div class="nr-eyebrow">${esc(recovery.eyebrow)}</div>
        <h2>${esc(recovery.title)}</h2>
        <p>${esc(recovery.body)}</p>
        <div class="nr-rule"><span>Custody rule</span><strong>${esc(recovery.rule)}</strong></div>
      </div>
      <div class="nr-actions">
        <a class="button primary" href="${esc(recovery.primary[1])}">${esc(recovery.primary[0])}</a>
        <a class="button ghost" href="${esc(recovery.secondary[1])}">${esc(recovery.secondary[0])}</a>
      </div>
      <details class="nr-details"><summary>Technical detail</summary><code>${esc(message)}</code></details>`;
  }

  new MutationObserver(render).observe(notice, {
    attributes: true,
    attributeFilter: ["class", "hidden"],
    childList: true,
    characterData: true,
    subtree: true,
  });

  addEventListener("popstate", removePanel);
  render();
})();