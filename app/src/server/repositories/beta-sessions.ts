import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  betaSessions,
  workspaces,
  type BetaSession,
  type NewBetaSession,
} from "../db/schema";
import {
  BETA_RUNBOOK_STAGES,
  type BetaAssistanceLevel,
  type BetaOperatorNotes,
  type BetaRunbookStage,
} from "../beta-sessions/types";
import { listBetaAnalyticsEvents } from "./beta-analytics";

export interface BetaSessionListFilters {
  workspaceId?: string;
  activeOnly?: boolean;
}

export interface BetaSessionSummary {
  sessionId: string;
  workspaceId: string;
  cohortLabel: string | null;
  assistanceLevel: string;
  startedAt: string;
  endedAt: string | null;
  stagesCompleted: Array<{ stage: BetaRunbookStage; completedAt: string }>;
  blockers: string[];
  feedbackReportIds: string[];
  eventIds: string[];
  operatorNotes: BetaOperatorNotes;
}

export async function workspaceExists(workspaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return Boolean(row);
}

export async function createBetaSession(input: {
  workspaceId: string;
  cohortLabel?: string | null;
  assistanceLevel?: BetaAssistanceLevel;
}): Promise<BetaSession> {
  const exists = await workspaceExists(input.workspaceId);
  if (!exists) {
    throw new BetaSessionError("workspace_not_found");
  }

  const [session] = await db
    .insert(betaSessions)
    .values({
      workspaceId: input.workspaceId,
      cohortLabel: input.cohortLabel ?? null,
      assistanceLevel: input.assistanceLevel ?? "hands_on",
      operatorNotes: {},
    } satisfies NewBetaSession)
    .returning();

  return session;
}

export async function listBetaSessions(
  filters: BetaSessionListFilters = {}
): Promise<BetaSession[]> {
  const conditions = [];

  if (filters.workspaceId) {
    conditions.push(eq(betaSessions.workspaceId, filters.workspaceId));
  }
  if (filters.activeOnly) {
    conditions.push(isNull(betaSessions.endedAt));
  }

  const query = db.select().from(betaSessions);

  if (conditions.length === 0) {
    return query;
  }

  return query.where(and(...conditions));
}

export async function getBetaSessionByIdOnly(
  sessionId: string
): Promise<BetaSession | null> {
  const [session] = await db
    .select()
    .from(betaSessions)
    .where(eq(betaSessions.id, sessionId))
    .limit(1);

  return session ?? null;
}

export async function endBetaSession(
  sessionId: string,
  endedAt: Date = new Date()
): Promise<BetaSession | null> {
  const [session] = await db
    .update(betaSessions)
    .set({ endedAt, updatedAt: new Date() })
    .where(eq(betaSessions.id, sessionId))
    .returning();

  return session ?? null;
}

export async function mergeBetaSessionNotes(
  sessionId: string,
  stageUpdates: BetaOperatorNotes
): Promise<BetaSession | null> {
  const existing = await getBetaSessionByIdOnly(sessionId);
  if (!existing) return null;

  const currentNotes = (existing.operatorNotes ?? {}) as BetaOperatorNotes;
  const merged: BetaOperatorNotes = { ...currentNotes };

  for (const [stage, note] of Object.entries(stageUpdates)) {
    if (!BETA_RUNBOOK_STAGES.includes(stage as BetaRunbookStage)) continue;
    merged[stage as BetaRunbookStage] = {
      ...currentNotes[stage as BetaRunbookStage],
      ...note,
    };
  }

  const [session] = await db
    .update(betaSessions)
    .set({ operatorNotes: merged, updatedAt: new Date() })
    .where(eq(betaSessions.id, sessionId))
    .returning();

  return session ?? null;
}

export async function buildBetaSessionSummary(
  sessionId: string
): Promise<BetaSessionSummary | null> {
  const session = await getBetaSessionByIdOnly(sessionId);
  if (!session) return null;

  const notes = (session.operatorNotes ?? {}) as BetaOperatorNotes;
  const stagesCompleted: BetaSessionSummary["stagesCompleted"] = [];
  const blockers = new Set<string>();
  const feedbackReportIds = new Set<string>();

  for (const stage of BETA_RUNBOOK_STAGES) {
    const note = notes[stage];
    if (note?.completedAt) {
      stagesCompleted.push({ stage, completedAt: note.completedAt });
    }
    for (const blockerId of note?.blockerIds ?? []) {
      blockers.add(blockerId);
    }
    if (note?.feedbackReportId) {
      feedbackReportIds.add(note.feedbackReportId);
    }
  }

  const events = await listBetaAnalyticsEvents({
    workspaceId: session.workspaceId,
    sessionId: session.id,
    limit: 500,
  });

  return {
    sessionId: session.id,
    workspaceId: session.workspaceId,
    cohortLabel: session.cohortLabel,
    assistanceLevel: session.assistanceLevel,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    stagesCompleted,
    blockers: [...blockers],
    feedbackReportIds: [...feedbackReportIds],
    eventIds: events.map((event) => event.id),
    operatorNotes: notes,
  };
}

export class BetaSessionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "BetaSessionError";
  }
}
