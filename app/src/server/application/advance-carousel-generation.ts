import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import {
  carouselAnchorPositions,
  resolveCarouselPreparedSnapshot,
  type CarouselDeckQualityV1,
} from "@/server/creative-work/carousel-contracts";
import {
  buildCarouselAnchorBoard,
  buildCarouselContactSheet,
  reviewCarouselSet,
} from "@/server/creative-work/carousel-visual";
import type { CreativeWorkCarouselSlide, CreativeWorkItem } from "@/server/db/schema";
import { creativeWorkItems } from "@/server/db/schema";
import { db } from "@/server/db";
import {
  carouselSlideBillingKey,
  carouselSlideSettlementAdapter,
} from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { getCreativeWork } from "@/server/repositories/creative-work";
import {
  listCurrentCarouselSlides,
  refreshCarouselWorkStatus,
  setRemainingCarouselAnchorKey,
} from "@/server/repositories/creative-work-carousel";
import { objectStorage } from "@/server/storage";

export type DispatchNextCarouselStageResult =
  | {
      ok: true;
      value: {
        dispatched: number;
        work: CreativeWorkItem | null;
        setReviewRecorded: boolean;
      };
    }
  | {
      ok: false;
      error: {
        code:
          | "work_not_found"
          | "work_not_carousel"
          | "stale_input"
          | "anchor_failed"
          | "dispatch_failed";
        details?: unknown;
      };
    };

/**
 * Deterministic continuation of the carousel chain: cover → ceil-middle →
 * closing → shared anchor board → remaining slides. Every call re-reads the
 * frozen snapshot and the current slides, dispatches at most the next missing
 * anchor through its own settlement, and — once every slide is terminal —
 * refreshes the aggregate and settles the set review exactly once.
 */
export async function dispatchNextCarouselStage(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
}): Promise<DispatchNextCarouselStageResult> {
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
  if (!snapshot) return { ok: false, error: { code: "stale_input" } };

  const slides = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
  const anchorPositions = carouselAnchorPositions(snapshot.deck.slides.length);
  const anchorSlides = anchorPositions
    .map((position) => slides.find((slide) => slide.position === position))
    .filter((slide): slide is CreativeWorkCarouselSlide => Boolean(slide));
  if (anchorSlides.length !== anchorPositions.length) {
    return { ok: false, error: { code: "stale_input" } };
  }
  const anchorPositionSet = new Set(anchorPositions);
  const nonAnchorSlides = slides.filter(
    (slide) => !anchorPositionSet.has(slide.position),
  );

  // The chain is strictly dependent: dispatch at most the next anchor, and
  // only when every prior anchor completed. Any anchor failure stops the chain.
  for (const anchor of anchorSlides) {
    if (anchor.status === "completed") continue;
    if (anchor.status === "failed") {
      await refreshCarouselWorkStatus({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
      }).catch(() => undefined);
      return {
        ok: false,
        error: {
          code: "anchor_failed",
          details: { slideId: anchor.id, position: anchor.position, errorCode: anchor.errorCode },
        },
      };
    }
    if (anchor.status === "draft") {
      const settled = await startGenerationSettlement(
        carouselSlideSettlementAdapter({
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          slideId: anchor.id,
          userId: input.userId,
          anchorKey: null,
          operationKey: carouselSlideBillingKey(input.workItemId, anchor.id),
        }),
      );
      if (!settled.ok) {
        return {
          ok: false,
          error: { code: "dispatch_failed", details: settled.error },
        };
      }
      return { ok: true, value: { dispatched: 1, work, setReviewRecorded: false } };
    }
    // queued/processing: the anchor is in flight.
    return { ok: true, value: { dispatched: 0, work, setReviewRecorded: false } };
  }

  // All three anchors completed: share the deterministic anchor board with
  // every remaining draft, then settle them in parallel. The board and its
  // key are deterministic; the queue CAS keeps duplicate sends impossible.
  const anchorBoardKey = `creative-work/${input.workItemId}/carousel/${snapshot.preparedRevision}/anchor-board.png`;
  const remainingDrafts = nonAnchorSlides.filter((slide) => slide.status === "draft");
  if (remainingDrafts.length > 0) {
    const anchorsWithBuffers = await Promise.all(
      anchorSlides.map(async (anchor) => ({
        position: anchor.position,
        buffer: await objectStorage.get(anchor.providerBaseKey as string),
      })),
    );
    const board = await buildCarouselAnchorBoard({ anchors: anchorsWithBuffers });
    await objectStorage.put(anchorBoardKey, board, "image/png");
    await setRemainingCarouselAnchorKey({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      slideIds: remainingDrafts.map((slide) => slide.id),
      anchorKey: anchorBoardKey,
    });
  }
  const results = await Promise.allSettled(
    remainingDrafts.map((slide) =>
      startGenerationSettlement(
        carouselSlideSettlementAdapter({
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          slideId: slide.id,
          userId: input.userId,
          anchorKey: anchorBoardKey,
          operationKey: carouselSlideBillingKey(input.workItemId, slide.id),
        }),
      ),
    ),
  );
  const dispatched = results.filter(
    (result) => result.status === "fulfilled" && result.value.ok,
  ).length;

  const current = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
  let refreshed: CreativeWorkItem | null = null;
  let setReviewRecorded = false;
  if (current.length > 0 && current.every((slide) => slide.status === "completed")) {
    refreshed = await refreshCarouselWorkStatus({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
    }).catch(() => null);
    setReviewRecorded = await recordCarouselSetReviewOnce({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      userId: input.userId,
      alreadyRecorded: work.carouselQuality != null,
      snapshot,
      slides: current,
    }).catch((error) => {
      logger.warn("[carousel] set review persistence failed", error);
      return false;
    });
  } else if (
    current.length > 0 &&
    current.every((slide) => slide.status === "completed" || slide.status === "failed")
  ) {
    refreshed = await refreshCarouselWorkStatus({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
    }).catch(() => null);
  }

  return { ok: true, value: { dispatched, work: refreshed ?? work, setReviewRecorded } };
}

/**
 * Advisory set review persisted exactly once: the conditional update on
 * `carousel_quality IS NULL` is the CAS, and only the winning caller records
 * the deck-level output_ready analytics event. Advisory failures and replayed
 * calls never emit a second event and never fail a slide.
 */
async function recordCarouselSetReviewOnce(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
  alreadyRecorded: boolean;
  snapshot: NonNullable<ReturnType<typeof resolveCarouselPreparedSnapshot>>;
  slides: CreativeWorkCarouselSlide[];
}): Promise<boolean> {
  if (input.alreadyRecorded) return false;
  const contactSheetKey = `creative-work/${input.workItemId}/carousel/${input.snapshot.preparedRevision}/contact-sheet.png`;
  const buffers = await Promise.all(
    input.slides.map((slide) => objectStorage.get(slide.outputKey as string)),
  );
  const contactSheet = await buildCarouselContactSheet({
    slides: input.slides.map((slide, index) => ({
      position: slide.position,
      buffer: buffers[index],
    })),
  });
  await objectStorage.put(contactSheetKey, contactSheet, "image/png");
  const advisoryWarnings = await reviewCarouselSet({
    contactSheet,
    deck: input.snapshot.deck,
    contract: input.snapshot.visualContract,
  });
  const quality: CarouselDeckQualityV1 = {
    version: 1,
    objectivePassed: input.slides.every(
      (slide) =>
        (slide.quality as { objectivePassed?: unknown } | null)?.objectivePassed !== false,
    ),
    advisoryWarnings,
    contactSheetKey,
    reviewedAt: new Date().toISOString(),
  };
  const [row] = await db
    .update(creativeWorkItems)
    .set({ carouselQuality: quality, updatedAt: new Date() })
    .where(
      and(
        eq(creativeWorkItems.workspaceId, input.workspaceId),
        eq(creativeWorkItems.id, input.workItemId),
        isNull(creativeWorkItems.carouselQuality),
      ),
    )
    .returning();
  if (!row) return false;
  void recordBetaAnalyticsEvent({
    workspaceId: input.workspaceId,
    userId: input.userId,
    eventKey: "output_ready",
    source: "server",
    properties: {
      creativeWorkId: input.workItemId,
      protocol: "carousel",
      outputCount: input.slides.length,
    },
  }).catch((error) =>
    logger.warn("[carousel] output_ready telemetry failed", error),
  );
  return true;
}
