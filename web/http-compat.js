import { getNimiqProvider } from "/nimiq-provider.js";

(() => {
  "use strict";

  // Secure browser compatibility layer for the canonical Mission HTTP API.
  // It adapts the older browser shell to the hardened server contract without
  // granting authority locally: wallet signatures, route-view capabilities,
  // broadcast capabilities, finality, and custody all remain server/network
  // decisions.
  const nativeFetch = window.fetch.bind(window);
  const passByMission = new Map();
  let pendingChallenge = null;

  function jsonBody(init) {
    if (!init?.body || typeof init.body !== "string") return null;
    try { return JSON.parse(init.body); } catch { return null; }
  }

  function flattenSignedEnvelope(body) {
    if (!body || typeof body !== "object" || !body.auth || typeof body.auth !== "object") return body;
    const { auth, ...rest } = body;
    return {
      ...rest,
      challenge_id: auth.challenge_id,
      public_key: auth.public_key,
      signature: auth.signature,
    };
  }

  function removeEmptyOptionalFields(body) {
    if (!body || typeof body !== "object") return body;
    const next = { ...body };
    for (const key of ["creator_display_label", "candidate_display_label", "candidate_label", "candidate_wallet", "why_you"]) {
      if (next[key] === "" || next[key] === null) delete next[key];
    }
    return next;
  }

  function viewStorageKey(missionId) {
    return `carryone.view.${missionId}`;
  }

  function storedViewToken(missionId) {
    return missionId ? sessionStorage.getItem(viewStorageKey(missionId)) : null;
  }

  function storeViewToken(missionId, token) {
    if (missionId && token) sessionStorage.setItem(viewStorageKey(missionId), token);
  }

  function randomToken(prefix) {
    if (typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return `${prefix}-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  function mutationNeedsIdempotency(method, path) {
    if (method !== "POST") return false;
    if (path === "/auth/challenge") return false;
    if (/^\/missions\/[^/]+\/reconcile$/.test(path)) return false;
    return true;
  }

  function normalizeRoute(route) {
    if (!Array.isArray(route)) return [];
    return route
      .filter((entry) => {
        if (entry && typeof entry === "object" && "status" in entry) return entry.status === "CONFIRMED";
        return true;
      })
      .map((entry) => {
        if (!entry || typeof entry !== "object" || !("current_holder" in entry) || !("recipient" in entry)) return entry;
        const hash = entry.tx_hash || "";
        return {
          sequence: entry.sequence,
          from: { display_label: entry.current_holder?.display_label || null, wallet_fingerprint: entry.current_holder?.wallet_fingerprint || "private" },
          via: entry.bridge ? { display_label: entry.bridge?.display_label || null, wallet_fingerprint: entry.bridge?.wallet_fingerprint || "private" } : null,
          to: { display_label: entry.recipient?.display_label || null, wallet_fingerprint: entry.recipient?.wallet_fingerprint || "private" },
          finalized_at: entry.confirmed_at,
          tx_hash_short: hash.length > 14 ? `${hash.slice(0, 7)}…${hash.slice(-5)}` : (hash || "verified tx"),
        };
      })
      .sort((a, b) => Number(a.sequence) - Number(b.sequence));
  }

  function normalizeMission(mission) {
    if (!mission || typeof mission !== "object") return mission;
    return { ...mission, route: normalizeRoute(mission.route) };
  }

  function normalizeInvitation(invitation) {
    if (!invitation || typeof invitation !== "object") return invitation;
    return {
      ...invitation,
      invitation_id: invitation.invitation_id || invitation.id,
    };
  }

  function normalizePayload(path, method, payload) {
    if (!payload || typeof payload !== "object") return payload;

    if (method === "POST" && /^\/missions\/[^/]+\/invitations$/.test(path) && payload.invitation) {
      const invitation = normalizeInvitation(payload.invitation);
      return {
        ...invitation,
        mission_id: payload.mission_id || invitation.mission_id,
        invite_token: payload.invite_token,
        invite_url: payload.web_invite_url,
        web_invite_url: payload.web_invite_url,
        nimiq_pay_custom_scheme: payload.nimiq_pay_custom_scheme,
      };
    }

    if (method === "GET" && /^\/i\/[^/]+$/.test(path) && payload.invitation) {
      const invitation = normalizeInvitation(payload.invitation);
      return {
        ...invitation,
        target_label: payload.mission?.target_label,
        mission_note: payload.mission?.mission_note,
        finalized_hop_count: payload.mission?.finalized_hop_count ?? 0,
        mission: normalizeMission(payload.mission),
      };
    }

    if (method === "POST" && /^\/i\/[^/]+\/accept$/.test(path)) return normalizeInvitation(payload);
    if (/^\/missions\/[^/]+$/.test(path) && method === "GET") return normalizeMission(payload);
    if (method === "POST" && path === "/missions") return normalizeMission(payload);

    if (method === "POST" && /^\/missions\/[^/]+\/reconcile$/.test(path) && payload.mission) {
      const mission = normalizeMission(payload.mission);
      const missionId = path.split("/")[2];
      const expected = passByMission.get(missionId)?.sequence;
      if (expected && Number(mission?.sequence) >= Number(expected)) {
        return { ...payload, mission, hop: { status: "FINAL", sequence: expected } };
      }
      return { ...payload, mission };
    }

    return payload;
  }

  async function rebuildResponse(response, payload) {
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json");
    return new Response(payload === null ? "" : JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  async function nativeJson(url, init) {
    const response = await nativeFetch(url, init);
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = null; }
    }
    if (!response.ok) {
      const code = payload?.error || `HTTP_${response.status}`;
      const message = payload?.message || response.statusText;
      throw new Error(`${code}: ${message}`);
    }
    return payload;
  }

  // ACCEPT_INVITATION already proves the bridge wallet. The canonical server
  // returns a read-only route capability in that same signed response, so the
  // bridge can continue from one wallet approval without a second VIEW_ROUTE
  // signature or reopening the invitation later.
  async function activateBridgeContinuationAfterAcceptance(acceptanceContext, acceptedInvitation) {
    const missionId = acceptedInvitation?.mission_id || acceptanceContext?.missionId;
    const token = acceptedInvitation?.view_token;
    if (!missionId || !token) {
      throw new Error("ACCEPT_CONTINUATION_CAPABILITY_MISSING");
    }

    storeViewToken(missionId, token);
    setTimeout(() => {
      if (/^\/i\//.test(location.pathname)) {
        history.pushState({}, "", `/mission/${encodeURIComponent(missionId)}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }, 0);
    return true;
  }

  window.fetch = async function nimCarrySecureFetch(input, init = {}) {
    const requestUrl = typeof input === "string" ? new URL(input, location.href) : new URL(input.url, location.href);
    let path = requestUrl.pathname;
    const method = String(init.method || (typeof input !== "string" ? input.method : "GET") || "GET").toUpperCase();
    let body = jsonBody(init);
    const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));

    if (path === "/auth/challenge" && method === "POST" && body) {
      pendingChallenge = {
        wallet: body.wallet,
        action: body.action,
        missionId: body.mission_id || null,
        invitationId: body.invitation_id || null,
        sequence: body.sequence ?? 0,
      };
    }

    body = removeEmptyOptionalFields(flattenSignedEnvelope(body));

    // The visible shell still calls its historical intent-specific URL. Adapt it
    // to the canonical invitation-bound endpoint and attach the one-time
    // capability that AUTHORIZE_PASS returned. A missing capability fails closed.
    const legacyBroadcast = path.match(/^\/missions\/([^/]+)\/pass-intent\/[^/]+\/broadcast$/);
    if (legacyBroadcast) {
      const missionId = decodeURIComponent(legacyBroadcast[1]);
      const pass = passByMission.get(missionId);
      if (!pass?.broadcastCapability) {
        throw new Error("BROADCAST_CAPABILITY_MISSING: authorize the delivery again before claiming a transaction.");
      }
      path = `/missions/${encodeURIComponent(missionId)}/broadcast`;
      requestUrl.pathname = path;
      body = {
        tx_hash: body?.tx_hash,
        broadcast_capability: pass.broadcastCapability,
      };
      if (pass.invitationId) body.invitation_id = pass.invitationId;
      if (!headers.has("Idempotency-Key")) headers.set("Idempotency-Key", pass.broadcastRetryKey);
    }

    // Non-public reads and reconcile calls must carry the minted route-view
    // capability. X-Wallet is intentionally never used as authorization.
    const missionRead = path.match(/^\/missions\/([^/]+)(?:\/route)?$/);
    const reconcile = path.match(/^\/missions\/([^/]+)\/reconcile$/);
    const protectedMissionId = missionRead?.[1] || reconcile?.[1];
    if (protectedMissionId && !headers.has("Authorization")) {
      const token = storedViewToken(decodeURIComponent(protectedMissionId));
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    if (mutationNeedsIdempotency(method, path) && !headers.has("Idempotency-Key")) {
      headers.set("Idempotency-Key", randomToken("browser"));
    }

    const finalInit = {
      ...init,
      method,
      headers,
      body: body === null ? init.body : JSON.stringify(body),
    };

    const acceptanceContext = method === "POST" && /^\/i\/[^/]+\/accept$/.test(path) && pendingChallenge?.action === "ACCEPT_INVITATION"
      ? { ...pendingChallenge }
      : null;

    const response = await nativeFetch(requestUrl.toString(), finalInit);
    const text = await response.clone().text();
    if (!text) return response;
    let payload;
    try { payload = JSON.parse(text); } catch { return response; }

    if (response.ok && method === "POST" && path === "/missions" && payload?.mission_id && payload?.view_token) {
      storeViewToken(payload.mission_id, payload.view_token);
    }

    const viewMatch = path.match(/^\/missions\/([^/]+)\/view$/);
    if (response.ok && method === "POST" && viewMatch && payload?.view_token) {
      storeViewToken(decodeURIComponent(viewMatch[1]), payload.view_token);
    }

    const passMatch = path.match(/^\/missions\/([^/]+)\/pass-intent$/);
    if (response.ok && method === "POST" && passMatch && payload) {
      const missionId = decodeURIComponent(passMatch[1]);
      const plannedData = typeof payload.recipient_data === "string" ? payload.recipient_data : "";
      sessionStorage.setItem("carryone.plannedTransaction", JSON.stringify({
        recipient_present: Boolean(payload.recipient),
        value_luna: Number(payload.value_luna),
        fee_luna: Number(payload.fee_luna),
        data_utf8_bytes: new TextEncoder().encode(plannedData).length,
        opaque_commitment_present: plannedData.startsWith("co:v1:"),
      }));
      passByMission.set(missionId, {
        invitationId: body?.invitation_id || null,
        sequence: payload.sequence,
        intentId: payload.intent_id,
        broadcastCapability: payload.broadcast_capability,
        broadcastRetryKey: randomToken("broadcast"),
      });
    }

    if (response.ok && acceptanceContext) {
      try {
        await activateBridgeContinuationAfterAcceptance(acceptanceContext, payload);
      } catch (error) {
        // Acceptance itself already succeeded. Do not replay it. Profile-backed
        // mission reads remain a safe fallback if the browser continuation token
        // cannot be stored.
        console.warn("NimCarry bridge continuation after acceptance failed", error);
      }
    }

    return rebuildResponse(response, normalizePayload(path, method, payload));
  };
})();
