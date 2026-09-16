import { getNimiqProvider } from "/nimiq-provider.js";

const run = document.querySelector("#run");
const copy = document.querySelector("#copy");
const status = document.querySelector("#status");
const result = document.querySelector("#result");

let latest = null;

function safeError(error) {
  const message = String(error?.message || error || "Unknown provider error");
  if (/permission|denied|reject/i.test(message)) return "PERMISSION_DENIED";
  if (/timeout/i.test(message)) return "PROVIDER_TIMEOUT";
  if (/consensus|sync/i.test(message)) return "CONSENSUS_SYNC_FAILURE";
  if (/network|transport|connection/i.test(message)) return "PROVIDER_TRANSPORT_FAILURE";
  return "PROVIDER_READ_FAILURE";
}

async function runDiagnostic() {
  run.disabled = true;
  copy.hidden = true;
  result.hidden = true;
  status.textContent = "Waiting for Nimiq Pay provider…";
  try {
    const nimiq = await getNimiqProvider();
    if (!nimiq || typeof nimiq.listAccounts !== "function") throw new Error("listAccounts() unavailable");

    const accounts = await nimiq.listAccounts();
    if (!Array.isArray(accounts)) throw new Error("listAccounts() returned a non-array result");

    let consensus = null;
    let blockNumber = null;
    if (typeof nimiq.isConsensusEstablished === "function") {
      try { consensus = await nimiq.isConsensusEstablished(); } catch { consensus = null; }
    }
    if (typeof nimiq.getBlockNumber === "function") {
      try {
        const value = Number(await nimiq.getBlockNumber());
        blockNumber = Number.isFinite(value) ? value : null;
      } catch { blockNumber = null; }
    }

    latest = {
      diagnostic: "NIMIQ_PAY_PAYMENT_IDENTITY",
      network: "TESTNET",
      observed_at: new Date().toISOString(),
      account_count: accounts.length,
      list_accounts: accounts,
      consensus_established: consensus,
      block_number: blockNumber,
      writes_performed: false,
    };

    result.textContent = JSON.stringify(latest, null, 2);
    result.hidden = false;
    copy.hidden = false;
    status.textContent = accounts.length
      ? "Read-only identity captured. Keep this result private and pair it with the FINAL native TESTNET transaction hash."
      : "Nimiq Pay returned no accounts.";
  } catch (error) {
    latest = null;
    status.textContent = `Diagnostic failed: ${safeError(error)}`;
    status.classList.add("error");
  } finally {
    run.disabled = false;
  }
}

run?.addEventListener("click", () => void runDiagnostic());
copy?.addEventListener("click", async () => {
  if (!latest) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(latest, null, 2));
    status.textContent = "Diagnostic JSON copied. Treat the full account address as private testing data.";
  } catch {
    status.textContent = "Copy was unavailable. Select the JSON manually.";
  }
});
