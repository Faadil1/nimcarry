import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { MissionRepository } from "./repository.js";
import {
  MissionValidationError,
  type AuthChallengeRecord,
  type InvitationRecord,
  type InvitationStatus,
  type MissionRecord,
  type MissionStoreSnapshot,
} from "./types.js";

const OPEN_INVITATION_STATES = new Set<InvitationStatus>(["INVITED", "ACCEPTED"]);

function emptySnapshot(): MissionStoreSnapshot {
  return { missions: [], invitations: [], challenges: [], auditEvents: [] };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class FileMissionRepository implements MissionRepository {
  private state: MissionStoreSnapshot;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {
    this.state = this.load();
  }

  private load(): MissionStoreSnapshot {
    if (!existsSync(this.filePath)) return emptySnapshot();
    const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<MissionStoreSnapshot>;
    return {
      missions: (parsed.missions ?? []).map((mission) => ({
        ...mission,
        // Old local snapshots pre-date the explicit Cycle-II target consent policy.
        // They are never silently upgraded to consented.
        targetConsentConfirmed: mission.targetConsentConfirmed ?? false,
      })),
      invitations: parsed.invitations ?? [],
      challenges: parsed.challenges ?? [],
      auditEvents: parsed.auditEvents ?? [],
    };
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, `${JSON.stringify(this.state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, this.filePath);
  }

  private async exclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private mission(id: string): MissionRecord {
    const mission = this.state.missions.find((item) => item.id === id);
    if (!mission) throw new MissionValidationError("MISSION_NOT_FOUND", `Mission ${id} does not exist`);
    return mission;
  }

  private invitation(id: string): InvitationRecord {
    const invitation = this.state.invitations.find((item) => item.id === id);
    if (!invitation) throw new MissionValidationError("INVITATION_NOT_FOUND", `Invitation ${id} does not exist`);
    return invitation;
  }

  async createMission(record: MissionRecord): Promise<MissionRecord> {
    return this.exclusive(() => {
      if (this.state.missions.some((item) => item.id === record.id)) {
        throw new MissionValidationError("MISSION_EXISTS", `Mission ${record.id} already exists`);
      }
      this.state.missions.push(clone(record));
      this.persist();
      return clone(record);
    });
  }

  async getMission(id: string): Promise<MissionRecord | undefined> {
    await this.queue;
    const record = this.state.missions.find((item) => item.id === id);
    return record ? clone(record) : undefined;
  }

  async cancelMissionPristine(id: string, signerWallet: string, now: number): Promise<MissionRecord> {
    return this.exclusive(() => {
      const mission = this.mission(id);
      if (mission.status !== "ACTIVE") throw new MissionValidationError("MISSION_NOT_ACTIVE", `Mission ${id} is ${mission.status}`);
      if (mission.creatorWalletNormalized !== signerWallet && mission.currentHolderWalletNormalized !== signerWallet) {
        throw new MissionValidationError("NOT_MISSION_AUTHORITY", "Only the creator/current holder can cancel this mission");
      }
      if (mission.finalizedHopCount !== 0) {
        throw new MissionValidationError("MISSION_ALREADY_MOVED", "A mission cannot be cancelled after its first finalized hop");
      }
      if (this.state.invitations.some((item) => item.missionId === id && OPEN_INVITATION_STATES.has(item.status))) {
        throw new MissionValidationError("OPEN_INVITATION", "Withdraw or close the active invitation before cancelling the mission");
      }
      mission.status = "CANCELLED";
      mission.cancelledAt = now;
      mission.updatedAt = now;
      this.persist();
      return clone(mission);
    });
  }

  async createInvitation(record: InvitationRecord): Promise<InvitationRecord> {
    return this.exclusive(() => {
      const mission = this.mission(record.missionId);
      if (mission.status !== "ACTIVE") throw new MissionValidationError("MISSION_NOT_ACTIVE", `Mission ${mission.id} is ${mission.status}`);
      if (record.inviterWalletNormalized !== mission.currentHolderWalletNormalized) {
        throw new MissionValidationError("WRONG_CURRENT_HOLDER", "Invitation signer is not the canonical current holder");
      }
      if (record.sequence !== mission.currentSequence + 1) {
        throw new MissionValidationError("WRONG_SEQUENCE", "Invitation sequence does not match the mission's next hop");
      }
      if (this.state.invitations.some((item) => item.missionId === record.missionId && OPEN_INVITATION_STATES.has(item.status))) {
        throw new MissionValidationError("OPEN_INVITATION_EXISTS", "Only one open invitation is allowed per mission");
      }
      if (this.state.invitations.some((item) => item.inviteTokenHash === record.inviteTokenHash)) {
        throw new MissionValidationError("INVITE_TOKEN_COLLISION", "Invite token hash already exists");
      }
      if (record.candidateWalletNormalized === record.inviterWalletNormalized) {
        throw new MissionValidationError("SELF_PASS", "The current holder cannot invite themselves as the next bridge");
      }
      this.state.invitations.push(clone(record));
      mission.updatedAt = record.createdAt;
      this.persist();
      return clone(record);
    });
  }

  async getInvitation(id: string): Promise<InvitationRecord | undefined> {
    await this.queue;
    const record = this.state.invitations.find((item) => item.id === id);
    return record ? clone(record) : undefined;
  }

  async reissueInvitation(input: {
    invitationId: string;
    inviteTokenHash: string;
    candidateLabel: string | null;
    candidateWalletNormalized: string | null;
    whyYou: string | null;
    createdAt: number;
    expiresAt: number;
  }): Promise<InvitationRecord> {
    return this.exclusive(() => {
      const invitation = this.invitation(input.invitationId);
      if (invitation.status !== "EXPIRED") throw new MissionValidationError("INVITATION_NOT_REISSUABLE", `Invitation is ${invitation.status}`);
      if (this.state.invitations.some((item) => item.id !== invitation.id && item.inviteTokenHash === input.inviteTokenHash)) {
        throw new MissionValidationError("INVITE_TOKEN_COLLISION", "Invite token hash already exists");
      }
      Object.assign(invitation, {
        candidateLabel: input.candidateLabel,
        candidateWalletNormalized: input.candidateWalletNormalized,
        candidateDisplayLabel: null,
        whyYou: input.whyYou,
        inviteTokenHash: input.inviteTokenHash,
        status: "INVITED" as const,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        acceptedAt: null,
        passDeadlineAt: null,
        declinedAt: null,
        withdrawnAt: null,
        completedAt: null,
        closedAt: null,
      });
      this.mission(invitation.missionId).updatedAt = input.createdAt;
      this.persist();
      return clone(invitation);
    });
  }

  async getInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | undefined> {
    await this.queue;
    const record = this.state.invitations.find((item) => item.inviteTokenHash === tokenHash);
    return record ? clone(record) : undefined;
  }

  async getOpenInvitation(missionId: string): Promise<InvitationRecord | undefined> {
    await this.queue;
    const record = this.state.invitations.find((item) => item.missionId === missionId && OPEN_INVITATION_STATES.has(item.status));
    return record ? clone(record) : undefined;
  }

  async getInvitationForSequence(missionId: string, sequence: number): Promise<InvitationRecord | undefined> {
    await this.queue;
    const record = this.state.invitations.find((item) => item.missionId === missionId && item.sequence === sequence);
    return record ? clone(record) : undefined;
  }

  async acceptInvitation(id: string, wallet: string, now: number, passDeadlineAt: number, candidateDisplayLabel: string | null = null): Promise<InvitationRecord> {
    return this.exclusive(() => {
      const invitation = this.invitation(id);
      const mission = this.mission(invitation.missionId);
      if (mission.status !== "ACTIVE") throw new MissionValidationError("MISSION_NOT_ACTIVE", `Mission ${mission.id} is ${mission.status}`);
      if (invitation.status !== "INVITED") throw new MissionValidationError("INVITATION_NOT_INVITED", `Invitation is ${invitation.status}`);
      if (now >= invitation.expiresAt) {
        invitation.status = "EXPIRED";
        invitation.closedAt = now;
        mission.updatedAt = now;
        this.persist();
        throw new MissionValidationError("INVITATION_EXPIRED", "Invitation has expired");
      }
      if (wallet === invitation.inviterWalletNormalized) throw new MissionValidationError("SELF_PASS", "The current holder cannot accept their own invitation");
      if (invitation.candidateWalletNormalized && invitation.candidateWalletNormalized !== wallet) {
        throw new MissionValidationError("WRONG_INVITEE_WALLET", "This invitation is pre-bound to a different wallet");
      }
      invitation.candidateWalletNormalized = wallet;
      invitation.candidateDisplayLabel = candidateDisplayLabel;
      invitation.status = "ACCEPTED";
      invitation.acceptedAt = now;
      invitation.passDeadlineAt = passDeadlineAt;
      mission.updatedAt = now;
      this.persist();
      return clone(invitation);
    });
  }

  async closeInvitation(
    id: string,
    status: Extract<InvitationStatus, "DECLINED" | "EXPIRED" | "WITHDRAWN">,
    now: number
  ): Promise<InvitationRecord> {
    return this.exclusive(() => {
      const invitation = this.invitation(id);
      const mission = this.mission(invitation.missionId);
      if (!OPEN_INVITATION_STATES.has(invitation.status)) {
        throw new MissionValidationError("INVITATION_ALREADY_CLOSED", `Invitation is already ${invitation.status}`);
      }
      if (status === "DECLINED" && invitation.status !== "INVITED") {
        throw new MissionValidationError("CANNOT_DECLINE_ACCEPTED", "An accepted invitation cannot be declined anonymously");
      }
      if (status === "EXPIRED") {
        const due = invitation.status === "INVITED"
          ? now >= invitation.expiresAt
          : invitation.passDeadlineAt !== null && now >= invitation.passDeadlineAt;
        if (!due) throw new MissionValidationError("INVITATION_NOT_DUE", "Invitation has not reached its expiry deadline");
      }
      invitation.status = status;
      invitation.closedAt = now;
      if (status === "DECLINED") invitation.declinedAt = now;
      if (status === "WITHDRAWN") invitation.withdrawnAt = now;
      mission.updatedAt = now;
      this.persist();
      return clone(invitation);
    });
  }

  async expireDueInvitations(now: number): Promise<number> {
    return this.exclusive(() => {
      let count = 0;
      const touched = new Set<string>();
      for (const invitation of this.state.invitations) {
        const due = invitation.status === "INVITED"
          ? now >= invitation.expiresAt
          : invitation.status === "ACCEPTED" && invitation.passDeadlineAt !== null && now >= invitation.passDeadlineAt;
        if (!due) continue;
        invitation.status = "EXPIRED";
        invitation.closedAt = now;
        touched.add(invitation.missionId);
        count += 1;
      }
      for (const missionId of touched) this.mission(missionId).updatedAt = now;
      if (count > 0) this.persist();
      return count;
    });
  }

  async completeFinalHop(input: {
    missionId: string;
    invitationId: string;
    sequence: number;
    recipientWallet: string;
    recipientHmac: string;
    now: number;
  }): Promise<{ mission: MissionRecord; invitation: InvitationRecord }> {
    return this.exclusive(() => {
      const mission = this.mission(input.missionId);
      const invitation = this.invitation(input.invitationId);

      if (invitation.missionId !== mission.id || invitation.sequence !== input.sequence) {
        throw new MissionValidationError("INVITATION_HOP_MISMATCH", "Invitation does not belong to this mission/sequence");
      }
      if (invitation.status === "COMPLETED" && mission.currentSequence >= input.sequence) {
        return { mission: clone(mission), invitation: clone(invitation) };
      }
      if (mission.status !== "ACTIVE") throw new MissionValidationError("MISSION_NOT_ACTIVE", `Mission ${mission.id} is ${mission.status}`);
      if (invitation.status !== "ACCEPTED") throw new MissionValidationError("INVITATION_NOT_ACCEPTED", "Only an accepted bridge can authorize final delivery");
      if (input.recipientHmac !== mission.targetWalletHmac) {
        throw new MissionValidationError("WRONG_FINAL_RECIPIENT", "Final recipient must be the mission destination");
      }
      if (mission.currentSequence + 1 !== input.sequence) {
        throw new MissionValidationError("FINALIZATION_SEQUENCE_RACE", "Mission sequence changed before finalization");
      }

      invitation.status = "COMPLETED";
      invitation.completedAt = input.now;
      invitation.closedAt = input.now;
      mission.currentSequence = input.sequence;
      mission.finalizedHopCount += 1;
      mission.currentHolderWalletNormalized = input.recipientWallet;
      mission.updatedAt = input.now;
      if (input.recipientHmac === mission.targetWalletHmac) {
        mission.status = "ARRIVED";
        mission.arrivedAt = input.now;
      }

      this.persist();
      return { mission: clone(mission), invitation: clone(invitation) };
    });
  }

  async createChallenge(record: AuthChallengeRecord): Promise<AuthChallengeRecord> {
    return this.exclusive(() => {
      if (this.state.challenges.some((item) => item.id === record.id || item.nonceHash === record.nonceHash)) {
        throw new MissionValidationError("CHALLENGE_COLLISION", "Challenge id/nonce already exists");
      }
      this.state.challenges.push(clone(record));
      this.persist();
      return clone(record);
    });
  }

  async getChallenge(id: string): Promise<AuthChallengeRecord | undefined> {
    await this.queue;
    const record = this.state.challenges.find((item) => item.id === id);
    return record ? clone(record) : undefined;
  }

  async consumeChallenge(id: string, now: number): Promise<AuthChallengeRecord> {
    return this.exclusive(() => {
      const record = this.state.challenges.find((item) => item.id === id);
      if (!record) throw new MissionValidationError("CHALLENGE_NOT_FOUND", `Challenge ${id} does not exist`);
      if (record.status === "USED") throw new MissionValidationError("CHALLENGE_REPLAY", "Challenge has already been used");
      if (record.status === "EXPIRED" || now >= record.expiresAt) {
        record.status = "EXPIRED";
        this.persist();
        throw new MissionValidationError("CHALLENGE_EXPIRED", "Challenge has expired");
      }
      record.status = "USED";
      record.usedAt = now;
      this.persist();
      return clone(record);
    });
  }

  async snapshot(): Promise<MissionStoreSnapshot> {
    await this.queue;
    return clone(this.state);
  }

  async recordAuditEvent(event: import("./types.js").AuditEventRecord): Promise<void> {
    return this.exclusive(() => {
      this.state.auditEvents ??= [];
      this.state.auditEvents.push(clone(event));
      this.persist();
    });
  }
}
