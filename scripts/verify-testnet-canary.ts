import { HttpNimiqRpcClient, hasReachedFinality } from "../src/nimiq/rpc-client.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readFlag(name: string): string | undefined {
  const args = process.argv.slice(2);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function requiredFlag(name: string): string {
  const value = readFlag(name);
  if (!value) throw new Error(`Missing required --${name}`);
  return value;
}

function normalizeAddress(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function shortAddress(value: string): string {
  const normalized = normalizeAddress(value);
  return normalized.length <= 12 ? normalized : `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
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
  const sender = requiredFlag("sender");
  const recipient = requiredFlag("recipient");
  const expectedLuna = Number(requiredFlag("luna"));
  const expectedData = readFlag("data");
  const timeoutMs = Number(readFlag("timeout-ms") ?? 240_000);

  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("--hash must be a 64-character hex transaction hash");
  if (!Number.isSafeInteger(expectedLuna) || expectedLuna <= 0) throw new Error("--luna must be a positive integer");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10_000) throw new Error("--timeout-ms must be an integer >= 10000");

  const client = new HttpNimiqRpcClient();
  const liveHead = await waitForAdvancingHead(client);
  const deadline = Date.now() + timeoutMs;

  let observedBlock: number | null = null;
  while (Date.now() < deadline) {
    const tx = await client.getTransactionByHash(hash);
    if (tx) {
      if (normalizeAddress(tx.from) !== normalizeAddress(sender)) {
        throw new Error(`CANARY_SENDER_MISMATCH: expected ${shortAddress(sender)}, got ${shortAddress(tx.from)}`);
      }
      if (normalizeAddress(tx.to) !== normalizeAddress(recipient)) {
        throw new Error(`CANARY_RECIPIENT_MISMATCH: expected ${shortAddress(recipient)}, got ${shortAddress(tx.to)}`);
      }
      if (tx.value !== expectedLuna) {
        throw new Error(`CANARY_VALUE_MISMATCH: expected ${expectedLuna} Luna, got ${tx.value}`);
      }
      if (expectedData !== undefined && tx.recipientData !== expectedData) {
        throw new Error("CANARY_DATA_MISMATCH: recipient data does not match the expected value");
      }

      observedBlock = tx.blockNumber;
      const head = await client.getBlockNumber();
      if (hasReachedFinality(tx, head)) {
        console.log(JSON.stringify({
          result: "PASS",
          network: "NIMIQ_TESTNET",
          chain_head_advancing: true,
          initial_live_head: liveHead,
          tx_hash: hash,
          sender: shortAddress(sender),
          recipient: shortAddress(recipient),
          value_luna: expectedLuna,
          included_block: observedBlock,
          final_head: head,
          finality: "FINAL",
        }, null, 2));
        return;
      }
    }
    await sleep(2_000);
  }

  throw new Error(`CANARY_NOT_FINAL_BEFORE_TIMEOUT: tx ${hash} last observed block=${observedBlock ?? "not-found"}`);
}

main().catch((error) => {
  console.error(`REAL_TRANSACTION_READINESS_FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
