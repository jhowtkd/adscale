import "server-only";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { creativeWorkItems, creativeWorkOutputs, creativeWorkPreparationAttempts } from "../db/schema";
import { resolveSinglePieceGuidance, type FrozenSinglePieceGuidance } from "../brand-taste/single-piece-guidance";

type Scope = { workspaceId: string; workItemId: string };

export async function resolveSinglePieceWorkGuidance(
  input: Scope & { generationMode: string; format: string },
  executor: Pick<typeof db, "select"> = db,
): Promise<FrozenSinglePieceGuidance | null> {
  const [work] = await executor.select().from(creativeWorkItems).where(and(
    eq(creativeWorkItems.workspaceId, input.workspaceId), eq(creativeWorkItems.id, input.workItemId),
  )).limit(1);
  return work?.toolKind === "single" ? resolveSinglePieceGuidance({
    workspaceId: input.workspaceId, clientProfileId: work.clientProfileId,
    generationMode: input.generationMode, format: input.format,
  }) : null;
}

export async function freezeSinglePiecePreparationGuidance(
  input: Scope & { attemptId: string; format: string },
): Promise<FrozenSinglePieceGuidance | null> {
  return db.transaction(async tx => {
    const scope = and(eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId),
      eq(creativeWorkPreparationAttempts.workItemId, input.workItemId), eq(creativeWorkPreparationAttempts.id, input.attemptId));
    const [attempt] = await tx.select().from(creativeWorkPreparationAttempts).where(scope).for("update");
    if (!attempt) throw new Error("Tentativa de preparação não encontrada neste workspace e Trabalho.");
    if (attempt.frozenGuidance) return attempt.frozenGuidance;
    // Technical attempts share the content revision; only a deliberate edit starts another unit.
    const executionKey = `single-piece-guidance:${input.workspaceId}:${input.workItemId}:${attempt.kind}:${attempt.inputRevision}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${executionKey}))`);
    const [previous] = await tx.select({ frozenGuidance: creativeWorkPreparationAttempts.frozenGuidance })
      .from(creativeWorkPreparationAttempts).where(and(
        eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId),
        eq(creativeWorkPreparationAttempts.workItemId, input.workItemId),
        eq(creativeWorkPreparationAttempts.kind, attempt.kind),
        eq(creativeWorkPreparationAttempts.inputRevision, attempt.inputRevision),
        isNotNull(creativeWorkPreparationAttempts.frozenGuidance),
      )).orderBy(asc(creativeWorkPreparationAttempts.createdAt), asc(creativeWorkPreparationAttempts.id)).limit(1);
    const selection = previous?.frozenGuidance
      ?? await resolveSinglePieceWorkGuidance({ ...input, generationMode: "single" }, tx);
    if (selection) await tx.update(creativeWorkPreparationAttempts).set({ frozenGuidance: selection }).where(scope);
    return selection;
  });
}

/** Durable freeze also protects direct/restarted workers when load-scope is memoized. */
export async function freezeSinglePieceOutputGuidance(input: Scope & { outputId: string }): Promise<FrozenSinglePieceGuidance | null> {
  return db.transaction(async tx => {
    const scope = and(eq(creativeWorkOutputs.workspaceId, input.workspaceId),
      eq(creativeWorkOutputs.workItemId, input.workItemId), eq(creativeWorkOutputs.id, input.outputId));
    const [output] = await tx.select().from(creativeWorkOutputs).where(scope).for("update");
    if (!output) throw new Error("Peça não encontrada neste workspace e Trabalho.");
    if (output.frozenGuidance) return output.frozenGuidance;
    const selection = await resolveSinglePieceWorkGuidance({ ...input, format: output.targetFormat,
      generationMode: output.parentOutputId ? output.revisionContext?.action === "format" ? "format_adaptation" : "creative_revision" : "single",
    }, tx);
    if (selection) await tx.update(creativeWorkOutputs).set({ frozenGuidance: selection }).where(scope);
    return selection;
  });
}
