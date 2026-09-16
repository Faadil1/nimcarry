import { getNimiqProvider } from "/nimiq-provider.js";

const params = new URLSearchParams(location.search);
const missionId = params.get("mission") || "";
const requestedReturn = params.get("return") || "";
const status = document.querySelector("#status");
const form = document.querySelector("#recovery-form");
const accountsEl = document.querySelector("#accounts");
const restoreButton = document.querySelector("#restore");
const cancel = document.querySelector("#cancel");

const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const short = (value) => {
  const text = String(value ?? "");
  return text.length > 16 ? `${text.slice(0, 7)}…${text.slice(-5)}` : text || "unknown";
};
const safeMissionPath = missionId ? `/mission/${encodeURIComponent(missionId)}` : "/";
const returnPath = requestedReturn.startsWith(safeMissionPath) ? requestedReturn : safeMissionPath;
cancel.href = returnPath;

function randomToken(prefix) {
  if (typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
  status.hidden = false;
}

async function api(path, { method = "GET", body } = {}) {
  const headers = new Headers(
    body === undefined
      ? { Accept: "application/json" }
      : { Accept: "application/json", "Content-Type": "application/json" },
  );
  if (method === "POST" && path !== "/auth/challenge") {
    headers.set("Idempotency-Key", randomToken("recovery"));
  }
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { error: "INVALID_JSON_RESPONSE", message: "Backend returned non-JSON content." }; }
  }
  if (!response.ok) throw new Error(`${payload?.error || `HTTP_${response.status}`}: ${payload?.message || response.statusText}`);
  return payload;
}

async function boot() {
  if (!missionId) {
    setStatus("RECOVERY_INPUT_REQUIRED: mission id is missing.", true);
    return;
  }

  try {
    const nimiq = await getNimiqProvider();
    const accounts = await nimiq.listAccounts();
    if (!Array.isArray(accounts) || accounts.length === 0) throw new Error("RECOVERY_NO_ACCOUNTS: Nimiq Pay shared no accounts.");

    accountsEl.innerHTML = accounts.map((account, index) => `
      <label class="wallet-option">
        <input type="radio" name="wallet" value="${esc(account)}" ${index === 0 ? "checked" : ""} />
        <span><strong>${esc(short(account))}</strong><small>Choose the human/basic mission identity, not the HTLC payment rail.</small></span>
      </label>`).join("");
    form.hidden = false;
    setStatus("Choose the creator/basic identity that owns this mission. Recovery is read-only.");
  } catch (error) {
    setStatus(error?.message || String(error), true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const wallet = new FormData(form).get("wallet");
  if (!wallet) return setStatus("Choose a Nimiq Pay mission identity to continue.", true);

  restoreButton.disabled = true;
  setStatus("Requesting a read-only VIEW_ROUTE signature…");
  try {
    const challenge = await api("/auth/challenge", {
      method: "POST",
      body: { wallet, action: "VIEW_ROUTE", mission_id: missionId },
    });
    const challengeId = challenge?.challenge_id || challenge?.id;
    const message = challenge?.canonical_message || challenge?.message;
    if (!challengeId || !message) throw new Error("VIEW_ROUTE_CHALLENGE_CONTRACT_MISMATCH");

    const nimiq = await getNimiqProvider();
    const signed = await nimiq.sign(message);
    if (!signed?.publicKey || !signed?.signature) throw new Error("VIEW_ROUTE_SIGNATURE_CONTRACT_MISMATCH");

    const view = await api(`/missions/${encodeURIComponent(missionId)}/view`, {
      method: "POST",
      body: {
        challenge_id: challengeId,
        public_key: signed.publicKey,
        signature: signed.signature,
      },
    });
    if (!view?.view_token) throw new Error("VIEW_ROUTE_CAPABILITY_CONTRACT_MISMATCH");

    sessionStorage.setItem(`carryone.view.${missionId}`, view.view_token);
    setStatus("Mission access restored. Returning to the same route…");
    location.replace(returnPath);
  } catch (error) {
    setStatus(error?.message || String(error), true);
    restoreButton.disabled = false;
  }
});

boot();