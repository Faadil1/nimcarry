import type { PgClientLike, PgPoolLike } from "./pg-pool.js";
import type { MissionRepository } from "../mission/repository.js";
import {
  MissionValidationError,
  type AuthChallengeRecord,
  type AuditEventRecord,
  type InvitationRecord,
  type InvitationStatus,
  type MissionRecord,
  type MissionStoreSnapshot,
} from "../mission/types.js";

const OPEN_INVITATION_STATES = new Set<InvitationStatus>(["INVITED", "ACCEPTED"]);

interface MissionRow {
  id: string;
  creator_wallet_normalized: string;
  creator_display_label: string | null;
  current_holder_wallet_normalized: string;
  target_label: string;
  target_wallet_ciphertext: Buffer;
  target_wallet_hmac: string;
  target_consent_confirmed: boolean;
  mission_note: string;
  status: MissionRecord["status"];
  visibility: MissionRecord["visibility"];
  finalized_hop_count: number;
  current_sequence: number;
  created_at: Date;
  arrived_at: Date | null;
  cancelled_at: Date | null;
  updated_at: Date;
}

interface InvitationRow {
  id: string;
  mission_id: string;
  sequence: number;
  inviter_wallet_normalized: string;
  candidate_label: string | null;
  candidate_wallet_normalized: string | null;
  candidate_display_label: string | null;
  why_you: string | null;
  invite_token_hash: string;
  status: InvitationStatus;
  created_at: Date;
  expires_at: Date;
  accepted_at: Date | null;
  pass_deadline_at: Date | null;
  declined_at: Date | null;
  withdrawn_at: Date | null;
  completed_at: Date | null;
  closed_at: Date | null;
}

interface ChallengeRow {
  id: string;
  wallet_normalized: string;
  action: AuthChallengeRecord["action"];
  mission_id: string | null;
  invitation_id: string | null;
  sequence: number;
  nonce_hash: string;
  canonical_message: string;
  status: AuthChallengeRecord["status"];
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

function epoch(ms: number): Date {
  return new Date(ms);
}

function toMs(date: Date | null): number | null {
  return date === null ? null : date.getTime();
}

function missionFromRow(row: MissionRow): MissionRecord {
  return {
    id: row.id,
    creatorWalletNormalized: row.creator_wallet_normalized,
    creatorDisplayLabel: row.creator_display_label,
    currentHolderWalletNormalized: row.current_holder_wallet_normalized,
    targetLabel: row.target_label,
    targetWalletCiphertext: row.target_wallet_ciphertext.toString("utf8"),
    targetWalletHmac: row.target_wallet_hmac,
    targetConsentConfirmed: row.target_consent_confirmed,
    missionNote: row.mission_note,
    status: row.status,
    visibility: row.visibility,
    finalizedHopCount: row.finalized_hop_count,
    currentSequence: row.current_sequence,
    createdAt: row.created_at.getTime(),
    arrivedAt: toMs(row.arrived_at),
    cancelledAt: toMs(row.cancelled_at),
    updatedAt: row.updated_at.getTime(),
  };
}

function invitationFromRow(row: InvitationRow): InvitationRecord {
  return {
    id: row.id,
    missionId: row.mission_id,
    sequence: row.sequence,
    inviterWalletNormalized: row.inviter_wallet_normalized,
    candidateLabel: row.candidate_label,
    candidateWalletNormalized: row.candidate_wallet_normalized,
    candidateDisplayLabel: row.candidate_display_label,
    whyYou: row.why_you,
    inviteTokenHash: row.invite_token_hash,
    status: row.status,
    createdAt: row.created_at.getTime(),
    expiresAt: row.expires_at.getTime(),
    acceptedAt: toMs(row.accepted_at),
    passDeadlineAt: toMs(row.pass_deadline_at),
    declinedAt: toMs(row.declined_at),
    withdrawnAt: toMs(row.withdrawn_at),
    completedAt: toMs(row.completed_at),
    closedAt: toMs(row.closed_at),
  };
}

function challengeFromRow(row: ChallengeRow): AuthChallengeRecord {
  return {
    id: row.id,
    walletNormalized: row.wallet_normalized,
    action: row.action,
    missionId: row.mission_id,
    invitationId: row.invitation_id,
    sequence: row.sequence,
    nonceHash: row.nonce_hash,
    canonicalMessage: row.canonical_message,
    status: row.status,
    expiresAt: row.expires_at.getTime(),
    usedAt: toMs(row.used_at),
    createdAt: row.created_at.getTime(),
  };
}

function mapPgErrorToMission(error: unknown, fallback: string): MissionValidationError {
  const code = (error as { code?: string })?.code;
  const detail = (error as { detail?: string })?.detail ?? (error as Error).message;
  switch (code) {
    case "23505": // unique_violation
      if (detail.includes("invitations_invite_token_hash_key")) {
        return new MissionValidationError("INVITE_TOKEN_COLLISION", detail);
      }
      if (detail.includes("one_open_invitation_per_mission")) {
        return new MissionValidationError("OPEN_INVITATION_EXISTS", detail);
      }
      if (detail.includes("one_invitation_sequence_per_mission")) {
        return new MissionValidationError("WRONG_SEQUENCE", detail);
      }
      if (detail.includes("pass_intents_pkey")) {
        return new MissionValidationError("RELAY_INTENT_CONFLICT", detail);
      }
      if (detail.includes("challenges_nonce_hash_key")) {
        return new MissionValidationError("CHALLENGE_COLLISION", detail);
      }
      if (detail.includes("participants_pkey")) {
        return new MissionValidationError("ROUTE_WALLET_REUSE", detail);
      }
      return new MissionValidationError("DUPLICATE_KEY", detail);
    case "23503": // foreign_key_violation
      return new MissionValidationError("MISSION_NOT_FOUND", detail);
    case "23514": // check_violation
      return new MissionValidationError("CHECK_VIOLATION", detail);
    default:
      return new MissionValidationError("DB_ERROR", fallback);
  }
}

/**
 * Postgres-backed implementation of the mission repository. Every method runs
 * its multi-row mutation inside a single transaction, so the file-store's
 * per-method exclusivity is preserved by the DB's own row-lock + transaction
 * semantics across multiple instances. DB-level constraints (global tx-hash
 * replay guard, one-open-invitation, route-loop guard, opaque commitment,
 * challenge replay) are inherited from the schema and surfaced as
 * MissionValidationError with the same reasons the in-memory adapter uses.
 */
export class PgMissionRepository implements MissionRepository {
  constructor(private readonly pool: PgPoolLike) {}

  private async withTransaction<T>(fn: (client: PgClientLike) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      try {
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } finally {
      client.release();
    }
  }

  async createMission(record: MissionRecord): Promise<MissionRecord> {
    return this.withTransaction(async (client) => {
      try {
        await client.query(
          `INSERT INTO missions
            (id, creator_wallet_normalized, creator_display_label,
             current_holder_wallet_normalized, target_label, target_wallet_ciphertext,
             target_wallet_hmac, target_consent_confirmed, mission_note, status,
             visibility, finalized_hop_count, current_sequence, created_at, arrived_at,
             cancelled_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            record.id,
            record.creatorWalletNormalized,
            record.creatorDisplayLabel,
            record.currentHolderWalletNormalized,
            record.targetLabel,
            Buffer.from(record.targetWalletCiphertext, "utf8"),
            record.targetWalletHmac,
            record.targetConsentConfirmed,
            record.missionNote,
            record.status,
            record.visibility,
            record.finalizedHopCount,
            record.currentSequence,
            epoch(record.createdAt),
            record.arrivedAt === null ? null : epoch(record.arrivedAt),
            record.cancelledAt === null ? null : epoch(record.cancelledAt),
            epoch(record.updatedAt),
          ]
        );
        await client.query(
          `INSERT INTO participants (mission_id, wallet_normalized, display_label, first_final_sequence)
           VALUES ($1, $2, $3, NULL)`,
          [record.id, record.creatorWalletNormalized, record.creatorDisplayLabel]
        );
      } catch (error) {
        throw mapPgErrorToMission(error, `createMission failed for ${record.id}`);
      }
      return record;
    });
  }

  async getMission(id: string): Promise<MissionRecord | undefined> {
    const result = await this.pool.query<MissionRow>(
      "SELECT * FROM missions WHERE id = $1",
      [id]
    );
    return result.rows.length === 0 ? undefined : missionFromRow(result.rows[0]);
  }

  async cancelMissionPristine(id: string, signerWallet: string, now: number): Promise<MissionRecord> {
    return this.withTransaction(async (client) => {
      // Load the mission row-locked, then validate and update in the same
      // transaction so the open-invitation + authority checks are atomic.
      const mission = await client.query<MissionRow>(
        "SELECT * FROM missions WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (mission.rows.length === 0) {
        throw new MissionValidationError("MISSION_NOT_FOUND", `Mission ${id} does not exist`);
      }
      const row = mission.rows[0];
      if (row.status !== "ACTIVE") {
        throw new MissionValidationError("MISSION_NOT_ACTIVE", `Mission ${id} is ${row.status}`);
      }
      if (
        row.creator_wallet_normalized !== signerWallet &&
        row.current_holder_wallet_normalized !== signerWallet
      ) {
        throw new MissionValidationError(
          "NOT_MISSION_AUTHORITY",
          "Only the creator/current holder can cancel this mission"
        );
      }
      if (row.finalized_hop_count !== 0) {
        throw new MissionValidationError(
          "MISSION_ALREADY_MOVED",
          "A mission cannot be cancelled after its first finalized hop"
        );
      }
      const openInvitation = await client.query<{ id: string }>(
        "SELECT id FROM invitations WHERE mission_id = $1 AND status IN ('INVITED','ACCEPTED')",
        [id]
      );
      if (openInvitation.rows.length > 0) {
        throw new MissionValidationError(
          "OPEN_INVITATION",
          "Withdraw or close the active invitation before cancelling the mission"
        );
      }
      const updated = await client.query<MissionRow>(
        `UPDATE missions SET status='CANCELLED', cancelled_at=$2, updated_at=$2 WHERE id=$1 RETURNING *`,
        [id, epoch(now)]
      );
      return missionFromRow(updated.rows[0]);
    });
  }

  async createInvitation(record: InvitationRecord): Promise<InvitationRecord> {
    return this.withTransaction(async (client) => {
      try {
        const missionCheck = await client.query<{ status: string; current_holder: string; current_sequence: number }>(
          `SELECT status, current_holder_wallet_normalized AS current_holder, current_sequence
           FROM missions WHERE id = $1`,
          [record.missionId]
        );
        if (missionCheck.rows.length === 0) {
          throw new MissionValidationError("MISSION_NOT_FOUND", `Mission ${record.missionId} does not exist`);
        }
        const mission = missionCheck.rows[0];
        if (mission.status !== "ACTIVE") {
          throw new MissionValidationError("MISSION_NOT_ACTIVE", `Mission ${record.missionId} is ${mission.status}`);
        }
        if (record.inviterWalletNormalized !== mission.current_holder) {
          throw new MissionValidationError(
            "WRONG_CURRENT_HOLDER",
            "Invitation signer is not the canonical current holder"
          );
        }
        if (record.sequence !== mission.current_sequence + 1) {
          throw new MissionValidationError(
            "WRONG_SEQUENCE",
            "Invitation sequence does not match the mission's next hop"
          );
        }

        await client.query(
          `INSERT INTO invitations
            (id, mission_id, sequence, inviter_wallet_normalized, candidate_label,
             candidate_wallet_normalized, candidate_display_label, why_you,
             invite_token_hash, status, created_at, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            record.id,
            record.missionId,
            record.sequence,
            record.inviterWalletNormalized,
            record.candidateLabel,
            record.candidateWalletNormalized,
            record.candidateDisplayLabel,
            record.whyYou,
            record.inviteTokenHash,
            record.status,
            epoch(record.createdAt),
            epoch(record.expiresAt),
          ]
        );
        await client.query("UPDATE missions SET updated_at = $2 WHERE id = $1", [
          record.missionId,
          epoch(record.createdAt),
        ]);
      } catch (error) {
        // Surface the most precise reason the file store would have used.
        throw mapPgErrorToMission(error, `createInvitation failed for ${record.id}`);
      }
      return record;
    });
  }

  async getInvitation(id: string): Promise<InvitationRecord | undefined> {
    const result = await this.pool.query<InvitationRow>("SELECT * FROM invitations WHERE id = $1", [id]);
    return result.rows.length === 0 ? undefined : invitationFromRow(result.rows[0]);
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
    return this.withTransaction(async (client) => {
      const current = await client.query<InvitationRow>("SELECT * FROM invitations WHERE id = $1 FOR UPDATE", [input.invitationId]);
      if (current.rows.length === 0) throw new MissionValidationError("INVITATION_NOT_FOUND", `Invitation ${input.invitationId} does not exist`);
      if (current.rows[0].status !== "EXPIRED") throw new MissionValidationError("INVITATION_NOT_REISSUABLE", `Invitation is ${current.rows[0].status}`);
      try {
        const updated = await client.query<InvitationRow>(
          `UPDATE invitations SET invite_token_hash=$2, candidate_label=$3, candidate_wallet_normalized=$4,
             candidate_display_label=NULL, why_you=$5, status='INVITED', created_at=$6, expires_at=$7,
             accepted_at=NULL, pass_deadline_at=NULL, declined_at=NULL, withdrawn_at=NULL,
             completed_at=NULL, closed_at=NULL
           WHERE id=$1 RETURNING *`,
          [input.invitationId, input.inviteTokenHash, input.candidateLabel, input.candidateWalletNormalized, input.whyYou, epoch(input.createdAt), epoch(input.expiresAt)]
        );
        await client.query("UPDATE missions SET updated_at=$2 WHERE id=$1", [current.rows[0].mission_id, epoch(input.createdAt)]);
        return invitationFromRow(updated.rows[0]);
      } catch (error) {
        throw mapPgErrorToMission(error, `reissueInvitation failed for ${input.invitationId}`);
      }
    });
  }

  async getInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | undefined> {
    const result = await this.pool.query<InvitationRow>(
      "SELECT * FROM invitations WHERE invite_token_hash = $1",
      [tokenHash]
    );
    return result.rows.length === 0 ? undefined : invitationFromRow(result.rows[0]);
  }

  async getOpenInvitation(missionId: string): Promise<InvitationRecord | undefined> {
    const result = await this.pool.query<InvitationRow>(
      `SELECT * FROM invitations WHERE mission_id = $1 AND status IN ('INVITED','ACCEPTED')`,
      [missionId]
    );
    return result.rows.length === 0 ? undefined : invitationFromRow(result.rows[0]);
  }

  async getInvitationForSequence(missionId: string, sequence: number): Promise<InvitationRecord | undefined> {
    const result = await this.pool.query<InvitationRow>(
      "SELECT * FROM invitations WHERE mission_id = $1 AND sequence = $2",
      [missionId, sequence]
    );
    return result.rows.length === 0 ? undefined : invitationFromRow(result.rows[0]);
  }

  async acceptInvitation(id: string, wallet: string, now: number, passDeadlineAt: number, candidateDisplayLabel: string | null = null): Promise<InvitationRecord> {
    return this.withTransaction(async (client) => {
      const invitation = await client.query<InvitationRow>(
        "SELECT * FROM invitations WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (invitation.rows.length === 0) {
        throw new MissionValidationError("INVITATION_NOT_FOUND", `Invitation ${id} does not exist`);
      }
      const row = invitation.rows[0];
      const mission = await client.query<MissionRow>(
        "SELECT * FROM missions WHERE id = $1 FOR UPDATE",
        [row.mission_id]
      );
      if (mission.rows.length === 0) {
        throw new MissionValidationError("MISSION_NOT_FOUND", `Mission ${row.mission_id} does not exist`);
      }
      const missionRow = mission.rows[0];
      if (missionRow.status !== "ACTIVE") {
        throw new MissionValidationError("MISSION_NOT_ACTIVE", `Mission ${row.mission_id} is ${missionRow.status}`);
      }
      if (row.status !== "INVITED") {
        throw new MissionValidationError("INVITATION_NOT_INVITED", `Invitation is ${row.status}`);
      }
      if (now >= row.expires_at.getTime()) {
        await client.query(
          `UPDATE invitations SET status='EXPIRED', closed_at=$2 WHERE id=$1`,
          [id, epoch(now)]
        );
        await client.query("UPDATE missions SET updated_at=$2 WHERE id=$1", [
          row.mission_id,
          epoch(now),
        ]);
        throw new MissionValidationError("INVITATION_EXPIRED", "Invitation has expired");
      }
      if (wallet === row.inviter_wallet_normalized) {
        throw new MissionValidationError("SELF_PASS", "The current holder cannot accept their own invitation");
      }
      if (row.candidate_wallet_normalized !== null && row.candidate_wallet_normalized !== wallet) {
        throw new MissionValidationError("WRONG_INVITEE_WALLET", "This invitation is pre-bound to a different wallet");
      }
      try {
        const updated = await client.query<InvitationRow>(
          `UPDATE invitations
             SET candidate_wallet_normalized=$2, status='ACCEPTED', accepted_at=$3,
                 pass_deadline_at=$4, candidate_display_label=$5
           WHERE id=$1 RETURNING *`,
          [id, wallet, epoch(now), epoch(passDeadlineAt), candidateDisplayLabel]
        );
        await client.query("UPDATE missions SET updated_at=$2 WHERE id=$1", [
          row.mission_id,
          epoch(now),
        ]);
        return invitationFromRow(updated.rows[0]);
      } catch (error) {
        throw mapPgErrorToMission(error, `acceptInvitation failed for ${id}`);
      }
    });
  }

  async closeInvitation(
    id: string,
    status: Extract<InvitationStatus, "DECLINED" | "EXPIRED" | "WITHDRAWN">,
    now: number
  ): Promise<InvitationRecord> {
    return this.withTransaction(async (client) => {
      const invitation = await client.query<InvitationRow>(
        "SELECT * FROM invitations WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (invitation.rows.length === 0) {
        throw new MissionValidationError("INVITATION_NOT_FOUND", `Invitation ${id} does not exist`);
      }
      const row = invitation.rows[0];
      if (!OPEN_INVITATION_STATES.has(row.status)) {
        throw new MissionValidationError("INVITATION_ALREADY_CLOSED", `Invitation is already ${row.status}`);
      }
      if (status === "DECLINED" && row.status !== "INVITED") {
        throw new MissionValidationError("CANNOT_DECLINE_ACCEPTED", "An accepted invitation cannot be declined anonymously");
      }
      if (status === "EXPIRED") {
        const due = row.status === "INVITED"
          ? now >= row.expires_at.getTime()
          : row.pass_deadline_at !== null && now >= row.pass_deadline_at.getTime();
        if (!due) throw new MissionValidationError("INVITATION_NOT_DUE", "Invitation has not reached its expiry deadline");
      }
      const sets: string[] = ["status=$2", "closed_at=$3"];
      const values: unknown[] = [id, status, epoch(now)];
      if (status === "DECLINED") {
        sets.push("declined_at=$3");
      }
      if (status === "WITHDRAWN") {
        sets.push("withdrawn_at=$3");
      }
      const updated = await client.query<InvitationRow>(
        `UPDATE invitations SET ${sets.join(", ")} WHERE id=$1 RETURNING *`,
        values
      );
      await client.query("UPDATE missions SET updated_at=$2 WHERE id=$1", [row.mission_id, epoch(now)]);
      return invitationFromRow(updated.rows[0]);
    });
  }

  async expireDueInvitations(now: number): Promise<number> {
    return this.withTransaction(async (client) => {
      const result = await client.query<{ id: string; mission_id: string }>(
        `SELECT id, mission_id FROM invitations
         WHERE (status='INVITED' AND expires_at <= $1)
            OR (status='ACCEPTED' AND pass_deadline_at IS NOT NULL AND pass_deadline_at <= $1)
         FOR UPDATE`,
        [epoch(now)]
      );
      if (result.rows.length === 0) return 0;
      for (const row of result.rows) {
        await client.query(
          `UPDATE invitations SET status='EXPIRED', closed_at=$2 WHERE id=$1`,
          [row.id, epoch(now)]
        );
      }
      const missionIds = [...new Set(result.rows.map((row) => row.mission_id))];
      for (const missionId of missionIds) {
        await client.query(`UPDATE missions SET updated_at=$2 WHERE id=$1`, [
          missionId,
          epoch(now),
        ]);
      }
      return result.rows.length;
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
    return this.withTransaction(async (client) => {
      const mission = await client.query<MissionRow>(
        "SELECT * FROM missions WHERE id = $1 FOR UPDATE",
        [input.missionId]
      );
      if (mission.rows.length === 0) {
        throw new MissionValidationError("MISSION_NOT_FOUND", `Mission ${input.missionId} does not exist`);
      }
      const missionRow = mission.rows[0];
      if (missionRow.status !== "ACTIVE") {
        // A finished mission can only be revisited for the idempotent re-read of
        // an already-completed hop; anything else is rejected up front.
        const revisit = await client.query<InvitationRow>(
          "SELECT * FROM invitations WHERE id = $1",
          [input.invitationId]
        );
        if (
          revisit.rows.length > 0 &&
          revisit.rows[0].mission_id === missionRow.id &&
          revisit.rows[0].sequence === input.sequence &&
          revisit.rows[0].status === "COMPLETED" &&
          missionRow.current_sequence >= input.sequence
        ) {
          return { mission: missionFromRow(missionRow), invitation: invitationFromRow(revisit.rows[0]) };
        }
        throw new MissionValidationError("MISSION_NOT_ACTIVE", `Mission ${missionRow.id} is ${missionRow.status}`);
      }

      const invitation = await client.query<InvitationRow>(
        "SELECT * FROM invitations WHERE id = $1 FOR UPDATE",
        [input.invitationId]
      );
      if (invitation.rows.length === 0) {
        throw new MissionValidationError("INVITATION_NOT_FOUND", `Invitation ${input.invitationId} does not exist`);
      }
      const invitationRow = invitation.rows[0];

      if (invitationRow.mission_id !== missionRow.id || invitationRow.sequence !== input.sequence) {
        throw new MissionValidationError("INVITATION_HOP_MISMATCH", "Invitation does not belong to this mission/sequence");
      }
      if (invitationRow.status === "COMPLETED" && missionRow.current_sequence >= input.sequence) {
        return { mission: missionFromRow(missionRow), invitation: invitationFromRow(invitationRow) };
      }
      if (invitationRow.status !== "ACCEPTED") {
        throw new MissionValidationError("INVITATION_NOT_ACCEPTED", "Only an accepted bridge can authorize final delivery");
      }
      if (input.recipientHmac !== missionRow.target_wallet_hmac) {
        throw new MissionValidationError("WRONG_FINAL_RECIPIENT", "Final recipient must be the mission destination");
      }
      if (missionRow.current_sequence + 1 !== input.sequence) {
        throw new MissionValidationError("FINALIZATION_SEQUENCE_RACE", "Mission sequence changed before finalization");
      }

      const arrived = input.recipientHmac === missionRow.target_wallet_hmac;
      let nextStatus: MissionRecord["status"] = "ACTIVE";
      if (arrived) nextStatus = "ARRIVED";

      const updatedInvitation = await client.query<InvitationRow>(
        `UPDATE invitations
           SET status='COMPLETED', completed_at=$2, closed_at=$2
         WHERE id=$1 RETURNING *`,
        [input.invitationId, epoch(input.now)]
      );
      const updatedMission = await client.query<MissionRow>(
        `UPDATE missions
           SET current_sequence=$2, finalized_hop_count=finalized_hop_count+1,
               current_holder_wallet_normalized=$3, status=$4::mission_status,
               arrived_at=CASE
                 WHEN $4::mission_status = 'ARRIVED'::mission_status THEN $5
                 ELSE arrived_at
               END,
               updated_at=$5
         WHERE id=$1 RETURNING *`,
        [
          input.missionId,
          input.sequence,
          input.recipientWallet,
          nextStatus,
          epoch(input.now),
        ]
      );

      // Record both human roles without pretending the bridge received the
      // payment. The bridge participated in the verified introduction; the
      // target is the finalized transaction recipient.
      try {
        if (invitationRow.candidate_wallet_normalized) {
          await client.query(
            `INSERT INTO participants (mission_id, wallet_normalized, display_label, display_name_opt_in, first_final_sequence)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (mission_id, wallet_normalized) DO UPDATE
               SET first_final_sequence = COALESCE(participants.first_final_sequence, EXCLUDED.first_final_sequence)`,
            [
              input.missionId,
              invitationRow.candidate_wallet_normalized,
              invitationRow.candidate_display_label,
              invitationRow.candidate_display_label !== null,
              input.sequence,
            ]
          );
        }
        await client.query(
          `INSERT INTO participants (mission_id, wallet_normalized, display_label, display_name_opt_in, first_final_sequence)
           VALUES ($1, $2, $3, FALSE, $4)
           ON CONFLICT (mission_id, wallet_normalized) DO UPDATE
             SET first_final_sequence = COALESCE(participants.first_final_sequence, EXCLUDED.first_final_sequence)`,
          [
            input.missionId,
            input.recipientWallet,
            missionRow.target_label,
            input.sequence,
          ]
        );
      } catch (error) {
        throw mapPgErrorToMission(error, `completeFinalHop participant guard failed for ${input.missionId}`);
      }

      return {
        mission: missionFromRow(updatedMission.rows[0]),
        invitation: invitationFromRow(updatedInvitation.rows[0]),
      };
    });
  }

  async createChallenge(record: AuthChallengeRecord): Promise<AuthChallengeRecord> {
    return this.withTransaction(async (client) => {
      try {
        await client.query(
          `INSERT INTO auth_challenges
            (id, wallet_normalized, action, mission_id, invitation_id, sequence,
             nonce_hash, canonical_message, status, expires_at, used_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            record.id,
            record.walletNormalized,
            record.action,
            record.missionId,
            record.invitationId,
            record.sequence,
            record.nonceHash,
            record.canonicalMessage,
            record.status,
            epoch(record.expiresAt),
            record.usedAt === null ? null : epoch(record.usedAt),
            epoch(record.createdAt),
          ]
        );
      } catch (error) {
        throw mapPgErrorToMission(error, `createChallenge failed for ${record.id}`);
      }
      return record;
    });
  }

  async getChallenge(id: string): Promise<AuthChallengeRecord | undefined> {
    const result = await this.pool.query<ChallengeRow>("SELECT * FROM auth_challenges WHERE id = $1", [id]);
    return result.rows.length === 0 ? undefined : challengeFromRow(result.rows[0]);
  }

  async consumeChallenge(id: string, now: number): Promise<AuthChallengeRecord> {
    return this.withTransaction(async (client) => {
      const challenge = await client.query<ChallengeRow>(
        "SELECT * FROM auth_challenges WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (challenge.rows.length === 0) {
        throw new MissionValidationError("CHALLENGE_NOT_FOUND", `Challenge ${id} does not exist`);
      }
      const row = challenge.rows[0];
      if (row.status === "USED") {
        throw new MissionValidationError("CHALLENGE_REPLAY", "Challenge has already been used");
      }
      if (row.status === "EXPIRED" || now >= row.expires_at.getTime()) {
        await client.query(`UPDATE auth_challenges SET status='EXPIRED' WHERE id=$1`, [id]);
        throw new MissionValidationError("CHALLENGE_EXPIRED", "Challenge has expired");
      }
      const updated = await client.query<ChallengeRow>(
        `UPDATE auth_challenges SET status='USED', used_at=$2 WHERE id=$1 RETURNING *`,
        [id, epoch(now)]
      );
      return challengeFromRow(updated.rows[0]);
    });
  }

  async snapshot(): Promise<MissionStoreSnapshot> {
    const [missions, invitations, challenges, auditEvents] = await Promise.all([
      this.pool.query<MissionRow>("SELECT * FROM missions"),
      this.pool.query<InvitationRow>("SELECT * FROM invitations"),
      this.pool.query<ChallengeRow>("SELECT * FROM auth_challenges"),
      this.pool.query<{
        id: string; mission_id: string | null; invitation_id: string | null; actor_wallet_normalized: string | null;
        event_type: string; metadata: Record<string, unknown>; created_at: Date;
      }>("SELECT * FROM audit_events"),
    ]);
    return {
      missions: missions.rows.map(missionFromRow),
      invitations: invitations.rows.map(invitationFromRow),
      challenges: challenges.rows.map(challengeFromRow),
      auditEvents: auditEvents.rows.map((row): AuditEventRecord => ({ id: row.id, missionId: row.mission_id, invitationId: row.invitation_id, actorWalletNormalized: row.actor_wallet_normalized, eventType: row.event_type, metadata: row.metadata, createdAt: row.created_at.getTime() })),
    };
  }

  async recordAuditEvent(event: AuditEventRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (mission_id, invitation_id, actor_wallet_normalized, event_type, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [event.missionId, event.invitationId, event.actorWalletNormalized, event.eventType, event.metadata, epoch(event.createdAt)]
    );
  }
}
