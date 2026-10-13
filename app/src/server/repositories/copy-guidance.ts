import "server-only";
import { independentCopyInputRevision } from "../creative-work/copy-execution";
import type { SocialPostCopy } from "../creative-work/contracts";
import { finalizePreparationAttempt } from "./creative-work-preparation";
import { setCreativeWorkCopy } from "./creative-work";
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

/** Validate and finalize under the same work lock as the copy write; no timestamp identity. */
export async function persistIndependentCopy(input: {
  workspaceId: string;
  workItemId: string;
  attemptId: string;
  inputRevision: string;
  executionId: string;
  copy: SocialPostCopy;
}) {
  return db.transaction(async tx => {
    const [work] = await tx.select().from(creativeWorkItems).where(and(
      eq(creativeWorkItems.workspaceId, input.workspaceId), eq(creativeWorkItems.id, input.workItemId),
    )).for("update");
    if (!work || independentCopyInputRevision(work) !== input.inputRevision) return null;
    const finalized = await finalizePreparationAttempt({
      ...input, currentRevision: independentCopyInputRevision(work),
      currentFingerprint: independentCopyFingerprint(input.workItemId), state: "completed", executor: tx,
    });
    if (!finalized.ok) return null;
    // CAS protects the write; the locked content fingerprint above owns execution validity.
    return setCreativeWorkCopy(input.workspaceId, input.workItemId, input.copy, input.executionId, work.updatedAt, tx);
  });
}
