(() => {
  "use strict";

  const KEY = "carryone.pendingInvitationAcceptance.v1";
  const MAX_AGE_MS = 5 * 60 * 1000;
  const PATCH_WINDOW_MS = 15_000;
  const originalFetch = window.fetch.bind(window);
  const patchedProviders = new WeakSet();

  const now = () => Date.now();
  const tokenFromPath = () => {
    const match = location.pathname.match(/^\/i\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  };
  const messageText = (value) => typeof value === "string" ? value : String(value?.message || "");

  function readPending() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (!parsed || !parsed.started_at || now() - Number(parsed.started_at) > MAX_AGE_MS) {
        sessionStorage.removeItem(KEY);
        return null;
      }
      return parsed;
    } catch {
      sessionStorage.removeItem(KEY);
      return null;
    }
  }

  function writePending(next) {
    const current = readPending() || {};
    const merged = { ...current, ...next, started_at: current.started_at || now() };
    sessionStorage.setItem(KEY, JSON.stringify(merged));
    return merged;
  }

  function clearPending() {
    sessionStorage.removeItem(KEY);
  }

  function safeJson(value) {
    try { return JSON.parse(String(value || "")); } catch { return null; }
  }

  function requestUrl(input) {
    try {
      if (typeof input === "string") return new URL(input, location.origin);
      if (input instanceof URL) return input;
      if (input?.url) return new URL(input.url, location.origin);
    } catch {}
    return null;
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || "GET").toUpperCase();
  }

  function requestBody(input, init) {
    if (typeof init?.body === "string") return init.body;
    return null;
  }

  async function resumeAcceptedSignature(pending) {
    if (!pending?.token || !pending?.challenge_id || !pending?.wallet || !pending?.public_key || !pending?.signature) return false;
    if (pending.resume_in_flight) return false;
    writePending({ resume_in_flight: true, resume_started_at: now() });
    try {
      const response = await originalFetch(`/i/${encodeURIComponent(pending.token)}/accept`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          auth: {
            challenge_id: pending.challenge_id,
            wallet: pending.wallet,
            public_key: pending.public_key,
            signature: pending.signature,
          },
        }),
      });
      if (!response.ok) {
        let detail = "";
        try {
          const body = await response.clone().json();
          detail = String(body?.error || body?.message || "");
        } catch {}
        if (/CHALLENGE_REPLAY/i.test(detail)) {
          clearPending();
          sessionStorage.setItem("carryone.invitationAcceptanceRecovered", String(now()));
          return true;
        }
        writePending({ resume_in_flight: false, last_resume_error: detail || `HTTP_${response.status}` });
        return false;
      }
      clearPending();
      sessionStorage.setItem("carryone.invitationAcceptanceRecovered", String(now()));
      return true;
    } catch (error) {
      writePending({ resume_in_flight: false, last_resume_error: String(error?.message || error) });
      return false;
    }
  }

  // Remember the private token before any native wallet UI can temporarily restore
  // another NimCarry route in the host WebView.
  const initialToken = tokenFromPath();
  if (initialToken) writePending({ token: initialToken, invite_seen_at: now() });

  // Capture only the ACCEPT_INVITATION challenge contract. No transaction request,
  // private key, seed phrase, or payment data is persisted.
  window.fetch = async function nimCarryInvitationResumeFetch(input, init) {
    const url = requestUrl(input);
    const method = requestMethod(input, init);
    const bodyText = requestBody(input, init);
    const requestJson = safeJson(bodyText);
    const response = await originalFetch(input, init);

    if (url && method === "POST" && /\/auth\/challenge$/.test(url.pathname) && requestJson?.action === "ACCEPT_INVITATION") {
      try {
        const payload = await response.clone().json();
        const token = tokenFromPath() || readPending()?.token;
        if (response.ok && token && (payload?.challenge_id || payload?.id) && (payload?.canonical_message || payload?.message)) {
          writePending({
            token,
            challenge_id: payload.challenge_id || payload.id,
            challenge_message: payload.canonical_message || payload.message,
            expires_at: payload.expires_at || payload.expiresAt || null,
            wallet: requestJson.wallet || null,
            mission_id: requestJson.mission_id || null,
            invitation_id: requestJson.invitation_id || null,
            sequence: requestJson.sequence ?? 0,
            challenge_captured_at: now(),
          });
        }
      } catch {}
    }

    if (url && method === "POST" && /\/i\/[A-Za-z0-9_-]+\/accept$/.test(url.pathname) && response.ok) {
      clearPending();
      sessionStorage.setItem("carryone.invitationAcceptanceRecovered", String(now()));
    }

    return response;
  };

  function patchProvider(raw) {
    if (!raw || typeof raw !== "object" || patchedProviders.has(raw) || typeof raw.sign !== "function") return;
    const originalSign = raw.sign.bind(raw);
    const wrapped = async (...args) => {
      const result = await originalSign(...args);
      const pending = readPending();
      const signedMessage = messageText(args[0]);
      if (
        pending?.challenge_id
        && pending?.challenge_message
        && pending.challenge_message === signedMessage
        && /(?:^|\n)action=ACCEPT_INVITATION(?:\n|$)/.test(signedMessage)
        && result?.publicKey
        && result?.signature
      ) {
        // Store only the short-lived public signature proof required to finish the
        // already-approved acceptance if Nimiq Pay restores a different route.
        writePending({
          public_key: result.publicKey,
          signature: result.signature,
          signed_at: now(),
          resume_in_flight: false,
        });
      }
      return result;
    };
    try {
      raw.sign = wrapped;
      patchedProviders.add(raw);
    } catch {}
  }

  const patchStartedAt = now();
  const patchTimer = setInterval(() => {
    patchProvider(window.nimiq);
    if (now() - patchStartedAt > PATCH_WINDOW_MS) clearInterval(patchTimer);
  }, 50);
  patchProvider(window.nimiq);

  async function recoverOnBoot() {
    const pending = readPending();
    if (!pending) return;

    if (pending.public_key && pending.signature) {
      const recovered = await resumeAcceptedSignature(pending);
      if (recovered) {
        const token = pending.token;
        if (token && tokenFromPath() !== token) location.replace(`/i/${encodeURIComponent(token)}?accept-recovered=1`);
      }
      return;
    }

    // The native signing screen may restore a previous route before the signed
    // result reaches JavaScript. Never silently leave the bridge on Mission Home:
    // return to the same private invite so the user can explicitly retry once.
    if (pending.challenge_id && pending.token && tokenFromPath() !== pending.token) {
      location.replace(`/i/${encodeURIComponent(pending.token)}?accept-resume=1`);
    }
  }

  // Let the host finish restoring the WebView before deciding whether a durable
  // acceptance proof needs to be replayed.
  setTimeout(recoverOnBoot, 120);
  addEventListener("pageshow", () => setTimeout(recoverOnBoot, 120));
})();
