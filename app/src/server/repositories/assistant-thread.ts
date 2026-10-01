import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  assistantActionRecords,
  assistantArtifactAnnotations,
  assistantArtifactApprovalEvents,
  assistantArtifactComparisonAcknowledgements,
  assistantArtifactIterationEvents,
  assistantArtifactLineages,
  assistantArtifactProposals,
  assistantArtifactVersions,
  assistantCreativeFeedbackDrafts,
  assistantGoalRuns,
  assistantGuidedFlowEvents,
  assistantGuidedFlowFeedback,
  assistantGuidedFlowStagingEvidence,
  assistantGuidedFlows,
  assistantMessages,
  assistantPlanFeedbackDrafts,
  assistantThreads,
} from "../db/schema";
import { equipeThreads } from "../db/equipe-schema";
import { getCampaignById } from "./campaign";
import { getClientProfile, resolveCampaignClientProfileId } from "./client-reference";

export interface CreateAssistantThreadInput {
  clientProfileId: string;
  campaignId?: string | null;
  name?: string;
  isDefault?: boolean;
}

export interface ListAssistantThreadsFilter {
  clientProfileId: string;
  campaignId?: string | null;
}

export class AssistantThreadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantThreadValidationError";
  }
}

async function validateCampaignProfileAlignment(
  workspaceId: string,
  clientProfileId: string,
  campaignId: string
) {
  const campaign = await getCampaignById(campaignId, workspaceId);
  if (!campaign) {
    throw new AssistantThreadValidationError("Campaign not found");
  }

  const resolvedProfileId = await resolveCampaignClientProfileId(workspaceId, {
    clientProfileId: campaign.clientProfileId ?? null,
    client: campaign.client ?? null,
  });

  if (resolvedProfileId !== clientProfileId) {
    throw new AssistantThreadValidationError(
      "Campaign client profile does not match supplied clientProfileId"
    );
  }

  return campaign;
}

export async function createAssistantThread(
  workspaceId: string,
  input: CreateAssistantThreadInput
) {
  const profile = await getClientProfile(workspaceId, input.clientProfileId);
  if (!profile) {
    throw new AssistantThreadValidationError("Client profile not found");
  }

  if (input.campaignId) {
    await validateCampaignProfileAlignment(
      workspaceId,
      input.clientProfileId,
      input.campaignId
    );
  }

  const name = input.name?.trim() || (input.campaignId ? "Conversa" : "Cliente");

  if (input.isDefault && input.campaignId) {
    return db.transaction(async (tx) => {
      await tx
        .update(assistantThreads)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(assistantThreads.workspaceId, workspaceId),
            eq(assistantThreads.campaignId, input.campaignId!),
            eq(assistantThreads.isDefault, true)
          )
        );

      const [thread] = await tx
        .insert(assistantThreads)
        .values({
          workspaceId,
          clientProfileId: input.clientProfileId,
          campaignId: input.campaignId,
          name,
          isDefault: true,
        })
        .returning();

      return thread;
    });
  }

  const [thread] = await db
    .insert(assistantThreads)
    .values({
      workspaceId,
      clientProfileId: input.clientProfileId,
      campaignId: input.campaignId ?? null,
      name,
      isDefault: input.isDefault ?? false,
    })
    .returning();

  return thread;
}

export async function getAssistantThreadById(workspaceId: string, threadId: string) {
  const [thread] = await db
    .select()
    .from(assistantThreads)
    .where(
      and(
        eq(assistantThreads.id, threadId),
        eq(assistantThreads.workspaceId, workspaceId)
      )
    )
    .limit(1);

  return thread ?? null;
}

export async function listAssistantThreads(
  workspaceId: string,
  filter: ListAssistantThreadsFilter
) {
  const conditions = [
    eq(assistantThreads.workspaceId, workspaceId),
    eq(assistantThreads.clientProfileId, filter.clientProfileId),
  ];

  if (filter.campaignId === null) {
    conditions.push(isNull(assistantThreads.campaignId));
  } else if (filter.campaignId !== undefined) {
    conditions.push(eq(assistantThreads.campaignId, filter.campaignId));
  }

  return db
    .select()
    .from(assistantThreads)
    .where(and(...conditions))
    .orderBy(desc(assistantThreads.updatedAt));
}

export async function getOrCreateDefaultCampaignThread(
  workspaceId: string,
  clientProfileId: string,
  campaignId: string
) {
  await validateCampaignProfileAlignment(workspaceId, clientProfileId, campaignId);

  const [existing] = await db
    .select()
    .from(assistantThreads)
    .where(
      and(
        eq(assistantThreads.workspaceId, workspaceId),
        eq(assistantThreads.clientProfileId, clientProfileId),
        eq(assistantThreads.campaignId, campaignId),
        eq(assistantThreads.isDefault, true)
      )
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  // Use the partial unique index as the concurrency primitive. Two campaign
  // surfaces can request the default thread at the same time; a check followed
  // by createAssistantThread would let both observe "missing" and one request
  // fail with assistant_threads_campaign_default_uidx. ON CONFLICT makes the
  // loser read and return the winner instead.
  const [created] = await db
    .insert(assistantThreads)
    .values({
      workspaceId,
      clientProfileId,
      campaignId,
      name: "Padrão",
      isDefault: true,
    })
    .onConflictDoNothing({
      target: [assistantThreads.workspaceId, assistantThreads.campaignId],
      where: sql`${assistantThreads.isDefault} = true AND ${assistantThreads.campaignId} IS NOT NULL`,
    })
    .returning();

  if (created) return created;

  const [concurrentWinner] = await db
    .select()
    .from(assistantThreads)
    .where(
      and(
        eq(assistantThreads.workspaceId, workspaceId),
        eq(assistantThreads.clientProfileId, clientProfileId),
        eq(assistantThreads.campaignId, campaignId),
        eq(assistantThreads.isDefault, true)
      )
    )
    .limit(1);

  if (!concurrentWinner) {
    throw new Error("Default campaign thread conflict resolved without a winner");
  }
  return concurrentWinner;
}

export async function linkThreadToCampaign(
  workspaceId: string,
  threadId: string,
  campaignId: string
) {
  const thread = await getAssistantThreadById(workspaceId, threadId);
  if (!thread) {
    return null;
  }

  await validateCampaignProfileAlignment(
    workspaceId,
    thread.clientProfileId,
    campaignId
  );

  const migratedFromThreadId =
    thread.campaignId === null ? thread.id : thread.migratedFromThreadId;

  const [updated] = await db
    .update(assistantThreads)
    .set({
      campaignId,
      migratedFromThreadId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(assistantThreads.id, threadId),
        eq(assistantThreads.workspaceId, workspaceId)
      )
    )
    .returning();

  return updated ?? null;
}

/** How long a conversation counts as "just created": the cleanup of a failed creation happens within seconds. */
export const UNUSED_THREAD_WINDOW_SECONDS = 10 * 60;

export type DeleteUnusedThreadResult = "deleted" | "not_found" | "in_use";

/**
 * Every table that hangs off a thread by a foreign key that deletes with it, as [table, thread column]. A thread with a row
 * in any of them is in use, whatever the row is: a goal run is born with the thread, before its first message, and the
 * delete would take it along. A Postgres test compares this list with the catalog, so a table added later cannot be
 * forgotten here.
 */
export const THREAD_DEPENDENTS = [
  [assistantMessages, assistantMessages.threadId],
  [assistantActionRecords, assistantActionRecords.threadId],
  [assistantGuidedFlows, assistantGuidedFlows.threadId],
  [assistantGuidedFlowEvents, assistantGuidedFlowEvents.threadId],
  [assistantGuidedFlowFeedback, assistantGuidedFlowFeedback.threadId],
  [assistantGuidedFlowStagingEvidence, assistantGuidedFlowStagingEvidence.threadId],
  [assistantGoalRuns, assistantGoalRuns.threadId],
  [assistantArtifactLineages, assistantArtifactLineages.threadId],
  [assistantArtifactVersions, assistantArtifactVersions.threadId],
  [assistantArtifactApprovalEvents, assistantArtifactApprovalEvents.threadId],
  [assistantArtifactComparisonAcknowledgements, assistantArtifactComparisonAcknowledgements.threadId],
  [assistantArtifactProposals, assistantArtifactProposals.threadId],
  [assistantArtifactIterationEvents, assistantArtifactIterationEvents.threadId],
  [assistantArtifactAnnotations, assistantArtifactAnnotations.threadId],
  [assistantPlanFeedbackDrafts, assistantPlanFeedbackDrafts.threadId],
  [assistantCreativeFeedbackDrafts, assistantCreativeFeedbackDrafts.threadId],
] as const;

/**
 * Takes back a conversation that was created and never used: the cleanup when its binding to an Equipe account was
 * refused. It removes nothing else: a thread with anything hanging off it (a message, a goal run, a guided flow...), a
 * default or campaign thread, one older than the window and, above all, one that an Equipe account owns are all
 * "in_use". The checks run under the thread's row lock, the one the binding insert (and any dependent row) takes through
 * its foreign key, so a row that commits first is seen here and one that comes later fails on the missing thread: a
 * binding is never left pointing at nothing. The age is read with the database's own clock, the one that stamped the row.
 */
export async function deleteUnusedAssistantThread(
  workspaceId: string,
  threadId: string,
): Promise<DeleteUnusedThreadResult> {
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({
        thread: assistantThreads,
        fresh: sql<boolean>`${assistantThreads.createdAt} > now() - make_interval(secs => ${UNUSED_THREAD_WINDOW_SECONDS})`,
      })
      .from(assistantThreads)
      .where(and(eq(assistantThreads.id, threadId), eq(assistantThreads.workspaceId, workspaceId)))
      .for("update");
    if (!found) return "not_found";
    if (found.thread.isDefault || found.thread.campaignId !== null || !found.fresh) return "in_use";
    for (const [table, column] of THREAD_DEPENDENTS) {
      const [dependent] = await tx.select({ one: sql<number>`1` }).from(table).where(eq(column, threadId)).limit(1);
      if (dependent) return "in_use";
    }
    const [owner] = await tx
      .select({ id: equipeThreads.id })
      .from(equipeThreads)
      .where(eq(equipeThreads.assistantThreadId, threadId))
      .limit(1);
    if (owner) return "in_use";
    await tx.delete(assistantThreads).where(eq(assistantThreads.id, threadId));
    return "deleted";
  });
}
