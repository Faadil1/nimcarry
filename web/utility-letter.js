// Renders the NimCarry letter on the standalone utility pages. Presentation only.
import { letterMarkup } from "/nc-ui.js";
import "/nc-wax.js";

document.querySelectorAll("[data-letter]").forEach((slot) => {
  slot.innerHTML = letterMarkup({
    to: slot.dataset.to || "",
    from: slot.dataset.from || "",
    note: slot.dataset.note || "",
    state: slot.dataset.letter || "incoming",
  });
});
