(() => {
  "use strict";

  const notice = document.querySelector("#notice");
  if (!notice || new URLSearchParams(location.search).get("demo") === "1") return;

  const HOLD_MS = 130 * 60 * 1000;
  let recovering = false;
  let lastHandledMessage = "";

  const missionId = () => {
    const match = location.pathname.match(/^\/mission\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  };
  const markerKey = (id) => `nimcarry.unproven-submission.${id}`;
  const missionPath = (id) => `/mission/${encodeURIComponent(id)}`;
  const routePath = (id) => `/mission/${encodeURIComponent(id)}/route`;

  function readMarker(id) {
    if (!id) return null;
    try { return JSON.parse(localStorage.getItem(markerKey(id)) || "null"); } catch { return null; }
  }

  function writeMarker(id) {
    if (!id) return null;
    const existing = readMarker(id);
    const marker = existing || {
      first_seen_at: new Date().toISOString(),
      hold_until: Date.now() + HOLD_MS,
    };
    localStorage.setItem(markerKey(id), JSON.stringify(marker));
    return marker;
  }

  function clearMarker(id) {
    if (id) localStorage.removeItem(markerKey(id));
  }

  function setNotice(message, error = true) {
    notice.textContent = message;
    notice.classList.toggle("error", error);
    notice.hidden = false;
  }

  function isExplicitNoBroadcast(message) {
    return /user[_ -]?(rejected|cancelled|canceled)|permission[_ -]?denied|invalid[_ -]?transaction|wallet selection cancelled/i.test(message);
  }

  function isAmbiguousSubmission(message) {
    if (!/\/mission\/[^/]+\/pass\/?$/.test(location.pathname)) return false;
    if (isExplicitNoBroadcast(message)) return false;
    return /nimiq_pay_send|send_unexpected_result|syncing your account|bad request|submission|broadcast|transport|network|timeout|provider|sync|transaction.*failed|failed.*transaction/i.test(message);
  }

  function safeProviderResultDetail(message) {
    const match = /result shape:\s*(undefined|null|array|string|number|boolean|object|function|symbol|bigint)/i.exec(String(message || ""));
    return match ? ` Provider result shape: ${match[1].toLowerCase()}.` : "";
  }

  async function reconcile(id) {
    const response = await fetch(`/missions/${encodeURIComponent(id)}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
    });
    const text = await response.text();
    let payload = null;
    if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
    if (!response.ok) throw new Error(`${payload?.error || `HTTP_${response.status}`}: ${payload?.message || response.statusText}`);
    return payload;
  }

  async function recoverUntilFinal(id, { quiet = false, providerDetail = "" } = {}) {
    if (!id || recovering) return false;
    recovering = true;
    if (!quiet) {
      setNotice(
        `SEND_STATUS_PENDING: Nimiq Pay did not return a provable transaction hash. NimCarry will verify this existing send attempt in the background. Do not resend 1 NIM.${providerDetail}`,
        false
      );
    }
    try {
      // One opportunistic check only. The canonical server-side maintenance
      // loop owns continued reconciliation, including no-hash discovery.
      const result = await reconcile(id);
      const mission = result?.mission;
      const hopStatus = result?.hop?.status;
      if (mission?.status === "ARRIVED" || hopStatus === "FINAL" || hopStatus === "CONFIRMED") {
        clearMarker(id);
        location.assign(routePath(id));
        return true;
      }
      if (hopStatus === "INVALID") {
        clearMarker(id);
        setNotice(
          "NO_BROADCAST_CONFIRMED: the previous handoff validity window ended without an independently verified matching transaction. Custody did not change. Return to the mission and prepare a fresh handoff.",
          true
        );
        return false;
      }
      setNotice(
        "SEND_STATUS_PENDING: No FINAL proof yet. NimCarry will keep checking this existing send attempt in the background. Do not resend 1 NIM.",
        false
      );
      location.assign(missionPath(id));
      return false;
    } catch (error) {
      console.info("[NimCarry submission recovery] foreground check unavailable; server background reconciliation remains authoritative");
      setNotice(
        "SEND_STATUS_PENDING: Verification is temporarily unavailable. NimCarry will keep checking the existing send attempt in the background. Do not resend 1 NIM.",
        false
      );
      location.assign(missionPath(id));
      return false;
    } finally {
      recovering = false;
    }
  }

  function handleNotice() {
    if (notice.hidden || !notice.classList.contains("error")) return;
    const message = notice.textContent?.trim() || "";
    if (!message || message === lastHandledMessage || !isAmbiguousSubmission(message)) return;
    lastHandledMessage = message;
    const id = missionId();
    if (!id) return;
    writeMarker(id);
    void recoverUntilFinal(id, { providerDetail: safeProviderResultDetail(message) });
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("#send, #refresh") : null;
    if (!target) return;
    const id = missionId();
    if (!id) return;

    if (target.id === "refresh" && /\/route\/?$/.test(location.pathname)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void reconcile(id)
        .then(() => location.reload())
        .catch((error) => setNotice(`VERIFICATION_DELAYED: ${error?.message || String(error)}`, true));
      return;
    }

    if (target.id === "send") {
      const marker = readMarker(id);
      if (!marker) return;
      if (Number(marker.hold_until) <= Date.now()) {
        clearMarker(id);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      setNotice("SUBMISSION_RECHECK_REQUIRED: a previous Nimiq Pay approval is still unproven. Checking the chain instead of creating a second 1 NIM send.", true);
      void recoverUntilFinal(id, { quiet: true });
    }
  }, true);

  new MutationObserver(handleNotice).observe(notice, {
    attributes: true,
    attributeFilter: ["class", "hidden"],
    childList: true,
    characterData: true,
    subtree: true,
  });

  handleNotice();
})();
