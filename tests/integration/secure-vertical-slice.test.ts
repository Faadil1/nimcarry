import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { PrivateKey, PublicKey, Signature } from "@nimiq/core";
import { afterEach, describe, expect, it } from "vitest";
import { ONE_NIM_IN_LUNA, type NimiqTxLookup } from "../../src/core/types.js";
import { ReachMissionCoordinator } from "../../src/mission/coordinator.js";
import { ReachMissionService } from "../../src/mission/service.js";
import { normalizeNimiqAddress, TargetWalletProtector } from "../../src/mission/target-wallet-crypto.js";
import { NimiqWalletAuthorizer, nimiqSignedMessageDigest } from "../../src/mission/wallet-auth.js";
import type { NimiqRpcClient } from "../../src/nimiq/rpc-client.js";
import { createRepositoryStores } from "../../src/persistence/bootstrap.js";
import { CanonicalRelayService } from "../../src/service/canonical-relay-service.js";
import { MemoryIdempotencyStore } from "../../src/service/idempotency.js";
import { createMissionHttpServer } from "../../src/service/mission-http-server.js";
import { MemoryRateLimiter } from "../../src/service/rate-limiter.js";
import { MemoryUserDirectory, PRIVACY_NOTICE_VERSION, profileTokenHash } from "../../src/users/user-directory.js";
import { PgMemPool } from "../helpers/pg-mem-pool.js";

interface Signer {
  privateKey: PrivateKey;
  publicKey: PublicKey;
  address: string;
}

class FakeRpcClient implements NimiqRpcClient {
  tx: NimiqTxLookup | null = null;
  async getTransactionByHash(): Promise<NimiqTxLookup | null> { return this.tx; }
  async getBlockNumber(): Promise<number> { return 3_032_100; }
}

function wallet(): Signer {
  const privateKey = PrivateKey.generate();
  const publicKey = PublicKey.derive(privateKey);
  return { privateKey, publicKey, address: publicKey.toAddress().toUserFriendlyAddress() };
}

function sign(message: string, signer: Signer): string {
  return Signature.create(signer.privateKey, signer.publicKey, nimiqSignedMessageDigest(message)).toHex();
}

function envelope(challenge: { challenge_id: string; message: string }, signer: Signer) {
  return {
    challenge_id: challenge.challenge_id,
    public_key: signer.publicKey.toHex(),
    signature: sign(challenge.message, signer),
  };
}

const FOUNDATION_SQL = readFileSync(
  join(import.meta.dirname!, "../../migrations/001_reach_mission_foundation.sql"),
  "utf8"
);
const browserCompat = readFileSync("web/http-compat.js", "utf8");
const protector = new TargetWalletProtector(Buffer.alloc(32, 31), Buffer.alloc(32, 32));

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  if (cleanup) await cleanup();
  cleanup = null;
});

async function listen(server: ReturnType<typeof createMissionHttpServer>): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("secure shared vertical slice", () => {
  it("connects hardened browser contract -> HTTP -> Postgres and persists one bridge-assisted direct FINAL delivery", async () => {
    // Browser contract guard: the production shell must carry the same security
    // artifacts exercised by the HTTP portion below.
    expect(browserCompat).toContain('broadcast_capability: pass.broadcastCapability');
    expect(browserCompat).toContain('headers.set("Authorization", `Bearer ${token}`)');
    expect(browserCompat).toContain('headers.set("Idempotency-Key", randomToken("browser"))');
    expect(browserCompat).not.toContain('headers.set("X-Wallet"');

    const pool = new PgMemPool();
    await pool.exec(FOUNDATION_SQL);
    // pg-mem fixture: production migration 006 adds constraints using
    // cardinality(text[]), which pg-mem does not implement.
    await pool.exec("ALTER TABLE pass_intents ADD COLUMN authorized_payment_wallets text[]");
    const stores = await createRepositoryStores(
      { CARRY_ONE_REPOSITORY: "postgres", CARRY_ONE_DATABASE_URL: "test://vertical" },
      () => pool
    );
    expect(stores.missionRepository).not.toBeNull();

    const rpc = new FakeRpcClient();
    const relay = new CanonicalRelayService(stores.relayStore, rpc);
    const repository = stores.missionRepository!;
    const missions = new ReachMissionService(repository, protector);
    const coordinator = new ReachMissionCoordinator(missions, repository, relay, protector);
    const authorizer = new NimiqWalletAuthorizer(repository, "https://nimcarry.example");
    const userDirectory = new MemoryUserDirectory();
    const server = createMissionHttpServer({
      coordinator,
      missions,
      repository,
      authorizer,
      relay,
      protector,
      canonicalOrigin: "https://nimcarry.example",
      idempotency: new MemoryIdempotencyStore(),
      limiter: new MemoryRateLimiter(),
      userDirectory,
      legacyRelayEnabled: false,
    });
    const baseUrl = await listen(server);
    cleanup = async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await stores.close();
    };

    async function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
    }

    async function challenge(signer: Signer, action: string, bindings: Record<string, unknown> = {}) {
      const response = await request("POST", "/auth/challenge", { wallet: signer.address, action, ...bindings });
      expect(response.status).toBe(200);
      return response.body as { challenge_id: string; message: string };
    }

    const creator = wallet();
    const paymentWallet = wallet();
    const bridge = wallet();
    const destination = wallet();
    const profileToken = "verticalprofiletoken_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const profile = await userDirectory.register({
      displayName: "Creator A",
      email: "creator@example.test",
      tokenHash: profileTokenHash(profileToken),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: Date.now(),
    });
    await userDirectory.linkVerifiedWallet(profile.id, creator.address);
    await userDirectory.linkVerifiedWallet(profile.id, paymentWallet.address);

    const createChallenge = await challenge(creator, "CREATE_MISSION");
    const created = await request("POST", "/missions", {
      ...envelope(createChallenge, creator),
      target_label: "Destination C",
      target_wallet: destination.address,
      target_consent_confirmed: true,
      mission_note: "Move this introduction through one trusted bridge.",
      creator_display_label: "Creator A",
      visibility: "UNLISTED",
    }, { "Idempotency-Key": "vertical-create" });
    expect(created.status).toBe(201);
    expect(created.body.view_token).toMatch(/^[A-Za-z0-9_-]+$/);
    const missionId = created.body.mission_id as string;

    const creatorRead = await request("GET", `/missions/${missionId}`, undefined, {
      Authorization: `Bearer ${created.body.view_token}`,
    });
    expect(creatorRead.status).toBe(200);
    expect(creatorRead.body.viewer_role).toBe("CREATOR");

    const inviteChallenge = await challenge(creator, "CREATE_INVITATION", { mission_id: missionId, sequence: 1 });
    const invited = await request("POST", `/missions/${missionId}/invitations`, {
      ...envelope(inviteChallenge, creator),
      candidate_label: "Bridge B",
      candidate_wallet: bridge.address,
      why_you: "You are one trusted connection closer.",
    }, { "Idempotency-Key": "vertical-invite" });
    expect(invited.status).toBe(201);
    const token = invited.body.invite_token as string;
    const invitationId = invited.body.invitation.id as string;

    const acceptChallenge = await challenge(bridge, "ACCEPT_INVITATION", {
      mission_id: missionId,
      invitation_id: invitationId,
      sequence: 1,
    });
    const accepted = await request("POST", `/i/${token}/accept`, {
      ...envelope(acceptChallenge, bridge),
      candidate_display_label: "Bridge B",
    }, { "Idempotency-Key": "vertical-accept" });
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe("ACCEPTED");

    const waitingBridgeView = await request("GET", `/missions/${missionId}`, undefined, {
      Authorization: `Bearer ${accepted.body.view_token}`,
    });
    expect(waitingBridgeView.status).toBe(200);
    expect(waitingBridgeView.body.viewer_role).toBe("INVITEE");
    expect(waitingBridgeView.body.primary_action).toBe("WAIT");

    const passChallenge = await challenge(creator, "AUTHORIZE_PASS", {
      mission_id: missionId,
      invitation_id: invitationId,
      sequence: 1,
    });
    const intent = await request("POST", `/missions/${missionId}/pass-intent`, {
      ...envelope(passChallenge, creator),
      invitation_id: invitationId,
    }, {
      "Idempotency-Key": "vertical-pass",
      "X-NimCarry-User-Token": profileToken,
    });
    expect(intent.status).toBe(200);
    expect(intent.body.value_luna).toBe(ONE_NIM_IN_LUNA);
    expect(intent.body.authorized_payment_wallets).toEqual([
      normalizeNimiqAddress(creator.address),
      normalizeNimiqAddress(paymentWallet.address),
    ]);
    expect(intent.body.recipient_data).toMatch(/^co:v1:/);
    expect(intent.body.broadcast_capability).toMatch(/^[A-Za-z0-9_-]+$/);

    const txHash = randomBytes(32).toString("hex");
    const broadcast = await request("POST", `/missions/${missionId}/broadcast`, {
      invitation_id: invitationId,
      tx_hash: txHash,
      broadcast_capability: intent.body.broadcast_capability,
    }, { "Idempotency-Key": "vertical-broadcast" });
    expect(broadcast.status).toBe(201);

    rpc.tx = {
      hash: txHash,
      from: creator.address,
      to: destination.address,
      value: ONE_NIM_IN_LUNA,
      blockNumber: 3_032_020,
      confirmations: 999,
      recipientData: intent.body.recipient_data,
    };

    const reconciled = await request("POST", `/missions/${missionId}/reconcile`, {}, {
      Authorization: `Bearer ${created.body.view_token}`,
    });
    expect(reconciled.status).toBe(200);
    expect(reconciled.body.mission.status).toBe("ARRIVED");
    expect(reconciled.body.mission.finalized_hop_count).toBe(1);
    expect(reconciled.body.mission.sequence).toBe(1);

    const finalizedInvitation = await pool.query<{ status: string; candidate_label: string | null; candidate_display_label: string | null; candidate_wallet_normalized: string | null; sequence: number }>(
      "SELECT status, candidate_label, candidate_display_label, candidate_wallet_normalized, sequence FROM invitations WHERE id = $1",
      [invitationId]
    );
    expect(finalizedInvitation.rows).toHaveLength(1);
    expect(finalizedInvitation.rows[0]).toMatchObject({
      status: "COMPLETED",
      candidate_label: "Bridge B",
      candidate_display_label: "Bridge B",
      candidate_wallet_normalized: normalizeNimiqAddress(bridge.address),
      sequence: 1,
    });

    const rawSequenceInvitation = await pool.query<{ mission_id: string; sequence: number; status: string; candidate_label: string | null; candidate_display_label: string | null }>(
      "SELECT mission_id, sequence, status, candidate_label, candidate_display_label FROM invitations WHERE mission_id = $1 AND sequence = $2",
      [missionId, 1]
    );
    console.log("DIRECT_RAW_SEQ_INVITE_DEBUG", JSON.stringify(rawSequenceInvitation.rows));
    const repositoryInvitation = await repository.getInvitationForSequence(missionId, 1);
    console.log("DIRECT_REPO_INVITE_DEBUG", JSON.stringify(repositoryInvitation));

    const bridgeView = await request("GET", `/missions/${missionId}`, undefined, {
      Authorization: `Bearer ${accepted.body.view_token}`,
    });
    expect(bridgeView.status).toBe(200);
    expect(bridgeView.body.viewer_role).toBe("PARTICIPANT");
    expect(bridgeView.body.status).toBe("ARRIVED");
    expect(bridgeView.body.route).toHaveLength(1);
    console.log("DIRECT_ROUTE_DEBUG", JSON.stringify({
      invitation: bridgeView.body.invitation,
      viewer_role: bridgeView.body.viewer_role,
      route: bridgeView.body.route[0],
    }));
    expect(bridgeView.body.route[0].status).toBe("CONFIRMED");
    expect(bridgeView.body.route[0].confirmed_at).toBeTruthy();
    expect(bridgeView.body.route[0].bridge).not.toBeNull();
    expect(bridgeView.body.route[0].bridge.display_label).toBe("Bridge B");
    expect(bridgeView.body.route[0].recipient.display_label).toBe("Destination C");
    expect(bridgeView.body.route[0].recipient.wallet_fingerprint).toBe("private");

    // PostgreSQL is not just configured: the projected custody state and FINAL
    // hop must be durably visible in the database before the HTTP response is
    // considered successful.
    const missionRow = await pool.query<{ current_sequence: number; finalized_hop_count: number }>(
      "SELECT current_sequence, finalized_hop_count FROM missions WHERE id = $1",
      [missionId]
    );
    expect(Number(missionRow.rows[0].current_sequence)).toBe(1);
    expect(Number(missionRow.rows[0].finalized_hop_count)).toBe(1);
    const hopRow = await pool.query<{ status: string; tx_hash: string }>(
      "SELECT status, tx_hash FROM hops WHERE mission_id = $1 AND sequence = 1",
      [missionId]
    );
    expect(hopRow.rows[0].status).toBe("FINAL");
    expect(hopRow.rows[0].tx_hash).toBe(txHash);
  });
});
