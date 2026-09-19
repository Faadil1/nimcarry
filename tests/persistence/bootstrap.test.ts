import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PgMemPool } from "../helpers/pg-mem-pool.js";
import { RelayStore } from "../../src/core/relay.js";
import { PgRelayStore } from "../../src/persistence/pg-relay-store.js";
import { PgMissionRepository } from "../../src/persistence/pg-mission-repository.js";
import { createRepositoryStores, resolveRepositoryMode } from "../../src/persistence/bootstrap.js";
import { MemoryUserDirectory, PgUserDirectory } from "../../src/users/user-directory.js";

const MIGRATION_PATH = join(import.meta.dirname!, "../../migrations/001_reach_mission_foundation.sql");

describe("repository mode resolution", () => {
  it("defaults to file when CARRY_ONE_REPOSITORY is unset", () => {
    expect(resolveRepositoryMode({})).toBe("file");
  });

  it("accepts file and postgres explicitly", () => {
    expect(resolveRepositoryMode({ CARRY_ONE_REPOSITORY: "file" })).toBe("file");
    expect(resolveRepositoryMode({ CARRY_ONE_REPOSITORY: "postgres" })).toBe("postgres");
  });

  it("fails fast on an unknown mode", () => {
    expect(() => resolveRepositoryMode({ CARRY_ONE_REPOSITORY: "redis" })).toThrow(
      /CARRY_ONE_REPOSITORY must be/
    );
  });
});

describe("repository store bootstrap (file mode)", () => {
  it("builds in-memory relay + human user stores when no state file is configured", async () => {
    const stores = await createRepositoryStores({ CARRY_ONE_REPOSITORY: "file" });
    expect(stores.relayStore).toBeInstanceOf(RelayStore);
    expect(stores.userDirectory).toBeInstanceOf(MemoryUserDirectory);
    expect(stores.pool).toBeNull();
    expect(stores.missionRepository).toBeNull();
    await stores.close();
  });
});

describe("repository store bootstrap (postgres mode)", () => {
  it("fails fast when no database URL is configured", async () => {
    const stores = createRepositoryStores({ CARRY_ONE_REPOSITORY: "postgres" });
    await expect(stores).rejects.toThrow(/CARRY_ONE_DATABASE_URL or DATABASE_URL/);
  });

  it("builds PgRelayStore + PgMissionRepository + PgUserDirectory on a shared pool", async () => {
    const pool = new PgMemPool();
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    await pool.exec(sql);

    const stores = await createRepositoryStores(
      {
        CARRY_ONE_REPOSITORY: "postgres",
        CARRY_ONE_DATABASE_URL: "test://ignored",
      },
      () => pool
    );

    expect(stores.relayStore).toBeInstanceOf(PgRelayStore);
    expect(stores.missionRepository).toBeInstanceOf(PgMissionRepository);
    expect(stores.userDirectory).toBeInstanceOf(PgUserDirectory);
    expect(stores.pool).toBe(pool);
    await stores.close();
  });
});
