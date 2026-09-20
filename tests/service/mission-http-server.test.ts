import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { PrivateKey, PublicKey, Signature } from "@nimiq/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ONE_NIM_IN_LUNA, type NimiqTxLookup } from "../../src/core/types.js";
import type { NimiqRpcClient } from "../../src/nimiq/rpc-client.js";
import { FileMissionRepository } from "../../src/mission/file-repository.js";
import { ReachMissionCoordinator } from "../../src/mission/coordinator.js";
import { ReachMissionService } from "../../src/mission/service.js";
import { TargetWalletProtector } from "../../src/mission/target-wallet-crypto.js";
import { NimiqWalletAuthorizer, nimiqSignedMessageDigest } from "../../src/mission/wallet-auth.js";
import { FileRelayStore } from "../../src/persistence/file-relay-store.js";
import { CanonicalRelayService } from "../../src/service/canonical-relay-service.js";
import { MemoryIdempotencyStore } from "../../src/service/idempotency.js";
import { MemoryRateLimiter } from "../../src/service/rate-limiter.js";
import { createMissionHttpServer } from "../../src/service/mission-http-server.js";
import { MemoryUserDirectory, PRIVACY_NOTICE_VERSION, profileTokenHash } from "../../src/users/user-directory.js";

class FakeRpcClient implements NimiqRpcClient {
  tx: NimiqTxLookup | null = null;
  async getTransactionByHash(): Promise<NimiqTxLookup | null> {
    return this.tx;
  }
  async getBlockNumber(): Promise<number> {
    return 3_032_100;
  }
}

interface Signer {
  privateKey: PrivateKey;
  publicKey: PublicKey;
  address: string;
}

function wallet(): Signer {
  const privateKey = PrivateKey.generate();
  const publicKey = PublicKey.derive(privateKey);
  return { privateKey, publicKey, address: publicKey.toAddress().toUserFriendlyAddress() };
}

function sign(message: string, signer: Signer): string {
  return Signature.create(signer.privateKey, signer.publicKey, nimiqSignedMessageDigest(message)).toHex();
}

const PROTECTOR = new TargetWalletProtector(Buffer.alloc(32, 11), Buffer.alloc(32, 12));

let dir: string;
let baseUrl: string;
let close: () => Promise<void>;
let rpc: FakeRpcClient;
let repository: FileMissionRepository;
let userDirectory: MemoryUserDirectory;

type Response = { status: number; headers: Headers; body: any };

async function request(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Non-JSON body (e.g. empty 204) stays null.
  }
  return { status: res.status, headers: res.headers, body: parsed };
}

async function challenge(walletAddress: string, action: string, bindings: Record<string, unknown> = {}): Promise<{ challenge_id: string; message: string }> {
  const res = await request("POST", "/auth/challenge", { wallet: walletAddress, action, ...bindings });
  expect(res.status).toBe(200);
  return res.body as { challenge_id: string; message: string; expires_at: string };
}

function envelope(ch: { challenge_id: string; message: string }, signer: Signer) {
  return { challenge_id: ch.challenge_id, public_key: signer.publicKey.toHex(), signature: sign(ch.message, signer) };
}

async function createMissionViaApi(signer: Signer, targetAddress: string, key: string, visibility = "UNLISTED") {
  const ch = await challenge(signer.address, "CREATE_MISSION");
  return request("POST", "/missions", {
    ...envelope(ch, signer),
    target_label: "Harley",
    target_wallet: targetAddress,
    target_consent_confirmed: true,
    mission_note: "I'd like this invitation to reach Harley through people who actually know him.",
    visibility,
    creator_display_label: "Faadil",
  }, { "Idempotency-Key": key });
}

async function listen(server: ReturnType<typeof createMissionHttpServer>): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("Reach Mission HTTP bindings", () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "carry-one-http-"));
    rpc = new FakeRpcClient();
    const missionPath = join(dir, "missions.json");
    const relayPath = join(dir, "relay.json");
    repository = new FileMissionRepository(missionPath);
    const missions = new ReachMissionService(repository, PROTECTOR);
    const relay = new CanonicalRelayService(new FileRelayStore(relayPath), rpc);
    const coordinator = new ReachMissionCoordinator(missions, repository, relay, PROTECTOR);
    const authorizer = new NimiqWalletAuthorizer(repository, "https://carry.one");
    const server = createMissionHttpServer({
      coordinator,
      missions,
      repository,
      authorizer,
      relay,
      protector: PROTECTOR,
      canonicalOrigin: "https://carry.one",
      idempotency: new MemoryIdempotencyStore(),
      limiter: new MemoryRateLimiter(),
    });
    baseUrl = await listen(server);
    close = () => new Promise((resolve) => server.close(() => resolve()));
  });

  afterAll(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs a mission end-to-end over HTTP: create -> invite -> accept -> pass -> broadcast -> reconcile -> arrived", async () => {
    const creator = wallet();
    const target = wallet();

    const createRes = await createMissionViaApi(creator, target.address, "create-e2e");
    expect(createRes.status).toBe(201);
    const missionView = createRes.body;
    expect(missionView.viewer_role).toBe("CREATOR");
    expect(missionView.primary_action).toBe("CREATE_INVITATION");
    expect(missionView.status).toBe("ACTIVE");
    expect(JSON.stringify(missionView)).not.toContain(target.address.replaceAll(" ", ""));
    const missionId = missionView.mission_id;

    const viewRes = await request("GET", `/missions/${missionId}`, undefined, {
      Authorization: `Bearer ${missionView.view_token}`,
    });
    expect(viewRes.status).toBe(200);
    expect(viewRes.body.current_holder.is_viewer).toBe(true);

    const inviteCh = await challenge(creator.address, "CREATE_INVITATION", { mission_id: missionId, sequence: 1 });
    const inviteRes = await request("POST", `/missions/${missionId}/invitations`, {
      ...envelope(inviteCh, creator),
      candidate_label: "Bridge",
      candidate_wallet: target.address,
      why_you: "You know the destination.",
    }, { "Idempotency-Key": "invite-e2e" });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.invite_token).toBeTruthy();
    expect(inviteRes.body.web_invite_url).toMatch(new RegExp(`^https://carry\\.one/i/${inviteRes.body.invite_token}$`));
    expect(inviteRes.body.nimiq_pay_custom_scheme).toContain("nimiqpay://miniapp?url=");
    const token = inviteRes.body.invite_token;
    const invitationId = inviteRes.body.invitation.id;

    const inviteViewRes = await request("GET", `/i/${token}`);
    expect(inviteViewRes.status).toBe(200);
    expect(inviteViewRes.body.invitation.status).toBe("INVITED");
    expect(inviteViewRes.body.mission.invitation.candidate_label).toBe("Bridge");

    const acceptCh = await challenge(target.address, "ACCEPT_INVITATION", {
      mission_id: missionId,
      invitation_id: invitationId,
      sequence: 1,
    });
    const acceptRes = await request("POST", `/i/${token}/accept`, {
      ...envelope(acceptCh, target),
      candidate_display_label: "Harley",
    }, { "Idempotency-Key": "accept-e2e" });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe("ACCEPTED");

    const passCh = await challenge(creator.address, "AUTHORIZE_PASS", {
      mission_id: missionId,
      invitation_id: invitationId,
      sequence: 1,
    });
    const passRes = await request("POST", `/missions/${missionId}/pass-intent`, {
      ...envelope(passCh, creator),
      invitation_id: invitationId,
    }, { "Idempotency-Key": "pass-e2e" });
    expect(passRes.status).toBe(200);
    const intent = passRes.body;
    expect(intent.sequence).toBe(1);
    expect(intent.recipient).toBe(target.address);
    expect(intent.expected_sender).toBe(creator.address);
    expect(intent.value_luna).toBe(ONE_NIM_IN_LUNA);
    expect(intent.recipient_data).toMatch(/^co:v1:/);
    expect(intent.broadcast_capability).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(new Date(intent.broadcast_capability_expires_at).getTime()).toBeGreaterThan(Date.now());

    const txHash = randomBytes(32).toString("hex");
    const broadcastBody = {
      invitation_id: invitationId,
      tx_hash: txHash,
      broadcast_capability: intent.broadcast_capability,
    };
    const broadcastRes = await request("POST", `/missions/${missionId}/broadcast`, broadcastBody, { "Idempotency-Key": "broadcast-e2e" });
    expect(broadcastRes.status).toBe(201);
    expect(broadcastRes.body.tx_hash).toBe(txHash);

    const broadcastRetry = await request("POST", `/missions/${missionId}/broadcast`, broadcastBody, { "Idempotency-Key": "broadcast-e2e" });
    expect(broadcastRetry.status).toBe(201);
    expect(broadcastRetry.headers.get("Idempotency-Replayed")).toBe("true");
    expect(broadcastRetry.body.tx_hash).toBe(txHash);

    const capabilityReplay = await request("POST", `/missions/${missionId}/broadcast`, broadcastBody, { "Idempotency-Key": "broadcast-replay-new-key" });
    expect(capabilityReplay.status).toBe(401);
    expect(capabilityReplay.body.error).toBe("BROADCAST_CAPABILITY_REPLAY");

    rpc.tx = {
      hash: txHash,
      from: creator.address,
      to: target.address,
      value: ONE_NIM_IN_LUNA,
      blockNumber: 3_032_020,
      confirmations: 999,
      recipientData: intent.recipient_data,
    };

    const reconcileRes = await request("POST", `/missions/${missionId}/reconcile`, {}, {
      "Idempotency-Key": "reconcile-e2e",
      Authorization: `Bearer ${missionView.view_token}`,
    });
    expect(reconcileRes.status).toBe(200);
    expect(reconcileRes.body.hop).toMatchObject({ tx_hash: txHash, status: "FINAL", sequence: 1 });
    expect(reconcileRes.body.mission.status).toBe("ARRIVED");
    expect(reconcileRes.body.mission.sequence).toBe(1);
    expect(reconcileRes.body.mission.finalized_hop_count).toBe(1);

    const targetViewCh = await challenge(target.address, "VIEW_ROUTE", { mission_id: missionId });
    const targetMintRes = await request("POST", `/missions/${missionId}/view`, envelope(targetViewCh, target), { "Idempotency-Key": "view-target-e2e" });
    expect(targetMintRes.status).toBe(200);
    expect(targetMintRes.body.view_token).toBeTruthy();

    const targetViewRes = await request("GET", `/missions/${missionId}`, undefined, {
      Authorization: `Bearer ${targetMintRes.body.view_token}`,
    });
    expect(targetViewRes.status).toBe(200);
    expect(targetViewRes.body.viewer_role).toBe("TARGET");
    expect(targetViewRes.body.primary_action).toBe("START_NEW_ROUTE");
    expect(targetViewRes.body.route).toHaveLength(1);
    expect(targetViewRes.body.route[0].recipient.is_viewer).toBe(true);
  });

  it("rejects broadcast claims that do not present a capability", async () => {
    const response = await request("POST", "/missions/00000000-0000-4000-8000-000000000000/broadcast", {
      invitation_id: "00000000-0000-4000-8000-000000000001",
      tx_hash: "ab".repeat(32),
    }, { "Idempotency-Key": "missing-broadcast-capability" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_STRING");
  });

  it("replays a mutation with the same Idempotency-Key instead of creating a second mission", async () => {
    const creator = wallet();
    const target = wallet();
    const ch = await challenge(creator.address, "CREATE_MISSION");
    const body = {
      ...envelope(ch, creator),
      target_label: "Idem",
      target_wallet: target.address,
      target_consent_confirmed: true,
      mission_note: "Same key must not create two missions.",
    };
    const first = await request("POST", "/missions", body, { "Idempotency-Key": "replay-create" });
    expect(first.status).toBe(201);
    const second = await request("POST", "/missions", body, { "Idempotency-Key": "replay-create" });
    expect(second.status).toBe(201);
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    expect(second.body.mission_id).toBe(first.body.mission_id);
  });

  it("rejects replay of an already-consumed challenge with 401 CHALLENGE_REPLAY", async () => {
    const creator = wallet();
    const target = wallet();
    const ch = await challenge(creator.address, "CREATE_MISSION");
    const body = {
      ...envelope(ch, creator),
      target_label: "Replay",
      target_wallet: target.address,
      target_consent_confirmed: true,
      mission_note: "Consume the challenge once.",
    };
    expect((await request("POST", "/missions", body, { "Idempotency-Key": "challenge-1" })).status).toBe(201);
    const replay = await request("POST", "/missions", body, { "Idempotency-Key": "challenge-2" });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe("CHALLENGE_REPLAY");
  });

  it("returns 400 with a details array when the body contains an unknown field", async () => {
    const creator = wallet();
    const ch = await challenge(creator.address, "CREATE_MISSION");
    const res = await request("POST", "/missions", {
      ...envelope(ch, creator),
      target_label: "Strict",
      target_wallet: creator.address,
      target_consent_confirmed: true,
      mission_note: "Unknown fields must be rejected.",
      bogus_field: "nope",
    }, { "Idempotency-Key": "strict-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UNKNOWN_FIELD");
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: "bogus_field" })]));
  });

  it("rejects mutation without Idempotency-Key header and unknown mission with 404", async () => {
    const creator = wallet();
    const ch = await challenge(creator.address, "CREATE_MISSION");
    const res = await request("POST", "/missions", {
      ...envelope(ch, creator),
      target_label: "NoKey",
      target_wallet: creator.address,
      target_consent_confirmed: true,
      mission_note: "Idempotency key is mandatory.",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("MISSING_IDEMPOTENCY_KEY");

    const missing = await request("GET", "/missions/00000000-0000-4000-8000-000000000000");
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("MISSION_NOT_FOUND");
  });

  it("declines an invitation token-only without a wallet signature", async () => {
    const creator = wallet();
    const candidate = wallet();
    const missionRes = await createMissionViaApi(creator, wallet().address, "decline-mission");
    const missionId = missionRes.body.mission_id;
    const ch = await challenge(creator.address, "CREATE_INVITATION", { mission_id: missionId, sequence: 1 });
    const inviteRes = await request("POST", `/missions/${missionId}/invitations`, {
      ...envelope(ch, creator),
      candidate_wallet: candidate.address,
    }, { "Idempotency-Key": "decline-invite" });
    expect(inviteRes.status).toBe(201);

    const declineRes = await request("POST", `/i/${inviteRes.body.invite_token}/decline`, {}, { "Idempotency-Key": "decline-1" });
    expect(declineRes.status).toBe(200);
    expect(declineRes.body.status).toBe("DECLINED");
  });
});

describe("Reach Mission route-view privacy", () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "carry-one-privacy-"));
    rpc = new FakeRpcClient();
    const missionPath = join(dir, "missions.json");
    const relayPath = join(dir, "relay.json");
    repository = new FileMissionRepository(missionPath);
    const missions = new ReachMissionService(repository, PROTECTOR);
    const relay = new CanonicalRelayService(new FileRelayStore(relayPath), rpc);
    const coordinator = new ReachMissionCoordinator(missions, repository, relay, PROTECTOR);
    const authorizer = new NimiqWalletAuthorizer(repository, "https://carry.one");
    userDirectory = new MemoryUserDirectory();
    const server = createMissionHttpServer({
      coordinator,
      missions,
      repository,
      authorizer,
      relay,
      protector: PROTECTOR,
      canonicalOrigin: "https://carry.one",
      idempotency: new MemoryIdempotencyStore(),
      limiter: new MemoryRateLimiter(),
      userDirectory,
    });
    baseUrl = await listen(server);
    close = () => new Promise((resolve) => server.close(() => resolve()));
  });

  afterAll(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("requires a route view capability for unlisted missions and ignores the spoofable X-Wallet header", async () => {
    const creator = wallet();
    const target = wallet();
    const createRes = await createMissionViaApi(creator, target.address, "privacy-create");
    expect(createRes.status).toBe(201);
    const missionId = createRes.body.mission_id;

    const anonymous = await request("GET", `/missions/${missionId}`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error).toBe("ROUTE_VIEW_CAPABILITY_REQUIRED");

    const spoofed = await request("GET", `/missions/${missionId}`, undefined, { "X-Wallet": creator.address });
    expect(spoofed.status).toBe(401);
    expect(spoofed.body.error).toBe("ROUTE_VIEW_CAPABILITY_REQUIRED");

    const garbage = await request("GET", `/missions/${missionId}`, undefined, { Authorization: "Bearer not-a-real-token" });
    expect(garbage.status).toBe(401);
    expect(garbage.body.error).toBe("ROUTE_VIEW_CAPABILITY_INVALID");

    const valid = await request("GET", `/missions/${missionId}`, undefined, {
      Authorization: `Bearer ${createRes.body.view_token}`,
    });
    expect(valid.status).toBe(200);
    expect(valid.body.current_holder.is_viewer).toBe(true);
  });

  it("uses a verified profile session as read-only fallback after a route token disappears", async () => {
    const creator = wallet();
    const target = wallet();
    const createRes = await createMissionViaApi(creator, target.address, "profile-route-recovery");
    const missionId = createRes.body.mission_id;

    const profileToken = randomBytes(32).toString("base64url");
    const profile = await userDirectory.register({
      email: "route-recovery@example.com",
      displayName: "Route recovery",
      tokenHash: profileTokenHash(profileToken),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: Date.now(),
    });
    await userDirectory.linkVerifiedWallet(profile.id, creator.address);

    const recovered = await request("GET", `/missions/${missionId}`, undefined, {
      Authorization: "Bearer invalid-after-runtime-restart",
      "X-NimCarry-User-Token": profileToken,
    });
    expect(recovered.status).toBe(200);
    expect(recovered.body.viewer_role).toBe("CREATOR");
    expect(recovered.body.current_holder.is_viewer).toBe(true);

    const strangerToken = randomBytes(32).toString("base64url");
    const stranger = await userDirectory.register({
      email: "route-stranger@example.com",
      displayName: "Stranger",
      tokenHash: profileTokenHash(strangerToken),
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyConsentAt: Date.now(),
    });
    await userDirectory.linkVerifiedWallet(stranger.id, wallet().address);
    const denied = await request("GET", `/missions/${missionId}`, undefined, {
      "X-NimCarry-User-Token": strangerToken,
    });
    expect(denied.status).toBe(401);
    expect(denied.body.error).toBe("ROUTE_VIEW_CAPABILITY_REQUIRED");
  });

  it("rejects a capability that is bound to another mission with 403", async () => {
    const creator = wallet();
    const target = wallet();
    const first = await createMissionViaApi(creator, target.address, "cap-a");
    const second = await createMissionViaApi(creator, wallet().address, "cap-b");

    const cross = await request("GET", `/missions/${second.body.mission_id}`, undefined, {
      Authorization: `Bearer ${first.body.view_token}`,
    });
    expect(cross.status).toBe(403);
    expect(cross.body.error).toBe("ROUTE_VIEW_CAPABILITY_MISSION_MISMATCH");
  });

  it("rejects strangers minting a route view capability on an unlisted mission", async () => {
    const creator = wallet();
    const target = wallet();
    const createRes = await createMissionViaApi(creator, target.address, "mint-stranger");
    const missionId = createRes.body.mission_id;

    const stranger = wallet();
    const ch = await challenge(stranger.address, "VIEW_ROUTE", { mission_id: missionId });
    const mintRes = await request("POST", `/missions/${missionId}/view`, envelope(ch, stranger), { "Idempotency-Key": "mint-stranger-1" });
    expect(mintRes.status).toBe(403);
    expect(mintRes.body.error).toBe("NOT_MISSION_PARTICIPANT");

    const boundElsewhere = await challenge(stranger.address, "VIEW_ROUTE", {
      mission_id: createRes.body.mission_id,
    });
    const otherMission = await createMissionViaApi(wallet(), wallet().address, "mint-other");
    const mismatched = await request("POST", `/missions/${otherMission.body.mission_id}/view`, envelope(boundElsewhere, stranger), {
      "Idempotency-Key": "mint-other-1",
    });
    expect(mismatched.status).toBe(401);
    expect(["AUTH_MISSION_MISMATCH", "AUTH_BINDING_MISMATCH"]).toContain(mismatched.body.error);
  });

  it("lets participants mint a capability and sees the invitation context for their own role", async () => {
    const creator = wallet();
    const target = wallet();
    const candidate = wallet();
    const createRes = await createMissionViaApi(creator, target.address, "role-create");
    const missionId = createRes.body.mission_id;

    const inviteCh = await challenge(creator.address, "CREATE_INVITATION", { mission_id: missionId, sequence: 1 });
    const inviteRes = await request("POST", `/missions/${missionId}/invitations`, {
      ...envelope(inviteCh, creator),
      candidate_label: "Bridget",
      candidate_wallet: candidate.address,
      why_you: "You were closest to the destination last summer.",
    }, { "Idempotency-Key": "role-invite" });
    expect(inviteRes.status).toBe(201);

    const candidateMint = await challenge(candidate.address, "VIEW_ROUTE", { mission_id: missionId });
    const candidateCap = await request("POST", `/missions/${missionId}/view`, envelope(candidateMint, candidate), { "Idempotency-Key": "role-candidate-cap" });
    expect(candidateCap.status).toBe(200);
    const candidateView = await request("GET", `/missions/${missionId}`, undefined, { Authorization: `Bearer ${candidateCap.body.view_token}` });
    expect(candidateView.status).toBe(200);
    expect(candidateView.body.viewer_role).toBe("INVITEE");
    expect(candidateView.body.invitation.candidate_label).toBe("Bridget");
    expect(candidateView.body.invitation.why_you).toBe("You were closest to the destination last summer.");

    const targetMint = await challenge(target.address, "VIEW_ROUTE", { mission_id: missionId });
    const targetCap = await request("POST", `/missions/${missionId}/view`, envelope(targetMint, target), { "Idempotency-Key": "role-target-cap" });
    expect(targetCap.status).toBe(200);
    const targetView = await request("GET", `/missions/${missionId}`, undefined, { Authorization: `Bearer ${targetCap.body.view_token}` });
    expect(targetView.status).toBe(200);
    expect(targetView.body.viewer_role).toBe("TARGET");
    expect(targetView.body.invitation.candidate_label).toBeNull();
    expect(targetView.body.invitation.candidate_wallet_fingerprint).toBeNull();
    expect(targetView.body.invitation.why_you).toBeNull();
    expect(targetView.body.invitation.pass_deadline_at).toBeNull();
    expect(targetView.body.invitation.status).toBe("INVITED");

    const creatorView = await request("GET", `/missions/${missionId}`, undefined, {
      Authorization: `Bearer ${createRes.body.view_token}`,
    });
    expect(creatorView.status).toBe(200);
    expect(creatorView.body.invitation.candidate_label).toBe("Bridget");
  });

  it("exposes an expired next-sequence invitation only to the creator/current-holder recovery view", async () => {
    const creator = wallet();
    const target = wallet();
    const candidate = wallet();
    const createRes = await createMissionViaApi(creator, target.address, "expired-recovery-create");
    const missionId = createRes.body.mission_id;
    const inviteCh = await challenge(creator.address, "CREATE_INVITATION", { mission_id: missionId, sequence: 1 });
    const inviteRes = await request("POST", `/missions/${missionId}/invitations`, {
      ...envelope(inviteCh, creator), candidate_label: "Bridge B", candidate_wallet: candidate.address, why_you: "Try again."
    }, { "Idempotency-Key": "expired-recovery-invite" });
    expect(inviteRes.status).toBe(201);
    await repository.expireDueInvitations(Date.now() + 48 * 60 * 60 * 1000);

    const creatorView = await request("GET", `/missions/${missionId}`, undefined, { Authorization: `Bearer ${createRes.body.view_token}` });
    expect(creatorView.status).toBe(200);
    expect(creatorView.body.invitation).toMatchObject({ invitation_id: inviteRes.body.invitation.id, sequence: 1, status: "EXPIRED" });
    expect(creatorView.body.invitation.candidate_label).toBe("Bridge B");
    expect(creatorView.body.primary_action).toBe("CREATE_INVITATION");

    const targetMint = await challenge(target.address, "VIEW_ROUTE", { mission_id: missionId });
    const targetCap = await request("POST", `/missions/${missionId}/view`, envelope(targetMint, target), { "Idempotency-Key": "expired-recovery-target" });
    expect(targetCap.status).toBe(200);
    const targetView = await request("GET", `/missions/${missionId}`, undefined, { Authorization: `Bearer ${targetCap.body.view_token}` });
    expect(targetView.status).toBe(200);
    expect(targetView.body.invitation).toBeNull();
    expect(targetView.body.primary_action).not.toBe("CREATE_INVITATION");
  });

  it("keeps public missions readable but redacts invitation context for anonymous viewers", async () => {
    const creator = wallet();
    const target = wallet();
    const candidate = wallet();
    const ch = await challenge(creator.address, "CREATE_MISSION");
    const createRes = await request("POST", "/missions", {
      ...envelope(ch, creator),
      target_label: "Public route",
      target_wallet: target.address,
      target_consent_confirmed: true,
      mission_note: "A public log everyone may follow.",
      visibility: "PUBLIC",
    }, { "Idempotency-Key": "public-create" });
    expect(createRes.status).toBe(201);
    const missionId = createRes.body.mission_id;

    const inviteCh = await challenge(creator.address, "CREATE_INVITATION", { mission_id: missionId, sequence: 1 });
    await request("POST", `/missions/${missionId}/invitations`, {
      ...envelope(inviteCh, creator),
      candidate_label: "Bridget",
      candidate_wallet: candidate.address,
      why_you: "Only the candidate should read this note.",
    }, { "Idempotency-Key": "public-invite" });

    const anonymous = await request("GET", `/missions/${missionId}`);
    expect(anonymous.status).toBe(200);
    expect(anonymous.body.viewer_role).toBe("UNLISTED_VIEWER");
    expect(anonymous.body.invitation.candidate_label).toBeNull();
    expect(anonymous.body.invitation.candidate_wallet_fingerprint).toBeNull();
    expect(anonymous.body.invitation.why_you).toBeNull();
    expect(anonymous.body.invitation.pass_deadline_at).toBeNull();
    expect(anonymous.body.invitation.status).toBe("INVITED");
  });

  it("rejects anonymous reconcile on an unlisted mission without disclosing mission view details", async () => {
    const creator = wallet();
    const target = wallet();
    const createRes = await createMissionViaApi(creator, target.address, "reconcile-anon-create");
    expect(createRes.status).toBe(201);
    const missionId = createRes.body.mission_id;

    const anonymous = await request("POST", `/missions/${missionId}/reconcile`, {}, { "Idempotency-Key": "reconcile-anon-1" });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error).toBe("ROUTE_VIEW_CAPABILITY_REQUIRED");
    expect(JSON.stringify(anonymous.body)).not.toContain("target_label");
    expect(JSON.stringify(anonymous.body)).not.toContain("mission_note");
    expect(anonymous.body).not.toHaveProperty("route");
    expect(anonymous.body).not.toHaveProperty("current_holder");

    const garbageToken = await request("POST", `/missions/${missionId}/reconcile`, {}, {
      "Idempotency-Key": "reconcile-anon-2",
      Authorization: "Bearer not-a-real-token",
    });
    expect(garbageToken.status).toBe(401);
    expect(garbageToken.body.error).toBe("ROUTE_VIEW_CAPABILITY_INVALID");

    const authorized = await request("POST", `/missions/${missionId}/reconcile`, {}, {
      "Idempotency-Key": "reconcile-anon-3",
      Authorization: `Bearer ${createRes.body.view_token}`,
    });
    expect(authorized.status).toBe(200);
    expect(authorized.body.mission.status).toBe("ACTIVE");
  });

  it("does not treat an invitation token as a route view capability (token only opens the landing page)", async () => {
    const creator = wallet();
    const target = wallet();
    const createRes = await createMissionViaApi(creator, target.address, "invite-cap-create");
    const missionId = createRes.body.mission_id;

    const inviteCh = await challenge(creator.address, "CREATE_INVITATION", { mission_id: missionId, sequence: 1 });
    const inviteRes = await request("POST", `/missions/${missionId}/invitations`, {
      ...envelope(inviteCh, creator),
      candidate_label: "Bridge",
      candidate_wallet: target.address,
    }, { "Idempotency-Key": "invite-cap-invite" });
    expect(inviteRes.status).toBe(201);
    const inviteToken = inviteRes.body.invite_token;

    const landing = await request("GET", `/i/${inviteToken}`);
    expect(landing.status).toBe(200);
    expect(landing.body.invitation.status).toBe("INVITED");

    const routeView = await request("GET", `/missions/${missionId}`, undefined, {
      Authorization: `Bearer ${inviteToken}`,
    });
    expect(routeView.status).toBe(401);
    expect(routeView.body.error).toBe("ROUTE_VIEW_CAPABILITY_INVALID");
    expect(routeView.body).not.toHaveProperty("route");

    const routeOnly = await request("GET", `/missions/${missionId}/route`, undefined, {
      Authorization: `Bearer ${inviteToken}`,
    });
    expect(routeOnly.status).toBe(401);
    expect(routeOnly.body.error).toBe("ROUTE_VIEW_CAPABILITY_INVALID");
  });
});

describe("Reach Mission legacy /relay gate", () => {
  let gateBaseUrl: string;
  let gateClose: () => Promise<void>;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "carry-one-relay-gate-"));
    const repository = new FileMissionRepository(join(dir, "missions.json"));
    const missions = new ReachMissionService(repository, PROTECTOR);
    const rpcClient = new FakeRpcClient();
    const relay = new CanonicalRelayService(new FileRelayStore(join(dir, "relay.json")), rpcClient);
    const coordinator = new ReachMissionCoordinator(missions, repository, relay, PROTECTOR);
    const authorizer = new NimiqWalletAuthorizer(repository, "https://carry.one");
    const server = createMissionHttpServer({
      coordinator,
      missions,
      repository,
      authorizer,
      relay,
      protector: PROTECTOR,
      canonicalOrigin: "https://carry.one",
      idempotency: new MemoryIdempotencyStore(),
      limiter: new MemoryRateLimiter(),
      legacyRelayEnabled: false,
    });
    gateBaseUrl = await listen(server);
    gateClose = () => new Promise((resolve) => server.close(() => resolve()));
  });

  afterAll(() => gateClose());

  it("rejects legacy /relay mutations with 403 while leaving the read surface open", async () => {
    for (const action of ["intent", "broadcast", "cancel", "reconcile"]) {
      const res = await fetch(`${gateBaseUrl}/relay/gated-baton/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("LEGACY_RELAY_DISABLED");
    }

    const history = await fetch(`${gateBaseUrl}/relay/gated-baton/history`);
    expect(history.status).toBe(200);
  });
});

describe("Reach Mission HTTP rate limiting", () => {
  it("returns 429 with Retry-After once the reads budget is exhausted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "carry-one-rate-"));
    try {
      const repository = new FileMissionRepository(join(dir, "missions.json"));
      const missions = new ReachMissionService(repository, PROTECTOR);
      const rpcClient = new FakeRpcClient();
      const relay = new CanonicalRelayService(new FileRelayStore(join(dir, "relay.json")), rpcClient);
      const coordinator = new ReachMissionCoordinator(missions, repository, relay, PROTECTOR);
      const authorizer = new NimiqWalletAuthorizer(repository, "https://carry.one");
      const server = createMissionHttpServer({
        coordinator,
        missions,
        repository,
        authorizer,
        relay,
        protector: PROTECTOR,
        canonicalOrigin: "https://carry.one",
        idempotency: new MemoryIdempotencyStore(),
        limiter: new MemoryRateLimiter(),
        limits: { readsPerMinute: 1, mutationsPerMinute: 1, challengesPerMinute: 1 },
      });
      const base = await listen(server);
      try {
        const first = await fetch(`${base}/usage`);
        expect(first.status).toBe(200);
        const second = await fetch(`${base}/usage`);
        expect(second.status).toBe(429);
        expect(second.headers.get("Retry-After")).toBeTruthy();
        const body = await second.json();
        expect(body.error).toBe("RATE_LIMITED");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
