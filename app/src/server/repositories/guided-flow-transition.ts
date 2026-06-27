import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { assistantGuidedFlowTransitions } from "../db/schema";
import { containsDeniedPersistenceKeys } from "./assistant-types";

export class GuidedFlowTransitionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuidedFlowTransitionValidationError";
  }
}

function assertSafeMetadata(metadata: Record<string, unknown>) {
  if (containsDeniedPersistenceKeys(metadata)) {
    throw new GuidedFlowTransitionValidationError(
      "Transition metadata contains denied persistence keys"
    );
  }
}

export async function insertGuidedFlowTransition(input: {
  guidedFlowId: string;
  workspaceId: string;
  commandId: string;
  commandType: string;
  expectedRevision: number;
  resultRevision: number;
  previousStep?: string | null;
  nextStep?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const metadata = input.metadata ?? {};
  assertSafeMetadata(metadata);

  const [row] = await db
    .insert(assistantGuidedFlowTransitions)
    .values({
      guidedFlowId: input.guidedFlowId,
      workspaceId: input.workspaceId,
      commandId: input.commandId,
      commandType: input.commandType,
      expectedRevision: input.expectedRevision,
      resultRevision: input.resultRevision,
      previousStep: input.previousStep ?? null,
      nextStep: input.nextStep ?? null,
      metadata,
    })
    .returning();

  return row!;
}

export async function getGuidedFlowTransitionByCommand(
  guidedFlowId: string,
  commandId: string
) {
  const [row] = await db
    .select()
    .from(assistantGuidedFlowTransitions)
    .where(
      and(
        eq(assistantGuidedFlowTransitions.guidedFlowId, guidedFlowId),
        eq(assistantGuidedFlowTransitions.commandId, commandId)
      )
    )
    .limit(1);

  return row ?? null;
}
