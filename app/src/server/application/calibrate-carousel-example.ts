import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { creativeWorkItems, creativeWorkPreparationAttempts } from "../db/schema";
import { withCreativeWorkPreparationLock } from "../repositories/creative-work";
import { loadCalibrationCandidateForWork } from "../repositories/brand-training-sessions";
import { resolveCarouselGuidanceCycle } from "../repositories/carousel-guidance-cycle";
import { materializeCarouselSlides, listCurrentCarouselSlides } from "../repositories/creative-work-carousel";
import { matchesCalibrationScope, planCalibrationScopes } from "../brand-training/visual-guidance-contract";
import { renderLearnedGuidance } from "../brand-taste/learned-guidance";
import { requireLocalLearningAuthorization } from "../brand-taste/local-learning-authorization";
import { buildCarouselVisualContract } from "../creative-work/carousel-visual";
import { buildCreativeWorkFactPack } from "../creative-work/fact-pack";
import { carouselDeckPlanSchema, resolveCarouselPreparedSnapshot } from "../creative-work/carousel-contracts";
import type { CreativeWorkIdentitySnapshot } from "../creative-work/contracts";
import { composeVisualDirection, visualRepertoireSchema } from "../brand-training/visual-repertoire";
import { peopleCatalogSchema, resolveBriefingPeople } from "../brand-training/people";
import { carouselSlideBillingKey, carouselSlideSettlementAdapter } from "../generation/settlement-adapters";
import { startGenerationSettlement } from "../generation/settlement";

/** A single cover exercises the carousel image scope without generating a five-image deck. */
export async function prepareCalibrationCarouselExample(input: {
  workspaceId: string; workItemId: string; calibration: { sessionId: string; round: number; slot: number };
}) {
  return withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async tx => {
    const [work] = await tx.select().from(creativeWorkItems).where(and(
      eq(creativeWorkItems.workspaceId, input.workspaceId), eq(creativeWorkItems.id, input.workItemId),
    )).for("update");
    if (!work || work.toolKind !== "carousel" || work.trainingSessionId !== input.calibration.sessionId
      || work.trainingRound !== input.calibration.round || work.trainingSlot !== input.calibration.slot) throw new Error("calibration_managed");
    const candidate = await loadCalibrationCandidateForWork(input.workspaceId, input.workItemId);
    const scope = planCalibrationScopes(candidate?.visualGuidance)[input.calibration.slot];
    if (!candidate?.visualGuidance || scope?.generationMode !== "carousel" || scope.format !== work.format
      || (work.format !== "4:5" && work.format !== "1:1")) throw new Error("calibration_guidance_context_changed");
    await requireLocalLearningAuthorization({ workspaceId: input.workspaceId, clientProfileId: work.clientProfileId });
    const existing = resolveCarouselPreparedSnapshot(work.inputSnapshot);
    if (existing) return existing;
    if (work.status !== "draft") throw new Error("calibration_managed");
    const cycleId = randomUUID();
    const cycle = await resolveCarouselGuidanceCycle({ workspaceId: work.workspaceId, clientProfileId: work.clientProfileId,
      format: work.format, cycleId, parentCycleId: null, requestKey: candidate.hash, contextFingerprint: candidate.hash }, {
      loadLearnedGuidance: async requested => {
        if (requested.role === "carousel_editorial") return { lines: [], appliedRefs: [], setHash: null, omissions: [] };
        const set = candidate.visualGuidance!.sets.find(set => matchesCalibrationScope(set, requested));
        if (!set) throw new Error("calibration_guidance_context_changed");
        return { ...renderLearnedGuidance(set), omissions: [] };
      },
    });
    const identity: CreativeWorkIdentitySnapshot = { ...candidate.identity, brandKnowledge: {
      mode: "published", versionId: null, versionNumber: null, versionHash: candidate.hash, compiledAt: candidate.knowledge.compiledAt,
      claims: candidate.knowledge.claims.filter(claim => (!claim.scope.format || claim.scope.format === work.format) && !claim.scope.channel),
    } };
    const repertoire = visualRepertoireSchema.safeParse(candidate.knowledge.claims.find(claim => claim.claimKey === "visual.repertoire")?.value);
    const language = repertoire.success ? repertoire.data.languages.find(item => item.id === work.settings.visualLanguageId) ?? null : null;
    if (work.settings.visualLanguageId && !language) throw new Error("visual_language_unknown");
    const catalog = peopleCatalogSchema.safeParse(candidate.knowledge.claims.find(claim => claim.claimKey === "people.catalog")?.value);
    const people = resolveBriefingPeople({ catalog: catalog.success ? catalog.data : null, personIds: work.settings.personIds, text: "" });
    if (!people.ok) throw new Error(people.error.code);
    const deck = carouselDeckPlanSchema.parse({ version: 1, revision: candidate.hash, workId: work.id,
      objective: "Teste visual de calibração", audience: null, tone: null, promise: "Texto de teste de calibração", format: work.format,
      slides: ["hook", "context", "argument", "method", "cta"].map((role, index) => ({
        slideId: `${work.id}:${index + 1}`, position: index + 1, role, purpose: "Teste visual de calibração, sem oferta ou promessa",
        primaryText: "Texto de teste de calibração", secondaryText: null, authority: "user_input", sourceFactIds: [],
        layoutFamily: index === 0 || index === 4 ? "impact" : "development",
      })),
    });
    const visualDirection = repertoire.success ? composeVisualDirection({ repertoire: repertoire.data, language }) : null;
    const visualContract = buildCarouselVisualContract({ format: work.format, identity, temporaryReferenceId: null });
    const snapshot = { version: 1 as const, preparedRevision: candidate.hash, deck, visualContract, generationScope: "cover" as const };
    const editorial = { version: 1 as const, revision: candidate.hash, contextHash: candidate.hash, guidanceCycleId: cycleId,
      research: { status: "not_needed" as const, question: "", thesis: "", sources: [], claims: [], gaps: [] },
      hooks: [], recommendedHookId: null, recommendation: null, selectedHookId: null, storyboard: [], caption: null,
      approvedScriptRevision: null, approvedCover: null, confirmedInteriorsRevision: null };
    const settings = { ...work.settings, carouselEditorial: editorial };
    // No editorial approval is invented: these private examples use only the existing image builder/job.
    await tx.insert(creativeWorkPreparationAttempts).values({ id: cycleId, workspaceId: work.workspaceId, workItemId: work.id,
      kind: "carousel_plan", inputRevision: work.updatedAt.toISOString(), inputFingerprint: candidate.hash,
      leaseExpiresAt: new Date(), state: "completed", frozenCarouselGuidance: cycle });
    await tx.update(creativeWorkItems).set({ identitySnapshot: identity, inputSnapshot: {
      generationPolicyVersion: "quality_recovery_v1", request: work.request, settings, sources: [], carousel: snapshot,
      factPack: buildCreativeWorkFactPack({ request: work.request, mode: "social_post", sources: [], brand: null, clientProfileId: work.clientProfileId }),
      ...(visualDirection ? { visualDirection } : {}),
      ...(people.people.length ? { people: people.people.map(person => ({ personId: person.id, name: person.name,
        referenceIds: [...person.referenceIds], primaryReferenceId: person.primaryReferenceId, preserve: [...person.preserve] })) } : {}),
    }, settings }).where(eq(creativeWorkItems.id, work.id));
    return snapshot;
  });
}

export async function generateCalibrationCarouselExample(input: Parameters<typeof prepareCalibrationCarouselExample>[0] & { userId: string }) {
  const snapshot = await prepareCalibrationCarouselExample(input);
  const slides = await withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async tx => {
    // Settlement replaces draft operation keys. Reuse the stored rows on replay,
    // under the work lock, instead of materializing another billable cover.
    const existing = await listCurrentCarouselSlides(input.workspaceId, input.workItemId, tx);
    return existing.length ? existing : materializeCarouselSlides({ ...input, deck: snapshot.deck, visualContractHash: snapshot.visualContract.contractHash });
  });
  const cover = slides.find(slide => slide.position === 1)!;
  if (cover.status === "completed" || cover.status === "failed") return { ok: true as const, value: cover };
  const settled = await startGenerationSettlement(carouselSlideSettlementAdapter({ ...input, slideId: cover.id, anchorKey: null,
    operationKey: carouselSlideBillingKey(input.workItemId, cover.id) }));
  if (!settled.ok) return { ok: false as const, error: settled.error };
  return { ok: true as const, value: cover };
}
