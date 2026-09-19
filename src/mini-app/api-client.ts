export interface SignatureEnvelope {
  challenge_id: string;
  public_key: string;
  signature: string;
}

export interface ChallengeResponse {
  challenge_id?: string;
  id?: string;
  canonical_message?: string;
  message?: string;
  expires_at?: string;
  expiresAt?: string;
}

export interface PassIntentResponse {
  intent_id: string;
  sequence: number;
  recipient: string;
  value_luna: number;
  fee_luna: number;
  recipient_data: string | null;
  expected_sender: string;
  authorized_payment_wallets: string[];
  expires_at: string;
  broadcast_capability: string;
  broadcast_capability_expires_at: string;
}

export interface CarryOneApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Test/host injection point. Defaults to Web Crypto randomUUID. */
  idempotencyKeyFactory?: () => string;
}

function signedBody(auth: SignatureEnvelope, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...fields, challenge_id: auth.challenge_id, public_key: auth.public_key, signature: auth.signature };
}

function defaultIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.randomUUID !== "function") {
    throw new Error("Secure randomUUID is unavailable; cannot generate an Idempotency-Key");
  }
  return cryptoApi.randomUUID();
}

export class CarryOneApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly idempotencyKeyFactory: () => string;

  constructor(options: CarryOneApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.idempotencyKeyFactory = options.idempotencyKeyFactory ?? defaultIdempotencyKey;
  }

  issueChallenge(input: { wallet: string; action: string; mission_id?: string | null; invitation_id?: string | null; sequence?: number }): Promise<ChallengeResponse> {
    return this.request("/auth/challenge", { method: "POST", body: input });
  }

  createMission(input: Record<string, unknown> & { auth: SignatureEnvelope }): Promise<unknown> {
    const { auth, ...fields } = input;
    return this.mutation("/missions", signedBody(auth, fields));
  }

  getMission(missionId: string, viewToken?: string): Promise<unknown> {
    return this.request(`/missions/${encodeURIComponent(missionId)}`, { viewToken });
  }

  createInvitation(missionId: string, input: Record<string, unknown> & { auth: SignatureEnvelope }): Promise<unknown> {
    const { auth, ...fields } = input;
    return this.mutation(`/missions/${encodeURIComponent(missionId)}/invitations`, signedBody(auth, fields));
  }

  getInvitation(inviteToken: string): Promise<unknown> {
    return this.request(`/i/${encodeURIComponent(inviteToken)}`);
  }

  acceptInvitation(inviteToken: string, input: { auth: SignatureEnvelope; candidate_display_label?: string }): Promise<unknown> {
    return this.mutation(
      `/i/${encodeURIComponent(inviteToken)}/accept`,
      signedBody(input.auth, { candidate_display_label: input.candidate_display_label })
    );
  }

  declineInvitation(inviteToken: string): Promise<unknown> {
    return this.mutation(`/i/${encodeURIComponent(inviteToken)}/decline`, {});
  }

  authorizePass(missionId: string, input: { invitation_id: string; auth: SignatureEnvelope }): Promise<PassIntentResponse> {
    return this.mutation(`/missions/${encodeURIComponent(missionId)}/pass-intent`, signedBody(input.auth, { invitation_id: input.invitation_id }));
  }

  /**
   * Attach the wallet-broadcast tx hash only with the short-lived capability
   * returned by the immediately preceding signed AUTHORIZE_PASS.
   */
  recordBroadcast(
    missionId: string,
    invitationId: string,
    txHash: string,
    broadcastCapability: string,
    idempotencyKey?: string
  ): Promise<unknown> {
    return this.mutation(
      `/missions/${encodeURIComponent(missionId)}/broadcast`,
      {
        invitation_id: invitationId,
        tx_hash: txHash,
        broadcast_capability: broadcastCapability,
      },
      idempotencyKey
    );
  }

  reconcile(missionId: string, viewToken?: string): Promise<unknown> {
    // Reconcile is naturally idempotent and intentionally bypasses the replay
    // cache server-side so each poll observes the latest finality state. It
    // enforces the same route-view Bearer capability as GET /missions/:id for
    // non-public missions, so the caller forwards its stored view token.
    return this.request(`/missions/${encodeURIComponent(missionId)}/reconcile`, { method: "POST", body: {}, viewToken });
  }

  private mutation<T = any>(path: string, body: unknown, idempotencyKey = this.idempotencyKeyFactory()): Promise<T> {
    return this.request(path, { method: "POST", body, idempotencyKey });
  }

  private async request(
    path: string,
    options: { method?: string; body?: unknown; viewToken?: string; idempotencyKey?: string } = {}
  ): Promise<any> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    // Kept as a client boundary for the secure route-follow capability. The
    // active backend branch must enforce this token before this feature can be
    // called production-ready; the client never falls back to spoofable X-Wallet.
    if (options.viewToken) headers.Authorization = `Bearer ${options.viewToken}`;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    const payload = text ? safeJson(text) : null;
    if (!response.ok) {
      const code = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : `HTTP_${response.status}`;
      const message = payload && typeof payload === "object" && "message" in payload ? String(payload.message) : response.statusText;
      throw new CarryOneApiError(code, message, response.status);
    }
    return payload;
  }
}

export class CarryOneApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = "CarryOneApiError";
  }
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); }
  catch { return { error: "INVALID_JSON_RESPONSE", message: "NimCarry API returned non-JSON content" }; }
}
