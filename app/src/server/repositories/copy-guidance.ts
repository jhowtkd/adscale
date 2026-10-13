import "server-only";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { creativeWorkItems, creativeWorkPreparationAttempts } from "../db/schema";
import { resolveSinglePieceGuidance } from "../brand-taste/single-piece-guidance";
import { preparationInputFingerprint } from "../creative-work/preparation-attempt";

export const independentCopyFingerprint = (workItemId: string) =>
  preparationInputFingerprint({ executionKey: `creative-work:${workItemId}:copy` });

/** The existing paid copy key owns the freeze, independently of autosave/CAS timestamps. */
export async function freezeIndependentCopyGuidance(input: { workspaceId: string; workItemId: string; attemptId: string }) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.workspaceId}:${input.workItemId}:copy`}))`);
    const scope = and(eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId),
      eq(creativeWorkPreparationAttempts.workItemId, input.workItemId));
    const [attempt] = await tx.select().from(creativeWorkPreparationAttempts)
      .where(and(scope, eq(creativeWorkPreparationAttempts.id, input.attemptId))).for("update");
    if (!attempt || attempt.inputFingerprint !== independentCopyFingerprint(input.workItemId)) throw new Error("Execução de copy não encontrada neste workspace e Trabalho.");
    if (attempt.frozenGuidance) return attempt.frozenGuidance;
    const [previous] = await tx.select().from(creativeWorkPreparationAttempts).where(and(scope,
      eq(creativeWorkPreparationAttempts.inputFingerprint, independentCopyFingerprint(input.workItemId)),
      isNotNull(creativeWorkPreparationAttempts.frozenGuidance))).orderBy(asc(creativeWorkPreparationAttempts.createdAt)).limit(1);
    const [work] = await tx.select().from(creativeWorkItems).where(and(
      eq(creativeWorkItems.workspaceId, input.workspaceId), eq(creativeWorkItems.id, input.workItemId))).for("update");
    if (!work) throw new Error("Trabalho não encontrado neste workspace.");
    const selection = previous?.frozenGuidance ?? {
      ...await resolveSinglePieceGuidance({ workspaceId: input.workspaceId, clientProfileId: work.clientProfileId,
        generationMode: work.toolKind, format: work.format }),
      preparation: { executionId: attempt.id, inputFingerprint: attempt.inputFingerprint },
    };
    await tx.update(creativeWorkPreparationAttempts).set({ frozenGuidance: selection })
      .where(and(scope, eq(creativeWorkPreparationAttempts.id, attempt.id)));
    return selection;
  });
}
