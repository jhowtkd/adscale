import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { assistantThreads } from "../db/schema";
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
