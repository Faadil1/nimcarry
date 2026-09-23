import { classifyNimiqAccounts, getNimiqProvider, isBasicNimiqAccountType } from "/nimiq-provider.js";

(() => {
  "use strict";

  const TOKEN_KEY = "nimcarry.userToken";
  const SIGNIN_PROGRESS_KEY = "nimcarry.signInProgress";
  const PROFILE_ID = "nimcarry-human-profile";
  const PRIVACY_NOTICE_VERSION = "2026-09-19";
  let cachedProfile = null;
  let loading = false;
  let loginChallengeId = null;
  let refreshPromise = null;
  let forcedRefreshPending = false;

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[char]));

  function userToken() {
    const token = localStorage.getItem(TOKEN_KEY);
    return token && /^[A-Za-z0-9_-]{32,}$/.test(token) ? token : null;
  }

  function clearSignInProgress() {
    localStorage.removeItem(SIGNIN_PROGRESS_KEY);
  }

  function writeSignInProgress(stage, details = {}) {
    const progress = {
      stage,
      challenge_id: typeof details.challenge_id === "string" ? details.challenge_id : null,
      expires_at: Number.isFinite(Number(details.expires_at)) ? Number(details.expires_at) : null,
      updated_at: Date.now(),
    };
    // Privacy boundary: never persist the email address or one-time code here.
    localStorage.setItem(SIGNIN_PROGRESS_KEY, JSON.stringify(progress));
    return progress;
  }

  function readSignInProgress() {
    let progress = null;
    try { progress = JSON.parse(localStorage.getItem(SIGNIN_PROGRESS_KEY) || "null"); }
    catch { clearSignInProgress(); return null; }
    if (!progress || !["REQUESTING", "CODE_SENT", "VERIFYING"].includes(progress.stage)) {
      clearSignInProgress();
      return null;
    }
    if (
      ["CODE_SENT", "VERIFYING"].includes(progress.stage) &&
      (!progress.challenge_id || !Number.isFinite(Number(progress.expires_at)))
    ) {
      clearSignInProgress();
      return null;
    }
    if (
      ["CODE_SENT", "VERIFYING"].includes(progress.stage) &&
      Number(progress.expires_at) <= Date.now()
    ) {
      clearSignInProgress();
      return { stage: "EXPIRED" };
    }
    return progress;
  }

  function restoreSignInProgress(card) {
    const progress = readSignInProgress();
    if (!progress) return;
    const status = card.querySelector("#nimcarry-signin-status");
    const verify = card.querySelector("#nimcarry-user-signin-verify");

    if (progress.stage === "EXPIRED") {
      if (status) status.textContent = "Your previous sign-in code expired. Request a new code to continue with the same profile.";
      return;
    }

    if (progress.stage === "REQUESTING") {
      if (status) status.textContent = "A previous sign-in request was interrupted before a code was confirmed. Request a fresh code to continue.";
      return;
    }

    loginChallengeId = progress.challenge_id;
    if (verify) verify.hidden = false;
    if (status) {
      status.textContent = progress.stage === "VERIFYING"
        ? "Code verification was interrupted. Try the code once more. If it was already consumed, request a new code."
        : "Resume sign-in: enter the 6-digit code if you received it. If not, request a fresh code using the exact email you originally registered with.";
    }
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
    const count = Array.isArray(profile.wallets) ? profile.wallets.length : 0;
    if (count > 0) return `${count} Nimiq wallet${count === 1 ? "" : "s"} linked and verified.`;
    return "You are a NimCarry user. Connect Nimiq only when you need custody actions.";
  }

  function renderLoggedOut(host) {
    const card = document.createElement("section");
    card.id = PROFILE_ID;
    card.className = "card human-profile-card";
    card.innerHTML = `
      <div class="kicker">Returning user</div>
      <h3>Already have a NimCarry profile?</h3>
      <p>Use the same email you registered with. We’ll send a 6-digit code so you can restore your existing profile on this browser or inside Nimiq Pay.</p>
      <form id="nimcarry-user-signin-request" class="form-grid">
        <label>Email<input name="email" maxlength="254" autocomplete="email" type="email" required placeholder="you@example.com" /></label>
        <button class="button secondary" type="submit">Send sign-in code</button>
      </form>
      <form id="nimcarry-user-signin-verify" class="form-grid" hidden style="margin-top:12px">
        <label>6-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="123456" /></label>
        <button class="button secondary" type="submit">Sign in to my profile</button>
      </form>
      <small id="nimcarry-signin-status" role="status" aria-live="polite">Returning users keep the same profile, history, and linked wallets.</small>
      <div id="nimcarry-signin-help" class="warning" hidden style="margin-top:10px">
        <strong>No code yet?</strong>
        Check inbox and spam, then make sure you used the exact email originally registered with NimCarry.
        If you never created a NimCarry profile, use “New to NimCarry?” below instead.
      </div>

      <div style="margin:22px 0 18px;border-top:1px solid var(--line,#d8cbbb);padding-top:18px">
        <div class="kicker">New to NimCarry?</div>
        <h3>Create your profile without a wallet.</h3>
        <p>Name + email creates your NimCarry user profile. A Nimiq wallet is only required later for custody actions such as accepting, holding, or passing the 1 NIM baton.</p>
      </div>
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
    card.querySelector("#nimcarry-user-signin-request")?.addEventListener("submit", requestSignIn);
    card.querySelector("#nimcarry-user-signin-verify")?.addEventListener("submit", verifySignIn);
    card.querySelector("#nimcarry-user-register")?.addEventListener("submit", registerUser);
    restoreSignInProgress(card);
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
      ${wallets.length
        ? `<div class="button-row" style="margin-top:10px">${wallets.map((wallet) => `<span class="button ghost" aria-disabled="true">Verified · ${esc(wallet.fingerprint || "NQ…")}</span>`).join("")}</div>`
        : ""}
      <div class="button-row" style="margin-top:12px">
        <button id="nimcarry-link-wallet" class="button secondary" type="button">${wallets.length ? "Add another Nimiq wallet" : "Connect Nimiq Pay when ready"}</button>
      </div>
      <small>${profile.email_verified ? "Email verified for profile recovery." : "Email not verified yet."} Email is never protocol authority; wallet signatures remain the authority for custody. <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Notice</a>.</small>
      <div class="button-row" style="margin-top:10px"><button id="nimcarry-delete-profile" class="button ghost" type="button">Delete my profile</button></div>
    `;
    host.appendChild(card);
    card.querySelector("#nimcarry-link-wallet")?.addEventListener("click", linkWallet);
    card.querySelector("#nimcarry-delete-profile")?.addEventListener("click", deleteProfile);
  }

  async function requestSignIn(event) {
    event.preventDefault();
    if (loading) return;
    loading = true;
    const status = document.querySelector("#nimcarry-signin-status");
    if (status) status.textContent = "Sending code…";
    writeSignInProgress("REQUESTING");
    try {
      const form = new FormData(event.currentTarget);
      const result = await userApi("/users/auth/request", {
        method: "POST",
        body: { email: String(form.get("email") || "").trim() },
      });
      loginChallengeId = result.challenge_id;
      const expiresAt = Number.isFinite(Date.parse(String(result.expires_at || "")))
        ? Date.parse(String(result.expires_at))
        : Date.now() + (Number(result.expires_in_seconds) || 600) * 1000;
      writeSignInProgress("CODE_SENT", {
        challenge_id: loginChallengeId,
        expires_at: expiresAt,
      });
      const verify = document.querySelector("#nimcarry-user-signin-verify");
      if (verify) verify.hidden = false;
      verify?.querySelector('input[name="code"]')?.focus();
      if (status) status.textContent = "If that exact email belongs to a NimCarry profile, a 6-digit code is on its way. It expires in 10 minutes.";
      const help = document.querySelector("#nimcarry-signin-help");
      if (help) help.hidden = false;
    } catch (error) {
      clearSignInProgress();
      loginChallengeId = null;
      const help = document.querySelector("#nimcarry-signin-help");
      if (help) help.hidden = false;
      if (status) {
        status.textContent = error.reason === "EMAIL_DELIVERY_NOT_CONFIGURED"
          ? "Returning-user email sign-in is being configured. Your existing profile is safe; try again shortly."
          : (error.message || "Could not send sign-in code.");
      }
    } finally {
      loading = false;
    }
  }

  async function verifySignIn(event) {
    event.preventDefault();
    if (loading || !loginChallengeId) return;
    loading = true;
    const status = document.querySelector("#nimcarry-signin-status");
    if (status) status.textContent = "Checking code…";
    const currentProgress = readSignInProgress();
    writeSignInProgress("VERIFYING", {
      challenge_id: loginChallengeId,
      expires_at: currentProgress?.expires_at || (Date.now() + 10 * 60 * 1000),
    });
    try {
      const form = new FormData(event.currentTarget);
      const profile = await userApi("/users/auth/verify", {
        method: "POST",
        body: {
          challenge_id: loginChallengeId,
          code: String(form.get("code") || "").trim(),
        },
      });
      localStorage.setItem(TOKEN_KEY, profile.user_token);
      cachedProfile = profile;
      loginChallengeId = null;
      clearSignInProgress();
      await refresh(true);
      dispatchEvent(new CustomEvent("nimcarry:user-ready", { detail: { user_id: profile.user_id, returning: true } }));
    } catch (error) {
      const terminal = ["LOGIN_CODE_EXPIRED", "LOGIN_CODE_LOCKED", "LOGIN_CODE_REPLAY"].includes(error.reason);
      if (terminal) {
        clearSignInProgress();
        loginChallengeId = null;
        const verify = document.querySelector("#nimcarry-user-signin-verify");
        if (verify) verify.hidden = true;
      } else {
        const progress = readSignInProgress();
        writeSignInProgress("CODE_SENT", {
          challenge_id: loginChallengeId,
          expires_at: progress?.expires_at || (Date.now() + 10 * 60 * 1000),
        });
      }
      if (status) {
        status.textContent = error.reason === "LOGIN_CODE_EXPIRED"
          ? "That code expired. Request a new one."
          : error.reason === "LOGIN_CODE_LOCKED"
            ? "Too many incorrect attempts. Request a new code."
            : error.reason === "LOGIN_CODE_REPLAY"
              ? "That code was already used. Request a new code to restore this browser."
              : (error.message || "Could not sign in.");
      }
    } finally {
      loading = false;
    }
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
          ? "That email already has a NimCarry profile. Use “Returning user” above to sign in instead of creating another account."
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
    const exposedAccounts = await nimiq.listAccounts();
    if (!Array.isArray(exposedAccounts) || exposedAccounts.length === 0) {
      throw new Error("No Nimiq wallet is available in Nimiq Pay yet.");
    }

    const classified = await classifyNimiqAccounts(exposedAccounts);
    const accounts = classified
      .filter((account) => isBasicNimiqAccountType(account.type))
      .map((account) => account.address);
    if (accounts.length === 0) {
      throw new Error("Nimiq Pay exposed no basic wallet identity. HTLC payment rails cannot be linked as NimCarry profile wallets.");
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
      <label>Choose basic wallet identity
        <select id="nimcarry-wallet-select">
          ${accounts.map((wallet) => `<option value="${esc(wallet)}">${esc(wallet.slice(0, 7))}…${esc(wallet.slice(-5))}</option>`).join("")}
        </select>
      </label>
      <small>HTLC payment rails are hidden here because they are not human wallet identities.</small>
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
    if (refreshPromise) {
      if (force) forcedRefreshPending = true;
      return refreshPromise;
    }

    refreshPromise = (async () => {
      const host = profileHost();
      if (!host) return;

      const existing = [...host.querySelectorAll(`#${PROFILE_ID}`)];
      if (existing.length === 1 && !force) return;
      existing.forEach((card) => card.remove());

      const profile = await loadProfile();
      if (!document.contains(host) || profileHost() !== host) return;

      // A MutationObserver can fire while an async profile read is pending.
      // Re-dedupe immediately before render so one host can never accumulate
      // repeated profile cards.
      [...host.querySelectorAll(`#${PROFILE_ID}`)].forEach((card) => card.remove());
      if (profile) renderProfile(host, profile);
      else renderLoggedOut(host);
    })();

    try {
      await refreshPromise;
    } finally {
      refreshPromise = null;
      if (forcedRefreshPending) {
        forcedRefreshPending = false;
        queueMicrotask(() => void refresh(true));
      }
    }
  }

  const observer = new MutationObserver(() => void refresh());
  const screen = document.querySelector("#screen");
  if (screen) observer.observe(screen, { childList: true, subtree: false });
  addEventListener("popstate", () => setTimeout(() => void refresh(true), 0));
  void refresh(true);
})();
