import { getNimiqProvider } from "/nimiq-provider.js";

(() => {
  "use strict";

  const button = document.querySelector("#run-preflight");
  const card = document.querySelector("#result-card");
  const status = document.querySelector("#preflight-status");
  const output = document.querySelector("#preflight-json");

  const safeClass = (error) => {
    const message = String(error?.message || error || "");
    if (message.includes("NIMIQ_NETWORK_MISMATCH")) return "NETWORK_MISMATCH";
    if (message.includes("NIMIQ_TESTNET_PREFLIGHT_UNAVAILABLE")) return "TESTNET_RPC_UNAVAILABLE_OR_BLOCKED";
    if (message.includes("NIMIQ_NETWORK_NOT_READY")) return "PROVIDER_CONSENSUS_NOT_READY";
    if (message.includes("NIMIQ_NETWORK_PREFLIGHT_UNSUPPORTED")) return "PROVIDER_PREFLIGHT_UNSUPPORTED";
    if (message.includes("NIMIQ_NETWORK_HEIGHT_INVALID")) return "PROVIDER_HEIGHT_INVALID";
    return "PREFLIGHT_FAILED";
  };

  button?.addEventListener("click", async () => {
    button.disabled = true;
    card.hidden = false;
    status.textContent = "Checking Nimiq Pay against the independent TESTNET head…";
    output.textContent = "";
    try {
      const provider = await getNimiqProvider();
      if (typeof provider.assertTestnetPreflight !== "function") {
        throw new Error("NIMIQ_NETWORK_PREFLIGHT_UNSUPPORTED");
      }
      const providerHeight = await provider.assertTestnetPreflight();
      const report = {
        result: "PASS",
        network_requirement: "TESTNET",
        provider_height: Number(providerHeight),
        independent_testnet_alignment: true,
        writes_performed: false,
        safe_next_step: "ONE_CONTROLLED_NIMCARRY_A_TO_B",
      };
      status.textContent = "PASS — Nimiq Pay is aligned with NimCarry TESTNET. No transaction was requested.";
      output.textContent = JSON.stringify(report, null, 2);
    } catch (error) {
      const report = {
        result: "FAIL_CLOSED",
        classification: safeClass(error),
        network_requirement: "TESTNET",
        writes_performed: false,
        safe_next_step: "STOP_NO_PAYMENT",
      };
      status.textContent = "FAIL CLOSED — TESTNET could not be proven. Do not send the baton.";
      output.textContent = JSON.stringify(report, null, 2);
    } finally {
      button.disabled = false;
    }
  });
})();
