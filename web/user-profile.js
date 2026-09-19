import { getNimiqProvider } from "/nimiq-provider.js";

(() => {
  "use strict";

  const TOKEN_KEY = "nimcarry.userToken";
  const PROFILE_ID = "nimcarry-human-profile";
  const PRIVACY_NOTICE_VERSION = "2026-09-19";
  let cachedProfile = null;
  let loading = false;

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[char]));

  function userToken() {
    const token = localStorage.getItem(TOKEN_KEY);
    return token && /^[A-Za-z0-9_-]{32,}$/.test(token) ? token : null;
  }

  async function userApi(path, { method = "GET", body } = {}) {
    const headers = { Accept: "application/json" };
    const token = userToken();
    if (token) headers["X-NimCarry-User-Token"] = token;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); }
      catch { payload = { error: "INVALID_JSON_RESPONSE", message: "NimCarry returned an unreadable profile response." }; }
    }
    if (!response.ok) {
      const error = new Error(payload?.message || response.statusText);
      error.reason = payload?.error || `HTTP_${response.status}`;
      throw error;
    }
    return payload;
  }

  function profileHost() {
    const screen = document.querySelector("#screen");
    if (!screen) return null;
    const path = location.pathname;
    if (path === "/" || path === "/create" || /^\/i\/[A-Za-z0-9_-]+$/.test(path)) return screen;
    return null;
  }

  function statusLine(profile) {
    if (!profile) return "";
    if (profile.wallet_linked) return "Nimiq wallet linked and verified.";
    return "You are a NimCarry user. Connect Nimiq only when you need custody actions.";
  }

  function renderLoggedOut(host) {
    const card = document.createElement("section");
    card.id = PROFILE_ID;
    card.className = "card human-profile-card";
    card.innerHTML = `
      <div class="kicker">Human first</div>
      <h3>Join NimCarry without a wallet.</h3>
      <p>Name + email creates your NimCarry user profile. A Nimiq wallet is only required later for custody actions such as accepting, holding, or passing the 1 NIM baton.</p>
      <form id="nimcarry-user-register" class="form-grid">
        <label>Name<input name="display_name" maxlength="80" autocomplete="name" required placeholder="Your name" /></label>
        <label>Email<input name="email" maxlength="254" autocomplete="email" type="email" required placeholder="you@example.com" /></label>
        <label class="checkline">
          <input name="privacy_consent" type="checkbox" required />
          <span>I agree to NimCarry storing my name and email to create my profile and measure real product usage. My email is not public and does not authorize custody. <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Notice</a>.</span>
        </label>
        <button class="button secondary" type="submit">Create my NimCarry profile</button>
      </form>
      <small id="nimcarry-user-status">No Nimiq wallet required to register.</small>
    `;
    host.appendChild(card);
    card.querySelector("#nimcarry-user-register")?.addEventListener("submit", registerUser);
  }

  function renderProfile(host, profile) {
    const card = document.createElement("section");
    card.id = PROFILE_ID;
    card.className = "card human-profile-card";
    const wallets = Array.isArray(profile.wallets) ? profile.wallets : [];
    card.innerHTML = `
      <div class="kicker">Your NimCarry profile</div>
      <h3>${esc(profile.display_name)}</h3>
      <p>${esc(profile.email)}</p>
      <div class="warning" style="margin-top:12px">${esc(statusLine(profile))}</div>
      <div class="button-row" style="margin-top:12px">
        ${profile.wallet_linked
          ? `<span class="button ghost" aria-disabled="true">Wallet verified · ${esc(wallets[0]?.fingerprint || "NQ…")}</span>`
          : '<button id="nimcarry-link-wallet" class="button secondary" type="button">Connect Nimiq Pay when ready</button>'}
      </div>
      <small>Email verification is not used for protocol authority. Wallet signatures remain the authority for custody. <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Notice</a>.</small>
      <div class="button-row" style="margin-top:10px"><button id="nimcarry-delete-profile" class="button ghost" type="button">Delete my profile</button></div>
    `;
    host.appendChild(card);
    card.querySelector("#nimcarry-link-wallet")?.addEventListener("click", linkWallet);
    card.querySelector("#nimcarry-delete-profile")?.addEventListener("click", deleteProfile);
  }

  async function registerUser(event) {
    event.preventDefault();
    if (loading) return;
    loading = true;
    const status = document.querySelector("#nimcarry-user-status");
    if (status) status.textContent = "Creating profile…";
    try {
      const form = new FormData(event.currentTarget);
      const profile = await userApi("/users/register", {
        method: "POST",
        body: {
          display_name: String(form.get("display_name") || "").trim(),
          email: String(form.get("email") || "").trim(),
          privacy_consent: form.get("privacy_consent") === "on",
          privacy_notice_version: PRIVACY_NOTICE_VERSION,
        },
      });
      localStorage.setItem(TOKEN_KEY, profile.user_token);
      cachedProfile = profile;
      refresh(true);
      dispatchEvent(new CustomEvent("nimcarry:user-ready", { detail: { user_id: profile.user_id } }));
    } catch (error) {
      if (status) {
        status.textContent = error.reason === "EMAIL_ALREADY_REGISTERED"
          ? "That email already has a NimCarry profile on another browser/session. This build does not yet email recovery links."
          : (error.message || "Could not create profile.");
      }
    } finally {
      loading = false;
    }
  }

  async function deleteProfile() {
    if (loading) return;
    if (!confirm("Delete your NimCarry profile? Linked wallet records and unused wallet-link challenges will be removed. Protocol records and public blockchain history are not rewritten.")) return;
    loading = true;
    try {
      await userApi("/users/me", { method: "DELETE" });
      localStorage.removeItem(TOKEN_KEY);
      cachedProfile = null;
      await refresh(true);
    } catch (error) {
      const host = document.querySelector(`#${PROFILE_ID}`);
      if (host) {
        const note = document.createElement("div");
        note.className = "warning";
        note.style.marginTop = "12px";
        note.textContent = error.message || "Could not delete profile.";
        host.appendChild(note);
      }
    } finally {
      loading = false;
    }
  }

  async function chooseWallet(nimiq) {
    const accounts = await nimiq.listAccounts();
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error("No Nimiq wallet is available in Nimiq Pay yet.");
    }
    if (accounts.length === 1) return accounts[0];

    const host = document.querySelector(`#${PROFILE_ID}`);
    if (!host) return accounts[0];
    const existing = host.querySelector("#nimcarry-wallet-picker");
    if (existing) existing.remove();

    const picker = document.createElement("div");
    picker.id = "nimcarry-wallet-picker";
    picker.className = "card";
    picker.style.marginTop = "12px";
    picker.innerHTML = `
      <label>Choose wallet
        <select id="nimcarry-wallet-select">
          ${accounts.map((wallet) => `<option value="${esc(wallet)}">${esc(wallet.slice(0, 7))}…${esc(wallet.slice(-5))}</option>`).join("")}
        </select>
      </label>
      <button id="nimcarry-wallet-confirm" class="button secondary" type="button">Verify this wallet</button>
    `;
    host.appendChild(picker);
    return new Promise((resolve) => {
      picker.querySelector("#nimcarry-wallet-confirm")?.addEventListener("click", () => {
        const selected = picker.querySelector("#nimcarry-wallet-select")?.value;
        picker.remove();
        resolve(selected || accounts[0]);
      }, { once: true });
    });
  }

  function walletLinkMessage(error) {
    const message = String(error?.message || "");
    if (/provider was not injected|running inside a Nimiq app|injected provider is unavailable/i.test(message)) {
      return "Open NimCarry inside Nimiq Pay to connect your wallet. This browser tab can keep your profile, but Safari or Chrome cannot provide the Nimiq Pay wallet connection.";
    }
    return message || "Wallet link failed.";
  }

  function showWalletLinkNotice(message) {
    const host = document.querySelector(`#${PROFILE_ID}`);
    if (!host) return;
    let note = host.querySelector("#nimcarry-wallet-link-notice");
    if (!note) {
      note = document.createElement("div");
      note.id = "nimcarry-wallet-link-notice";
      note.className = "warning";
      note.setAttribute("role", "status");
      note.setAttribute("aria-live", "polite");
      note.style.marginTop = "12px";
      host.appendChild(note);
    }
    note.textContent = message;
  }

  async function linkWallet() {
    if (loading) return;
    loading = true;
    const button = document.querySelector("#nimcarry-link-wallet");
    if (button) button.disabled = true;
    try {
      const nimiq = await getNimiqProvider();
      if (!nimiq || typeof nimiq.listAccounts !== "function" || typeof nimiq.sign !== "function") {
        throw new Error("Open NimCarry in Nimiq Pay to link a wallet.");
      }
      const wallet = await chooseWallet(nimiq);
      const challenge = await userApi("/users/wallet/challenge", {
        method: "POST",
        body: { wallet },
      });
      const signed = await nimiq.sign(challenge.message);
      if (!signed?.publicKey || !signed?.signature) throw new Error("Nimiq Pay did not return a wallet signature.");
      cachedProfile = await userApi("/users/wallet/link", {
        method: "POST",
        body: {
          challenge_id: challenge.challenge_id,
          public_key: signed.publicKey,
          signature: signed.signature,
        },
      });
      document.querySelector("#nimcarry-wallet-link-notice")?.remove();
      refresh(true);
    } catch (error) {
      showWalletLinkNotice(walletLinkMessage(error));
      if (button) button.disabled = false;
    } finally {
      loading = false;
    }
  }

  async function loadProfile() {
    if (!userToken()) return null;
    if (cachedProfile) return cachedProfile;
    try {
      cachedProfile = await userApi("/users/me");
      return cachedProfile;
    } catch (error) {
      if (error.reason === "USER_TOKEN_INVALID" || error.reason === "USER_TOKEN_REQUIRED") {
        localStorage.removeItem(TOKEN_KEY);
      }
      return null;
    }
  }

  async function refresh(force = false) {
    const host = profileHost();
    if (!host) return;
    const existing = document.querySelector(`#${PROFILE_ID}`);
    if (existing && !force) return;
    existing?.remove();
    const profile = await loadProfile();
    if (!document.contains(host)) return;
    if (profile) renderProfile(host, profile);
    else renderLoggedOut(host);
  }

  const observer = new MutationObserver(() => void refresh());
  const screen = document.querySelector("#screen");
  if (screen) observer.observe(screen, { childList: true, subtree: false });
  addEventListener("popstate", () => setTimeout(() => void refresh(true), 0));
  void refresh(true);
})();
