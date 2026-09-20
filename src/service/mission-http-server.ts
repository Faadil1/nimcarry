import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { INTENT_VALIDITY_WINDOW_MS, isIntentStale, RelayValidationError } from "../core/relay.js";
import { ONE_NIM_IN_LUNA, type Hop, type PassIntent } from "../core/types.js";
import type { MissionRepository } from "../mission/repository.js";
import { ReachMissionCoordinator } from "../mission/coordinator.js";
import { ReachMissionService } from "../mission/service.js";
import { normalizeNimiqAddress, TargetWalletProtector } from "../mission/target-wallet-crypto.js";
import { MissionValidationError, type InvitationRecord } from "../mission/types.js";
import { buildUsageEvidence } from "../mission/usage.js";
import { NimiqWalletAuthorizer } from "../mission/wallet-auth.js";
import { buildCarryOneInviteLinks } from "../mini-app/deeplink.js";
import { RpcVerificationDelayedError } from "../nimiq/resilient-rpc-client.js";
import {
  BROADCAST_CAPABILITY_TTL_MS,
  BroadcastCapabilityError,
  MemoryBroadcastCapabilityStore,
  type BroadcastCapabilityStore,
} from "./broadcast-capability.js";
import type { CanonicalRelayService } from "./canonical-relay-service.js";
import { handleRelayRequest, legacyRelayEnabledFromEnv } from "./http-server.js";
import {
  MemoryRouteViewCapabilityStore,
  RouteViewCapabilityError,
  type RouteViewCapabilityStore,
} from "./route-view-capability.js";
import {
  RequestValidationError,
  asAddress,
  asBoolean,
  asEnum,
  asInteger,
  asObject,
  asOpaqueToken,
  asOptionalEnum,
  asOptionalUuid,
  asTxHash,
  asUuid,
  boundedText,
  parseSignedEnvelope,
  rejectUnknownKeys,
} from "./request-schema.js";
import { idempotencyFingerprint, type IdempotencyStore } from "./idempotency.js";
import type { RateLimiter } from "./rate-limiter.js";
import { composeMissionView, type MissionView } from "./mission-view.js";
import { profileTokenHash, type UserDirectory } from "../users/user-directory.js";

const MAX_BODY_BYTES = 16 * 1024;
const MISSION_ACTIONS = [
  "CREATE_MISSION",
  "CREATE_INVITATION",
  "ACCEPT_INVITATION",
  "WITHDRAW_INVITATION",
  "AUTHORIZE_PASS",
  "AUTHORIZE_DELIVERY",
  "BIND_DESTINATION",
  "CANCEL_MISSION",
  "VIEW_ROUTE",
] as const;

export interface HttpLimits {
  readsPerMinute: number;
  mutationsPerMinute: number;
  challengesPerMinute: number;
}

export interface MissionHttpDeps {
  coordinator: ReachMissionCoordinator;
  missions: ReachMissionService;
  repository: MissionRepository;
  authorizer: NimiqWalletAuthorizer;
  relay: CanonicalRelayService;
  protector: TargetWalletProtector;
  canonicalOrigin: string;
  idempotency: IdempotencyStore;
  limiter: RateLimiter;
  limits?: HttpLimits;
  /** Optional injection point for tests. Defaults to a process-local, short-lived store. */
  broadcastCapabilities?: BroadcastCapabilityStore;
  /** Optional injection point for tests. Defaults to a process-local store. */
  routeViewCapabilities?: RouteViewCapabilityStore;
  /** Optional human-profile registry used only to freeze verified same-user payment wallets at AUTHORIZE_PASS. */
  userDirectory?: UserDirectory;
  /**
   * Explicit legacy `/relay` mutation gate. Defaults to
   * `CARRY_ONE_LEGACY_RELAY_ENABLED` (enabled outside production, disabled in
   * production).
   */
  legacyRelayEnabled?: boolean;
}

const defaultCapabilityStores = new WeakMap<MissionHttpDeps, BroadcastCapabilityStore>();
const defaultRouteViewCapabilityStores = new WeakMap<MissionHttpDeps, RouteViewCapabilityStore>();

function capabilityStore(deps: MissionHttpDeps): BroadcastCapabilityStore {
  if (deps.broadcastCapabilities) return deps.broadcastCapabilities;
  let store = defaultCapabilityStores.get(deps);
  if (!store) {
    store = new MemoryBroadcastCapabilityStore();
    defaultCapabilityStores.set(deps, store);
  }
  return store;
}

function routeViewCapabilityStore(deps: MissionHttpDeps): RouteViewCapabilityStore {
  if (deps.routeViewCapabilities) return deps.routeViewCapabilities;
  let store = defaultRouteViewCapabilityStores.get(deps);
  if (!store) {
    store = new MemoryRouteViewCapabilityStore();
    defaultRouteViewCapabilityStores.set(deps, store);
  }
  return store;
}

function envInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function httpLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): HttpLimits {
  return {
    readsPerMinute: envInt(env, "CARRY_ONE_RATE_LIMIT_READS_PER_MINUTE", 120),
    mutationsPerMinute: envInt(env, "CARRY_ONE_RATE_LIMIT_MUTATIONS_PER_MINUTE", 30),
    challengesPerMinute: envInt(env, "CARRY_ONE_RATE_LIMIT_CHALLENGES_PER_MINUTE", 6),
  };
}

function resolveLimits(deps: MissionHttpDeps): HttpLimits {
  return deps.limits ?? httpLimitsFromEnv();
}

const USER_PROFILE_TOKEN_RE = /^[A-Za-z0-9_-]{32,}$/;

async function authorizedPaymentWalletSnapshot(
  deps: MissionHttpDeps,
  req: IncomingMessage,
  holderWallet: string
): Promise<string[]> {
  const holder = normalizeNimiqAddress(holderWallet);
  if (!deps.userDirectory) return [holder];

  const raw = req.headers["x-nimcarry-user-token"];
  const token = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!token || !USER_PROFILE_TOKEN_RE.test(token)) return [holder];

  const profile = await deps.userDirectory.getByTokenHash(profileTokenHash(token));
  if (!profile) return [holder];

  const verified = (await deps.userDirectory.walletsForUser(profile.id)).map(normalizeNimiqAddress);
  if (!verified.includes(holder)) return [holder];

  return [holder, ...verified].filter(
    (wallet, index, all) => all.findIndex((candidate) => candidate === wallet) === index
  );
}

export function createMissionHttpServer(deps: MissionHttpDeps) {
  // Materialize the per-server capability stores once. Keeping them process-local
  // means a restart invalidates bearer tokens (route-view and broadcast) without
  // losing the durable pass intent.
  capabilityStore(deps);
  routeViewCapabilityStore(deps);
  return createServer((req, res) => {
    handleRequest(deps, req, res).catch((err) => sendError(res, err));
  });
}

async function handleRequest(deps: MissionHttpDeps, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);

  if (segments.length === 1 && segments[0] === "health") {
    return send(res, 200, { status: "ok" });
  }
  if (segments[0] === "relay") {
    return handleRelayRequest(deps.relay, req, res, { legacyRelayEnabled: deps.legacyRelayEnabled ?? legacyRelayEnabledFromEnv() });
  }
  if (segments[0] === "usage" && segments.length === 1) {
    if (req.method !== "GET") return notFound(req, res, url);
    if (!checkReadLimit(deps, req, res)) return;
    const snapshot = await deps.repository.snapshot();
    const histories = snapshot.missions.map((mission) => deps.relay.getHistory(mission.id));
    return send(res, 200, buildUsageEvidence(snapshot, histories));
  }
  if (segments[0] === "auth" && segments.length === 2 && segments[1] === "challenge") {
    return handleChallenge(deps, req, res);
  }
  if (segments[0] === "missions") {
    return handleMission(deps, req, res, url, segments);
  }
  if (segments[0] === "i") {
    return handleInvitation(deps, req, res, url, segments);
  }
  if (segments[0] === "c") {
    return handleDestinationClaim(deps, req, res, url, segments);
  }
  return notFound(req, res, url);
}

// ---- Missions ----

async function handleMission(deps: MissionHttpDeps, req: IncomingMessage, res: ServerResponse, url: URL, segments: string[]) {
  if (segments.length === 1) {
    if (req.method === "POST") return sendMutation(deps, req, res, () => createMission(deps, req));
    return notFound(req, res, url);
  }

  const missionId = asUuid(decodeURIComponent(segments[1]), "missionId");
  const tail = segments.slice(2);

  if (req.method === "GET" && tail.length === 0) {
    if (!checkReadLimit(deps, req, res)) return;
    return send(res, 200, await viewMission(deps, req, missionId));
  }
  if (req.method === "GET" && tail.length === 1 && tail[0] === "route") {
    if (!checkReadLimit(deps, req, res)) return;
    const view = await viewMission(deps, req, missionId);
    return send(res, 200, view.route);
  }
  if (req.method === "POST" && tail.length === 1 && tail[0] === "view") {
    return sendMutation(deps, req, res, () => issueRouteViewCapability(deps, req, missionId));
  }
  if (req.method === "POST" && tail.length === 1 && tail[0] === "cancel") {
    return sendMutation(deps, req, res, () => cancelMission(deps, req, missionId));
  }
  if (req.method === "POST" && tail.length === 1 && tail[0] === "reconcile") {
    return sendRateLimited(deps, req, res, () => reconcileMission(deps, req, missionId));
  }
  if (req.method === "POST" && tail.length === 1 && tail[0] === "pass-intent") {
    return sendMutation(deps, req, res, () => authorizePass(deps, req, missionId));
  }
  if (req.method === "POST" && tail.length === 1 && tail[0] === "delivery-intent") {
    return sendMutation(deps, req, res, () => authorizeDelivery(deps, req, missionId));
  }
  if (req.method === "POST" && tail.length === 1 && tail[0] === "broadcast") {
    return sendMutation(deps, req, res, () => broadcast(deps, req, missionId));
  }
  if (req.method === "POST" && tail.length === 1 && tail[0] === "invitations") {
    return sendMutation(deps, req, res, () => createInvitation(deps, req, missionId));
  }
  if (req.method === "POST" && tail.length === 3 && tail[0] === "invitations" && tail[2] === "reissue") {
    const invitationId = asUuid(decodeURIComponent(tail[1]), "invitationId");
    return sendMutation(deps, req, res, () => reissueInvitation(deps, req, missionId, invitationId));
  }
  if (req.method === "POST" && tail.length === 3 && tail[0] === "invitations" && tail[2] === "withdraw") {
    const invitationId = asUuid(decodeURIComponent(tail[1]), "invitationId");
    return sendMutation(deps, req, res, () => withdrawInvitation(deps, req, missionId, invitationId));
  }
  return notFound(req, res, url);
}

async function createMission(deps: MissionHttpDeps, req: IncomingMessage): Promise<{ status: number; body: unknown }> {
  const obj = await jsonBody(req);
  const envelope = parseSignedEnvelope(obj);
  const targetLabel = boundedText(obj.target_label, "target_label", 1, 60);
  const targetWallet = obj.target_wallet === undefined || obj.target_wallet === null || obj.target_wallet === ""
    ? undefined
    : asAddress(obj.target_wallet, "target_wallet");
  const targetConsentConfirmed = obj.target_consent_confirmed === undefined || obj.target_consent_confirmed === null
    ? false
    : asBoolean(obj.target_consent_confirmed, "target_consent_confirmed");
  const missionNote = boundedText(obj.mission_note, "mission_note", 1, 180);
  const visibility = asOptionalEnum(obj.visibility, ["UNLISTED", "PRIVATE", "PUBLIC"], "visibility") ?? "UNLISTED";
  const creatorDisplayLabel =
    obj.creator_display_label === undefined || obj.creator_display_label === null
      ? undefined
      : boundedText(obj.creator_display_label, "creator_display_label", 1, 60);
  rejectUnknownKeys(obj, [
    "challenge_id",
    "public_key",
    "signature",
    "target_label",
    "target_wallet",
    "target_consent_confirmed",
    "mission_note",
    "visibility",
    "creator_display_label",
  ]);

  const auth = await verifyEnvelope(deps, envelope);
  const creatorWallet = normalizeNimiqAddress(auth.wallet);

  if (!targetWallet) {
    const created = await deps.missions.createClaimMission({
      auth,
      targetLabel,
      missionNote,
      creatorDisplayLabel,
      visibility,
    });
    const viewCapability = routeViewCapabilityStore(deps).issue({ missionId: created.mission.id, holderWallet: creatorWallet });
    return {
      status: 201,
      body: {
        ...(await viewMission(deps, req, created.mission.id, creatorWallet)),
        destination_claim: created.claim,
        claim_url: `${deps.canonicalOrigin.replace(/\/$/, "")}/c/${encodeURIComponent(created.claimToken)}`,
        view_token: viewCapability.token,
        view_token_expires_at: new Date(viewCapability.expiresAt).toISOString(),
      },
    };
  }

  const mission = await deps.missions.createMission({
    auth,
    targetLabel,
    targetWallet,
    targetConsentConfirmed,
    missionNote,
    creatorDisplayLabel,
    visibility,
  });
  const viewCapability = routeViewCapabilityStore(deps).issue({ missionId: mission.id, holderWallet: creatorWallet });
  return {
    status: 201,
    body: {
      ...(await viewMission(deps, req, mission.id, creatorWallet)),
      view_token: viewCapability.token,
      view_token_expires_at: new Date(viewCapability.expiresAt).toISOString(),
    },
  };
}

async function cancelMission(deps: MissionHttpDeps, req: IncomingMessage, missionId: string) {
  const obj = await jsonBody(req);
  const envelope = parseSignedEnvelope(obj);
  rejectUnknownKeys(obj, ["challenge_id", "public_key", "signature"]);
  const auth = await verifyEnvelope(deps, envelope);
  await deps.missions.cancelMission(missionId, auth);
  return { status: 200, body: await viewMission(deps, req, missionId, normalizeNimiqAddress(auth.wallet)) };
}

async function createInvitation(deps: MissionHttpDeps, req: IncomingMessage, missionId: string) {
  const obj = await jsonBody(req);
  const envelope = parseSignedEnvelope(obj);
  const candidateLabel =
    obj.candidate_label === undefined || obj.candidate_label === null
      ? undefined
      : boundedText(obj.candidate_label, "candidate_label", 1, 60);
  const candidateWallet =
    obj.candidate_wallet === undefined || obj.candidate_wallet === null ? undefined : asAddress(obj.candidate_wallet, "candidate_wallet");
  const whyYou =
    obj.why_you === undefined || obj.why_you === null ? undefined : boundedText(obj.why_you, "why_you", 1, 120);
  rejectUnknownKeys(obj, [
    "challenge_id",
    "public_key",
    "signature",
    "candidate_label",
    "candidate_wallet",
    "why_you",
  ]);

  const auth = await verifyEnvelope(deps, envelope);
  const { invitation, inviteToken } = await deps.missions.createInvitation({
    missionId,
    auth,
    candidateLabel,
    candidateWallet,
    whyYou,
  });
  const links = buildCarryOneInviteLinks(deps.canonicalOrigin, inviteToken);
  return {
    status: 201,
    body: {
      mission_id: missionId,
      invitation,
      invite_token: inviteToken,
      web_invite_url: links.webInviteUrl,
      nimiq_pay_custom_scheme: links.nimiqPayCustomScheme,
    },
  };
}

async function reissueInvitation(deps: MissionHttpDeps, req: IncomingMessage, missionId: string, invitationId: string) {
  const obj = await jsonBody(req);
  const envelope = parseSignedEnvelope(obj);
  const candidateLabel = obj.candidate_label === undefined || obj.candidate_label === null ? undefined : boundedText(obj.candidate_label, "candidate_label", 1, 60);
  const candidateWallet = obj.candidate_wallet === undefined || obj.candidate_wallet === null ? undefined : asAddress(obj.candidate_wallet, "candidate_wallet");
  const whyYou = obj.why_you === undefined || obj.why_you === null ? undefined : boundedText(obj.why_you, "why_you", 1, 120);
  rejectUnknownKeys(obj, ["challenge_id", "public_key", "signature", "candidate_label", "candidate_wallet", "why_you"]);
  const auth = await verifyEnvelope(deps, envelope);
  const { invitation, inviteToken } = await deps.missions.reissueInvitation({
    missionId,
    invitationId,
    auth,
    candidateLabel,
    candidateWallet,
    whyYou,
    activePassRecipient: deps.coordinator.activePassRecipient(missionId),
  });
  const links = buildCarryOneInviteLinks(deps.canonicalOrigin, inviteToken);
  return { status: 200, body: { mission_id: missionId, invitation, invite_token: inviteToken, web_invite_url: links.webInviteUrl, nimiq_pay_custom_scheme: links.nimiqPayCustomScheme } };
}

async function authorizeDelivery(deps: MissionHttpDeps, req: IncomingMessage, missionId: string) {
  const obj = await jsonBody(req);
  const envelope = parseSignedEnvelope(obj);
  rejectUnknownKeys(obj, ["challenge_id", "public_key", "signature"]);
  const auth = await verifyEnvelope(deps, envelope);
  const now = Date.now();
  const authorizedPaymentWallets = await authorizedPaymentWalletSnapshot(deps, req, auth.wallet);
  const intent = await deps.coordinator.authorizeDelivery({
    missionId,
    auth,
    authorizedPaymentWallets,
    now,
  });
  const intentExpiresAt = intent.createdAt + INTENT_VALIDITY_WINDOW_MS;
  const ttlMs = Math.min(BROADCAST_CAPABILITY_TTL_MS, intentExpiresAt - now);
  if (ttlMs <= 0) {
    throw new MissionValidationError("PASS_INTENT_EXPIRED", "Authorized delivery intent has expired; authorize delivery again");
  }
  const issued = capabilityStore(deps).issue(
    {
      missionId,
      invitationId: null,
      sequence: intent.sequence,
      intentNonce: intent.nonce,
      holderWallet: normalizeNimiqAddress(auth.wallet),
    },
    { now, ttlMs }
  );
  return { status: 200, body: toPassIntentPayload(intent, issued) };
}

async function authorizePass(deps: MissionHttpDeps, req: IncomingMessage, missionId: string) {
  const obj = await jsonBody(req);
  const envelope = parseSignedEnvelope(obj);
  const invitationId = asUuid(obj.invitation_id, "invitation_id");
  rejectUnknownKeys(obj, ["challenge_id", "public_key", "signature", "invitation_id"]);

  const auth = await verifyEnvelope(deps, envelope);
  const now = Date.now();
  const authorizedPaymentWallets = await authorizedPaymentWalletSnapshot(deps, req, auth.wallet);
  const intent = await deps.coordinator.authorizePass({
    missionId,
    invitationId,
    auth,
    authorizedPaymentWallets,
    now,
  });
  const intentExpiresAt = intent.createdAt + INTENT_VALIDITY_WINDOW_MS;
  const ttlMs = Math.min(BROADCAST_CAPABILITY_TTL_MS, intentExpiresAt - now);
  if (ttlMs <= 0) {
    throw new MissionValidationError("PASS_INTENT_EXPIRED", "Authorized pass intent has expired; authorize the pass again");
  }
  const issued = capabilityStore(deps).issue(
    {
      missionId,
      invitationId,
      sequence: intent.sequence,
      intentNonce: intent.nonce,
      holderWallet: normalizeNimiqAddress(auth.wallet),
    },
    { now, ttlMs }
  );
  return { status: 200, body: toPassIntentPayload(intent, issued) };
}

async function broadcast(deps: MissionHttpDeps, req: IncomingMessage, missionId: string) {
  const obj = await jsonBody(req);
  const invitationId = obj.invitation_id === undefined || obj.invitation_id === null
    ? null
    : asUuid(obj.invitation_id, "invitation_id");
  const txHash = asTxHash(obj.tx_hash, "tx_hash");
  const capability = asOpaqueToken(obj.broadcast_capability, "broadcast_capability");
  rejectUnknownKeys(obj, ["invitation_id", "tx_hash", "broadcast_capability"]);

  const active = deps.relay.getActiveIntent(missionId);
  if (!active) throw new MissionValidationError("NO_ACTIVE_PASS", "No authorized delivery exists for this mission");
  if ((active.invitationId ?? null) !== invitationId) {
    throw new MissionValidationError("DELIVERY_INTENT_KIND_MISMATCH", "Broadcast provenance does not match the authorized delivery");
  }

  capabilityStore(deps).consume(capability, {
    missionId,
    invitationId,
    sequence: active.sequence,
    intentNonce: active.nonce,
    holderWallet: normalizeNimiqAddress(active.currentHolder),
  });

  const hop = invitationId === null
    ? await deps.coordinator.recordDeliveryBroadcast({ missionId, txHash })
    : await deps.coordinator.recordBroadcast({ missionId, invitationId, txHash });
  return { status: 201, body: toHopResponse(hop) };
}

async function reconcileMission(deps: MissionHttpDeps, req: IncomingMessage, missionId: string) {
  const obj = await jsonBody(req);
  rejectUnknownKeys(obj, []);
  const reconciled = await deps.coordinator.reconcile(missionId);
  return {
    status: 200,
    body: {
      mission: await viewMission(deps, req, missionId),
      hop: reconciled.hop
        ? ("baton_id" in reconciled.hop ? reconciled.hop : toHopResponse(reconciled.hop))
        : null,
    },
  };
}

async function withdrawInvitation(deps: MissionHttpDeps, req: IncomingMessage, missionId: string, invitationId: string) {
  const obj = await jsonBody(req);
  const envelope = parseSignedEnvelope(obj);
  rejectUnknownKeys(obj, ["challenge_id", "public_key", "signature"]);
  void missionId;
  const auth = await verifyEnvelope(deps, envelope);
  const invitation = await deps.missions.withdrawInvitation(invitationId, auth);
  return { status: 200, body: invitation };
}

// ---- Destination claims ----

async function handleDestinationClaim(deps: MissionHttpDeps, req: IncomingMessage, res: ServerResponse, url: URL, segments: string[]) {
  if (segments.length < 2) return notFound(req, res, url);
  const token = asOpaqueToken(decodeURIComponent(segments[1]), "token");
  const tail = segments[2];

  if (req.method === "GET" && !tail) {
    if (!checkReadLimit(deps, req, res)) return;
    const resolved = await deps.missions.getDestinationClaimByToken(token);
    return send(res, 200, { claim: resolved.publicClaim });
  }
  if (req.method === "POST" && tail === "bind") {
    return sendMutation(deps, req, res, () => bindDestinationClaim(deps, req, token));
  }
  return notFound(req, res, url);
}

async function bindDestinationClaim(deps: MissionHttpDeps, req: IncomingMessage, token: string) {
  const obj = await jsonBody(req);
  const envelope = parseSignedEnvelope(obj);
  rejectUnknownKeys(obj, ["challenge_id", "public_key", "signature"]);
  const auth = await verifyEnvelope(deps, envelope);
  const result = await deps.missions.bindDestinationClaim({ token, auth });
  const issued = routeViewCapabilityStore(deps).issue({ missionId: result.mission.id, holderWallet: normalizeNimiqAddress(auth.wallet) });
  return {
    status: 200,
    body: {
      claim: result.claim,
      mission_id: result.mission.id,
      view_token: issued.token,
      view_token_expires_at: new Date(issued.expiresAt).toISOString(),
    },
  };
}

// ---- Invitations ----

async function handleInvitation(deps: MissionHttpDeps, req: IncomingMessage, res: ServerResponse, url: URL, segments: string[]) {
  if (segments.length < 2) return notFound(req, res, url);
  const token = asOpaqueToken(decodeURIComponent(segments[1]), "token");
  const tail = segments[2];

  if (req.method === "GET" && !tail) {
    if (!checkReadLimit(deps, req, res)) return;
    const invitationRecord = await deps.missions.getInvitationRecordByToken(token);
    const invitation = await deps.missions.getInvitationByToken(token);
    const mission = await viewInvitationMission(deps, invitationRecord);
    return send(res, 200, { invitation, mission });
  }
  if (req.method === "POST" && tail === "accept") {
    return sendMutation(deps, req, res, () => acceptInvitation(deps, req, token));
  }
  if (req.method === "POST" && tail === "decline") {
    return sendMutation(deps, req, res, () => declineInvitation(deps, req, token));
  }
  return notFound(req, res, url);
}

async function acceptInvitation(deps: MissionHttpDeps, req: IncomingMessage, token: string) {
  const obj = await jsonBody(req);
  const envelope = parseSignedEnvelope(obj);
  const candidateDisplayLabel =
    obj.candidate_display_label === undefined || obj.candidate_display_label === null
      ? undefined
      : boundedText(obj.candidate_display_label, "candidate_display_label", 1, 60);
  rejectUnknownKeys(obj, ["challenge_id", "public_key", "signature", "candidate_display_label"]);

  const auth = await verifyEnvelope(deps, envelope);
  const invitation = await deps.missions.acceptInvitation({ token, auth, candidateDisplayLabel });

  // The ACCEPT_INVITATION signature already proves the bridge wallet and binds
  // it to this mission/sequence. Reuse that verified identity to issue the
  // read-only mission capability in the same response. The bridge should not
  // be asked for a second VIEW_ROUTE signature just to continue the handoff.
  const issued = routeViewCapabilityStore(deps).issue({
    missionId: invitation.mission_id,
    holderWallet: normalizeNimiqAddress(auth.wallet),
  });

  return {
    status: 200,
    body: {
      ...invitation,
      view_token: issued.token,
      view_token_expires_at: new Date(issued.expiresAt).toISOString(),
    },
  };
}

async function declineInvitation(deps: MissionHttpDeps, req: IncomingMessage, token: string) {
  const obj = await jsonBody(req);
  rejectUnknownKeys(obj, []);
  const invitation = await deps.missions.declineInvitation(token);
  return { status: 200, body: invitation };
}

// ---- Auth ----

async function handleChallenge(deps: MissionHttpDeps, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return notFound(req, res, new URL(req.url ?? "/", "http://localhost"));
  if (!checkReadLimit(deps, req, res)) return;

  const obj = await jsonBody(req);
  const wallet = asAddress(obj.wallet, "wallet");
  const action = asEnum(obj.action, MISSION_ACTIONS, "action");
  const missionId = asOptionalUuid(obj.mission_id, "mission_id");
  const invitationId = asOptionalUuid(obj.invitation_id, "invitation_id");
  const sequence = obj.sequence === undefined || obj.sequence === null ? undefined : asInteger(obj.sequence, "sequence");
  rejectUnknownKeys(obj, ["wallet", "action", "mission_id", "invitation_id", "sequence"]);

  const ip = clientAddress(req);
  if (!checkLimit(deps, res, `challenge:${ip}:${wallet}`, resolveLimits(deps).challengesPerMinute)) return;

  const challenge = await deps.authorizer.issue({
    wallet,
    action,
    missionId: missionId ?? undefined,
    invitationId: invitationId ?? undefined,
    sequence: sequence ?? undefined,
  });
  return send(res, 200, { challenge_id: challenge.id, message: challenge.message, expires_at: challenge.expiresAt });
}

// ---- Shared helpers ----

async function verifyEnvelope(deps: MissionHttpDeps, envelope: { challenge_id: string; public_key: string; signature: string }) {
  return deps.authorizer.verifyAndConsume({
    challengeId: envelope.challenge_id,
    publicKeyHex: envelope.public_key,
    signatureHex: envelope.signature,
  });
}

function clientAddress(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "unknown";
}

function checkLimit(deps: MissionHttpDeps, res: ServerResponse, key: string, limit: number): boolean {
  const decision = deps.limiter.allow(key, limit);
  if (decision.allowed) return true;
  send(res, 429, { error: "RATE_LIMITED", message: `Rate limit exceeded; retry in ${decision.retryAfterSeconds}s` }, {
    "Retry-After": String(decision.retryAfterSeconds),
  });
  return false;
}

function checkReadLimit(deps: MissionHttpDeps, req: IncomingMessage, res: ServerResponse): boolean {
  return checkLimit(deps, res, `read:${clientAddress(req)}`, resolveLimits(deps).readsPerMinute);
}

function requireIdempotencyKey(req: IncomingMessage, res: ServerResponse): string | null {
  const header = req.headers["idempotency-key"];
  const key = typeof header === "string" ? header : Array.isArray(header) ? header[0] : undefined;
  if (!key) {
    send(res, 400, { error: "MISSING_IDEMPOTENCY_KEY", message: "Mutation endpoints require an Idempotency-Key header" });
    return null;
  }
  if (key.length > 64 || !/^[A-Za-z0-9_-]+$/.test(key)) {
    send(res, 400, { error: "INVALID_IDEMPOTENCY_KEY", message: "Idempotency-Key must be a client-generated token up to 64 characters" });
    return null;
  }
  return key;
}

async function sendMutation(
  deps: MissionHttpDeps,
  req: IncomingMessage,
  res: ServerResponse,
  run: () => Promise<{ status: number; body: unknown }>
): Promise<void> {
  const ip = clientAddress(req);
  if (!checkLimit(deps, res, `mut:${ip}`, resolveLimits(deps).mutationsPerMinute)) return;

  const idemKey = requireIdempotencyKey(req, res);
  if (idemKey === null) return;

  const fingerprint = idempotencyFingerprint(req.method ?? "POST", req.url ?? "/", idemKey);
  const stored = await deps.idempotency.lookup(fingerprint);
  if (stored) {
    send(res, stored.status, stored.body, { "Idempotency-Replayed": "true" });
    return;
  }

  const result = await run();
  await deps.idempotency.save(fingerprint, { status: result.status, body: result.body, createdAt: Date.now() });
  send(res, result.status, result.body);
}

/**
 * Naturally idempotent mutations (reconcile) skip the replay cache: every call
 * must recompute against the latest relay/mission state so a polling client can
 * advance as soon as a hop finalizes. They still pay the mutation rate limit.
 */
async function sendRateLimited(
  deps: MissionHttpDeps,
  req: IncomingMessage,
  res: ServerResponse,
  run: () => Promise<{ status: number; body: unknown }>
): Promise<void> {
  const ip = clientAddress(req);
  if (!checkLimit(deps, res, `mut:${ip}`, resolveLimits(deps).mutationsPerMinute)) return;
  const result = await run();
  send(res, result.status, result.body);
}

async function viewMission(deps: MissionHttpDeps, req: IncomingMessage, missionId: string, signedWallet?: string): Promise<MissionView> {
  const record = await deps.missions.getMissionRecord(missionId);
  let resolution: ViewerResolution;
  if (signedWallet !== undefined) {
    resolution = { viewer: normalizeNimiqAddress(signedWallet), authorized: true };
  } else if (record.visibility !== "PUBLIC") {
    resolution = await resolveViewer(deps, req, record.id);
  } else {
    resolution = { viewer: null, authorized: true };
  }
  return buildMissionView(deps, missionId, resolution);
}

/**
 * Invitation view: the invite token is the bearer for the curated bridge
 * landing page (`GET /i/:token`). Continued route access after accepting or
 * declining requires a separate signed `VIEW_ROUTE` capability mint via
 * `POST /missions/:id/view`.
 */
async function viewInvitationMission(deps: MissionHttpDeps, invitationRecord: InvitationRecord): Promise<MissionView> {
  return buildMissionView(deps, invitationRecord.missionId, {
    viewer: invitationRecord.candidateWalletNormalized,
    authorized: true,
  });
}

interface ViewerResolution {
  viewer: string | null;
  authorized: boolean;
}

async function resolveProfileViewer(
  deps: MissionHttpDeps,
  req: IncomingMessage,
  missionId: string
): Promise<ViewerResolution | null> {
  if (!deps.userDirectory) return null;

  const raw = req.headers["x-nimcarry-user-token"];
  const token = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!token || !USER_PROFILE_TOKEN_RE.test(token)) return null;

  const profile = await deps.userDirectory.getByTokenHash(profileTokenHash(token));
  if (!profile) return null;

  const linkedWallets = (await deps.userDirectory.walletsForUser(profile.id)).map(normalizeNimiqAddress);
  if (linkedWallets.length === 0) return null;

  const record = await deps.missions.getMissionRecord(missionId);
  const linkedSet = new Set(linkedWallets);
  const preferred = [
    record.currentHolderWalletNormalized,
    record.creatorWalletNormalized,
    ...linkedWallets,
  ].filter((wallet, index, all) => linkedSet.has(wallet) && all.indexOf(wallet) === index);

  for (const wallet of preferred) {
    const view = await buildMissionView(deps, missionId, { viewer: wallet, authorized: true });
    if (view.viewer_role !== "UNLISTED_VIEWER") {
      await deps.userDirectory.touch(profile.id);
      return { viewer: wallet, authorized: true };
    }
  }
  return null;
}

/**
 * Resolve a route-view request to an (optionally personalized) viewer identity.
 *
 * Bearer resolution goes through the route-view capability store — the minted
 * view token. The legacy spoofable `X-Wallet` header is no longer read; a
 * missing or invalid capability rejects with 401/403 before any unlisted mission
 * data is produced.
 */
async function resolveViewer(
  deps: MissionHttpDeps,
  req: IncomingMessage,
  missionId: string
): Promise<ViewerResolution> {
  const token = bearerToken(req);
  if (token) {
    try {
      const capability = routeViewCapabilityStore(deps).verify(token, { missionId });
      if (capability.holderWallet === null) {
        throw new MissionValidationError(
          "VIEWER_AUTH_REQUIRED",
          "This route view capability does not bind a viewer identity"
        );
      }
      return { viewer: capability.holderWallet, authorized: true };
    } catch (error) {
      if (
        error instanceof RouteViewCapabilityError &&
        ["ROUTE_VIEW_CAPABILITY_INVALID", "ROUTE_VIEW_CAPABILITY_EXPIRED"].includes(error.reason)
      ) {
        const profileViewer = await resolveProfileViewer(deps, req, missionId);
        if (profileViewer) return profileViewer;
      }
      throw error;
    }
  }

  const profileViewer = await resolveProfileViewer(deps, req, missionId);
  if (profileViewer) return profileViewer;

  throw new MissionValidationError(
    "ROUTE_VIEW_CAPABILITY_REQUIRED",
    "This mission is not public. Route view requires a Bearer route view capability"
  );
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  const text = typeof header === "string" ? header : Array.isArray(header) ? header[0] : undefined;
  if (!text) return null;
  const match = /^Bearer\s+([A-Za-z0-9_-]+)$/i.exec(text.trim());
  return match ? match[1] : null;
}

/**
 * Signed `VIEW_ROUTE` mint: mission participants (creator, current holder,
 * invitee, active/accepted invitee, target, earlier bridges) may mint a
 * route-view capability for their wallet; strangers may not. Read-only — minting
 * exposes no mission data and grants no custody.
 */
async function issueRouteViewCapability(deps: MissionHttpDeps, req: IncomingMessage, missionId: string) {
  const obj = await jsonBody(req);
  const envelope = parseSignedEnvelope(obj);
  rejectUnknownKeys(obj, ["challenge_id", "public_key", "signature"]);
  const auth = await verifyEnvelope(deps, envelope);
  if (auth.missionId !== undefined && auth.missionId !== missionId) {
    throw new MissionValidationError("AUTH_MISSION_MISMATCH", "Authorization is bound to another mission");
  }
  const wallet = normalizeNimiqAddress(auth.wallet);
  const record = await deps.missions.getMissionRecord(missionId);
  const view = await buildMissionView(deps, missionId, { viewer: wallet, authorized: true });
  if (view.viewer_role === "UNLISTED_VIEWER" && record.visibility !== "PUBLIC") {
    throw new MissionValidationError(
      "NOT_MISSION_PARTICIPANT",
      "Only mission participants can mint a route view capability"
    );
  }
  const issued = routeViewCapabilityStore(deps).issue({ missionId, holderWallet: wallet });
  return {
    status: 200,
    body: { view_token: issued.token, view_token_expires_at: new Date(issued.expiresAt).toISOString() },
  };
}

async function buildMissionView(
  deps: MissionHttpDeps,
  missionId: string,
  resolution: ViewerResolution
): Promise<MissionView> {
  const record = await deps.missions.getMissionRecord(missionId);
  const route = deps.relay.getHistory(missionId);
  let invitation = await deps.repository.getOpenInvitation(missionId);
  const viewerIsRecoveryHolder = resolution.viewer !== null && (
    resolution.viewer === record.creatorWalletNormalized || resolution.viewer === record.currentHolderWalletNormalized
  );
  if (invitation === undefined) {
    const latestFinalHop = route
      .filter((hop) => hop.status === "CONFIRMED" && hop.confirmed_at !== null)
      .sort((a, b) => b.sequence - a.sequence)[0];

    if (latestFinalHop?.invitation_id) {
      // The relay row carries the exact invitation that authorized this
      // delivery. Use that durable FK instead of reconstructing provenance from
      // (mission_id, sequence), which can be fragile across adapters/read paths.
      invitation = await deps.repository.getInvitation(latestFinalHop.invitation_id);
    } else if (latestFinalHop) {
      // Legacy persisted hops pre-date invitation_id on the relay model.
      invitation = await deps.repository.getInvitationForSequence(missionId, latestFinalHop.sequence);
    } else if (viewerIsRecoveryHolder) {
      invitation = await deps.repository.getInvitationForSequence(missionId, record.currentSequence + 1);
    }
  }
  const finalizedBridgeMarks: Record<number, { label: string | null; wallet: string | null }> = {};
  await Promise.all(
    route
      .filter((hop) => hop.status === "CONFIRMED" && hop.confirmed_at !== null)
      .map(async (hop) => {
        // Prefer the invitation already resolved for this mission read. This is
        // the same canonical row used to derive the viewer role and avoids a
        // second read racing the FINAL projection. Fall back to a direct
        // sequence lookup for historical route entries.
        const historicalInvitation =
          invitation?.id === hop.invitation_id
            ? invitation
            : hop.invitation_id
              ? await deps.repository.getInvitation(hop.invitation_id)
              : invitation?.sequence === hop.sequence
                ? invitation
                : await deps.repository.getInvitationForSequence(missionId, hop.sequence);
        finalizedBridgeMarks[hop.sequence] = historicalInvitation
          ? {
              label: historicalInvitation.candidateDisplayLabel ?? historicalInvitation.candidateLabel,
              wallet: historicalInvitation.candidateWalletNormalized,
            }
          : { label: null, wallet: null };
      })
  );
  const activeIntent = deps.relay.getActiveIntent(missionId);
  const view = composeMissionView({
    mission: record,
    invitation: invitation ?? null,
    route,
    protector: deps.protector,
    viewer: resolution.viewer,
    finalizedBridgeMarks,
    authenticatedParticipantFallback:
      record.status === "ARRIVED" && resolution.authorized && resolution.viewer !== null,
    hasActiveIntent: activeIntent !== null,
    activeIntentStale: activeIntent ? isIntentStale(activeIntent) : false,
    activeIntentHasBroadcast: activeIntent ? deps.relay.hasRecordedBroadcast(missionId) : false,
  });

  return view;
}

function toPassIntentPayload(intent: PassIntent, capability: { token: string; expiresAt: number }) {
  return {
    intent_id: intent.batonId,
    sequence: intent.sequence,
    recipient: intent.recipient,
    value_luna: ONE_NIM_IN_LUNA,
    fee_luna: 0,
    recipient_data: intent.recipientData,
    expected_sender: intent.currentHolder,
    authorized_payment_wallets: intent.authorizedPaymentWallets,
    expires_at: new Date(intent.createdAt + INTENT_VALIDITY_WINDOW_MS).toISOString(),
    broadcast_capability: capability.token,
    broadcast_capability_expires_at: new Date(capability.expiresAt).toISOString(),
  };
}

function toHopResponse(hop: Hop) {
  return {
    baton_id: hop.batonId,
    sequence: hop.sequence,
    invitation_id: hop.invitationId ?? null,
    current_holder: hop.currentHolder,
    recipient: hop.recipient,
    tx_hash: hop.txHash,
    value_luna: hop.value,
    status: hop.status,
    created_at: new Date(hop.createdAt).toISOString(),
    confirmed_at: hop.confirmedAt === null ? null : new Date(hop.confirmedAt).toISOString(),
  };
}

function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(req.headers["content-length"] ?? 0);
    if (declaredLength > MAX_BODY_BYTES) {
      reject(new RequestValidationError("REQUEST_BODY_TOO_LARGE", `Request body exceeds ${MAX_BODY_BYTES} bytes`));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new RequestValidationError("REQUEST_BODY_TOO_LARGE", `Request body exceeds ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(asObject(parsed));
      } catch {
        reject(new RequestValidationError("BAD_JSON", "Request body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function notFound(req: IncomingMessage, res: ServerResponse, url: URL) {
  return send(res, 404, { error: "NOT_FOUND", message: `No route for ${req.method} ${url.pathname}` });
}

function send(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...extraHeaders });
  res.end(JSON.stringify(body ?? null));
}

const AUTH_REASONS = new Set([
  "CHALLENGE_NOT_FOUND",
  "CHALLENGE_REPLAY",
  "CHALLENGE_EXPIRED",
  "MALFORMED_SIGNATURE",
  "SIGNER_WALLET_MISMATCH",
  "INVALID_SIGNATURE",
  "WRONG_AUTH_ACTION",
  "AUTH_MISSION_MISMATCH",
  "AUTH_INVITATION_MISMATCH",
  "AUTH_SEQUENCE_MISMATCH",
  "AUTH_BINDING_MISMATCH",
  "ROUTE_VIEW_CAPABILITY_REQUIRED",
  "VIEWER_AUTH_REQUIRED",
]);
const NOT_FOUND_REASONS = new Set(["MISSION_NOT_FOUND", "INVITATION_NOT_FOUND"]);
const FORBIDDEN_REASONS = new Set([
  "WRONG_CURRENT_HOLDER",
  "NOT_MISSION_AUTHORITY",
  "WRONG_INVITEE_WALLET",
  "NOT_MISSION_PARTICIPANT",
]);
const BAD_REQUEST_REASONS = new Set([
  "TARGET_CONSENT_REQUIRED",
  "TARGET_IS_CREATOR",
  "SELF_PASS",
  "WRONG_SEQUENCE",
  "INVALID_NIMIQ_ADDRESS",
  "INVALID_TEXT_LENGTH",
]);

function sendError(res: ServerResponse, err: unknown) {
  if (err instanceof RequestValidationError) {
    return send(res, 400, { error: err.reason, message: err.message, details: err.details });
  }
  if (err instanceof BroadcastCapabilityError) {
    const status = err.reason === "BROADCAST_CAPABILITY_BINDING_MISMATCH" ? 403 : 401;
    return send(res, status, { error: err.reason, message: err.message });
  }
  if (err instanceof RouteViewCapabilityError) {
    const status = err.reason === "ROUTE_VIEW_CAPABILITY_MISSION_MISMATCH" ? 403 : 401;
    return send(res, status, { error: err.reason, message: err.message });
  }
  if (err instanceof MissionValidationError) {
    let status = 409;
    if (AUTH_REASONS.has(err.reason)) status = 401;
    else if (NOT_FOUND_REASONS.has(err.reason)) status = 404;
    else if (FORBIDDEN_REASONS.has(err.reason)) status = 403;
    else if (BAD_REQUEST_REASONS.has(err.reason)) status = 400;
    return send(res, status, { error: err.reason, message: err.message });
  }
  if (err instanceof RelayValidationError) {
    return send(res, 409, { error: err.reason, message: err.message });
  }
  if (err instanceof RpcVerificationDelayedError) {
    return send(res, 503, {
      error: "VERIFICATION_DELAYED",
      message: "Nimiq verification is temporarily delayed. The pass remains pending; custody has not changed.",
    });
  }
  const message = err instanceof Error ? err.message : String(err);
  send(res, 500, { error: "INTERNAL_ERROR", message });
}
