import { and, eq } from "drizzle-orm";
import {
  initialStepForPath,
  type GuidedFlowPath,
  type GuidedFlowStatus,
} from "@/lib/guided-flow/types";
import { db } from "../db";
import { assistantGuidedFlows } from "../db/schema";
import { getAssistantThreadById } from "./assistant-thread";
import { containsDeniedPersistenceKeys } from "./assistant-types";

export type { GuidedFlowPath, GuidedFlowStatus };
export { initialStepForPath };

export interface UpsertGuidedFlowInput {
  path: GuidedFlowPath;
  status: GuidedFlowStatus;
  currentStep: string;
  slots?: Record<string, unknown>;
  missingFields?: string[];
  assetIds?: string[];
  referenceIds?: string[];
  campaignId?: string | null;
}

export interface PatchGuidedFlowInput {
  path?: GuidedFlowPath;
  status?: GuidedFlowStatus;
  currentStep?: string;
  slots?: Record<string, unknown>;
  missingFields?: string[];
  assetIds?: string[];
  referenceIds?: string[];
  campaignId?: string | null;
}

export class GuidedFlowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuidedFlowValidationError";
  }
}

function assertSafeJson(value: unknown, label: string) {
  if (containsDeniedPersistenceKeys(value)) {
    throw new GuidedFlowValidationError(`${label} contains denied persistence keys`);
  }
}

async function assertThreadScope(
  workspaceId: string,
  threadId: string,
  clientProfileId: string
) {
  const thread = await getAssistantThreadById(workspaceId, threadId);
  if (!thread) {
    throw new GuidedFlowValidationError("Thread not found");
  }
  if (thread.clientProfileId !== clientProfileId) {
    throw new GuidedFlowValidationError(
      "Client profile does not match thread scope"
    );
  }
  return thread;
}

function assertFlowScope(
  workspaceId: string,
  clientProfileId: string,
  threadId: string,
  flow: typeof assistantGuidedFlows.$inferSelect
) {
  if (flow.workspaceId !== workspaceId) {
    throw new GuidedFlowValidationError("Cross-workspace mutation rejected");
  }
  if (flow.clientProfileId !== clientProfileId) {
    throw new GuidedFlowValidationError("Cross-client mutation rejected");
  }
  if (flow.threadId !== threadId) {
    throw new GuidedFlowValidationError("Cross-thread mutation rejected");
  }
}

export async function getGuidedFlowByThread(
  workspaceId: string,
  threadId: string
) {
  const [flow] = await db
    .select()
    .from(assistantGuidedFlows)
    .where(
      and(
        eq(assistantGuidedFlows.workspaceId, workspaceId),
        eq(assistantGuidedFlows.threadId, threadId)
      )
    )
    .limit(1);

  return flow ?? null;
}

export async function upsertGuidedFlow(
  workspaceId: string,
  threadId: string,
  clientProfileId: string,
  input: UpsertGuidedFlowInput
) {
  await assertThreadScope(workspaceId, threadId, clientProfileId);

  const slots = input.slots ?? {};
  const missingFields = input.missingFields ?? [];
  const assetIds = input.assetIds ?? [];
  const referenceIds = input.referenceIds ?? [];

  assertSafeJson(slots, "slots");
  assertSafeJson(missingFields, "missingFields");
  assertSafeJson(assetIds, "assetIds");
  assertSafeJson(referenceIds, "referenceIds");

  const existing = await getGuidedFlowByThread(workspaceId, threadId);
  const now = new Date();

  if (existing) {
    assertFlowScope(workspaceId, clientProfileId, threadId, existing);

    const [updated] = await db
      .update(assistantGuidedFlows)
      .set({
        path: input.path,
        status: input.status,
        currentStep: input.currentStep,
        slots,
        missingFields,
        assetIds,
        referenceIds,
        campaignId: input.campaignId ?? existing.campaignId,
        updatedAt: now,
      })
      .where(
        and(
          eq(assistantGuidedFlows.id, existing.id),
          eq(assistantGuidedFlows.workspaceId, workspaceId),
          eq(assistantGuidedFlows.threadId, threadId)
        )
      )
      .returning();

    return updated!;
  }

  const [created] = await db
    .insert(assistantGuidedFlows)
    .values({
      workspaceId,
      clientProfileId,
      threadId,
      path: input.path,
      status: input.status,
      currentStep: input.currentStep,
      slots,
      missingFields,
      assetIds,
      referenceIds,
      campaignId: input.campaignId ?? null,
    })
    .returning();

  return created;
}

export async function patchGuidedFlow(
  workspaceId: string,
  threadId: string,
  clientProfileId: string,
  patch: PatchGuidedFlowInput
) {
  await assertThreadScope(workspaceId, threadId, clientProfileId);

  const existing = await getGuidedFlowByThread(workspaceId, threadId);
  if (!existing) {
    throw new GuidedFlowValidationError("Guided flow not found");
  }

  assertFlowScope(workspaceId, clientProfileId, threadId, existing);

  const nextSlots =
    patch.slots !== undefined
      ? { ...existing.slots, ...patch.slots }
      : existing.slots;

  assertSafeJson(nextSlots, "slots");
  if (patch.missingFields !== undefined) {
    assertSafeJson(patch.missingFields, "missingFields");
  }
  if (patch.assetIds !== undefined) {
    assertSafeJson(patch.assetIds, "assetIds");
  }
  if (patch.referenceIds !== undefined) {
    assertSafeJson(patch.referenceIds, "referenceIds");
  }

  const [updated] = await db
    .update(assistantGuidedFlows)
    .set({
      ...(patch.path !== undefined ? { path: patch.path } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.currentStep !== undefined ? { currentStep: patch.currentStep } : {}),
      slots: nextSlots,
      ...(patch.missingFields !== undefined
        ? { missingFields: patch.missingFields }
        : {}),
      ...(patch.assetIds !== undefined ? { assetIds: patch.assetIds } : {}),
      ...(patch.referenceIds !== undefined
        ? { referenceIds: patch.referenceIds }
        : {}),
      ...(patch.campaignId !== undefined ? { campaignId: patch.campaignId } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(assistantGuidedFlows.id, existing.id),
        eq(assistantGuidedFlows.workspaceId, workspaceId),
        eq(assistantGuidedFlows.threadId, threadId)
      )
    )
    .returning();

  return updated!;
}
