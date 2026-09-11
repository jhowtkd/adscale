import "server-only";
import { logger } from "@/lib/logger";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import {
  carouselAnchorPositions,
  quoteCarouselUnits,
  resolveCarouselPreparedSnapshot,
} from "@/server/creative-work/carousel-contracts";
import {
  CarouselGenerationGateError,
  hasCurrentApprovedCarouselCover,
  readCarouselEditorial,
} from "@/server/creative-work/carousel-editorial-state";
import { checkSpend } from "@/server/billing/paywall";
import type { CreativeWorkCarouselSlide, CreativeWorkItem } from "@/server/db/schema";
import { carouselSlideBillingKey, carouselSlideSettlementAdapter } from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { getCreativeWork } from "@/server/repositories/creative-work";
import {
  confirmCarouselInteriorsRevision,
  listCurrentCarouselSlides,
  materializeCarouselSlides,
  refreshCarouselWorkStatus,
} from "@/server/repositories/creative-work-carousel";
import { dispatchNextCarouselStage } from "@/server/application/advance-carousel-generation";

function eligibleInteriorDraftCount(slides: CreativeWorkCarouselSlide[]): number {
  return slides.filter(
    (slide) => slide.position !== 1 && (slide.status === "draft" || slide.status === "failed"),
  ).length;
}

export type GenerateCarouselWorkInput = {
  workspaceId: string;
  workItemId: string;
  userId: string;
  preparedRevision: string;
  studioSessionId?: string;
  rolloutVariant?: StudioRolloutVariant;
};

export type GenerateCarouselWorkResult =
  | {
      ok: true;
      value: {
        work: CreativeWorkItem;
        carouselSlides: CreativeWorkCarouselSlide[];
        preparedRevision: string;
      };
    }
  | {
      ok: false;
      error: {
        code:
          | "work_not_found"
          | "work_not_carousel"
          | "stale_input"
          | "invalid_generation_gate"
          | "credit_blocked"
          | "dispatch_failed";
        details?: unknown;
      };
    };

/**
 * Confirms a prepared carousel stage from the frozen snapshot: cover settles
 * one image; interiors writes lote confirmation then continues the existing
 * anchor chain. Client-supplied scope never authorizes dispatch.
 */
export async function generateCarouselWork(
  input: GenerateCarouselWorkInput,
): Promise<GenerateCarouselWorkResult> {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate) return { ok: false, error: { code: "work_not_found" } };
  const { work } = aggregate;
  if (work.toolKind !== "carousel") {
    return {
      ok: false,
      error: { code: "work_not_carousel", details: { toolKind: work.toolKind } },
    };
  }
  const snapshot = resolveCarouselPreparedSnapshot(work.inputSnapshot);
  if (!snapshot || snapshot.preparedRevision !== input.preparedRevision) {
    return { ok: false, error: { code: "stale_input" } };
  }
  if (!snapshot.generationScope || !snapshot.scriptRevision) {
    return {
      ok: false,
      error: { code: "invalid_generation_gate", details: { reason: "legacy_snapshot_requires_prepare" } },
    };
  }

  const editorial = readCarouselEditorial(work.settings);
  if (snapshot.generationScope === "cover") {
    if (!editorial || editorial.approvedScriptRevision !== snapshot.scriptRevision) {
      return {
        ok: false,
        error: { code: "invalid_generation_gate", details: { reason: "script_not_approved" } },
      };
    }
    return confirmCoverGeneration(input, work, snapshot);
  }

  const coverSlideId = editorial?.approvedCover?.slideId ?? null;
  if (
    !editorial
    || !coverSlideId
    || !hasCurrentApprovedCarouselCover(
      editorial,
      snapshot.scriptRevision,
      snapshot.preparedRevision,
      coverSlideId,
    )
  ) {
    return {
      ok: false,
      error: { code: "invalid_generation_gate", details: { reason: "cover_not_approved" } },
    };
  }
  return confirmInteriorsGeneration(input, work, snapshot, coverSlideId);
}

async function confirmCoverGeneration(
  input: GenerateCarouselWorkInput,
  work: CreativeWorkItem,
  snapshot: NonNullable<ReturnType<typeof resolveCarouselPreparedSnapshot>>,
): Promise<GenerateCarouselWorkResult> {
  const quote = quoteCarouselUnits(1);
  const spendCheck = await checkSpend(input.workspaceId, "image_derivation", quote.credits);
  if (!spendCheck.allowed) {
    return { ok: false, error: { code: "credit_blocked", details: spendCheck } };
  }

  const slides = await materializeCarouselSlides({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    deck: snapshot.deck,
    visualContractHash: snapshot.visualContract.contractHash,
  });
  const firstAnchor = slides.find((slide) => slide.position === carouselAnchorPositions(snapshot.deck.slides.length)[0]);
  if (!firstAnchor) {
    return { ok: false, error: { code: "stale_input" } };
  }
  const isInitialClaim = firstAnchor.status === "draft";

  let settled: Awaited<ReturnType<typeof startGenerationSettlement>>;
  try {
    settled = await startGenerationSettlement(
      carouselSlideSettlementAdapter({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        slideId: firstAnchor.id,
        userId: input.userId,
        anchorKey: null,
        operationKey: carouselSlideBillingKey(input.workItemId, firstAnchor.id),
      }),
    );
  } catch (error) {
    if (error instanceof CarouselGenerationGateError) {
      return { ok: false, error: { code: "invalid_generation_gate", details: error.details } };
    }
    throw error;
  }
  if (!settled.ok) {
    if (settled.error.code === "credit_blocked") {
      return {
        ok: false,
        error: { code: "credit_blocked", details: settled.error.details },
      };
    }
    return { ok: false, error: { code: "dispatch_failed" } };
  }

  if (isInitialClaim) {
    void recordBetaAnalyticsEvent({
      workspaceId: input.workspaceId,
      userId: input.userId,
      eventKey: "generation_confirmed",
      source: "server",
      properties: {
        creativeWorkId: input.workItemId,
        protocol: "carousel",
        outputCount: 1,
        ...(input.studioSessionId ? { studioSessionId: input.studioSessionId } : {}),
        ...(input.rolloutVariant ? { rolloutVariant: input.rolloutVariant } : {}),
      },
    }).catch((error) =>
      logger.warn("[carousel] generation_confirmed telemetry failed", error),
    );
  }

  const refreshed = await refreshCarouselWorkStatus({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
  });

  return {
    ok: true,
    value: {
      work: refreshed ?? work,
      carouselSlides: slides,
      preparedRevision: snapshot.preparedRevision,
    },
  };
}

async function confirmInteriorsGeneration(
  input: GenerateCarouselWorkInput,
  work: CreativeWorkItem,
  snapshot: NonNullable<ReturnType<typeof resolveCarouselPreparedSnapshot>>,
  coverSlideId: string,
): Promise<GenerateCarouselWorkResult> {
  const slides = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
  if (slides.length === 0) {
    return { ok: false, error: { code: "stale_input" } };
  }
  const remaining = eligibleInteriorDraftCount(slides);
  const quote = quoteCarouselUnits(remaining);
  const spendCheck = await checkSpend(input.workspaceId, "image_derivation", quote.credits);
  if (!spendCheck.allowed) {
    return { ok: false, error: { code: "credit_blocked", details: spendCheck } };
  }

  const confirmed = await confirmCarouselInteriorsRevision({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    expectedUpdatedAt: work.updatedAt,
    preparedRevision: snapshot.preparedRevision,
    scriptRevision: snapshot.scriptRevision as string,
    coverSlideId,
  });
  if (!confirmed) {
    const latest = await getCreativeWork(input.workspaceId, input.workItemId);
    const latestEditorial = latest ? readCarouselEditorial(latest.work.settings) : null;
    if (
      latest
      && latestEditorial?.confirmedInteriorsRevision === snapshot.preparedRevision
      && hasCurrentApprovedCarouselCover(
        latestEditorial,
        snapshot.scriptRevision as string,
        snapshot.preparedRevision,
        coverSlideId,
      )
    ) {
      return finishInteriorsDispatch(input, latest.work, snapshot, slides, false);
    }
    return {
      ok: false,
      error: { code: "invalid_generation_gate", details: { reason: "interiors_confirmation_rejected" } },
    };
  }

  return finishInteriorsDispatch(input, confirmed, snapshot, slides, true);
}

async function finishInteriorsDispatch(
  input: GenerateCarouselWorkInput,
  work: CreativeWorkItem,
  snapshot: NonNullable<ReturnType<typeof resolveCarouselPreparedSnapshot>>,
  slides: CreativeWorkCarouselSlide[],
  recordConfirmation: boolean,
): Promise<GenerateCarouselWorkResult> {
  let dispatched: Awaited<ReturnType<typeof dispatchNextCarouselStage>>;
  try {
    dispatched = await dispatchNextCarouselStage({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      userId: input.userId,
    });
  } catch (error) {
    if (error instanceof CarouselGenerationGateError) {
      return { ok: false, error: { code: "invalid_generation_gate", details: error.details } };
    }
    throw error;
  }
  if (!dispatched.ok && dispatched.error.code !== "anchor_failed") {
    if (dispatched.error.code === "work_not_found") {
      return { ok: false, error: { code: "work_not_found" } };
    }
    if (dispatched.error.code === "stale_input") {
      return { ok: false, error: { code: "stale_input" } };
    }
    return { ok: false, error: { code: "dispatch_failed", details: dispatched.error } };
  }

  const remaining = eligibleInteriorDraftCount(slides);
  if (recordConfirmation && remaining > 0) {
    void recordBetaAnalyticsEvent({
      workspaceId: input.workspaceId,
      userId: input.userId,
      eventKey: "generation_confirmed",
      source: "server",
      properties: {
        creativeWorkId: input.workItemId,
        protocol: "carousel",
        outputCount: remaining,
        ...(input.studioSessionId ? { studioSessionId: input.studioSessionId } : {}),
        ...(input.rolloutVariant ? { rolloutVariant: input.rolloutVariant } : {}),
      },
    }).catch((error) =>
      logger.warn("[carousel] generation_confirmed telemetry failed", error),
    );
  }

  const refreshed = await refreshCarouselWorkStatus({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
  });
  const current = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);

  return {
    ok: true,
    value: {
      work: refreshed ?? (dispatched.ok ? dispatched.value.work : null) ?? work,
      carouselSlides: current,
      preparedRevision: snapshot.preparedRevision,
    },
  };
}
