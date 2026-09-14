import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "../db";
import {
  brandTrainingSessions,
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  type TrainingSession,
} from "../db/schema";
import {
  CALIBRATION_SLOTS_PER_ROUND,
  calibrationFeedbackSchema,
  calibrationRoundSchema,
  candidateSchema,
  nextRoundNumber,
  type CalibrationRound,
  type Candidate,
} from "../brand-training/calibration";

export type { TrainingSession };

export type BrandTrainingSessionErrorCode =
  | "not_found"
  | "stale_session"
  | "round_running"
  | "round_limit"
  | "invalid_feedback"
  | "session_closed";

export class BrandTrainingSessionError extends Error {
  readonly code: BrandTrainingSessionErrorCode;

  constructor(code: BrandTrainingSessionErrorCode, message?: string) {
    super(message ?? code);
    this.name = "BrandTrainingSessionError";
    this.code = code;
  }
}

export type SessionCommand =
  | {
      type: "feedback";
      round: number;
      slot: number;
      rating: "good" | "bad";
      note: string;
      dimensions: string[];
      actorId: string;
    }
  | { type: "replace_candidate"; candidate: Candidate }
  | { type: "extend" }
  | { type: "archive" };

type SessionFields = Pick<
  TrainingSession,
  "candidate" | "rounds" | "extensionCount" | "status"
>;

/**
 * Pure state transition, shared by the transactional writer below. Output
 * quality (status/objective/review flags) is read from persisted outputs by
 * callers, never from the browser payload validated here.
 */
export function applySessionCommand(
  session: TrainingSession,
  command: SessionCommand,
  now: Date,
): SessionFields {
  if (command.type === "archive") {
    if (session.status === "activated" || session.status === "archived") {
      throw new BrandTrainingSessionError("session_closed", "Session is already closed");
    }
    return {
      candidate: session.candidate,
      rounds: session.rounds,
      extensionCount: session.extensionCount,
      status: "archived",
    };
  }
  if (session.status === "activated" || session.status === "archived") {
    throw new BrandTrainingSessionError("session_closed", "Session is closed");
  }
  switch (command.type) {
    case "feedback": {
      const parsed = calibrationFeedbackSchema.safeParse({
        rating: command.rating,
        note: command.note,
        dimensions: command.dimensions,
        actorId: command.actorId,
        at: now.toISOString(),
      });
      if (!parsed.success) {
        throw new BrandTrainingSessionError("invalid_feedback", "Feedback payload is invalid");
      }
      const roundIndex = session.rounds.findIndex((round) => round.number === command.round);
      if (roundIndex === -1) {
        throw new BrandTrainingSessionError("invalid_feedback", "Round does not exist");
      }
      if (!Number.isInteger(command.slot) || command.slot < 0 || command.slot > 3) {
        throw new BrandTrainingSessionError("invalid_feedback", "Slot is out of range");
      }
      const rounds = session.rounds.map((round, index) =>
        index === roundIndex
          ? {
              ...round,
              slots: round.slots.map((slot) =>
                slot.index === command.slot ? { ...slot, feedback: parsed.data } : slot,
              ) as TrainingSession["rounds"][number]["slots"],
            }
          : round,
      );
      return {
        candidate: session.candidate,
        rounds,
        extensionCount: session.extensionCount,
        status: session.status,
      };
    }
    case "replace_candidate": {
      if (session.status === "calibrating") {
        throw new BrandTrainingSessionError(
          "round_running",
          "Cannot replace the candidate while a round is running",
        );
      }
      candidateSchema.parse(command.candidate);
      return {
        candidate: command.candidate,
        rounds: session.rounds,
        extensionCount: session.extensionCount,
        status: session.status,
      };
    }
    case "extend": {
      return {
        candidate: session.candidate,
        rounds: session.rounds,
        extensionCount: session.extensionCount + 1,
        status: session.status === "pending" ? "review" : session.status,
      };
    }
  }
}

/** Guard for round creation: null capacity is an explicit-extension decision, never silent. */
export function requireRoundCapacity(completedRounds: number, extensions: number): number {
  const next = nextRoundNumber(completedRounds, extensions);
  if (next === null) {
    throw new BrandTrainingSessionError(
      "round_limit",
      "Calibration round ceiling reached; open an explicit extension",
    );
  }
  return next;
}

type SelectExecutor = Pick<typeof db, "select">;

async function assertProfileScoped(
  executor: SelectExecutor,
  workspaceId: string,
  profileId: string,
): Promise<void> {
  const [profile] = await executor
    .select()
    .from(clientProfiles)
    .where(and(eq(clientProfiles.workspaceId, workspaceId), eq(clientProfiles.id, profileId)))
    .limit(1);
  if (!profile) {
    throw new BrandTrainingSessionError("not_found", "Client profile not found in this workspace");
  }
}

function lockKey(workspaceId: string, profileId: string): string {
  return `brand-training:${workspaceId}:${profileId}`;
}

export async function getTrainingSession(
  workspaceId: string,
  profileId: string,
): Promise<TrainingSession | null> {
  const [session] = await db
    .select()
    .from(brandTrainingSessions)
    .where(
      and(
        eq(brandTrainingSessions.workspaceId, workspaceId),
        eq(brandTrainingSessions.clientProfileId, profileId),
        notInArray(brandTrainingSessions.status, ["archived", "activated"]),
      ),
    )
    .limit(1);
  return session ?? null;
}

export async function getTrainingSessionById(
  workspaceId: string,
  profileId: string,
  sessionId: string,
): Promise<TrainingSession | null> {
  const [session] = await db
    .select()
    .from(brandTrainingSessions)
    .where(
      and(
        eq(brandTrainingSessions.id, sessionId),
        eq(brandTrainingSessions.workspaceId, workspaceId),
        eq(brandTrainingSessions.clientProfileId, profileId),
      ),
    )
    .limit(1);
  return session ?? null;
}

export async function createTrainingSession(input: {
  workspaceId: string;
  profileId: string;
  userId: string;
  candidate: Candidate;
  baseVersionId: string | null;
}): Promise<TrainingSession> {
  candidateSchema.parse(input.candidate);
  const candidate = input.candidate;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey(input.workspaceId, input.profileId)}))`);
    await assertProfileScoped(tx, input.workspaceId, input.profileId);
    const [existing] = await tx
      .select()
      .from(brandTrainingSessions)
      .where(
        and(
          eq(brandTrainingSessions.workspaceId, input.workspaceId),
          eq(brandTrainingSessions.clientProfileId, input.profileId),
          notInArray(brandTrainingSessions.status, ["archived", "activated"]),
        ),
      )
      .limit(1);
    if (existing) return existing;
    const [created] = await tx
      .insert(brandTrainingSessions)
      .values({
        workspaceId: input.workspaceId,
        clientProfileId: input.profileId,
        createdByUserId: input.userId,
        baseVersionId: input.baseVersionId,
        status: "review",
        candidate,
        rounds: [],
        extensionCount: 0,
      })
      .returning();
    return created!;
  });
}

export async function mutateTrainingSession(input: {
  workspaceId: string;
  profileId: string;
  sessionId: string;
  expectedRevision: number;
  command: SessionCommand;
  now?: () => Date;
}): Promise<TrainingSession> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey(input.workspaceId, input.profileId)}))`);
    const [session] = await tx
      .select()
      .from(brandTrainingSessions)
      .where(
        and(
          eq(brandTrainingSessions.id, input.sessionId),
          eq(brandTrainingSessions.workspaceId, input.workspaceId),
          eq(brandTrainingSessions.clientProfileId, input.profileId),
        ),
      )
      .limit(1);
    if (!session) {
      throw new BrandTrainingSessionError("not_found", "Training session not found");
    }
    if (session.revision !== input.expectedRevision) {
      throw new BrandTrainingSessionError("stale_session", "Session revision changed");
    }
    const next = applySessionCommand(session, input.command, input.now?.() ?? new Date());
    const [updated] = await tx
      .update(brandTrainingSessions)
      .set({ ...next, revision: session.revision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(brandTrainingSessions.id, input.sessionId),
          eq(brandTrainingSessions.revision, input.expectedRevision),
        ),
      )
      .returning();
    if (!updated) {
      throw new BrandTrainingSessionError("stale_session", "Session revision changed");
    }
    return updated;
  });
}

/**
 * Resolves the frozen candidate that backs a calibration work item, following
 * the persisted link — never a client-supplied snapshot. Null for regular
 * works, unknown works, or scope mismatches.
 */
export async function loadCalibrationCandidateForWork(
  workspaceId: string,
  workItemId: string,
): Promise<Candidate | null> {
  const [work] = await db
    .select({
      clientProfileId: creativeWorkItems.clientProfileId,
      trainingSessionId: creativeWorkItems.trainingSessionId,
      trainingRound: creativeWorkItems.trainingRound,
    })
    .from(creativeWorkItems)
    .where(and(eq(creativeWorkItems.id, workItemId), eq(creativeWorkItems.workspaceId, workspaceId)))
    .limit(1);
  if (!work?.trainingSessionId || !work.trainingRound) return null;
  const [session] = await db
    .select()
    .from(brandTrainingSessions)
    .where(
      and(
        eq(brandTrainingSessions.id, work.trainingSessionId),
        eq(brandTrainingSessions.workspaceId, workspaceId),
        eq(brandTrainingSessions.clientProfileId, work.clientProfileId),
      ),
    )
    .limit(1);
  if (!session) return null;
  return session.rounds.find((round) => round.number === work.trainingRound)?.candidate ?? null;
}

export type CalibrationWorkDraft = {
  id: string;
  draftKey: string;
  title: string;
  request: string;
};

/**
 * Appends one calibration round and its four private works atomically
 * (plan 01, T2). The links, the frozen candidate and the round land in the
 * same transaction, so a retry never observes a round without works.
 *
 * Idempotent: repeating the call for an already-appended round number returns
 * the existing round and its work ids without allocating another round.
 * Works resolve by deterministic draft key, so a repeated insert finds the
 * same UUIDs instead of duplicating slots.
 */
export async function appendCalibrationRound(input: {
  workspaceId: string;
  profileId: string;
  sessionId: string;
  expectedRevision: number;
  roundNumber: number;
  candidate: Candidate;
  quoteCredits: number;
  coverage: string[];
  confirmedBy: string;
  works: [CalibrationWorkDraft, CalibrationWorkDraft, CalibrationWorkDraft, CalibrationWorkDraft];
  now?: () => Date;
}): Promise<{ session: TrainingSession; workItemIds: [string, string, string, string]; resumed: boolean }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey(input.workspaceId, input.profileId)}))`);
    const [session] = await tx
      .select()
      .from(brandTrainingSessions)
      .where(
        and(
          eq(brandTrainingSessions.id, input.sessionId),
          eq(brandTrainingSessions.workspaceId, input.workspaceId),
          eq(brandTrainingSessions.clientProfileId, input.profileId),
        ),
      )
      .limit(1);
    if (!session) {
      throw new BrandTrainingSessionError("not_found", "Training session not found");
    }
    if (session.revision !== input.expectedRevision) {
      throw new BrandTrainingSessionError("stale_session", "Session revision changed");
    }
    if (session.status === "activated" || session.status === "archived") {
      throw new BrandTrainingSessionError("session_closed", "Session is closed");
    }
    const resumed = session.rounds.find((round) => round.number === input.roundNumber);
    if (resumed) {
      return {
        session,
        workItemIds: resumed.slots.map((slot) => slot.workItemId) as [string, string, string, string],
        resumed: true,
      };
    }
    const next = requireRoundCapacity(session.rounds.length, session.extensionCount);
    if (next !== input.roundNumber) {
      throw new BrandTrainingSessionError("stale_session", "Round number changed");
    }
    const latest = session.rounds[session.rounds.length - 1];
    if (latest) {
      const running = await tx
        .select({ status: creativeWorkOutputs.status })
        .from(creativeWorkOutputs)
        .where(
          and(
            eq(creativeWorkOutputs.workspaceId, input.workspaceId),
            inArray(
              creativeWorkOutputs.workItemId,
              latest.slots.map((slot) => slot.workItemId),
            ),
          ),
        );
      if (running.some((output) => output.status === "queued" || output.status === "processing")) {
        throw new BrandTrainingSessionError(
          "round_running",
          "Finish the running round before opening the next one",
        );
      }
    }
    await tx
      .insert(creativeWorkItems)
      .values(
        input.works.map((work, index) => ({
          id: work.id,
          workspaceId: input.workspaceId,
          clientProfileId: input.profileId,
          createdByUserId: input.confirmedBy,
          draftKey: work.draftKey,
          toolKind: "single" as const,
          title: work.title,
          request: work.request,
          format: "4:5" as const,
          settings: { targetFormats: [] },
          brief: null,
          status: "draft" as const,
          trainingSessionId: input.sessionId,
          trainingRound: input.roundNumber,
          trainingSlot: index,
        })),
      )
      .onConflictDoNothing();
    const resolved = await tx
      .select({ id: creativeWorkItems.id, draftKey: creativeWorkItems.draftKey })
      .from(creativeWorkItems)
      .where(
        and(
          eq(creativeWorkItems.workspaceId, input.workspaceId),
          inArray(
            creativeWorkItems.draftKey,
            input.works.map((work) => work.draftKey),
          ),
        ),
      );
    const idByDraftKey = new Map(resolved.map((row) => [row.draftKey, row.id]));
    const workItemIds = input.works.map((work) => {
      const id = idByDraftKey.get(work.draftKey);
      if (!id) throw new BrandTrainingSessionError("not_found", "Calibration work lost its draft link");
      return id;
    }) as [string, string, string, string];
    const round = calibrationRoundSchema.parse({
      number: input.roundNumber,
      candidate: input.candidate,
      quoteCredits: input.quoteCredits,
      confirmedBy: input.confirmedBy,
      confirmedAt: (input.now?.() ?? new Date()).toISOString(),
      coverage: input.coverage,
      slots: workItemIds.map((workItemId, index) => ({
        index,
        workItemId,
        outputId: null,
        feedback: null,
      })),
    }) as CalibrationRound;
    if (round.slots.length !== CALIBRATION_SLOTS_PER_ROUND) {
      throw new BrandTrainingSessionError("invalid_feedback", "Calibration round must carry four slots");
    }
    const [updated] = await tx
      .update(brandTrainingSessions)
      .set({ rounds: [...session.rounds, round], status: "calibrating", revision: session.revision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(brandTrainingSessions.id, input.sessionId),
          eq(brandTrainingSessions.revision, input.expectedRevision),
        ),
      )
      .returning();
    if (!updated) {
      throw new BrandTrainingSessionError("stale_session", "Session revision changed");
    }
    return { session: updated, workItemIds, resumed: false };
  });
}

/**
 * Links dispatched output ids to their round slots (plan 01, T2). Called once
 * per dispatch batch by the calibration service with the revision it holds;
 * a concurrent feedback write wins the revision race and the service retries
 * with a fresh read instead of clobbering the feedback.
 */
export async function linkCalibrationRoundOutputs(input: {
  workspaceId: string;
  profileId: string;
  sessionId: string;
  expectedRevision: number;
  round: number;
  outputIds: Partial<Record<0 | 1 | 2 | 3, string>>;
}): Promise<TrainingSession> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey(input.workspaceId, input.profileId)}))`);
    const [session] = await tx
      .select()
      .from(brandTrainingSessions)
      .where(
        and(
          eq(brandTrainingSessions.id, input.sessionId),
          eq(brandTrainingSessions.workspaceId, input.workspaceId),
          eq(brandTrainingSessions.clientProfileId, input.profileId),
        ),
      )
      .limit(1);
    if (!session) {
      throw new BrandTrainingSessionError("not_found", "Training session not found");
    }
    if (session.revision !== input.expectedRevision) {
      throw new BrandTrainingSessionError("stale_session", "Session revision changed");
    }
    const roundIndex = session.rounds.findIndex((round) => round.number === input.round);
    if (roundIndex === -1) {
      throw new BrandTrainingSessionError("not_found", "Calibration round not found");
    }
    const rounds = session.rounds.map((round, index) =>
      index === roundIndex
        ? {
            ...round,
            slots: round.slots.map((slot) => {
              const outputId = input.outputIds[slot.index as 0 | 1 | 2 | 3];
              return outputId && !slot.outputId ? { ...slot, outputId } : slot;
            }) as TrainingSession["rounds"][number]["slots"],
          }
        : round,
    );
    const [updated] = await tx
      .update(brandTrainingSessions)
      .set({ rounds, revision: session.revision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(brandTrainingSessions.id, input.sessionId),
          eq(brandTrainingSessions.revision, input.expectedRevision),
        ),
      )
      .returning();
    if (!updated) {
      throw new BrandTrainingSessionError("stale_session", "Session revision changed");
    }
    return updated;
  });
}
