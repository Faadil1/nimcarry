import { RelayStore } from "../core/relay.js";
import type { MissionRepository } from "../mission/repository.js";
import { MemoryUserDirectory, PgUserDirectory, type UserDirectory } from "../users/user-directory.js";
import { FileRelayStore } from "./file-relay-store.js";
import { PgPool, type PgPoolLike } from "./pg-pool.js";
import { PgMissionRepository } from "./pg-mission-repository.js";
import { PgRelayStore } from "./pg-relay-store.js";

export type RepositoryMode = "postgres" | "file";

export interface RepositoryStores {
  relayStore: RelayStore;
  missionRepository: MissionRepository | null;
  userDirectory: UserDirectory;
  pool: PgPoolLike | null;
  close(): Promise<void>;
}

/**
 * Resolve the storage backend from CARRY_ONE_REPOSITORY. Defaults to "file" so
 * existing deployments keep the current behavior unless they opt into Postgres.
 */
export function resolveRepositoryMode(env: NodeJS.ProcessEnv = process.env): RepositoryMode {
  const raw = env.CARRY_ONE_REPOSITORY?.trim().toLowerCase();
  if (raw === undefined || raw === "") return "file";
  if (raw === "postgres" || raw === "file") return raw;
  throw new Error(`CARRY_ONE_REPOSITORY must be "postgres" or "file", got "${raw}"`);
}

/**
 * Build the configured storage layer. In "file" mode mission/relay behavior
 * remains unchanged and the human-user directory is process-local. Production
 * Postgres mode persists user profiles and wallet links in Neon/PostgreSQL.
 */
export async function createRepositoryStores(
  env: NodeJS.ProcessEnv = process.env,
  poolFactory: (databaseUrl: string) => PgPoolLike = (url: string) => new PgPool(url)
): Promise<RepositoryStores> {
  const mode = resolveRepositoryMode(env);

  if (mode === "postgres") {
    const databaseUrl = env.CARRY_ONE_DATABASE_URL ?? env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        'CARRY_ONE_REPOSITORY=postgres requires CARRY_ONE_DATABASE_URL or DATABASE_URL to be set'
      );
    }
    const pool = poolFactory(databaseUrl);
    const relayStore = await PgRelayStore.load(pool);
    return {
      relayStore,
      missionRepository: new PgMissionRepository(pool),
      userDirectory: new PgUserDirectory(pool),
      pool,
      close: () => pool.close(),
    };
  }

  const relayStateFile = env.CARRY_ONE_RELAY_STATE_FILE;
  return {
    relayStore: relayStateFile ? new FileRelayStore(relayStateFile) : new RelayStore(),
    missionRepository: null,
    userDirectory: new MemoryUserDirectory(),
    pool: null,
    close: async () => undefined,
  };
}
