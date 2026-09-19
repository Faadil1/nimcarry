import "dotenv/config";
import type { Server } from "node:http";
import { NimiqWalletAuthorizer } from "./mission/wallet-auth.js";
import { FileMissionRepository } from "./mission/file-repository.js";
import { ReachMissionCoordinator } from "./mission/coordinator.js";
import { ReachMissionService } from "./mission/service.js";
import type { MissionRepository } from "./mission/repository.js";
import { decodeKey, TargetWalletProtector } from "./mission/target-wallet-crypto.js";
import { HttpNimiqRpcClient } from "./nimiq/rpc-client.js";
import { ResilientNimiqRpcClient } from "./nimiq/resilient-rpc-client.js";
import { IncomingTransactionWatcher } from "./nimiq/transaction-watcher.js";
import { createRepositoryStores, resolveRepositoryMode } from "./persistence/bootstrap.js";
import { CanonicalRelayService } from "./service/canonical-relay-service.js";
import { MemoryIdempotencyStore } from "./service/idempotency.js";
import { createMissionHttpServer } from "./service/mission-http-server.js";
import { MemoryRateLimiter } from "./service/rate-limiter.js";
import { createHttpServer } from "./service/http-server.js";
import { createUserEmailSender } from "./users/email-auth.js";
import { createNimCarryHttpServer } from "./users/http.js";
import type { UserDirectory } from "./users/user-directory.js";

const port = Number(process.env.PORT ?? 8787);
const defaultRpcUrl = process.env.NIMIQ_RPC_URL ?? "https://rpc.testnet.nimiqwatch.com";
const rpcUrls = (process.env.NIMIQ_RPC_URLS ?? defaultRpcUrl).split(",").map((value) => value.trim()).filter(Boolean);
const watchAddress = process.env.NIMIQ_TESTNET_WALLET_ADDRESS;
const repositoryMode = resolveRepositoryMode();

interface Application {
  server: Server;
  sweep?: () => Promise<number>;
}

async function main(): Promise<void> {
  const stores = await createRepositoryStores();
  const rpc = new ResilientNimiqRpcClient(rpcUrls.map((url) => new HttpNimiqRpcClient(url)));
  const relayService = new CanonicalRelayService(stores.relayStore, rpc);
  const app = createApplicationServer(relayService, stores.missionRepository, stores.userDirectory);
  registerMaintenance(app);

  app.server.listen(port, () => {
    console.log(`Carry One server listening on :${port} (${rpcUrls.length} read RPC endpoint${rpcUrls.length === 1 ? "" : "s"})`);
    console.log(`Repository mode: ${repositoryMode}${repositoryMode === "postgres" ? "" : ` (relay state: ${process.env.CARRY_ONE_RELAY_STATE_FILE ?? "in-memory"})`}`);
    if (!watchAddress) return console.warn("NIMIQ_TESTNET_WALLET_ADDRESS is not configured; transaction watching is disabled");
    new IncomingTransactionWatcher(rpc, watchAddress).start();
  });

  let closing = false;
  const shutdown = async (code: number): Promise<void> => {
    if (closing) return;
    closing = true;
    app.server.close(async () => {
      await stores.close();
      process.exit(code);
    });
  };
  process.once("SIGINT", () => void shutdown(0));
  process.once("SIGTERM", () => void shutdown(0));
}

function createApplicationServer(
  relayService: CanonicalRelayService,
  postgresRepository: MissionRepository | null,
  userDirectory: UserDirectory
): Application {
  const missionStateFile = process.env.CARRY_ONE_MISSION_STATE_FILE;
  const emailSender = createUserEmailSender();
  const encryptionKey = process.env.CARRY_ONE_TARGET_ENCRYPTION_KEY_B64URL;
  const hmacKey = process.env.CARRY_ONE_TARGET_HMAC_KEY_B64URL;
  const repository = postgresRepository ?? (missionStateFile ? new FileMissionRepository(missionStateFile) : null);
  if (!repository || !encryptionKey || !hmacKey) {
    console.warn("Reach Mission HTTP bindings are disabled: configure Postgres or CARRY_ONE_MISSION_STATE_FILE, plus CARRY_ONE_TARGET_ENCRYPTION_KEY_B64URL and CARRY_ONE_TARGET_HMAC_KEY_B64URL to enable them.");
    return { server: createHttpServer(relayService) };
  }

  const protector = new TargetWalletProtector(decodeKey(encryptionKey, "CARRY_ONE_TARGET_ENCRYPTION_KEY_B64URL"), decodeKey(hmacKey, "CARRY_ONE_TARGET_HMAC_KEY_B64URL"));
  const missions = new ReachMissionService(repository, protector);
  const canonicalOrigin = process.env.CARRY_ONE_CANONICAL_ORIGIN ?? `http://localhost:${port}`;
  const coordinator = new ReachMissionCoordinator(missions, repository, relayService, protector);
  const authorizer = new NimiqWalletAuthorizer(repository, canonicalOrigin);
  const missionServer = createMissionHttpServer({
    coordinator,
    missions,
    repository,
    authorizer,
    relay: relayService,
    protector,
    canonicalOrigin,
    idempotency: new MemoryIdempotencyStore(),
    limiter: new MemoryRateLimiter(),
  });

  console.log(`Reach Mission HTTP bindings enabled (${postgresRepository ? "PostgreSQL" : `state: ${missionStateFile}`}, canonical origin: ${canonicalOrigin})`);
  return {
    server: createNimCarryHttpServer(missionServer, userDirectory, canonicalOrigin, emailSender),
    sweep: () => repository.expireDueInvitations(Date.now()),
  };
}

function registerMaintenance(app: Application): void {
  if (!app.sweep) return;
  const intervalMs = Number(process.env.CARRY_ONE_INVITATION_SWEEP_INTERVAL_MS ?? 60_000);
  const timer = setInterval(() => {
    app.sweep!().then(
      (count) => { if (count > 0) console.log(`Carry One invitation sweep expired ${count} invitation${count === 1 ? "" : "s"}`); },
      (err) => console.error("Carry One invitation sweep failed:", err)
    );
  }, intervalMs);
  timer.unref();
  app.server.once("close", () => clearInterval(timer));
}

void main().catch((error) => {
  console.error("Startup failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
