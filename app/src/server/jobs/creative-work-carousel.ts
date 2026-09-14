import "server-only";
import { logger } from "@/lib/logger";
import { objectStorage } from "@/server/storage";
import { normalizeReferenceBuffers } from "@/server/ai/normalize-image-for-ai";
import sharp from "sharp";
import { executeCanonicalGeneration } from "@/server/generation/pipeline/execute";
import { resolveImageRenderPolicy } from "@/server/ai/image-render-policy";
import {
  runCreativeWorkQualityAssessment,
} from "@/server/generation/pipeline/post-generation";
import {
  GENERATION_CREDIT_COSTS,
  type GenerationRequest,
} from "@/server/generation/canonical/types";
import { settleTerminalRefund } from "@/server/generation/settlement";
import { decideCreativeWorkRefund } from "@/server/generation/canonical/policies";
import { carouselSlideBillingKey } from "@/server/generation/settlement-adapters";
import { getCreativeWork } from "@/server/repositories/creative-work";
import {
  completeCarouselSlide,
  failCarouselSlide,
  listCarouselSlideLineage,
  listCurrentCarouselSlides,
  markCarouselSlideProcessing,
} from "@/server/repositories/creative-work-carousel";
import { dispatchNextCarouselStage } from "@/server/application/advance-carousel-generation";
import { refineCarouselSlide } from "@/server/application/refine-carousel-slide";
import {
  carouselAnchorPositions,
  resolveCarouselPreparedSnapshot,
  resolveCarouselSlideRevisionInstruction,
} from "@/server/creative-work/carousel-contracts";
import { buildCarouselSlidePrompt } from "@/server/creative-work/prompt";
import {
  planCarouselSlideReferences,
  type CreativeWorkReferenceSlot,
} from "@/server/creative-work/reference-plan";
import { matchPersonPhotoBuffers, resolveSnapshotPersonSlots, type MatchedPersonPhotoInput } from "@/server/creative-work/identity";
import { resolveCreativeWorkArtRefinement } from "@/server/creative-work/contracts";
import { snapshotPeopleMentionedInText } from "@/server/brand-training/people";
import {
  runCarouselTextComposition,
  TextCompositionError,
} from "@/server/creative-work/text-composite";
import { approvedBrandFontAssets, type BrandFontAsset } from "@/server/brand-training/font-assets";
import type {
  CreativeWorkCarouselSlide,
  CreativeWorkItem,
} from "@/server/db/schema";
import { inngest } from "./client";
import type { Inngest } from "inngest";

/**
 * One carousel slide provider job (Task 6): one direct canonical image call
 * for the text-free base, deterministic exact-asset + copy composition, the
 * shared tri-state objective QA without its legacy correction call, and the
 * deterministic chain continuation. A failure marks and refunds ONLY that
 * slide; an anchor failure never calls the continuation (the chain stops).
 */

const CAROUSEL_CANVAS: Record<"4:5" | "1:1", { width: number; height: number }> = {
  "4:5": { width: 1024, height: 1280 },
  "1:1": { width: 1024, height: 1024 },
};

interface CarouselSlideGenerateEvent {
  workspaceId: string;
  workItemId: string;
  slideId: string;
}

interface CarouselSlideJobStep {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

type CarouselSlideFailureCode =
  | "contract_mismatch"
  | "reference_failure"
  | "provider_failed"
  | "provider_output_corrupt"
  | "wrong_dimensions"
  | "exact_asset_missing"
  | "copy_overflow"
  | "objective_failed"
  | "qa_failed"
  | "generation_interrupted";

function shortError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

function isAnchorSlide(slide: CreativeWorkCarouselSlide, snapshot: NonNullable<ReturnType<typeof resolveCarouselPreparedSnapshot>>): boolean {
  return carouselAnchorPositions(snapshot.deck.slides.length).includes(slide.position);
}

async function failAndRefundSlide(input: {
  workspaceId: string;
  workItemId: string;
  slideId: string;
  userId: string | null;
  errorCode: CarouselSlideFailureCode;
  reason: string;
  isAnchor: boolean;
}): Promise<{ success: false; slideId: string; failureCode: CarouselSlideFailureCode }> {
  const failed = await failCarouselSlide({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    slideId: input.slideId,
    errorCode: input.errorCode,
  }).catch((error) => {
    logger.error(`[carouselSlideJob] fail-slide failed slideId=${input.slideId}`, error);
    return null;
  });
  // Same terminal policy as legacy output recovery: an idempotent refund
  // under the per-output terminal key — repeated calls are duplicates.
  await settleTerminalRefund({
    workspaceId: input.workspaceId,
    decision: decideCreativeWorkRefund({
      surface: "quick_tool",
      failurePhase: "terminal",
      workItemId: input.workItemId,
      outputId: input.slideId,
    }),
    metadata: {
      creativeWorkId: input.workItemId,
      slideId: input.slideId,
      reason: input.reason,
      description: "creative_work_carousel_slide_terminal_refund",
    },
    userId: input.userId ?? undefined,
  }).catch((error) => {
    logger.error(`[carouselSlideJob] terminal refund failed slideId=${input.slideId}`, error);
  });
  if (failed && !input.isAnchor) {
    // Non-anchor aggregate reconciliation only — never used to skip a
    // failed anchor (the chain stops on anchor failure).
    await dispatchNextCarouselStage({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      userId: input.userId ?? "",
    }).catch((error) => {
      logger.warn(`[carouselSlideJob] reconciliation dispatch failed slideId=${input.slideId}`, error);
    });
  }
  return { success: false, slideId: input.slideId, failureCode: input.errorCode };
}

export async function runCreativeWorkCarouselSlide(input: {
  event: CarouselSlideGenerateEvent;
  runId?: string;
  attempt?: number;
}): Promise<{ success: boolean; slideId: string; skipped?: boolean }> {
  const { workspaceId, workItemId, slideId } = input.event;
  logger.info(
    `[carouselSlideJob] START workspaceId=${workspaceId} workItemId=${workItemId} slideId=${slideId} runId=${input.runId ?? "n/a"} attempt=${input.attempt ?? 0}`,
  );

  const aggregate = await getCreativeWork(workspaceId, workItemId);
  if (!aggregate || aggregate.work.toolKind !== "carousel") {
    return { success: true, slideId, skipped: true };
  }
  const work: CreativeWorkItem = aggregate.work;
  const snapshot = resolveCarouselPreparedSnapshot(work.inputSnapshot);
  if (!snapshot) {
    return { success: true, slideId, skipped: true };
  }

  const slides = await listCurrentCarouselSlides(workspaceId, workItemId);
  const slide = slides.find((row) => row.id === slideId);
  if (!slide) {
    return { success: true, slideId, skipped: true };
  }
  if (slide.status === "completed") {
    // Duplicate delivery of an already-settled event.
    return { success: true, slideId, skipped: true };
  }

  // queued → processing CAS: a lost lease means another run owns the slide.
  const claimed = await markCarouselSlideProcessing({ workspaceId, workItemId, slideId });
  if (!claimed) {
    return { success: true, slideId, skipped: true };
  }
  const anchor = isAnchorSlide(claimed, snapshot);

  try {
    if (claimed.visualContractHash !== snapshot.visualContract.contractHash) {
      return await failAndRefundSlide({
        workspaceId, workItemId, slideId, userId: work.createdByUserId,
        errorCode: "contract_mismatch", reason: "slide_visual_contract_hash_mismatch", isAnchor: anchor,
      });
    }

    const layoutPlan = snapshot.visualContract.layoutFamilies[claimed.layoutFamily];
    const dimensions = CAROUSEL_CANVAS[snapshot.deck.format];

    // Provider references (role-bound, ≤4). Exact assets are never sent —
    // they are composited after generation from the frozen slots.
    const identitySnapshot = work.identitySnapshot;
    const identityReferenceAssets = (identitySnapshot?.assets ?? [])
      .filter((asset) => asset.usageMode === "reference" && asset.mimeType)
      .map((asset) => ({ assetKey: asset.assetKey, mimeType: asset.mimeType, label: asset.label }));
    const temporarySource = snapshot.visualContract.temporaryReferenceId
      ? (work.inputSnapshot?.sources ?? []).find(
          (source) => source.sourceId === snapshot.visualContract.temporaryReferenceId,
        )
      : undefined;
    const temporaryReference = temporarySource?.assetKey && temporarySource.mimeType
      ? { assetKey: temporarySource.assetKey, mimeType: temporarySource.mimeType, label: temporarySource.label?.trim() || "Temporary reference" }
      : null;
    // Named people (plan 03, T2): slides whose frozen copy mentions a frozen
    // snapshot person carry that person's primary photo next to the anchor
    // board. Missing photos fail the slide as reference_failure, like any
    // other mandatory authority.
    const planSlide = snapshot.deck.slides.find((candidate) => candidate.position === claimed.position);
    const slidePeople = snapshotPeopleMentionedInText(
      planSlide ? [planSlide.purpose, planSlide.primaryText, planSlide.secondaryText ?? ""].join("\n") : "",
      work.inputSnapshot?.people ?? [],
    );
    let referenceSlots: CreativeWorkReferenceSlot[];
    let referenceImages: Array<{ buffer: Buffer; mimeType: string; name: string }>;
    // Plan 03, T3: slide people bound to their loaded primary photos for the
    // person-fidelity assessment over the final composed image.
    let slidePersonPhotos: MatchedPersonPhotoInput[] = [];
    try {
      const { slots: personSlots } = await resolveSnapshotPersonSlots({
        workspaceId,
        clientProfileId: work.clientProfileId,
        people: slidePeople,
        identityAssets: identitySnapshot?.assets ?? [],
      });
      referenceSlots = planCarouselSlideReferences({
        isAnchor: anchor,
        anchorBoardKey: claimed.anchorKey,
        identityReferenceAssets,
        temporaryReference,
        personSlots,
      });
      referenceImages = await Promise.all(
        referenceSlots.map(async (slot) => ({
          buffer: await objectStorage.get(slot.assetKey),
          mimeType: slot.mimeType,
          name: slot.label,
        })),
      );
      slidePersonPhotos = matchPersonPhotoBuffers({
        people: slidePeople,
        personSlots,
        loaded: referenceSlots.map((slot, index) => ({
          slot,
          buffer: referenceImages[index]!.buffer,
          mimeType: referenceImages[index]!.mimeType,
        })),
      });
    } catch (error) {
      // Any failure in the reference stage — planning rejection or a
      // missing/unloadable (unauthorized) reference asset — is terminal for
      // this slide only, under the shared reference_failure code.
      logger.warn(`[carouselSlideJob] reference failure slideId=${slideId}: ${shortError(error)}`);
      return await failAndRefundSlide({
        workspaceId, workItemId, slideId, userId: work.createdByUserId,
        errorCode: "reference_failure", reason: shortError(error), isAnchor: anchor,
      });
    }
    const normalizedReferenceImages = await normalizeReferenceBuffers(referenceImages);

    const prompt = buildCarouselSlidePrompt({
      slide: {
        slideId: deckSlideId(snapshot, claimed),
        position: claimed.position,
        role: claimed.role,
        purpose: deckSlidePurpose(snapshot, claimed),
        layoutFamily: claimed.layoutFamily,
      },
      deck: snapshot.deck,
      contract: snapshot.visualContract,
      factPack: work.inputSnapshot?.factPack ?? null,
      request: work.inputSnapshot?.request ?? work.request,
      references: referenceSlots,
      storyboard: snapshot.storyboard,
      generationScope: snapshot.generationScope,
      visualDirection: work.inputSnapshot?.visualDirection ?? null,
      // Pending visual-revision instruction persisted on the draft by the
      // revise path (manual or automatic); first generations carry none.
      revisionInstruction: resolveCarouselSlideRevisionInstruction(claimed.quality),
    });

    const request: GenerationRequest = {
      authorship: { workspaceId, userId: work.createdByUserId },
      origin: "quick_tool",
      surface: "quick_tool",
      intent: { mode: "social_post", objective: snapshot.deck.objective },
      identity: { clientProfileId: work.clientProfileId, referenceImages: normalizedReferenceImages, brandConstraints: null },
      format: { targetFormat: snapshot.deck.format, dimensions, constraints: null },
      source: {
        parentId: claimed.parentSlideId,
        sourceVersionId: claimed.parentSlideId,
        lineageId: claimed.lineageId,
        packageSource: "creative_work_carousel_slide",
      },
      prompt: { text: prompt },
      cost: { chargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput, refundPolicy: "default" },
      idempotency: { billingKey: carouselSlideBillingKey(workItemId, claimed.id), skipWhenOutputExists: true },
      destination: {
        kind: "creative_work_carousel_slide",
        id: claimed.id,
        storagePrefix: `creative-work/${workItemId}/carousel/slides/${claimed.id}`,
        workItemId,
      },
      executionPolicy: "direct",
      attempt: claimed.versionNumber - 1,
      renderPolicy: resolveImageRenderPolicy(work.inputSnapshot?.renderPolicy),
    };

    let generated;
    try {
      generated = await executeCanonicalGeneration(request, {
        telemetry: {
          workspaceId,
          workId: workItemId,
          jobType: "creative_work",
          inngestRunId: typeof input.runId === "string" ? input.runId : undefined,
          inngestAttempt: typeof input.attempt === "number" ? input.attempt : undefined,
        },
      });
    } catch (error) {
      logger.error(`[carouselSlideJob] provider call failed slideId=${slideId}`, error);
      return await failAndRefundSlide({
        workspaceId, workItemId, slideId, userId: work.createdByUserId,
        errorCode: "provider_failed", reason: shortError(error), isAnchor: anchor,
      });
    }

    // The untouched provider image stays at the executor's key.
    const providerBaseKey = generated.outputKey;
    const baseBuffer = generated.buffer;

    const baseMetadata = await sharp(baseBuffer).metadata().catch(() => null);
    if (!baseMetadata || !baseMetadata.width || !baseMetadata.height) {
      return await failAndRefundSlide({
        workspaceId, workItemId, slideId, userId: work.createdByUserId,
        errorCode: "provider_output_corrupt", reason: "provider base is not a decodable image", isAnchor: anchor,
      });
    }
    if (baseMetadata.width !== dimensions.width || baseMetadata.height !== dimensions.height) {
      return await failAndRefundSlide({
        workspaceId, workItemId, slideId, userId: work.createdByUserId,
        errorCode: "wrong_dimensions",
        reason: `expected ${dimensions.width}x${dimensions.height}, produced ${baseMetadata.width}x${baseMetadata.height}`,
        isAnchor: anchor,
      });
    }

    // Exact brand assets first, at their frozen slots — before any copy.
    let composedBase = baseBuffer;
    if (layoutPlan.exactAssetSlots.length > 0) {
      try {
        const layers = await Promise.all(
          layoutPlan.exactAssetSlots.map(async (slot) => {
            const assetBuffer = await objectStorage.get(slot.assetKey).catch(() => null);
            if (!assetBuffer) {
              throw new Error(`exact asset not found: ${slot.assetKey}`);
            }
            const resized = await sharp(assetBuffer)
              .resize(slot.width, slot.height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
              .png()
              .toBuffer();
            return { input: resized, left: slot.x, top: slot.y };
          }),
        );
        composedBase = await sharp(baseBuffer)
          .resize(dimensions.width, dimensions.height, { fit: "cover" })
          .composite(layers)
          .png()
          .toBuffer();
      } catch (error) {
        return await failAndRefundSlide({
          workspaceId, workItemId, slideId, userId: work.createdByUserId,
          errorCode: "exact_asset_missing", reason: shortError(error), isAnchor: anchor,
        });
      }
    }

    // Approved font or the Pango `sans` fallback — never a new font package.
    let font: BrandFontAsset | null = null;
    let fontBuffer: Buffer | null = null;
    let fallbackFamily: "sans" | null = null;
    if (snapshot.visualContract.typography.authority === "approved" && snapshot.visualContract.typography.fontAssetKey) {
      const approved = approvedBrandFontAssets(identitySnapshot?.brandKit.fontAssets ?? []);
      const selected = approved.find((asset) => asset.assetKey === snapshot.visualContract.typography.fontAssetKey);
      if (selected) {
        font = selected;
        fontBuffer = await objectStorage.get(selected.assetKey).catch(() => null);
        if (!fontBuffer) {
          return await failAndRefundSlide({
            workspaceId, workItemId, slideId, userId: work.createdByUserId,
            errorCode: "exact_asset_missing", reason: `approved font asset not found: ${selected.assetKey}`, isAnchor: anchor,
          });
        }
      } else {
        fallbackFamily = "sans";
      }
    } else {
      fallbackFamily = snapshot.visualContract.typography.fallbackFamily ?? "sans";
    }

    let composition;
    try {
      composition = await runCarouselTextComposition({
        base: composedBase,
        dimensions,
        primaryText: claimed.primaryText,
        secondaryText: claimed.secondaryText,
        primaryRegion: layoutPlan.primaryRegion,
        secondaryRegion: layoutPlan.secondaryRegion,
        safeAreaPx: snapshot.visualContract.safeAreaPx,
        font,
        fontBuffer,
        fallbackFamily,
        brandColors: identitySnapshot?.brandKit.colors ?? [],
      });
    } catch (error) {
      if (error instanceof TextCompositionError) {
        return await failAndRefundSlide({
          workspaceId, workItemId, slideId, userId: work.createdByUserId,
          errorCode: "copy_overflow", reason: `text composition failed: ${error.code}`, isAnchor: anchor,
        });
      }
      throw error;
    }

    const outputKey = `creative-work/${workItemId}/carousel/slides/${claimed.id}/final.png`;
    await objectStorage.put(outputKey, composition.buffer, "image/png");
    // No existing thumbnail helper produces a smaller artifact — the preview
    // equals the final output and no thumbnail pipeline is added.
    const previewKey = outputKey;

    // Shared tri-state objective QA over the FINAL composed image. Its
    // `fail` verdict is terminal — the legacy second objective-correction
    // image call is intentionally NOT made on this path.
    let assessment;
    try {
      assessment = await runCreativeWorkQualityAssessment({
        workItemId,
        outputId: claimed.id,
        attempt: Math.max(claimed.versionNumber, 1),
        imageBuffer: composition.buffer,
        expectedDimensions: dimensions,
        requiredReferenceRoles: referenceSlots.filter((slot) => slot.required).map((slot) => slot.role),
        attachedReferenceRoles: referenceSlots.map((slot) => slot.role),
        qa: {
          mode: "social_post",
          format: snapshot.deck.format,
          request: work.inputSnapshot?.request ?? work.request,
          copy: {
            headline: claimed.primaryText,
            body: claimed.secondaryText ?? "",
            cta: "",
          },
          factPack: work.inputSnapshot?.factPack ?? null,
          brandName: work.inputSnapshot?.factPack?.identity.brandName ?? null,
          references: referenceSlots.map((slot, index) => ({
            role: slot.role,
            label: slot.label,
            required: slot.required,
            buffer: referenceImages[index]?.buffer ?? Buffer.alloc(0),
            mimeType: slot.mimeType,
          })),
          locale: "pt-BR",
          // Plan 04, T4: request the same-call art critique only when the
          // snapshot carries an explicitly accepted refinement budget.
          ...(resolveCreativeWorkArtRefinement(work.inputSnapshot)
            ? { artCritique: { enabled: true } }
            : {}),
        },
        people: slidePersonPhotos,
        score: {
          imageBuffer: composition.buffer,
          mimeType: "image/png",
          campaign: {
            name: snapshot.deck.promise,
            client: work.inputSnapshot?.factPack?.identity.brandName ?? "",
            product: "",
            offer: "",
            objective: snapshot.deck.objective,
            audience: snapshot.deck.audience ?? "",
          },
          derivation: {
            ctaText: null,
            format: snapshot.deck.format,
            generationMode: "social_post",
            feedback: null,
          },
          locale: "pt-BR",
          contract: null,
        },
        telemetry: {
          workspaceId,
          workId: workItemId,
          jobType: "creative_work",
          inngestRunId: typeof input.runId === "string" ? input.runId : undefined,
          inngestAttempt: typeof input.attempt === "number" ? input.attempt : undefined,
        },
      });
    } catch (error) {
      logger.error(`[carouselSlideJob] quality assessment failed slideId=${slideId}`, error);
      return await failAndRefundSlide({
        workspaceId, workItemId, slideId, userId: work.createdByUserId,
        errorCode: "qa_failed", reason: shortError(error), isAnchor: anchor,
      });
    }

    if (assessment.objectiveVerdict === "fail") {
      return await failAndRefundSlide({
        workspaceId, workItemId, slideId, userId: work.createdByUserId,
        errorCode: "objective_failed",
        reason: `objective QA failed: ${assessment.quality.objectiveCodes.join(",") || "unknown"}`,
        isAnchor: anchor,
      });
    }

    const completed = await completeCarouselSlide({
      workspaceId,
      workItemId,
      slideId: claimed.id,
      providerBaseKey,
      outputKey,
      previewKey,
      quality: {
        ...assessment.quality,
        generationEvidence: {
          version: 1,
          observations: (generated.candidates ?? []).flatMap((candidate) =>
            candidate.observation ? [candidate.observation] : [],
          ),
          providerCalls: generated.providerCalls ?? null,
          providerRetries: generated.providerRetries ?? null,
          excludedCalls: generated.excludedCalls ?? [],
        },
      } as unknown as Record<string, unknown>,
    });
    if (!completed) {
      // Lost lease after a concurrent terminal transition: never double-settle.
      return { success: true, slideId, skipped: true };
    }

    // Plan 04, T4: automatic art refinement after a terminal validated
    // slide. Best-effort and isolated: the slide is already COMPLETED, so a
    // refinement failure must never reclassify it. Runs BEFORE the chain
    // continuation so an anchor revision supersedes its dependents before
    // they dispatch — never after they settle. Only budgeted works pay for
    // the lineage re-read; the coordinator re-validates everything
    // (calibration, root, critique, ceiling) against live rows.
    if (resolveCreativeWorkArtRefinement(work.inputSnapshot)) {
      try {
        const lineage = await listCarouselSlideLineage(workspaceId, workItemId, completed.lineageId);
        let rootSlideId = completed.id;
        let rootVersion = completed.versionNumber;
        for (const version of lineage) {
          if (version.versionNumber < rootVersion) {
            rootSlideId = version.id;
            rootVersion = version.versionNumber;
          }
        }
        const outcome = await refineCarouselSlide({
          workspaceId,
          workItemId,
          rootSlideId,
          completedSlideId: completed.id,
        });
        logger.info(
          `[carouselSlideJob] art-refinement slideId=${slideId} kind=${outcome.kind} reason=${outcome.reason}`,
        );
      } catch (refineError) {
        logger.warn(
          `[carouselSlideJob] art-refinement failed slideId=${slideId} (slide stays completed): ${refineError instanceof Error ? refineError.message : String(refineError)}`,
        );
      }
    }

    // Chain continuation exactly once per terminal transition.
    await dispatchNextCarouselStage({
      workspaceId,
      workItemId,
      userId: work.createdByUserId ?? "",
    }).catch((error) => {
      logger.warn(`[carouselSlideJob] chain continuation failed slideId=${slideId}`, error);
    });

    logger.info(`[carouselSlideJob] DONE slideId=${slideId} outputKey=${outputKey}`);
    return { success: true, slideId };
  } catch (error) {
    logger.error(`[carouselSlideJob] FAILED slideId=${slideId}`, error);
    return await failAndRefundSlide({
      workspaceId, workItemId, slideId, userId: work.createdByUserId,
      errorCode: "provider_failed", reason: shortError(error), isAnchor: anchor,
    });
  }
}

function deckSlidePurpose(
  snapshot: NonNullable<ReturnType<typeof resolveCarouselPreparedSnapshot>>,
  slide: CreativeWorkCarouselSlide,
): string {
  return snapshot.deck.slides.find((plan) => plan.position === slide.position)?.purpose ?? slide.role;
}

function deckSlideId(
  snapshot: NonNullable<ReturnType<typeof resolveCarouselPreparedSnapshot>>,
  slide: CreativeWorkCarouselSlide,
): string {
  return snapshot.deck.slides.find((plan) => plan.position === slide.position)?.slideId ?? slide.id;
}

/**
 * Interrupted-run recovery: marks the same slide failed and refunds it
 * idempotently. Repeated deliveries are duplicates at every layer.
 */
export async function runCreativeWorkCarouselSlideOnFailure(input: {
  event: CarouselSlideGenerateEvent;
  error: unknown;
}): Promise<void> {
  const { workspaceId, workItemId, slideId } = input.event;
  const aggregate = await getCreativeWork(workspaceId, workItemId).catch(() => null);
  const work = aggregate?.work ?? null;
  const snapshot = work ? resolveCarouselPreparedSnapshot(work.inputSnapshot) : null;
  const slides = await listCurrentCarouselSlides(workspaceId, workItemId).catch(() => []);
  const slide = slides.find((row) => row.id === slideId) ?? null;

  const failed = await failCarouselSlide({
    workspaceId,
    workItemId,
    slideId,
    errorCode: "generation_interrupted",
  }).catch((error) => {
    logger.error(`[carouselSlideJob] interrupted fail failed slideId=${slideId}`, error);
    return null;
  });
  if (!failed) return;

  await settleTerminalRefund({
    workspaceId,
    decision: decideCreativeWorkRefund({
      surface: "quick_tool",
      failurePhase: "terminal",
      workItemId,
      outputId: slideId,
    }),
    metadata: {
      creativeWorkId: workItemId,
      slideId,
      reason: input.error instanceof Error ? input.error.message : String(input.error),
      description: "creative_work_carousel_slide_interrupted_refund",
    },
    userId: work?.createdByUserId ?? undefined,
  }).catch((error) => {
    logger.error(`[carouselSlideJob] interrupted refund failed slideId=${slideId}`, error);
  });

  if (slide && snapshot && !isAnchorSlide(slide, snapshot)) {
    await dispatchNextCarouselStage({
      workspaceId,
      workItemId,
      userId: work?.createdByUserId ?? "",
    }).catch((error) => {
      logger.warn(`[carouselSlideJob] interrupted reconciliation failed slideId=${slideId}`, error);
    });
  }
}

const carouselSlideJobConfig: {
  id: string;
  retries: 0;
  concurrency: [{ limit: number; scope: "account"; key: string }];
  onFailure: (args: { event: { data: unknown }; error: unknown; step: CarouselSlideJobStep }) => Promise<void>;
} = {
    id: "generate-creative-work-carousel-slide",
    retries: 0 as const,
    // Carousel-specific account image key; v2 Creative Work uses key `"openai"` (limit 2).
    concurrency: [{ limit: 1, scope: "account" as const, key: `"creative-work-image"` }],
    onFailure: async ({ event, error, step }) => {
    const data = event.data as CarouselSlideGenerateEvent;
    await step.run("recover-interrupted-slide", async () => {
      await runCreativeWorkCarouselSlideOnFailure({ event: data, error });
    });
    logger.error(
      `[carouselSlideJob] INTERRUPTED slideId=${data.slideId} recovered=true`,
    );
  },
};

export const creativeWorkCarouselSlideJob = inngest.createFunction(
  {
    ...carouselSlideJobConfig,
    triggers: [{ event: "creative-work.carousel-slide.generate" }],
  },
  async ({ event, step }: { event: { data: unknown }; step: CarouselSlideJobStep }) =>
    step.run("generate-carousel-slide", () =>
      runCreativeWorkCarouselSlide({ event: event.data as CarouselSlideGenerateEvent }),
    ),
);

export function createCreativeWorkCarouselSlideJobV2(client: Inngest) {
  return client.createFunction(
    {
      ...carouselSlideJobConfig,
      id: "generate-creative-work-carousel-slide-v2",
      triggers: [{ event: "creative-work.carousel-slide.generate.v2" }],
    },
    async ({ event, step }: { event: { data: unknown }; step: CarouselSlideJobStep }) =>
      step.run("generate-carousel-slide", () =>
        runCreativeWorkCarouselSlide({ event: event.data as CarouselSlideGenerateEvent }),
      ),
  );
}
