(() => {
  "use strict";

  const label = document.querySelector("#network-label");
  if (!label) return;
  const query = new URLSearchParams(location.search);
  if (query.get("demo") === "1") return;

  // Do not assert TESTNET merely because NimCarry is configured for TESTNET.
  // The payment wrapper independently proves provider-chain alignment before
  // every write and fails closed if it cannot.
  label.textContent = "TESTNET REQUIRED";
})();
