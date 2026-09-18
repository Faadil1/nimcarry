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
  const recoveryPathForMission = (id, returnPath = `/mission/${encodeURIComponent(id)}`) => {
    const url = new URL("/route-access-recovery.html", location.origin);
    url.searchParams.set("mission", id);
    url.searchParams.set("return", returnPath);
    return `${url.pathname}${url.search}`;
  };
  const routeRecoveryPath = () => {
    const id = missionId();
    if (!id) return "/";
    return recoveryPathForMission(id, `${location.pathname}${location.search}`);
  };
  const sessionMissionIds = () => {
    const prefix = "carryone.view.";
    const found = [];
    try {
      for (let index = 0; index < sessionStorage.length; index += 1) {
        const key = sessionStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const id = key.slice(prefix.length);
        if (id && !found.includes(id)) found.push(id);
      }
    } catch {
      return [];
    }
    return found.slice(-5).reverse();
  };

  function classify(message) {
    const text = String(message || "");
    const lower = text.toLowerCase();
    const onPass = /\/mission\/[^/]+\/pass\/?$/.test(location.pathname);

    if (/route_view_capability_(invalid|expired|required)|route view capability is unknown or expired|route view capability has expired|route view requires a bearer route view capability/.test(lower)) {
      return {
        kind: "access",
        eyebrow: "Mission access needs a fresh signature",
        title: "Your mission is still safe.",
        body: "A runtime restart can invalidate the short-lived read-only route capability. The mission, invitation state and verified custody are unchanged. Restore access with the creator/basic Nimiq Pay identity.",
        primary: ["Restore mission access", routeRecoveryPath()],
        secondary: ["NimCarry home", "/"],
        rule: "Refreshing read access never changes custody",
      };
    }

    if (/invitation_(expired|not_found|not_reissuable)|invite link is invalid or no longer recognized/.test(lower)) {
      return {
        kind: "expired",
        eyebrow: "This invitation is closed",
        title: "The letter never left its verified holder.",
        body: "This private invite expired, was replaced, or is no longer recognized. No handoff is inferred from an old link. The current holder can prepare the supported next invitation from the mission.",
        primary: missionId() ? ["Back to mission", missionPath()] : ["NimCarry home", "/"],
        secondary: ["NimCarry home", "/"],
        rule: "An expired invitation cannot move custody",
      };
    }

    if (/pass_deadline_expired|pass_intent_expired|authorized pass intent has expired/.test(lower)) {
      return {
        kind: "expired",
        eyebrow: "The handoff window closed",
        title: "Don’t reuse an expired authorization.",
        body: "The bridge may have consented, but this handoff window is over. Custody remains with the last verified holder until a fresh supported handoff reaches FINAL.",
        primary: ["Back to mission", missionPath()],
        secondary: ["Check verified route", routePath()],
        rule: "Expired intent = no custody change",
      };
    }

    if (/broadcast_in_flight|transaction broadcast/.test(lower) && !/not proven|unproven/.test(lower)) {
      return {
        kind: "pending",
        eyebrow: "A handoff may already be in flight",
        title: "Don’t create a second handoff.",
        body: "NimCarry has evidence that a broadcast claim exists and is keeping the route locked while it checks the independent record. Leave the letter with the last verified holder until FINAL is observed.",
        primary: ["Check verified route", routePath()],
        secondary: ["Back to mission", missionPath()],
        rule: "In-flight is not FINAL · do not duplicate the baton",
      };
    }

    if (/not_mission_participant|viewer_auth_required|recovery_wrong_wallet/.test(lower)) {
      return {
        kind: "account",
        eyebrow: "This identity cannot open the letter",
        title: "Choose a mission participant identity.",
        body: "NimCarry will not widen a private route because a link exists. Use the creator/current participant identity that is actually bound to this mission.",
        primary: ["Restore with the right identity", routeRecoveryPath()],
        secondary: ["NimCarry home", "/"],
        rule: "Private route access stays participant-scoped",
      };
    }

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
        body: "Nimiq Pay did not return enough evidence for NimCarry to prove this handoff. NimCarry checks the chain independently. The route stays with the last verified holder unless FINAL is independently observed.",
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

  function ensurePanel() {
    let panel = document.querySelector("#nimiq-recovery-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "nimiq-recovery-panel";
      panel.className = "nimiq-recovery-panel";
      panel.setAttribute("aria-live", "polite");
      notice.insertAdjacentElement("afterend", panel);
    }
    return panel;
  }

  function renderHomeRecovery() {
    if (location.pathname !== "/" || location.search) return false;
    const ids = sessionMissionIds();
    if (!ids.length) return false;

    const panel = ensurePanel();
    panel.dataset.kind = "access";
    const actions = ids.map((id, index) => {
      const fingerprint = id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
      return `<a class="button ${index === 0 ? "primary" : "ghost"}" href="${esc(recoveryPathForMission(id))}">Restore mission ${esc(fingerprint)}</a>`;
    }).join("");
    panel.innerHTML = `
      <div class="nr-stamp">ROUTE SAFE</div>
      <div class="nr-copy">
        <div class="nr-eyebrow">Previous mission found in this Nimiq Pay session</div>
        <h2>Resume without creating a new mission.</h2>
        <p>NimCarry found a previous read-only mission capability in this browser session. Re-sign VIEW_ROUTE to restore access. This does not send NIM, re-invite a bridge, or change custody.</p>
        <div class="nr-rule"><span>Custody rule</span><strong>Recovery is read-only · only FINAL changes custody</strong></div>
      </div>
      <div class="nr-actions">${actions}</div>`;
    return true;
  }

  function render() {
    const isError = notice.classList.contains("error") && !notice.hidden;
    const visibleMessage = notice.textContent?.trim() || "";
    const message = notice.dataset.systemMessage?.trim() || visibleMessage;
    if (!isError || !message) {
      removePanel();
      renderHomeRecovery();
      return;
    }

    const recovery = classify(message);
    if (!recovery) {
      removePanel();
      return;
    }

    const panel = ensurePanel();
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

  addEventListener("popstate", () => {
    removePanel();
    render();
  });
  render();
})();
