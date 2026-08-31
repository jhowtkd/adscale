import "server-only";
import { logger } from "@/lib/logger";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import {
  carouselAnchorPositions,
  quoteCarouselDeck,
  resolveCarouselPreparedSnapshot,
} from "@/server/creative-work/carousel-contracts";
import { checkSpend } from "@/server/billing/paywall";
import type { CreativeWorkCarouselSlide, CreativeWorkItem } from "@/server/db/schema";
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import { carouselSlideBillingKey, carouselSlideSettlementAdapter } from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import {
  getCreativeWork,
} from "@/server/repositories/creative-work";
import {
  materializeCarouselSlides,
  refreshCarouselWorkStatus,
} from "@/server/repositories/creative-work-carousel";

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
          | "credit_blocked"
          | "dispatch_failed";
        details?: unknown;
      };
    };

/**
 * Confirms a prepared carousel deck: proves the workspace can cover the full
 * planned deck once (no total debit), materializes the frozen slide drafts
 * idempotently, and settles only the first anchor through its own one-unit
 * settlement. Every later slide is charged by its own dispatch.
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

  // Preflight only proves the balance at confirmation time; each slide is
  // debited by its own settlement when it is actually dispatched.
  const quote = quoteCarouselDeck(snapshot.deck.slides.length);
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

  const settled = await startGenerationSettlement(
    carouselSlideSettlementAdapter({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      slideId: firstAnchor.id,
      userId: input.userId,
      anchorKey: null,
      operationKey: carouselSlideBillingKey(input.workItemId, firstAnchor.id),
    }),
  );
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
        outputCount: snapshot.deck.slides.length,
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
