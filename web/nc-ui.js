// Shared visual pieces for the NimCarry interface: the letter (the payment link as an
// object), the wax seal (the 1 NIM), confetti, and the drag-to-send gesture.
// Markup only uses classes: the dev server's CSP forbids inline style attributes.

const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

let uid = 0;
const nextId = (prefix) => `${prefix}${++uid}`;

export function setGround(name) {
  if (document.body.dataset.ground !== name) document.body.dataset.ground = name;
}

export function arrowSvg(direction = "right") {
  const path = direction === "left" ? "M15 5 L8 12 L15 19" : "M5 12 H19 M13 6 L19 12 L13 18";
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}

export function hexSvg(fill = "#e0b34f", stroke = "#fff8e9") {
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3 L35 11.5 L35 28.5 L20 37 L5 28.5 L5 11.5 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
}

// A gold wax seal embossed with the Nimiq hexagon: the 1 NIM that seals the letter.
export function sealSvg() {
  const g = nextId("ncw");
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
<defs>
<radialGradient id="${g}a" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="#fff3c4"/><stop offset=".22" stop-color="#f1c85a"/><stop offset=".55" stop-color="#d5a63e"/><stop offset=".82" stop-color="#9f7221"/><stop offset="1" stop-color="#6e4b0f"/></radialGradient>
<linearGradient id="${g}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b0"/><stop offset=".55" stop-color="#c4933f"/><stop offset="1" stop-color="#7a520e"/></linearGradient>
</defs>
<path d="M50 5 C62 4 70 10 78 14 C88 19 95 28 95 40 C97 50 94 58 96 66 C95 78 86 86 76 91 C66 96 56 94 48 96 C36 97 26 92 18 86 C9 79 5 68 6 56 C4 46 7 37 9 30 C14 18 24 11 36 7 C41 5 45 6 50 5 Z" fill="url(#${g}a)"/>
<circle cx="50" cy="51" r="31" fill="none" stroke="#7a520e" stroke-opacity=".45" stroke-width="2.5"/>
<circle cx="50" cy="51" r="27" fill="none" stroke="#fff3c4" stroke-opacity=".35" stroke-width="1.2"/>
<path d="M50 31 L67 41 L67 61 L50 71 L33 61 L33 41 Z" fill="url(#${g}b)" stroke="#6e4b0f" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M50 36 L62 43 L62 50 L38 50 L38 43 Z" fill="#fff" opacity=".35"/>
<ellipse cx="33" cy="24" rx="13" ry="5.5" fill="#fff" opacity=".6" transform="rotate(-30 33 24)"/>
</svg>`;
}

function stampMarkup(state, to, date) {
  if (state === "sealed") return `<div class="nc-stamp nc-stamp--waiting" aria-hidden="true"><span>Waiting to be</span><strong>opened</strong></div>`;
  if (state === "opened" || state === "sending") return `<div class="nc-stamp nc-stamp--opened" aria-hidden="true"><span>Opened by</span><strong>${esc(to)}</strong></div>`;
  if (state === "arrived") return `<div class="nc-stamp nc-stamp--arrived" aria-hidden="true"><span>${esc(date || "")}</span><strong>Arrived</strong><span>Confirmed on Nimiq</span></div>`;
  return "";
}

/**
 * The payment link as an object.
 * state: draft | sealed (sender waits) | incoming (recipient's view) | opened | sending | arrived
 */
export function letterMarkup({ to = "", from = "", note = "", state = "draft", reference = "", date = "", tilt = "" } = {}) {
  const name = String(to || "").trim();
  const shownName = name || "Their name";
  const onlyName = (name || "them").toUpperCase();
  const fromLine = String(from || "").trim();
  const label = state === "arrived" ? `1 NIM delivered to ${name || "the recipient"}` : `Payment link: 1 NIM for ${name || "the recipient"}`;
  return `<article class="nc-letter${tilt ? ` nc-tilt-${esc(tilt)}` : ""}" data-state="${esc(state)}" aria-label="${esc(label)}">
<div class="nc-letter__meta"><span>NimCarry · private link</span><span>${esc(reference ? `N° ${reference}` : "N° ——")}</span></div>
<div class="nc-letter__amount"><b>1</b><span>NIM</span></div>
<div class="nc-letter__for"><span class="nc-letter__label">For</span><span class="nc-letter__name${name ? "" : " is-empty"}" data-letter-name>${esc(shownName)}</span><span class="nc-letter__label" data-letter-from${fromLine ? "" : " hidden"}>From <span data-letter-from-name>${esc(fromLine)}</span></span></div>
<p class="nc-letter__note" data-letter-note>${esc(note)}</p>
<div class="nc-letter__fold" aria-hidden="true"></div>
<div class="nc-letter__foot"><span class="nc-letter__only">Only <span data-letter-only>${esc(onlyName)}</span> can open this</span><span class="nc-postage" aria-hidden="true">${hexSvg()}<span>1 NIM</span></span></div>
<div class="nc-seal" aria-hidden="true">${sealSvg()}</div>
${stampMarkup(state, name || "them", date)}
</article>`;
}

export function referenceFor(id) {
  const clean = String(id || "").replace(/[^A-Za-z0-9]/g, "");
  return clean ? clean.slice(-4).toUpperCase() : "";
}

export function confettiMarkup() {
  return `<div class="nc-confetti" aria-hidden="true"><svg viewBox="0 0 400 520" preserveAspectRatio="none">
<circle class="p" cx="345" cy="70" r="30" fill="#e0b34f"/>
<path class="p" d="M-10 330 A60 60 0 0 1 110 330 Z" fill="#183f36"/>
<rect class="p" x="318" y="300" width="58" height="58" rx="14" fill="#ddd9f2" transform="rotate(18 347 329)"/>
<path class="p" d="M30 150 C45 132 60 168 75 150 C90 132 105 168 120 150" fill="none" stroke="#a94f37" stroke-width="9" stroke-linecap="round"/>
<circle class="p" cx="60" cy="90" r="11" fill="#c77455"/>
<path class="p" d="M300 420 L324 462 L276 462 Z" fill="#a94f37"/>
<circle class="p" cx="372" cy="200" r="9" fill="#2f6a53"/>
<rect class="p" x="16" y="420" width="15" height="40" rx="7.5" fill="#e0b34f" transform="rotate(-24 23 440)"/>
<path class="p" d="M200 18 L208 34 L226 36 L212 48 L216 66 L200 57 L184 66 L188 48 L174 36 L192 34 Z" fill="#c4933f"/>
</svg></div>`;
}

export function dropMarkup(to) {
  const name = String(to || "").trim() || "them";
  const initial = (name.charAt(0) || "?").toUpperCase();
  return `<div class="nc-drop" id="nc-drop" data-state="ready">
<span class="nc-drop__hint" aria-hidden="true"><svg width="16" height="24" viewBox="0 0 16 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4 L12 12 L4 20"/></svg><svg width="16" height="24" viewBox="0 0 16 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4 L12 12 L4 20"/></svg><svg width="16" height="24" viewBox="0 0 16 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4 L12 12 L4 20"/></svg></span>
<span class="nc-drop__target" aria-hidden="true"><b>${esc(initial)}</b><small>${esc(name)}’s wallet</small></span>
<button type="button" class="nc-drop__knob" id="nc-drop-knob" aria-label="Send 1 NIM to ${esc(name)}: drag the seal onto their wallet, or press Enter">${sealSvg()}</button>
</div>`;
}

/**
 * Drag the wax seal onto the recipient. Calls onDrop once when released close enough.
 * Keyboard: Enter/Space on the seal also sends (same action as the send button).
 */
export function bindDrop(root, onDrop) {
  const knob = root?.querySelector(".nc-drop__knob");
  const target = root?.querySelector(".nc-drop__target");
  if (!root || !knob || !target) return () => {};
  let startX = 0;
  let x = 0;
  let dragging = false;
  let done = false;
  const maxX = () => Math.max(0, target.offsetLeft + target.offsetWidth / 2 - (knob.offsetLeft + knob.offsetWidth / 2));
  const setX = (value) => { x = value; knob.style.setProperty("--x", `${value}px`); root.classList.toggle("is-near", value > maxX() * 0.72); };
  const finish = () => {
    if (done) return;
    done = true;
    setX(maxX());
    root.classList.add("is-done");
    root.dataset.state = "dropped";
    setTimeout(() => onDrop(), 260);
  };
  const reset = () => { done = false; root.classList.remove("is-done", "is-near"); root.dataset.state = "ready"; setX(0); };
  knob.addEventListener("pointerdown", (event) => {
    if (done || root.getAttribute("aria-disabled") === "true") return;
    dragging = true;
    startX = event.clientX - x;
    root.classList.add("is-dragging");
    knob.setPointerCapture?.(event.pointerId);
  });
  knob.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    setX(Math.max(0, Math.min(maxX(), event.clientX - startX)));
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("is-dragging");
    if (x > maxX() * 0.72) finish();
    else setX(0);
  };
  knob.addEventListener("pointerup", release);
  knob.addEventListener("pointercancel", release);
  knob.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); finish(); }
  });
  return reset;
}

export const PHASE_COPY = {
  "authorization-requested": "Confirm it’s you in Nimiq Pay…",
  "authorized": "Signed. Preparing the payment…",
  "wallet-approval-opened": "Approve exactly 1 NIM in Nimiq Pay.",
  "provider-reference-returned": "Sent. Recording it…",
  "broadcast-unproven": "Nimiq Pay didn’t return a reference. Checking the network — don’t send again.",
  "broadcast-claim-recorded": "Sent. Waiting for the Nimiq network…",
  "verification-pending": "Sealed and sent. Confirming on the Nimiq network…",
  "verification-status": "Confirming on the Nimiq network…",
  "verification-delayed": "Confirmation is taking a while. We keep checking — don’t send again.",
  "verification-backgrounded": "Still confirming. You can close the app; it will show up here.",
  "final": "Confirmed on the Nimiq network.",
  "error": "Nothing was sent twice. Read the message above.",
};

export function phaseMarkup() {
  return `<div class="nc-phase" id="nc-phase" data-phase="idle" role="status" aria-live="polite"><span class="nc-phase__icon">${sealSvg()}</span><span id="nc-phase-text"></span></div>`;
}

export function setPhase(phase) {
  const node = document.querySelector("#nc-phase");
  if (!node) return;
  const text = PHASE_COPY[phase];
  if (!text) return;
  node.dataset.phase = phase;
  const label = node.querySelector("#nc-phase-text");
  if (label) label.textContent = text;
}
