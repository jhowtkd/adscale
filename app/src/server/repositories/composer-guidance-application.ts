import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { creativeWorkOutputs, creativeWorkPreparationAttempts } from "../db/schema";
import type { ComposerGuidanceApplication } from "../brand-taste/composer-guidance-application";

export async function recordComposerGuidanceApplication(input: {
  workspaceId: string;
  workItemId: string;
  outputId?: string;
  application: ComposerGuidanceApplication;
}): Promise<void> {
  const table = input.outputId ? creativeWorkOutputs : creativeWorkPreparationAttempts;
  const [row] = await db.update(table).set({
    guidanceApplications: sql`coalesce(${table.guidanceApplications}, '[]'::jsonb) || ${JSON.stringify([input.application])}::jsonb`,
  }).where(and(
    eq(table.workspaceId, input.workspaceId),
    eq(table.workItemId, input.workItemId),
    eq(table.id, input.outputId ?? input.application.executionId),
  )).returning({ id: table.id });
  if (!row) throw new Error("Execução do composer não encontrada neste workspace e Trabalho.");
}

export async function listComposerGuidanceApplications(input: {
  workspaceId: string;
  workItemId: string;
  executionId?: string;
}): Promise<ComposerGuidanceApplication[]> {
  const outputs = await db.select({ applications: creativeWorkOutputs.guidanceApplications })
    .from(creativeWorkOutputs).where(and(
      eq(creativeWorkOutputs.workspaceId, input.workspaceId), eq(creativeWorkOutputs.workItemId, input.workItemId),
      input.executionId ? eq(creativeWorkOutputs.id, input.executionId) : undefined,
    ));
  const attempts = await db.select({ applications: creativeWorkPreparationAttempts.guidanceApplications })
    .from(creativeWorkPreparationAttempts).where(and(
      eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId), eq(creativeWorkPreparationAttempts.workItemId, input.workItemId),
      input.executionId ? eq(creativeWorkPreparationAttempts.id, input.executionId) : undefined,
    ));
  return [...outputs, ...attempts].flatMap(row => row.applications ?? []);
}
