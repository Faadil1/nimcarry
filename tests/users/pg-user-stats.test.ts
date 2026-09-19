import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrivateKey, PublicKey } from "@nimiq/core";
import { describe, expect, it } from "vitest";
import { PgMemPool } from "../helpers/pg-mem-pool.js";
import {
  PgUserDirectory,
  PRIVACY_NOTICE_VERSION,
  newProfileToken,
  profileTokenHash,
} from "../../src/users/user-directory.js";

function wallet(): string {
  return PublicKey.derive(PrivateKey.generate()).toAddress().toUserFriendlyAddress();
}

const FOUNDATION_MIGRATION = "../../migrations/001_reach_mission_foundation.sql";

const USER_SCHEMA_FOR_PG_MEM = `
  CREATE TABLE users (
    id uuid PRIMARY KEY,
    email_normalized text NOT NULL UNIQUE,
    display_name text NOT NULL,
    profile_token_hash text NOT NULL UNIQUE,
    email_verified_at timestamptz,
    privacy_notice_version text,
    privacy_consent_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL
  );

  CREATE TABLE user_wallets (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_normalized text NOT NULL UNIQUE,
    linked_at timestamptz NOT NULL,
    verified_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, wallet_normalized)
  );
`;

describe("Postgres real-usage assurance metrics", () => {
  it("counts activation only after verified Nimiq behavior and finality only after verification", async () => {
    const pool = new PgMemPool();
    await pool.exec(readFileSync(join(import.meta.dirname!, FOUNDATION_MIGRATION), "utf8"));
    // pg-mem does not implement PostgreSQL position(), which is used by the
    // production users migration check constraint. This minimal test schema
    // mirrors only the columns exercised by PgUserDirectory.stats().
    await pool.exec(USER_SCHEMA_FOR_PG_MEM);

    const directory = new PgUserDirectory(pool);
    const t0 = Date.UTC(2026, 8, 19, 12, 0, 0);
    const preVerifiedWallet = wallet();
    const activatedWallet = wallet();

    const legacy = await directory.register({
      email: "legacy@example.com",
      displayName: "Legacy",
      tokenHash: profileTokenHash(newProfileToken()),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: t0,
      now: t0,
    });
    const activated = await directory.register({
      email: "activated@example.com",
      displayName: "Activated",
      tokenHash: profileTokenHash(newProfileToken()),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: t0,
      now: t0,
    });

    // A mission that predates wallet verification must never become traction retroactively.
    await pool.query(
      `INSERT INTO missions
        (id, creator_wallet_normalized, current_holder_wallet_normalized, target_label,
         target_wallet_ciphertext, target_wallet_hmac, target_consent_confirmed, mission_note,
         status, visibility, finalized_hop_count, current_sequence, created_at, updated_at)
       VALUES ($1,$2,$2,'Target',$3,'legacy-hmac',true,'Legacy test',
               'ACTIVE','UNLISTED',0,0,$4,$4)`,
      [crypto.randomUUID(), preVerifiedWallet, Buffer.from("cipher"), new Date(t0 + 1_000)]
    );

    await directory.linkVerifiedWallet(legacy.id, preVerifiedWallet, t0 + 5_000);
    await directory.linkVerifiedWallet(activated.id, activatedWallet, t0 + 2_000);

    const missionId = crypto.randomUUID();
    const invitationId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO missions
        (id, creator_wallet_normalized, current_holder_wallet_normalized, target_label,
         target_wallet_ciphertext, target_wallet_hmac, target_consent_confirmed, mission_note,
         status, visibility, finalized_hop_count, current_sequence, created_at, updated_at)
       VALUES ($1,$2,$2,'Target',$3,'active-hmac',true,'Real post-verification action',
               'ACTIVE','UNLISTED',0,0,$4,$4)`,
      [missionId, activatedWallet, Buffer.from("cipher"), new Date(t0 + 3_000)]
    );
    await pool.query(
      `INSERT INTO invitations
        (id, mission_id, sequence, inviter_wallet_normalized, invite_token_hash, status, created_at, expires_at)
       VALUES ($1,$2,1,$3,$4,'COMPLETED',$5,$6)`,
      [
        invitationId,
        missionId,
        activatedWallet,
        crypto.randomUUID(),
        new Date(t0 + 3_100),
        new Date(t0 + 60_000),
      ]
    );
    await pool.query(
      `INSERT INTO hops
        (id, mission_id, invitation_id, sequence, sender_wallet_normalized,
         recipient_wallet_normalized, tx_hash, recipient_value_luna, status, created_at, finalized_at)
       VALUES ($1,$2,$3,1,$4,$5,$6,100000,'FINAL',$7,$8)`,
      [
        crypto.randomUUID(),
        missionId,
        invitationId,
        activatedWallet,
        wallet(),
        "a".repeat(64),
        new Date(t0 + 3_200),
        new Date(t0 + 4_000),
      ]
    );

    expect(await directory.stats()).toEqual({
      registeredUsers: 2,
      consentedUsers: 2,
      walletLinkedUsers: 2,
      activatedUsers: 1,
      finalizedUsers: 1,
      protocolParticipants: 1,
    });
  });
});
