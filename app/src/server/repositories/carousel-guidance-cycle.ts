import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { creativeWorkItems, creativeWorkPreparationAttempts } from "../db/schema";
import { withCreativeWorkPreparationLock } from "./creative-work";
import { getCarouselEditorialFixedPrompts } from "../creative-work/carousel-editorial";
import { carouselResearchPolicy } from "../shared-skills-texts";
import { getCreativeWorkPromptVersion } from "../shared-skills";
import { loadLocalLearningPromptCalibrationContext } from "../brand-taste/prompt-calibration-loader";
import type { CarouselGuidanceGateway, FrozenCarouselGuidanceCycle } from "../brand-taste/carousel-guidance-cycle";
import type { CarouselEditorialCommand, CarouselEditorialState } from "../creative-work/carousel-editorial-state";

/** The same AP19 reader as loadLearnedGuidance on the Equipe gateway; no second eligibility implementation. */
const gateway: CarouselGuidanceGateway = { loadLearnedGuidance: loadLocalLearningPromptCalibrationContext };

export async function getCarouselGuidanceCycle(input: { workspaceId: string; workItemId: string; cycleId: string }): Promise<FrozenCarouselGuidanceCycle | null> {
  const [row] = await db.select({ frozen: creativeWorkPreparationAttempts.frozenCarouselGuidance }).from(creativeWorkPreparationAttempts).where(and(
    eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId), eq(creativeWorkPreparationAttempts.workItemId, input.workItemId),
    eq(creativeWorkPreparationAttempts.id, input.cycleId),
  ));
  return row?.frozen ? structuredClone(row.frozen) : null;
}

/** The cycle lives on its FIRST preparation execution. Later steps retain this id.
 * The work lock serializes selection, including a reclaimed attempt after a crash.
 * This transaction commits before research; it never holds a model/provider call.
 */
export async function freezeCarouselGuidanceCycle(input: {
  workspaceId: string; workItemId: string; executionId: string; expectedUpdatedAt: string;
  requestKey: string; contextFingerprint: string; parentCycleId?: string;
  editorial: CarouselEditorialState;
  commandKind: Exclude<CarouselEditorialCommand, { kind: "approve_script" | "approve_cover" }>["kind"];
}, reader: CarouselGuidanceGateway = gateway): Promise<FrozenCarouselGuidanceCycle> {
  return withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async tx => {
    const [work] = await tx.select().from(creativeWorkItems).where(and(eq(creativeWorkItems.workspaceId, input.workspaceId), eq(creativeWorkItems.id, input.workItemId)));
    if (!work || work.toolKind !== "carousel" || work.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("stale_carousel_guidance_cycle");
    const scoped = and(eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId), eq(creativeWorkPreparationAttempts.workItemId, input.workItemId), eq(creativeWorkPreparationAttempts.kind, "carousel_plan"));
    if (input.parentCycleId) {
      const [parent] = await tx.select().from(creativeWorkPreparationAttempts).where(and(scoped, eq(creativeWorkPreparationAttempts.id, input.parentCycleId)));
      if (!parent?.frozenCarouselGuidance) throw new Error("unknown_carousel_guidance_cycle");
      if (parent.frozenCarouselGuidance.format === work.format && parent.frozenCarouselGuidance.clientProfileId === work.clientProfileId) {
        if (input.commandKind === "select_hook" || (input.commandKind === "propose_hooks" && parent.frozenCarouselGuidance.contextFingerprint === input.contextFingerprint)) return structuredClone(parent.frozenCarouselGuidance);
        if (input.commandKind === "revise_script" && parent.frozenCarouselGuidance.requestKey === input.requestKey) {
          // A completed retry closes this operation even when the root execution failed.
          const [previous] = await tx.select().from(creativeWorkPreparationAttempts).where(and(scoped,
            eq(creativeWorkPreparationAttempts.inputFingerprint, input.requestKey), ne(creativeWorkPreparationAttempts.id, input.executionId),
          )).orderBy(desc(creativeWorkPreparationAttempts.createdAt), desc(creativeWorkPreparationAttempts.id)).limit(1);
          if (previous && previous.state !== "completed") return structuredClone(parent.frozenCarouselGuidance);
        }
      }
    }
    const [attempt] = await tx.select().from(creativeWorkPreparationAttempts).where(and(scoped, eq(creativeWorkPreparationAttempts.id, input.executionId)));
    if (!attempt) throw new Error("unknown_carousel_preparation_execution");
    if (attempt.frozenCarouselGuidance) throw new Error("carousel_execution_already_frozen");
    const frozen = await resolveCarouselGuidanceCycle({ workspaceId: work.workspaceId, clientProfileId: work.clientProfileId,
      format: work.format, cycleId: attempt.id, parentCycleId: input.parentCycleId ?? null,
      requestKey: input.requestKey, contextFingerprint: input.contextFingerprint }, reader);
    await tx.update(creativeWorkPreparationAttempts).set({ frozenCarouselGuidance: frozen }).where(and(scoped, eq(creativeWorkPreparationAttempts.id, attempt.id)));
    // Attach the cycle before providers run, without changing the caller's CAS revision.
    await tx.update(creativeWorkItems).set({ settings: { ...work.settings,
      carouselEditorial: { ...input.editorial, guidanceCycleId: frozen.cycleId },
    } }).where(and(eq(creativeWorkItems.workspaceId, input.workspaceId), eq(creativeWorkItems.id, input.workItemId)));
    return structuredClone(frozen);
  });
}

/** Shared freeze for editorial cycles and private, factually neutral calibration examples. */
export async function resolveCarouselGuidanceCycle(input: {
  workspaceId: string; clientProfileId: string; format: string; cycleId: string; parentCycleId: string | null;
  requestKey: string; contextFingerprint: string;
}, reader: CarouselGuidanceGateway = gateway): Promise<FrozenCarouselGuidanceCycle> {
  const editorial = getCarouselEditorialFixedPrompts();
  const common = { workspaceId: input.workspaceId, clientProfileId: input.clientProfileId, generationMode: "carousel", format: input.format, language: "en" as const };
  const carousel_editorial = await reader.loadLearnedGuidance({ ...common, role: "carousel_editorial", fixedPromptVersion: editorial.fixedPromptVersion });
  const imagePromptVersion = getCreativeWorkPromptVersion("image_prompt");
  const image_prompt = await reader.loadLearnedGuidance({ ...common, role: "image_prompt", fixedPromptVersion: imagePromptVersion });
  return { version: 1, cycleId: input.cycleId, parentCycleId: input.parentCycleId, requestKey: input.requestKey,
    contextFingerprint: input.contextFingerprint, clientProfileId: input.clientProfileId, format: input.format,
    editorial, imagePromptVersion, research: { withExternalEvidence: carouselResearchPolicy(true), withoutExternalEvidence: carouselResearchPolicy(false), fixedPromptVersion: getCreativeWorkPromptVersion() },
    selections: { carousel_editorial, image_prompt } };
}
