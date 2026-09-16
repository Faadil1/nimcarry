import { HttpNimiqRpcClient, hasReachedFinality } from "../src/nimiq/rpc-client.js";
import { classifyPaymentSender, normalizeNimiqAddress, shortNimiqAddress } from "../src/nimiq/payment-identity.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function args(): string[] {
  return process.argv.slice(2);
}

function readFlag(name: string): string | undefined {
  const all = args();
  const index = all.indexOf(`--${name}`);
  return index >= 0 ? all[index + 1] : undefined;
}

function readAllFlags(name: string): string[] {
  const all = args();
  const values: string[] = [];
  for (let i = 0; i < all.length; i += 1) {
    if (all[i] === `--${name}` && all[i + 1]) values.push(all[i + 1]);
  }
  return values;
}

function requiredFlag(name: string): string {
  const value = readFlag(name);
  if (!value) throw new Error(`Missing required --${name}`);
  return value;
}

async function waitForAdvancingHead(client: HttpNimiqRpcClient, timeoutMs = 15_000): Promise<number> {
  const first = await client.getBlockNumber();
  const deadline = Date.now() + timeoutMs;
  let latest = first;
  while (Date.now() < deadline) {
    await sleep(1_500);
    latest = await client.getBlockNumber();
    if (latest > first) return latest;
  }
  throw new Error(`TESTNET_HEAD_NOT_ADVANCING: head remained at ${latest}`);
}

async function main() {
  const hash = requiredFlag("hash").toLowerCase();
  const listedAccounts = readAllFlags("listed-account");
  const expectedRecipient = readFlag("recipient");
  const expectedLunaRaw = readFlag("luna");
  const expectedData = readFlag("data");
  const timeoutMs = Number(readFlag("timeout-ms") ?? 240_000);

  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("--hash must be a 64-character hex transaction hash");
  if (expectedLunaRaw !== undefined && (!Number.isSafeInteger(Number(expectedLunaRaw)) || Number(expectedLunaRaw) <= 0)) {
    throw new Error("--luna must be a positive integer when supplied");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10_000) throw new Error("--timeout-ms must be an integer >= 10000");

  const client = new HttpNimiqRpcClient();
  const initialLiveHead = await waitForAdvancingHead(client);
  const deadline = Date.now() + timeoutMs;
  let lastObservedBlock: number | null = null;

  while (Date.now() < deadline) {
    const tx = await client.getTransactionByHash(hash);
    if (!tx) {
      await sleep(2_000);
      continue;
    }

    lastObservedBlock = tx.blockNumber;

    if (expectedRecipient && normalizeNimiqAddress(tx.to) !== normalizeNimiqAddress(expectedRecipient)) {
      throw new Error(`DIAGNOSTIC_RECIPIENT_MISMATCH: expected ${shortNimiqAddress(expectedRecipient)}, got ${shortNimiqAddress(tx.to)}`);
    }
    if (expectedLunaRaw !== undefined && tx.value !== Number(expectedLunaRaw)) {
      throw new Error(`DIAGNOSTIC_VALUE_MISMATCH: expected ${expectedLunaRaw} Luna, got ${tx.value}`);
    }
    if (expectedData !== undefined && tx.recipientData !== expectedData) {
      throw new Error("DIAGNOSTIC_DATA_MISMATCH: recipient data does not match the expected value");
    }

    const head = await client.getBlockNumber();
    if (!hasReachedFinality(tx, head)) {
      await sleep(2_000);
      continue;
    }

    const senderRelation = classifyPaymentSender(tx.from, listedAccounts);
    const report = {
      result: "OBSERVED_FINAL",
      network: "NIMIQ_TESTNET",
      diagnostic_only: true,
      tx_hash: hash,
      chain_head_advancing: true,
      initial_live_head: initialLiveHead,
      included_block: tx.blockNumber,
      final_head: head,
      finality: "FINAL",
      observed_sender: shortNimiqAddress(tx.from),
      listed_accounts: listedAccounts.map(shortNimiqAddress),
      sender_relation: senderRelation,
      recipient: shortNimiqAddress(tx.to),
      value_luna: tx.value,
      data_matches_expected: expectedData === undefined ? null : tx.recipientData === expectedData,
      interpretation:
        senderRelation === "DIFFERS_FROM_LISTED_ACCOUNTS"
          ? "The FINAL on-chain sender differs from the account identity supplied from Nimiq Pay. Do not weaken custody checks; establish an authorized payment-address mapping before changing canonical validation."
          : senderRelation === "MATCHES_LISTED_ACCOUNT"
            ? "The FINAL on-chain sender matches one of the supplied Nimiq Pay account identities."
            : "No Nimiq Pay listAccounts() identity was supplied, so sender mapping remains unclassified.",
    };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  throw new Error(`DIAGNOSTIC_NOT_FINAL_BEFORE_TIMEOUT: tx ${hash} last observed block=${lastObservedBlock ?? "not-found"}`);
}

main().catch((error) => {
  console.error(`PAYMENT_IDENTITY_DIAGNOSTIC_FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
