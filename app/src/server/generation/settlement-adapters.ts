import { settlementDeadline } from "./settlement-wait";
import { GOAL_CREATIVE_LEVELS } from "@/lib/assistant/goal";
import { logger } from "@/lib/logger";
import { getTargetDimensions } from "@/lib/formats";
import {
  recordUsage,
  type CreditAction,
} from "@/server/billing/credits";
import { spend, type SpendResult } from "@/server/billing/paywall";
import type { CreativeWorkOutputPlan } from "@/server/creative-work/contracts";
import type { CreativeWorkOrigin } from "@/server/creative-work/funnel-events";
import {
  carouselAnchorPositions,
  resolveCarouselPreparedSnapshot,
} from "@/server/creative-work/carousel-contracts";
import { CarouselGenerationGateError } from "@/server/creative-work/carousel-editorial-state";
import {
  chargeForGeneration,
  chargeForGenerationBatch,
} from "@/server/generation/canonical/charge";
import {
  GENERATION_CREDIT_COSTS,
  type GenerationBatchCharge,
  type GenerationMode,
  type GenerationRequest,
  type GenerationSurface,
} from "@/server/generation/canonical/types";
import {
  creativeWorkCompensatoryRefundIdempotencyKey,
  creativeWorkLegacyTerminalReactivationIdempotencyKey,
  creativeWorkLegacyTerminalReactivationRefundIdempotencyKey,
  creativeWorkTerminalRefundIdempotencyKey,
  creativeWorkTerminalReactivationIdempotencyKey,
  creativeWorkTerminalReactivationRefundIdempotencyKey,
} from "@/server/generation/canonical/policies";
import {
  CAROUSEL_SLIDE_GENERATE_EVENT,
  heavyImageEventName,
} from "@/server/jobs/heavy-image-events";
import {
  logCreativeWorkGenerationAggregate,
  logCreativeWorkGenerationLifecycle,
  logCreativeWorkOutputTerminal,
} from "@/server/creative-work/job-telemetry";
import {
  attachDiagnosticEnvelope,
  diagnosticContextForDispatch,
  type DispatchWorkIdentity,
} from "@/server/diagnostics/envelope";
import { inngest } from "@/server/jobs/client";
import { updateCampaign } from "@/server/repositories/campaign";
import {
  createCreativeWorkRevision,
  deleteQueuedCreativeWorkOutputs,
  failQueuedCreativeWorkOutput,
  getCreativeWork,
  recordCreativeWorkGenerationAggregate,
  refreshCreativeWorkStatus,
  setCreativeWorkStatus,
} from "@/server/repositories/creative-work";
import {
  createDerivation,
  createPackageChildIfAbsent,
  deleteQueuedDerivation,
  failQueuedDerivation,
  getDerivationById,
  getDerivationsByIds,
  getLatestFormatAdaptationChild,
  touchQueuedDerivation,
} from "@/server/repositories/derivation";
import {
  listCurrentCarouselSlides,
  queueAuthorizedCarouselSlide,
} from "@/server/repositories/creative-work-carousel";
import type { CreativeWorkCarouselSlide } from "@/server/db/schema";
import {
  getUsageByIdempotencyKey,
  getUsageByIdempotencyKeys,
  trackUsage,
} from "@/server/repositories/usage";
import type {
  GenerationSettlementAdapter,
  GenerationSettlementChargeResult,
  GenerationSettlementReservation,
} from "./settlement";

const SETTLEMENT_POLL_ATTEMPTS = 10;

type CreativeWork = NonNullable<
  Awaited<ReturnType<typeof getCreativeWork>>
>["work"];
type CreativeWorkOutputs = NonNullable<
  Awaited<ReturnType<typeof getCreativeWork>>
>["outputs"];

export type CreativeWorkSettlementValue = {
  work: CreativeWork;
  outputs: CreativeWorkOutputs;
};

type CreativeWorkReservation =
  GenerationSettlementReservation<CreativeWorkSettlementValue> & {
    newlyCreatedIds: string[];
  };

function toSettlementCharge(
  spend: SpendResult,
): GenerationSettlementChargeResult {
  return spend.ok
    ? spend
    : {
        ok: false,
        reason: spend.conversionPayload.reason,
        details: spend.conversionPayload,
      };
}

function dispatchAckKey(billingKey: string) {
  return `${billingKey}:dispatch-ack`;
}

function creativeWorkGenerateEventId(outputId: string) {
  return `creative-work-generate:${outputId}`;
}

function formatAdaptationEventId(derivationId: string) {
  return `format-adaptation:${derivationId}`;
}

function creativeWorkRevisionEventId(outputId: string) {
  return `creative-work-revision:${outputId}`;
}

async function recordDispatchAck(
  workspaceId: string,
  metadata: Record<string, unknown>,
  ackKey: string,
) {
  try {
    await trackUsage(
      workspaceId,
      "generation_dispatch_ack",
      0,
      metadata,
      ackKey,
    );
  } catch (error) {
    // Dispatch already left the process. Losing the ack must not convert a
    // successful settlement into an untyped exception or force a refunding join.
    logger.error(
      `[generation-settlement] dispatch ack failed key=${ackKey}`,
      error,
    );
  }
}

function settlementDispatchMetadata(metadata: unknown) {
  const value = metadata as
    | {
        settlementDispatchAckRequired?: unknown;
        settlementDispatchAckKey?: unknown;
      }
    | null
    | undefined;
  return {
    required: value?.settlementDispatchAckRequired === true,
    key:
      typeof value?.settlementDispatchAckKey === "string"
        ? value.settlementDispatchAckKey
        : null,
  };
}

function creativeWorkDispatchRefunds(
  input: { workspaceId: string; workItemId: string; userId: string },
  outputs: Array<{ id: string }>,
) {
  return outputs.map((output) => ({
    workspaceId: input.workspaceId,
    action: "image_derivation" as const,
    idempotencyKey: `creative-work:${input.workItemId}:output:${output.id}:dispatch-refund`,
    amount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
    metadata: {
      creativeWorkId: input.workItemId,
      outputId: output.id,
      description: "creative_work_dispatch_refund",
    },
    userId: input.userId,
  }));
}

function creativeWorkDispatchRefundKey(workItemId: string, outputId: string) {
  return `creative-work:${workItemId}:output:${outputId}:dispatch-refund`;
}

async function emitCreativeWorkDispatchFailureTelemetry(input: {
  workspaceId: string;
  workItemId: string;
  outputIds: string[];
  generationCorrelationId: string;
  refunded: boolean;
}): Promise<void> {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  const outputs = (aggregate?.outputs ?? []).filter(
    (output) => output.generationCorrelationId === input.generationCorrelationId,
  );
  const scopedOutputs = outputs.length > 0
    ? outputs
    : (aggregate?.outputs ?? []).filter((output) => input.outputIds.includes(output.id));
  const unitCount = scopedOutputs.length || input.outputIds.length;
  const activeUnitCount = scopedOutputs.filter((output) => output.status === "processing").length;
  for (const outputId of input.outputIds) {
    const output = scopedOutputs.find((candidate) => candidate.id === outputId);
    logCreativeWorkOutputTerminal({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      outputId,
      generationCorrelationId: input.generationCorrelationId,
      protocol: "unknown",
      imageCallCount: output?.imageCallCount ?? 0,
      retryCount: output?.retryCount ?? 0,
      unitCount,
      activeUnitCount,
      environment: process.env.RENDER_SERVICE_NAME ?? process.env.NODE_ENV ?? "unknown",
      outcome: "failed",
      failureCode: "dispatch_failed",
      refunded: input.refunded,
      durationMs: 0,
    });
  }
  const generation = await recordCreativeWorkGenerationAggregate(
    input.workspaceId,
    input.workItemId,
    input.generationCorrelationId,
  );
  if (!generation) return;
  const fields = {
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    generationCorrelationId: generation.generationCorrelationId,
    unitCount: generation.unitCount,
    terminalCount: generation.terminalCount,
    successCount: generation.successCount,
    failureCount: generation.failureCount,
    result: generation.result,
    firstTerminalAt: generation.firstTerminalAt,
    completedAt: generation.completedAt,
    timeToFirstOutputMs: generation.timeToFirstOutputMs,
    totalDurationMs: generation.totalDurationMs,
  } as const;
  if (generation.firstTerminalEmitted) {
    logCreativeWorkGenerationAggregate({ phase: "first_terminal", ...fields });
  }
  if (generation.completionEmitted) {
    logCreativeWorkGenerationAggregate({ phase: "completed", ...fields });
  }
}

async function dispatchCreativeWorkOutputs(input: {
  workspaceId: string;
  workItemId: string;
  generationCorrelationId: string;
  outputIds: string[];
  result: "sent" | "recovered";
  /**
   * Server-validated work identity for the diagnostic envelope (trace-386).
   * Envelope only — never read for settlement decisions or effects.
   */
  work?: DispatchWorkIdentity | null;
}) {
  const started = performance.now();
  try {
    await inngest.send(
      input.outputIds.map((outputId) => ({
        id: creativeWorkGenerateEventId(outputId),
        name: heavyImageEventName("creative-work.generate"),
        data: attachDiagnosticEnvelope(
          {
            workspaceId: input.workspaceId,
            workItemId: input.workItemId,
            outputId,
            generationCorrelationId: input.generationCorrelationId,
          },
          diagnosticContextForDispatch({
            workspaceId: input.workspaceId,
            workItemId: input.workItemId,
            outputId,
            generationCorrelationId: input.generationCorrelationId,
            work: input.work,
            synthesize: true,
          }),
        ),
      })),
    );
    logCreativeWorkGenerationLifecycle({
      event: "creative_work_generation_dispatched",
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      generationCorrelationId: input.generationCorrelationId,
      unitCount: input.outputIds.length,
      outputIds: input.outputIds,
      dispatchDurationMs: Math.round(performance.now() - started),
      result: input.result,
    });
  } catch (error) {
    logCreativeWorkGenerationLifecycle({
      event: "creative_work_generation_dispatched",
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      generationCorrelationId: input.generationCorrelationId,
      unitCount: input.outputIds.length,
      outputIds: input.outputIds,
      dispatchDurationMs: Math.round(performance.now() - started),
      result: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function dispatchCreativeWorkRevision(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  generationCorrelationId: string;
  result: "sent" | "recovered";
}) {
  const started = performance.now();
  try {
    await inngest.send({
      id: creativeWorkRevisionEventId(input.outputId),
      name: heavyImageEventName("creative-work.generate"),
      // Ambient only (trace-386): the revise command scopes a fresh
      // single-operation context around settlement; without one the legacy
      // shape is preserved. Envelope only — never a settlement input.
      data: attachDiagnosticEnvelope(
        {
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          outputId: input.outputId,
          generationCorrelationId: input.generationCorrelationId,
        },
        diagnosticContextForDispatch({
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          outputId: input.outputId,
          generationCorrelationId: input.generationCorrelationId,
          synthesize: false,
        }),
      ),
    });
    logCreativeWorkGenerationLifecycle({
      event: "creative_work_generation_dispatched",
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      generationCorrelationId: input.generationCorrelationId,
      unitCount: 1,
      outputIds: [input.outputId],
      dispatchDurationMs: Math.round(performance.now() - started),
      result: input.result,
    });
  } catch (error) {
    logCreativeWorkGenerationLifecycle({
      event: "creative_work_generation_dispatched",
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      generationCorrelationId: input.generationCorrelationId,
      unitCount: 1,
      outputIds: [input.outputId],
      dispatchDurationMs: Math.round(performance.now() - started),
      result: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function creativeWorkSettlementAdapter(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
  readyWork: CreativeWork;
  plans: CreativeWorkOutputPlan[];
  batch: GenerationBatchCharge;
  existing?: CreativeWorkSettlementValue;
  /** Atomically validates a frozen retry and claims outputs under its work lock. */
  reserveReadyWork?: () => Promise<{ work: CreativeWork; outputs: CreativeWorkOutputs; newlyCreatedIds: string[] } | null>;
}): GenerationSettlementAdapter<
  CreativeWorkSettlementValue,
  CreativeWorkReservation
> {
  return {
    async reserve() {
      if (input.existing) {
        return {
          claimed: false,
          value: input.existing,
          newlyCreatedIds: [],
        };
      }
      if (input.reserveReadyWork) {
        const reserved = await input.reserveReadyWork();
        if (!reserved) throw Object.assign(new Error("creative_work_stale_reservation"), { code: "stale_input" });
        return {
          claimed: reserved.newlyCreatedIds.length > 0,
          value: { work: reserved.work, outputs: reserved.outputs },
          newlyCreatedIds: reserved.newlyCreatedIds,
        };
      }
      throw Object.assign(new Error("creative_work_missing_atomic_reservation"), { code: "stale_input" });
    },
    async join() {
      let lastAggregate: Awaited<ReturnType<typeof getCreativeWork>> = null;
      let missingRequiredAck = false;
      let chargeUsage: Awaited<ReturnType<typeof getUsageByIdempotencyKey>> | null = null;
      const deadline = settlementDeadline({ maxAttempts: SETTLEMENT_POLL_ATTEMPTS, maxMs: 10_000 });
      for (let attempt = 0; deadline.shouldContinue(attempt); attempt += 1) {
        const aggregate = await deadline.read(() => getCreativeWork(input.workspaceId, input.workItemId, undefined, { includeSources: false }));
        if (!aggregate?.outputs.length) return null;
        lastAggregate = aggregate;
        chargeUsage ??= await deadline.read(() => getUsageByIdempotencyKey(
          input.workspaceId,
          input.batch.billingKey,
        ));
        const ack = settlementDispatchMetadata(chargeUsage?.metadata);
        missingRequiredAck =
          ack.required &&
          (!ack.key ||
            !(await deadline.read(() => getUsageByIdempotencyKey(input.workspaceId, ack.key!))));
        const failed = aggregate.outputs.filter(
          (output) => output.failureCode === "dispatch_failed",
        );
        const refundUsages = await deadline.read(() => getUsageByIdempotencyKeys(
          input.workspaceId,
          aggregate.outputs.map((output) => creativeWorkDispatchRefundKey(input.workItemId, output.id)),
        ));
        const hasRecordedRefund = [...refundUsages.values()].some((usage) => usage != null);
        if (failed.length > 0 || hasRecordedRefund) {
          return {
            status: "dispatch_failed",
            failure: {
              value: { work: aggregate.work, outputs: aggregate.outputs },
              refunds: creativeWorkDispatchRefunds(input, aggregate.outputs),
              resumeAfterCompensation: Boolean(input.existing),
            },
          };
        }
        if (ack.required) {
          if (!missingRequiredAck) {
            const work =
              aggregate.outputs.every((output) => output.status === "queued")
                ? ((await setCreativeWorkStatus(
                    input.workspaceId,
                    input.workItemId,
                    "generating",
                  )) ?? aggregate.work)
                : aggregate.work;
            return {
              status: "settled",
              value: { work, outputs: aggregate.outputs },
            };
          }
          await deadline.pause();
          continue;
        }
        if (
          aggregate.work.status === "generating" ||
          aggregate.outputs.some((output) => output.status !== "queued")
        ) {
          return {
            status: "settled",
            value: { work: aggregate.work, outputs: aggregate.outputs },
          };
        }
        await deadline.pause();
      }
      // Missing ack is not proof of dispatch. Resume idempotent send for still-
      // queued rows, then write ack and settle. Already-progressed rows settle.
      if (lastAggregate) {
        const recordedAck = settlementDispatchMetadata(chargeUsage?.metadata);
        if (!chargeUsage || (recordedAck.required && !recordedAck.key)) {
          throw new Error("generation_settlement_dispatch_uncertain");
        }
        const queuedIds = lastAggregate.outputs
          .filter((output) => output.status === "queued")
          .map((output) => output.id);
        if (queuedIds.length > 0) {
          try {
            await dispatchCreativeWorkOutputs({
              workspaceId: input.workspaceId,
              workItemId: input.workItemId,
              generationCorrelationId: lastAggregate.work.generationCorrelationId,
              outputIds: queuedIds,
              result: "recovered",
              work: lastAggregate.work,
            });
          } catch (error) {
            // Ambiguous vs an earlier accepted send. Leave rows queued and do
            // not refund — the next replay can resume again.
            logger.error(
              `[generation-settlement] batch recovery dispatch uncertain workItemId=${input.workItemId}`,
              error,
            );
            throw new Error("generation_settlement_dispatch_uncertain");
          }
        }
        await recordDispatchAck(
          input.workspaceId,
          {
            creativeWorkId: input.workItemId,
            generationCorrelationId: lastAggregate.work.generationCorrelationId,
            outputIds: lastAggregate.outputs.map((output) => output.id),
          },
          dispatchAckKey(input.batch.billingKey),
        );
        const work =
          (await setCreativeWorkStatus(
            input.workspaceId,
            input.workItemId,
            "generating",
          )) ?? lastAggregate.work;
        return {
          status: "settled",
          value: { work, outputs: lastAggregate.outputs },
        };
      }
      throw new Error("generation_settlement_join_timeout");
    },
    async charge() {
      const ackKey = dispatchAckKey(input.batch.billingKey);
      const spend = await chargeForGenerationBatch(input.batch, {
        returnPath: `/quick-tools/create-post?workId=${input.workItemId}`,
        metadata: {
          creativeWorkId: input.workItemId,
          settlementDispatchAckRequired: true,
          settlementDispatchAckKey: ackKey,
        },
      });
      return toSettlementCharge(spend);
    },
    release: (reservation) =>
      deleteQueuedCreativeWorkOutputs(
        input.workspaceId,
        input.workItemId,
        reservation.newlyCreatedIds,
      ),
    async dispatch(reservation) {
      await dispatchCreativeWorkOutputs({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        generationCorrelationId: reservation.value.work.generationCorrelationId,
        outputIds: reservation.newlyCreatedIds,
        result: "sent",
        work: reservation.value.work,
      });
    },
    async failDispatch(reservation) {
      const failedOutputIds = (await Promise.all(
        reservation.newlyCreatedIds.map(async (outputId) => {
          try {
            const failed = await failQueuedCreativeWorkOutput(
              input.workspaceId,
              input.workItemId,
              outputId,
              "dispatch_failed",
            );
            return failed ? outputId : null;
          } catch {
            return null;
          }
        }),
      )).filter((outputId): outputId is string => outputId !== null);
      await refreshCreativeWorkStatus(
        input.workspaceId,
        input.workItemId,
      ).catch(() => undefined);
      return {
        value: reservation.value,
        refunds: creativeWorkDispatchRefunds(
          input,
          reservation.newlyCreatedIds.map((id) => ({ id })),
        ),
          onCompensated: ({ compensated }) =>
            emitCreativeWorkDispatchFailureTelemetry({
              workspaceId: input.workspaceId,
              workItemId: input.workItemId,
              outputIds: failedOutputIds,
              generationCorrelationId: reservation.value.work.generationCorrelationId,
              refunded: compensated,
            }),
      };
    },
    async completeDispatch(reservation) {
      await recordDispatchAck(
        input.workspaceId,
        {
          creativeWorkId: input.workItemId,
          generationCorrelationId: input.readyWork.generationCorrelationId,
          outputIds: reservation.newlyCreatedIds,
        },
        dispatchAckKey(input.batch.billingKey),
      );
      const work =
        (await setCreativeWorkStatus(
          input.workspaceId,
          input.workItemId,
          "generating",
        )) ?? input.readyWork;
      return { work, outputs: reservation.value.outputs };
    },
  };
}

/** Per-slide billing key: one charge, one refund and one event id per slide. */
export function carouselSlideBillingKey(workItemId: string, slideId: string) {
  return `creative-work:${workItemId}:carousel-slide:${slideId}:generate`;
}

function carouselSlideDispatchRefund(
  input: { workspaceId: string; workItemId: string; userId: string },
  slideId: string,
) {
  return {
    workspaceId: input.workspaceId,
    action: "image_derivation" as const,
    idempotencyKey: `${carouselSlideBillingKey(input.workItemId, slideId)}:dispatch-refund`,
    amount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
    metadata: {
      creativeWorkId: input.workItemId,
      slideId,
      description: "creative_work_carousel_slide_dispatch_refund",
    },
    userId: input.userId,
  };
}

export type CarouselSlideSettlementValue = {
  slide: CreativeWorkCarouselSlide;
};

type CarouselSlideReservation =
  GenerationSettlementReservation<CarouselSlideSettlementValue>;

/**
 * One-unit settlement for a single carousel slide. Reserve claims the row
 * through the `draft|failed → queued` CAS (so the idempotent queue prevents
 * duplicate sends), charge debits exactly one `image_derivation` unit under
 * the per-slide billing key, and dispatch sends one Inngest event whose id is
 * derived from the same key. Only the claimed slide is refunded when the
 * dispatch fails; a queued row that no charge owns is taken over idempotently
 * by the next replay instead of stranding the deck.
 */
export function carouselSlideSettlementAdapter(input: {
  workspaceId: string;
  workItemId: string;
  slideId: string;
  userId: string;
  /** Shared anchor-board key; null is reserved for the three anchor slides. */
  anchorKey: string | null;
  operationKey: string;
}): GenerationSettlementAdapter<CarouselSlideSettlementValue> {
  const billingKeyFor = (slideId: string) =>
    carouselSlideBillingKey(input.workItemId, slideId);
  const ackKeyFor = (slideId: string) => dispatchAckKey(billingKeyFor(slideId));

  async function currentSlide(slideId: string) {
    const slides = await listCurrentCarouselSlides(
      input.workspaceId,
      input.workItemId,
    );
    return slides.find((row) => row.id === slideId) ?? null;
  }

  /** Queueing without a shared anchor is reserved for the anchor positions. */
  async function assertAnchorKeyPolicy(slide: CreativeWorkCarouselSlide) {
    if (input.anchorKey !== null) return;
    const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
    const snapshot = resolveCarouselPreparedSnapshot(
      aggregate?.work.inputSnapshot ?? null,
    );
    if (!snapshot) throw new Error("carousel_prepared_snapshot_missing");
    if (!carouselAnchorPositions(snapshot.deck.slides.length).includes(slide.position)) {
      throw new Error("carousel_slide_missing_anchor_key");
    }
  }

  async function dispatchCarouselSlideEvent(slide: CreativeWorkCarouselSlide) {
    await inngest.send({
      id: `${billingKeyFor(slide.id)}:dispatch`,
      name: heavyImageEventName(CAROUSEL_SLIDE_GENERATE_EVENT),
      data: {
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        slideId: slide.id,
        position: slide.position,
        anchorKey: input.anchorKey,
        triggeredByUserId: input.userId,
      },
    });
  }

  return {
    async reserve() {
      const existing = await currentSlide(input.slideId);
      if (!existing) throw new Error("carousel_slide_missing_for_settlement");
      await assertAnchorKeyPolicy(existing);
      const queued = await queueAuthorizedCarouselSlide({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        slideId: input.slideId,
        anchorKey: input.anchorKey,
        operationKey: input.operationKey,
      });
      if (queued.outcome === "claimed") return { claimed: true, value: { slide: queued.slide } };
      if (queued.outcome === "already_claimed") {
        return { claimed: false, value: { slide: queued.slide } };
      }
      if (queued.outcome === "unauthorized") {
        throw new CarouselGenerationGateError({
          slideId: input.slideId,
          reason: "carousel_generation_gate",
        });
      }
      throw new Error("carousel_slide_missing_for_settlement");
    },
    async join(reservation) {
      const refund = carouselSlideDispatchRefund(input, input.slideId);
      let slide = reservation.value.slide;
      let chargeUsage: Awaited<ReturnType<typeof getUsageByIdempotencyKey>> | null = null;
      const deadline = settlementDeadline({ maxAttempts: SETTLEMENT_POLL_ATTEMPTS, maxMs: 10_000 });
      for (let attempt = 0; deadline.shouldContinue(attempt); attempt += 1) {
        if (slide.status === "completed" || slide.status === "processing") {
          return { status: "settled" as const, value: { slide } };
        }
        if (slide.status === "failed") {
          return {
            status: "dispatch_failed" as const,
            failure: { value: { slide }, refunds: [refund] },
          };
        }
        chargeUsage ??= await deadline.read(() => getUsageByIdempotencyKey(
          input.workspaceId,
          billingKeyFor(slide.id),
        ));
        const recordedRefund = await deadline.read(() => getUsageByIdempotencyKey(
          input.workspaceId,
          refund.idempotencyKey,
        ));
        if (recordedRefund) {
          return {
            status: "dispatch_failed" as const,
            failure: { value: { slide }, refunds: [refund] },
          };
        }
        if (!chargeUsage) {
          // No charge owns the queued row (a pre-provider failure left it
          // behind). Take the dispatch over idempotently: the per-slide
          // billing key and stable event id make this safe under races.
          break;
        }
        const ack = settlementDispatchMetadata(chargeUsage.metadata);
        if (ack.required) {
          const recordedAck =
            ack.key &&
            (await deadline.read(() => getUsageByIdempotencyKey(input.workspaceId, ack.key!)));
          if (recordedAck) {
            return { status: "settled" as const, value: { slide } };
          }
        }
        await deadline.pause();
        slide = (await deadline.read(() => currentSlide(input.slideId))) ?? slide;
      }
      // Takeover/recovery: re-authorize the current revision before spend or
      // send. Invalidation after the original claim must not dispatch.
      const recoveryAck = settlementDispatchMetadata(chargeUsage?.metadata);
      if (recoveryAck.required && !recoveryAck.key) {
        throw new Error("generation_settlement_dispatch_uncertain");
      }
      const reauthorized = await queueAuthorizedCarouselSlide({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        slideId: input.slideId,
        anchorKey: input.anchorKey,
        operationKey: input.operationKey,
      });
      if (reauthorized.outcome !== "already_claimed" && reauthorized.outcome !== "claimed") {
        throw new CarouselGenerationGateError({
          slideId: input.slideId,
          reason: "carousel_generation_gate",
        });
      }
      slide = reauthorized.slide;
      const spendResult = await spend({
        workspaceId: input.workspaceId,
        action: "image_derivation",
        idempotencyKey: billingKeyFor(slide.id),
        amount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
        metadata: {
          creativeWorkId: input.workItemId,
          slideId: slide.id,
          chargeKind: "unit",
          destinationKind: "creative_work_carousel_slide",
          recovery: true,
        },
        userId: input.userId,
      });
      if (!spendResult.ok) {
        return {
          status: "dispatch_failed" as const,
          failure: { value: { slide }, refunds: [] },
        };
      }
      try {
        await dispatchCarouselSlideEvent(slide);
      } catch (error) {
        logger.error(
          `[generation-settlement] carousel takeover dispatch uncertain slideId=${slide.id}`,
          error,
        );
        throw new Error("generation_settlement_dispatch_uncertain");
      }
      await recordDispatchAck(
        input.workspaceId,
        {
          creativeWorkId: input.workItemId,
          slideId: slide.id,
          recovery: true,
        },
        ackKeyFor(slide.id),
      );
      return { status: "settled" as const, value: { slide } };
    },
    async charge(reservation) {
      const slide = reservation.value.slide;
      const spendResult = await spend({
        workspaceId: input.workspaceId,
        action: "image_derivation",
        idempotencyKey: billingKeyFor(slide.id),
        amount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
        metadata: {
          creativeWorkId: input.workItemId,
          slideId: slide.id,
          position: slide.position,
          chargeKind: "unit",
          destinationKind: "creative_work_carousel_slide",
          settlementDispatchAckRequired: true,
          settlementDispatchAckKey: ackKeyFor(slide.id),
        },
        userId: input.userId,
      });
      return toSettlementCharge(spendResult);
    },
    async resolveReplay(reservation) {
      const refund = carouselSlideDispatchRefund(input, input.slideId);
      let slide = (await currentSlide(input.slideId)) ?? reservation.value.slide;
      const chargeUsage = await getUsageByIdempotencyKey(
        input.workspaceId,
        billingKeyFor(slide.id),
      );
      const ack = settlementDispatchMetadata(chargeUsage?.metadata);
      const deadline = settlementDeadline({ maxAttempts: SETTLEMENT_POLL_ATTEMPTS, maxMs: 10_000 });
      for (let attempt = 0; deadline.shouldContinue(attempt); attempt += 1) {
        const recordedRefund = await deadline.read(() => getUsageByIdempotencyKey(
          input.workspaceId,
          refund.idempotencyKey,
        ));
        if (recordedRefund || slide.status === "failed") {
          return {
            status: "dispatch_failed" as const,
            failure: { value: { slide }, refunds: [refund] },
          };
        }
        if (slide.status === "completed" || slide.status === "processing") {
          return { status: "settled" as const, value: { slide } };
        }
        if (ack.required) {
          const recordedAck =
            ack.key &&
            (await deadline.read(() => getUsageByIdempotencyKey(input.workspaceId, ack.key!)));
          if (recordedAck) {
            return { status: "settled" as const, value: { slide } };
          }
        } else if (slide.status !== "queued") {
          return { status: "settled" as const, value: { slide } };
        }
        await deadline.pause();
        slide = (await deadline.read(() => currentSlide(input.slideId))) ?? slide;
      }
      // Missing ack is not proof of dispatch. Resume the idempotent send for
      // the still-queued row, then write ack and settle.
      if (!chargeUsage || (ack.required && !ack.key)) {
        throw new Error("generation_settlement_dispatch_uncertain");
      }
      if (slide.status === "queued") {
        try {
          await dispatchCarouselSlideEvent(slide);
        } catch (error) {
          logger.error(
            `[generation-settlement] carousel recovery dispatch uncertain slideId=${slide.id}`,
            error,
          );
          throw new Error("generation_settlement_dispatch_uncertain");
        }
      }
      await recordDispatchAck(
        input.workspaceId,
        {
          creativeWorkId: input.workItemId,
          slideId: slide.id,
          recovery: true,
        },
        ackKeyFor(slide.id),
      );
      return { status: "settled" as const, value: { slide } };
    },
    // The reservation has no row of its own to delete: the CAS already moved
    // the slide to queued. A queued row that ends up without a charge is
    // re-driven idempotently by the next replay (see join()).
    release: async () => undefined,
    async dispatch(reservation) {
      await dispatchCarouselSlideEvent(reservation.value.slide);
    },
    async failDispatch(reservation, error) {
      logger.error(
        `[generation-settlement] carousel slide dispatch FAILED slideId=${reservation.value.slide.id}`,
        error,
      );
      return {
        value: reservation.value,
        refunds: [carouselSlideDispatchRefund(input, reservation.value.slide.id)],
      };
    },
    async completeDispatch(reservation) {
      await recordDispatchAck(
        input.workspaceId,
        {
          creativeWorkId: input.workItemId,
          slideId: reservation.value.slide.id,
          position: reservation.value.slide.position,
        },
        ackKeyFor(reservation.value.slide.id),
      );
      return reservation.value;
    },
  };
}

type FormatSource = NonNullable<
  Awaited<ReturnType<typeof getDerivationById>>
>;
type FormatChild = Awaited<ReturnType<typeof createDerivation>>;
export type FormatAdaptationSettlementValue = {
  derivation: FormatChild;
  source: FormatSource;
};
type FormatAdaptationReservation =
  GenerationSettlementReservation<FormatAdaptationSettlementValue> & {
    previous: FormatChild | null;
  };

export function formatAdaptationSettlementAdapter(input: {
  workspaceId: string;
  userId: string;
  targetFormat: string;
  billingIdempotencyKey: string;
  billingMetadata?: Record<string, unknown>;
  assistantActionId?: string | null;
  locale?: string;
  source: FormatSource;
}): GenerationSettlementAdapter<
  FormatAdaptationSettlementValue,
  FormatAdaptationReservation
> {
  return {
    async reserve() {
      const previous = await getLatestFormatAdaptationChild({
        workspaceId: input.workspaceId,
        parentId: input.source.id,
        format: input.targetFormat,
      });
      const child = await createDerivation({
        campaignId: input.source.campaignId,
        workspaceId: input.workspaceId,
        planId: input.source.planId ?? undefined,
        parentId: input.source.id,
        status: "queued",
        generationMode: "format_adaptation",
        variantIndex: input.source.variantIndex ?? undefined,
        ctaText: input.source.ctaText ?? undefined,
        format: input.targetFormat,
      });
      return {
        claimed: true,
        value: { derivation: child, source: input.source },
        previous,
      };
    },
    async charge(reservation) {
      const dimensions =
        getTargetDimensions(
          input.targetFormat as "1:1" | "4:5" | "9:16" | "3:4",
        ) ?? { width: 1024, height: 1024 };
      const request: GenerationRequest = {
        authorship: {
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
        origin: input.assistantActionId ? "assistant" : "campaign",
        surface: input.assistantActionId ? "assistant" : "campaign",
        intent: { mode: "format_adaptation", objective: null },
        identity: {
          clientProfileId: null,
          referenceImages: [],
          brandConstraints: null,
        },
        format: {
          targetFormat: input.targetFormat,
          dimensions,
          constraints: null,
        },
        source: {
          parentId: input.source.id,
          sourceVersionId: null,
          lineageId: null,
          packageSource: null,
        },
        prompt: {
          text: `Adapt derivation ${input.source.id} to ${input.targetFormat}`,
        },
        cost: {
          chargeAmount: GENERATION_CREDIT_COSTS.singleDerivation,
          refundPolicy: "default",
        },
        idempotency: {
          billingKey: input.billingIdempotencyKey,
          skipWhenOutputExists: true,
        },
        destination: {
          kind: "derivation",
          id: reservation.value.derivation.id,
          storagePrefix: `derivations/${reservation.value.derivation.id}`,
          campaignId: input.source.campaignId,
        },
      };
      const ackKey = dispatchAckKey(input.billingIdempotencyKey);
      const spend = await chargeForGeneration(request, {
        metadata: {
          sourceDerivationId: input.source.id,
          derivationId: reservation.value.derivation.id,
          reservationUpdatedAt:
            reservation.value.derivation.updatedAt.toISOString(),
          ...input.billingMetadata,
          settlementDispatchAckRequired: true,
          settlementDispatchAckKey: ackKey,
          targetFormat: input.targetFormat,
        },
      });
      return toSettlementCharge(spend);
    },
    async resolveReplay(reservation) {
      const usage = await getUsageByIdempotencyKey(
        input.workspaceId,
        input.billingIdempotencyKey,
      );
      const metadata = usage?.metadata as
        | {
            derivationId?: unknown;
            destinationId?: unknown;
            reservationUpdatedAt?: unknown;
            settlementDispatchAckRequired?: unknown;
            settlementDispatchAckKey?: unknown;
          }
        | null
        | undefined;
      const originalId =
        typeof metadata?.derivationId === "string"
          ? metadata.derivationId
          : typeof metadata?.destinationId === "string"
            ? metadata.destinationId
            : null;
      let original = originalId
        ? await getDerivationById(originalId, input.workspaceId)
        : reservation.previous;
      const reservationUpdatedAt =
        typeof metadata?.reservationUpdatedAt === "string"
          ? new Date(metadata.reservationUpdatedAt)
          : null;
      const ack = settlementDispatchMetadata(metadata);
      const dispatchRefund = {
        workspaceId: input.workspaceId,
        action: "image_derivation" as const,
        idempotencyKey: `${input.billingIdempotencyKey}:dispatch-refund`,
        amount: GENERATION_CREDIT_COSTS.singleDerivation,
        metadata: {
          sourceDerivationId: input.source.id,
          derivationId: original?.id,
          targetFormat: input.targetFormat,
          description: "format_adaptation_dispatch_refund",
        },
        userId: input.userId,
      };
      const recordedRefund = await getUsageByIdempotencyKey(
        input.workspaceId,
        dispatchRefund.idempotencyKey,
      );
      if (recordedRefund && original) {
        return {
          status: "dispatch_failed",
          failure: {
            value: { derivation: original, source: input.source },
            refunds: [dispatchRefund],
          },
        };
      }
      const deadline = settlementDeadline({ maxAttempts: SETTLEMENT_POLL_ATTEMPTS, maxMs: 10_000 });
      for (let attempt = 0; original && deadline.shouldContinue(attempt); attempt += 1) {
        // When ack is required, wait for ack or the durable dispatch-refund
        // marker. A fast terminal job failure before completeDispatch writes
        // ack must not look like a sync dispatch failure.
        if (ack.required) {
          const recordedAck =
            ack.key &&
            (await deadline.read(() => getUsageByIdempotencyKey(input.workspaceId, ack.key!)));
          if (recordedAck) {
            await updateCampaign(input.source.campaignId, input.workspaceId, {
              status: "generating",
            });
            return {
              status: "settled",
              value: { derivation: original, source: input.source },
            };
          }
          const lateRefund = await deadline.read(() => getUsageByIdempotencyKey(
            input.workspaceId,
            dispatchRefund.idempotencyKey,
          ));
          if (lateRefund) {
            return {
              status: "dispatch_failed",
              failure: {
                value: { derivation: original, source: input.source },
                refunds: [dispatchRefund],
              },
            };
          }
          await deadline.pause();
          original = await deadline.read(() => getDerivationById(original!.id, input.workspaceId));
          continue;
        }
        if (original.status === "failed") {
          return {
            status: "dispatch_failed",
            failure: {
              value: { derivation: original, source: input.source },
              refunds: [dispatchRefund],
            },
          };
        }
        if (
          original.status !== "queued" ||
          (reservationUpdatedAt &&
            original.updatedAt > reservationUpdatedAt)
        ) {
          await updateCampaign(input.source.campaignId, input.workspaceId, {
            status: "generating",
          });
          return {
            status: "settled",
            value: { derivation: original, source: input.source },
          };
        }
        await deadline.pause();
        original = await deadline.read(() => getDerivationById(original!.id, input.workspaceId));
      }
      if (!original) return null;
      // Timeout with ack required: only a successful queued re-send may mint
      // ack. failed without ack/refund stays uncertain so the next replay can retry.
      if (ack.required) {
        const finalAck =
          ack.key &&
          (await getUsageByIdempotencyKey(input.workspaceId, ack.key));
        if (finalAck) {
          await updateCampaign(input.source.campaignId, input.workspaceId, {
            status: "generating",
          });
          return {
            status: "settled",
            value: { derivation: original, source: input.source },
          };
        }
        const finalRefund = await getUsageByIdempotencyKey(
          input.workspaceId,
          dispatchRefund.idempotencyKey,
        );
        if (finalRefund) {
          return {
            status: "dispatch_failed",
            failure: {
              value: { derivation: original, source: input.source },
              refunds: [dispatchRefund],
            },
          };
        }
        if (original.status === "failed") {
          logger.error(
            `[generation-settlement] format recovery unresolved derivationId=${original.id} status=${original.status}`,
          );
          throw new Error("generation_settlement_dispatch_uncertain");
        }
      }
      // Missing ack is not proof of dispatch. Resume idempotent send while
      // still queued, then write ack and settle.
      if (!usage || (ack.required && !ack.key)) {
        throw new Error("generation_settlement_dispatch_uncertain");
      }
      if (original.status === "queued") {
        try {
          await inngest.send({
            id: formatAdaptationEventId(original.id),
            name: heavyImageEventName("derivation.generate"),
            data: {
              derivationId: original.id,
              campaignId: input.source.campaignId,
              workspaceId: input.workspaceId,
              triggeredByUserId: input.userId,
              locale: input.locale,
              generationMode: "format_adaptation",
              variantIndex: input.source.variantIndex,
              ctaText: input.source.ctaText,
              format: input.targetFormat,
              ...(input.assistantActionId
                ? { assistantActionId: input.assistantActionId }
                : {}),
            },
          });
        } catch (error) {
          // Ambiguous vs an earlier accepted send. Leave queued and do not refund.
          logger.error(
            `[generation-settlement] format recovery dispatch uncertain derivationId=${original.id}`,
            error,
          );
          throw new Error("generation_settlement_dispatch_uncertain");
        }
      }
      await recordDispatchAck(
        input.workspaceId,
        {
          sourceDerivationId: input.source.id,
          derivationId: original.id,
          targetFormat: input.targetFormat,
        },
        dispatchAckKey(input.billingIdempotencyKey),
      );
      await touchQueuedDerivation(
        original.id,
        input.workspaceId,
        original.updatedAt,
      );
      await updateCampaign(input.source.campaignId, input.workspaceId, {
        status: "generating",
      });
      return {
        status: "settled",
        value: { derivation: original, source: input.source },
      };
    },
    release: (reservation) =>
      deleteQueuedDerivation(
        reservation.value.derivation.id,
        input.workspaceId,
      ),
    async dispatch(reservation) {
      await inngest.send({
        id: formatAdaptationEventId(reservation.value.derivation.id),
        name: heavyImageEventName("derivation.generate"),
        data: {
          derivationId: reservation.value.derivation.id,
          campaignId: input.source.campaignId,
          workspaceId: input.workspaceId,
          triggeredByUserId: input.userId,
          locale: input.locale,
          generationMode: "format_adaptation",
          variantIndex: input.source.variantIndex,
          ctaText: input.source.ctaText,
          format: input.targetFormat,
          ...(input.assistantActionId
            ? { assistantActionId: input.assistantActionId }
            : {}),
        },
      });
    },
    async failDispatch(reservation, error) {
      logger.error(
        `[adaptFormat] event send FAILED derivationId=${reservation.value.derivation.id}`,
        error,
      );
      const failed = await failQueuedDerivation(
        reservation.value.derivation.id,
        input.workspaceId,
      ).catch(() => null);
      return {
        value: {
          derivation: failed ?? reservation.value.derivation,
          source: input.source,
        },
        refunds: [{
            workspaceId: input.workspaceId,
            action: "image_derivation",
            idempotencyKey: `${input.billingIdempotencyKey}:dispatch-refund`,
            amount: GENERATION_CREDIT_COSTS.singleDerivation,
            metadata: {
              sourceDerivationId: input.source.id,
              derivationId: reservation.value.derivation.id,
              targetFormat: input.targetFormat,
              description: "format_adaptation_dispatch_refund",
            },
            userId: input.userId,
          }],
      };
    },
    async completeDispatch(reservation) {
      await recordDispatchAck(
        input.workspaceId,
        {
          sourceDerivationId: input.source.id,
          derivationId: reservation.value.derivation.id,
          targetFormat: input.targetFormat,
        },
        dispatchAckKey(input.billingIdempotencyKey),
      );
      await touchQueuedDerivation(
        reservation.value.derivation.id,
        input.workspaceId,
        reservation.value.derivation.updatedAt,
      );
      await updateCampaign(input.source.campaignId, input.workspaceId, {
        status: "generating",
      });
      return reservation.value;
    },
  };
}

type CreativeWorkOutput = CreativeWorkOutputs[number];

export type CreativeWorkRevisionSettlementValue = {
  output: CreativeWorkOutput;
};

type CreativeWorkRevisionReservation =
  GenerationSettlementReservation<CreativeWorkRevisionSettlementValue>;

function revisionBillingKey(workItemId: string, outputId: string) {
  return `creative-work:${workItemId}:revision:${outputId}`;
}

function revisionDispatchRefund(
  input: { workspaceId: string; workItemId: string; userId: string },
  outputId: string,
) {
  const billingKey = revisionBillingKey(input.workItemId, outputId);
  return {
    workspaceId: input.workspaceId,
    action: "image_derivation" as const,
    idempotencyKey: `${billingKey}:dispatch-refund`,
    amount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
    metadata: {
      creativeWorkId: input.workItemId,
      outputId,
      description: "creative_work_revision_dispatch_refund",
    },
    userId: input.userId,
  };
}

export class InvalidCreativeWorkRevisionError extends Error {
  readonly code = "invalid_revision" as const;
  constructor() {
    super("invalid_revision");
    this.name = "InvalidCreativeWorkRevisionError";
  }
}

export function creativeWorkRevisionSettlementAdapter(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
  parentOutputId: string;
  revisionKey: string;
  instruction: string;
  revisionAssetId: string | null;
  objective: string | null;
  context?: import("@/server/creative-work/output-review").OutputRevisionContextV1 | null;
  expectedReviewRevision?: number;
}): GenerationSettlementAdapter<
  CreativeWorkRevisionSettlementValue,
  CreativeWorkRevisionReservation
> {
  return {
    async reserve() {
      const hasReviewContext =
        input.context != null || input.expectedReviewRevision !== undefined;
      const reservation = hasReviewContext
        ? await createCreativeWorkRevision(
            input.workspaceId,
            input.workItemId,
            input.revisionKey,
            input.parentOutputId,
            input.instruction,
            input.revisionAssetId,
            {
              context: input.context ?? null,
              expectedReviewRevision: input.expectedReviewRevision,
            },
          )
        : await createCreativeWorkRevision(
            input.workspaceId,
            input.workItemId,
            input.revisionKey,
            input.parentOutputId,
            input.instruction,
            input.revisionAssetId,
          );
      if (!reservation) {
        throw new InvalidCreativeWorkRevisionError();
      }
      if (reservation.claimedForDispatch) {
        logCreativeWorkGenerationLifecycle({
          event: "creative_work_generation_requested",
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          generationCorrelationId: reservation.output.generationCorrelationId,
          unitCount: 1,
          outputIds: [reservation.output.id],
          credits: GENERATION_CREDIT_COSTS.creativeWorkOutput,
          unitChargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
        });
      }
      return {
        claimed: reservation.claimedForDispatch,
        value: { output: reservation.output },
      };
    },
    async join(reservation) {
      // Concurrent loser or HTTP replay of the same revisionKey.
      // Settle immediately when no charge owns the row yet so losers do not
      // block on the claimer. When a charge exists, wait for ack/failure.
      let output = reservation.value.output;
      const billingKey = revisionBillingKey(input.workItemId, output.id);
      const refund = revisionDispatchRefund(input, output.id);
      const chargeUsage = await getUsageByIdempotencyKey(
        input.workspaceId,
        billingKey,
      );
      if (!chargeUsage) {
        if (output.failureCode === "dispatch_failed") {
          return {
            status: "dispatch_failed",
            failure: { value: { output }, refunds: [refund] },
          };
        }
        return { status: "settled", value: { output } };
      }
      const ack = settlementDispatchMetadata(chargeUsage.metadata);
      const deadline = settlementDeadline({ maxAttempts: SETTLEMENT_POLL_ATTEMPTS, maxMs: 10_000 });
      for (let attempt = 0; deadline.shouldContinue(attempt); attempt += 1) {
        const recordedRefund = await deadline.read(() => getUsageByIdempotencyKey(
          input.workspaceId,
          refund.idempotencyKey,
        ));
        if (output.failureCode === "dispatch_failed" || recordedRefund) {
          return {
            status: "dispatch_failed",
            failure: { value: { output }, refunds: [refund] },
          };
        }
        if (ack.required) {
          const recordedAck =
            ack.key &&
            (await deadline.read(() => getUsageByIdempotencyKey(input.workspaceId, ack.key!)));
          if (recordedAck) {
            return { status: "settled", value: { output } };
          }
        } else if (output.status !== "queued") {
          return { status: "settled", value: { output } };
        }
        await deadline.pause();
        output =
          (
            await deadline.read(() => getCreativeWork(input.workspaceId, input.workItemId, undefined, { includeSources: false }))
          )?.outputs.find((row) => row.id === output.id) ?? output;
      }
      // Missing ack is not proof of dispatch. Resume idempotent send while
      // still queued, then write ack and settle.
      if (ack.required && !ack.key) throw new Error("generation_settlement_dispatch_uncertain");
      if (output.status === "queued") {
        try {
          await dispatchCreativeWorkRevision({
            workspaceId: input.workspaceId,
            workItemId: input.workItemId,
            outputId: output.id,
            generationCorrelationId: output.generationCorrelationId,
            result: "recovered",
          });
        } catch (error) {
          // Ambiguous vs an earlier accepted send. Leave the revision queued
          // and do not refund — the next replay can resume again.
          logger.error(
            `[generation-settlement] revision recovery dispatch uncertain outputId=${output.id}`,
            error,
          );
          throw new Error("generation_settlement_dispatch_uncertain");
        }
      }
      await recordDispatchAck(
        input.workspaceId,
        {
          creativeWorkId: input.workItemId,
          outputId: output.id,
          revisionOf: input.parentOutputId,
        },
        dispatchAckKey(billingKey),
      );
      return { status: "settled", value: { output } };
    },
    async charge(reservation) {
      const billingKey = revisionBillingKey(
        input.workItemId,
        reservation.value.output.id,
      );
      const ackKey = dispatchAckKey(billingKey);
      const batch: GenerationBatchCharge = {
        kind: "batch",
        authorship: {
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
        origin: "quick_tool",
        surface: "quick_tool",
        intent: {
          mode: "creative_revision",
          objective: input.objective,
        },
        parentId: input.workItemId,
        unitCount: 1,
        chargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
        unitChargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
        billingKey,
        refundPolicy: "default",
      };
      const spend = await chargeForGenerationBatch(batch, {
        metadata: {
          creativeWorkId: input.workItemId,
          outputId: reservation.value.output.id,
          revisionOf: input.parentOutputId,
          settlementDispatchAckRequired: true,
          settlementDispatchAckKey: ackKey,
        },
      });
      return toSettlementCharge(spend);
    },
    // release only runs on charge failure (no resolveReplay for revisions).
    release: async (reservation) => {
      await failQueuedCreativeWorkOutput(
        input.workspaceId,
        input.workItemId,
        reservation.value.output.id,
        "credit_blocked",
      );
    },
    async dispatch(reservation) {
      await dispatchCreativeWorkRevision({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        outputId: reservation.value.output.id,
        generationCorrelationId: reservation.value.output.generationCorrelationId,
        result: "sent",
      });
    },
    async failDispatch(reservation) {
      const failed = await failQueuedCreativeWorkOutput(
        input.workspaceId,
        input.workItemId,
        reservation.value.output.id,
        "dispatch_failed",
      );
      return {
        value: { output: failed ?? reservation.value.output },
        refunds: [
          revisionDispatchRefund(input, reservation.value.output.id),
        ],
      };
    },
    async completeDispatch(reservation) {
      const billingKey = revisionBillingKey(
        input.workItemId,
        reservation.value.output.id,
      );
      await recordDispatchAck(
        input.workspaceId,
        {
          creativeWorkId: input.workItemId,
          outputId: reservation.value.output.id,
          revisionOf: input.parentOutputId,
        },
        dispatchAckKey(billingKey),
      );
      return reservation.value;
    },
  };
}

type DerivationRow = Awaited<ReturnType<typeof createDerivation>>;

export type DerivationBatchSettlementValue = {
  derivations: DerivationRow[];
  newlyCreatedIds?: string[];
};

type DerivationBatchReservation =
  GenerationSettlementReservation<DerivationBatchSettlementValue> & {
    newlyCreatedIds: string[];
    chargePlan?: {
      amount: number;
      unitCount: number;
      billingKey: string;
      unitChargeAmount: number;
    };
  };

function derivationGenerateEventId(prefix: string, derivationId: string) {
  return `${prefix}:${derivationId}`;
}

function derivationIdsFromMetadata(metadata: unknown): string[] {
  const value = metadata as { derivationIds?: unknown } | null | undefined;
  if (!Array.isArray(value?.derivationIds)) return [];
  return value.derivationIds.filter(
    (id): id is string => typeof id === "string",
  );
}

function batchDispatchRefund(input: {
  workspaceId: string;
  userId: string;
  billingKey: string;
  amount: number;
  action: CreditAction;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    workspaceId: input.workspaceId,
    action: input.action,
    idempotencyKey: `${input.billingKey}:dispatch-refund`,
    amount: input.amount,
    metadata: {
      description: input.description,
      ...input.metadata,
    },
    userId: input.userId,
  };
}

async function resolveDerivationBatchReplay(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  billingKey: string;
  eventIdPrefix: string;
  locale?: string;
  assistantActionId: string;
  amount: number;
  action: CreditAction;
  description: string;
  buildEventData: (
    derivation: DerivationRow,
  ) => Record<string, unknown>;
}): Promise<
  | { status: "settled"; value: DerivationBatchSettlementValue }
  | {
      status: "dispatch_failed";
      failure: {
        value: DerivationBatchSettlementValue;
        refunds: ReturnType<typeof batchDispatchRefund>[];
      };
    }
  | null
> {
  const usage = await getUsageByIdempotencyKey(
    input.workspaceId,
    input.billingKey,
  );
  const metadata = usage?.metadata as
    | {
        derivationIds?: unknown;
        settlementDispatchAckRequired?: unknown;
        settlementDispatchAckKey?: unknown;
      }
    | null
    | undefined;
  const originalIds = derivationIdsFromMetadata(metadata);
  const refund = batchDispatchRefund({
    workspaceId: input.workspaceId,
    userId: input.userId,
    billingKey: input.billingKey,
    amount: input.amount,
    action: input.action,
    description: input.description,
    metadata: { derivationIds: originalIds },
  });
  const recordedRefund = await getUsageByIdempotencyKey(
    input.workspaceId,
    refund.idempotencyKey,
  );
  let originals =
    originalIds.length > 0
      ? await getDerivationsByIds(originalIds, input.workspaceId)
      : [];
  if (recordedRefund && originals.length > 0) {
    return {
      status: "dispatch_failed",
      failure: {
        value: { derivations: originals },
        refunds: [refund],
      },
    };
  }
  const ack = settlementDispatchMetadata(metadata);
  const deadline = settlementDeadline({ maxAttempts: SETTLEMENT_POLL_ATTEMPTS, maxMs: 10_000 });
  for (let attempt = 0; originals.length > 0 && deadline.shouldContinue(attempt); attempt += 1) {
    // When ack is required, wait for ack or the durable dispatch-refund
    // marker. A fast terminal job failure before completeDispatch writes
    // ack must not look like a sync dispatch failure.
    if (ack.required) {
      const recordedAck =
        ack.key &&
        (await deadline.read(() => getUsageByIdempotencyKey(input.workspaceId, ack.key!)));
      if (recordedAck) {
        await updateCampaign(input.campaignId, input.workspaceId, {
          status: "generating",
        });
        return { status: "settled", value: { derivations: originals } };
      }
      const lateRefund = await deadline.read(() => getUsageByIdempotencyKey(
        input.workspaceId,
        refund.idempotencyKey,
      ));
      if (lateRefund) {
        return {
          status: "dispatch_failed",
          failure: {
            value: { derivations: originals },
            refunds: [refund],
          },
        };
      }
      await deadline.pause();
      originals = await deadline.read(() => getDerivationsByIds(originalIds, input.workspaceId));
      continue;
    }
    if (originals.some((row) => row.status === "failed")) {
      return {
        status: "dispatch_failed",
        failure: {
          value: { derivations: originals },
          refunds: [refund],
        },
      };
    }
    if (originals.some((row) => row.status !== "queued")) {
      await updateCampaign(input.campaignId, input.workspaceId, {
        status: "generating",
      });
      return { status: "settled", value: { derivations: originals } };
    }
    await deadline.pause();
    originals = await deadline.read(() => getDerivationsByIds(originalIds, input.workspaceId));
  }
  if (originals.length === 0) return null;
  // Timeout with ack required: only a successful queued re-send may mint
  // ack. failed without ack/refund stays uncertain so the next replay can retry.
  if (ack.required) {
    const finalAck =
      ack.key &&
      (await getUsageByIdempotencyKey(input.workspaceId, ack.key));
    if (finalAck) {
      await updateCampaign(input.campaignId, input.workspaceId, {
        status: "generating",
      });
      return { status: "settled", value: { derivations: originals } };
    }
    const finalRefund = await getUsageByIdempotencyKey(
      input.workspaceId,
      refund.idempotencyKey,
    );
    if (finalRefund) {
      return {
        status: "dispatch_failed",
        failure: {
          value: { derivations: originals },
          refunds: [refund],
        },
      };
    }
    if (originals.some((row) => row.status === "failed")) {
      logger.error(
        `[generation-settlement] derivation batch recovery unresolved billingKey=${input.billingKey}`,
      );
      throw new Error("generation_settlement_dispatch_uncertain");
    }
  }
  if (!usage || (ack.required && !ack.key)) {
    throw new Error("generation_settlement_dispatch_uncertain");
  }
  const queued = originals.filter((row) => row.status === "queued");
  if (queued.length > 0) {
    try {
      await inngest.send(
        queued.map((derivation) => ({
          id: derivationGenerateEventId(input.eventIdPrefix, derivation.id),
          name: heavyImageEventName("derivation.generate"),
          data: input.buildEventData(derivation),
        })),
      );
    } catch (error) {
      logger.error(
        `[generation-settlement] derivation batch recovery uncertain billingKey=${input.billingKey}`,
        error,
      );
      throw new Error("generation_settlement_dispatch_uncertain");
    }
  }
  await recordDispatchAck(
    input.workspaceId,
    {
      campaignId: input.campaignId,
      derivationIds: originals.map((row) => row.id),
      assistantActionId: input.assistantActionId,
    },
    dispatchAckKey(input.billingKey),
  );
  await updateCampaign(input.campaignId, input.workspaceId, {
    status: "generating",
  });
  return { status: "settled", value: { derivations: originals } };
}

function derivationBatchSettlementAdapter(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  assistantActionId?: string | null;
  billingKey: string;
  amount: number;
  unitCount: number;
  /** Product-resolved unit price; required — settlement does not invent costs. */
  unitChargeAmount: number;
  action: CreditAction;
  intentMode: GenerationBatchCharge["intent"]["mode"];
  origin?: CreativeWorkOrigin;
  surface?: GenerationSurface;
  eventIdPrefix: string;
  refundDescription: string;
  billingMetadata?: Record<string, unknown>;
  reserve: () => Promise<DerivationBatchReservation>;
  buildEventData: (derivation: DerivationRow) => Record<string, unknown>;
  /** When set, only these ids are dispatched (defaults to all reserved). */
  dispatchIds?: (reservation: DerivationBatchReservation) => string[];
  /**
   * Product-owned charge plan from the reservation (e.g. charge only rows
   * actually claimed in a race). Defaults to the fixed amount/key inputs.
   */
  resolveChargePlan?: (reservation: DerivationBatchReservation) => {
    amount: number;
    unitCount: number;
    billingKey: string;
    unitChargeAmount: number;
  };
}): GenerationSettlementAdapter<
  DerivationBatchSettlementValue,
  DerivationBatchReservation
> {
  const origin = input.origin ?? "assistant";
  const surface = input.surface ?? "assistant";
  const chargePlanFor = (reservation: DerivationBatchReservation) => {
    if (reservation.chargePlan) return reservation.chargePlan;
    const plan = input.resolveChargePlan?.(reservation) ?? {
      amount: input.amount,
      unitCount: input.unitCount,
      billingKey: input.billingKey,
      unitChargeAmount: input.unitChargeAmount,
    };
    reservation.chargePlan = plan;
    return plan;
  };
  const dispatchTargets = (reservation: DerivationBatchReservation) => {
    const ids = new Set(
      input.dispatchIds
        ? input.dispatchIds(reservation)
        : reservation.value.derivations.map((row) => row.id),
    );
    return reservation.value.derivations.filter((row) => ids.has(row.id));
  };
  return {
    reserve: input.reserve,
    async charge(reservation) {
      const plan = chargePlanFor(reservation);
      const ackKey = dispatchAckKey(plan.billingKey);
      const targets = dispatchTargets(reservation);
      const derivationIds = targets.map((row) => row.id);
      const batch: GenerationBatchCharge = {
        kind: "batch",
        authorship: {
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
        origin,
        surface,
        intent: { mode: input.intentMode, objective: null },
        parentId: input.campaignId,
        unitCount: plan.unitCount,
        chargeAmount: plan.amount,
        unitChargeAmount: plan.unitChargeAmount,
        billingKey: plan.billingKey,
        refundPolicy: "default",
      };
      const spend = await chargeForGenerationBatch(batch, {
        action: input.action,
        metadata: {
          campaignId: input.campaignId,
          ...(input.assistantActionId
            ? { assistantActionId: input.assistantActionId }
            : {}),
          derivationIds,
          settlementDispatchAckRequired: true,
          settlementDispatchAckKey: ackKey,
          ...input.billingMetadata,
        },
      });
      return toSettlementCharge(spend);
    },
    async resolveReplay(reservation) {
      const plan = chargePlanFor(reservation);
      return resolveDerivationBatchReplay({
        workspaceId: input.workspaceId,
        userId: input.userId,
        campaignId: input.campaignId,
        billingKey: plan.billingKey,
        eventIdPrefix: input.eventIdPrefix,
        assistantActionId: input.assistantActionId ?? "",
        amount: plan.amount,
        action: input.action,
        description: input.refundDescription,
        buildEventData: input.buildEventData,
      });
    },
    release: async (reservation) => {
      await Promise.all(
        reservation.newlyCreatedIds.map((id) =>
          deleteQueuedDerivation(id, input.workspaceId),
        ),
      );
    },
    async dispatch(reservation) {
      const targets = dispatchTargets(reservation);
      if (targets.length === 0) return;
      await inngest.send(
        targets.map((derivation) => ({
          id: derivationGenerateEventId(input.eventIdPrefix, derivation.id),
          name: heavyImageEventName("derivation.generate"),
          data: input.buildEventData(derivation),
        })),
      );
    },
    async failDispatch(reservation) {
      const targets = dispatchTargets(reservation);
      const plan = chargePlanFor(reservation);
      await Promise.allSettled(
        targets.map((derivation) =>
          failQueuedDerivation(derivation.id, input.workspaceId),
        ),
      );
      return {
        value: {
          derivations: targets,
          newlyCreatedIds: targets.map((row) => row.id),
        },
        refunds: [
          batchDispatchRefund({
            workspaceId: input.workspaceId,
            userId: input.userId,
            billingKey: plan.billingKey,
            amount: plan.amount,
            action: input.action,
            description: input.refundDescription,
            metadata: {
              derivationIds: targets.map((row) => row.id),
            },
          }),
        ],
      };
    },
    async completeDispatch(reservation) {
      const plan = chargePlanFor(reservation);
      await recordDispatchAck(
        input.workspaceId,
        {
          campaignId: input.campaignId,
          derivationIds: reservation.value.derivations.map((row) => row.id),
          ...(input.assistantActionId
            ? { assistantActionId: input.assistantActionId }
            : {}),
        },
        dispatchAckKey(plan.billingKey),
      );
      if (dispatchTargets(reservation).length > 0) {
        await updateCampaign(input.campaignId, input.workspaceId, {
          status: "generating",
        });
      }
      return {
        ...reservation.value,
        newlyCreatedIds: reservation.newlyCreatedIds,
      };
    },
  };
}

export function assistantCreativeTripletSettlementAdapter(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  actionId: string;
  format: string;
  planVersionId: string;
  goalRunId: string;
  locale?: string;
  /** Product-resolved batch total and unit price. */
  amount: number;
  unitChargeAmount: number;
}): GenerationSettlementAdapter<
  DerivationBatchSettlementValue,
  DerivationBatchReservation
> {
  const billingKey = `assistant-action:${input.actionId}:creative-triplet`;
  return derivationBatchSettlementAdapter({
    workspaceId: input.workspaceId,
    userId: input.userId,
    campaignId: input.campaignId,
    assistantActionId: input.actionId,
    billingKey,
    amount: input.amount,
    unitCount: GOAL_CREATIVE_LEVELS.length,
    unitChargeAmount: input.unitChargeAmount,
    action: "image_derivation",
    intentMode: "art_variation",
    eventIdPrefix: "assistant-creative-triplet",
    refundDescription: "assistant_creative_triplet_dispatch_refund",
    billingMetadata: {
      actionId: input.actionId,
      goalRunId: input.goalRunId,
      count: GOAL_CREATIVE_LEVELS.length,
    },
    async reserve() {
      const derivations = await Promise.all(
        GOAL_CREATIVE_LEVELS.map((creativeLevel) =>
          createDerivation({
            campaignId: input.campaignId,
            workspaceId: input.workspaceId,
            format: input.format,
            generationMode: "art_variation",
            variantIndex: 0,
            status: "queued",
            creativeLevel,
          }),
        ),
      );
      return {
        claimed: true,
        value: { derivations },
        newlyCreatedIds: derivations.map((row) => row.id),
      };
    },
    buildEventData: (derivation) => ({
      derivationId: derivation.id,
      campaignId: input.campaignId,
      workspaceId: input.workspaceId,
      triggeredByUserId: input.userId,
      locale: input.locale,
      generationMode: "art_variation",
      creativeLevel: derivation.creativeLevel,
      format: input.format,
      variantIndex: 0,
      planVersionId: input.planVersionId,
      assistantActionId: input.actionId,
      goalRunId: input.goalRunId,
      refundPolicy: "none",
    }),
  });
}

export function assistantGoalPackageSettlementAdapter(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  actionId: string;
  baseDerivation: DerivationRow;
  formats: readonly string[];
  planVersionId: string;
  goalRunId: string;
  locale?: string;
  /** Product-resolved batch total and unit price. */
  amount: number;
  unitChargeAmount: number;
}): GenerationSettlementAdapter<
  DerivationBatchSettlementValue,
  DerivationBatchReservation
> {
  const billingKey = `assistant-action:${input.actionId}:goal-package`;
  const creativeLevel =
    (input.baseDerivation.creativeLevel as
      | "conservative"
      | "balanced"
      | "bold"
      | "extreme"
      | null
      | undefined) ?? "balanced";
  return derivationBatchSettlementAdapter({
    workspaceId: input.workspaceId,
    userId: input.userId,
    campaignId: input.campaignId,
    assistantActionId: input.actionId,
    billingKey,
    amount: input.amount,
    unitCount: input.formats.length,
    unitChargeAmount: input.unitChargeAmount,
    action: "delivery_package_child",
    intentMode: "format_adaptation",
    eventIdPrefix: "assistant-goal-package",
    refundDescription: "assistant_goal_package_dispatch_refund",
    billingMetadata: {
      actionId: input.actionId,
      goalRunId: input.goalRunId,
      baseVersionId: input.baseDerivation.id,
      formats: [...input.formats],
    },
    async reserve() {
      const created = await Promise.all(
        input.formats.map((format) =>
          createPackageChildIfAbsent({
            campaignId: input.campaignId,
            workspaceId: input.workspaceId,
            parentId: input.baseDerivation.id,
            format,
            generationMode: "format_adaptation",
            status: "queued",
            ...(input.baseDerivation.ctaText
              ? { ctaText: input.baseDerivation.ctaText }
              : {}),
            creativeLevel,
          }),
        ),
      );
      return {
        claimed: true,
        value: { derivations: created.map((row) => row.child) },
        newlyCreatedIds: created
          .filter((row) => row.created)
          .map((row) => row.child.id),
      };
    },
    buildEventData: (derivation) => ({
      derivationId: derivation.id,
      campaignId: input.campaignId,
      workspaceId: input.workspaceId,
      triggeredByUserId: input.userId,
      locale: input.locale,
      generationMode: "format_adaptation",
      format: derivation.format,
      variantIndex: 0,
      planVersionId: input.planVersionId,
      assistantActionId: input.actionId,
      goalRunId: input.goalRunId,
      refundPolicy: "none",
    }),
  });
}

export type AssistantPreviewSettlementValue = {
  derivation: DerivationRow;
};

type AssistantPreviewReservation =
  GenerationSettlementReservation<AssistantPreviewSettlementValue>;

export function assistantPreviewSettlementAdapter(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  actionId: string;
  planId: string;
  format: string;
  ctaText: string;
  styleAssetId?: string | null;
  locale?: string;
}): GenerationSettlementAdapter<
  AssistantPreviewSettlementValue,
  AssistantPreviewReservation
> {
  const billingKey = `assistant-action:${input.actionId}:preview`;
  return {
    async reserve() {
      const derivation = await createDerivation({
        campaignId: input.campaignId,
        workspaceId: input.workspaceId,
        planId: input.planId,
        status: "queued",
        generationMode: "art_variation",
        variantIndex: 0,
        ctaText: input.ctaText,
        format: input.format,
        isPreview: true,
        styleAssetId: input.styleAssetId ?? undefined,
      });
      return { claimed: true, value: { derivation } };
    },
    async charge(reservation) {
      const dimensions =
        getTargetDimensions(input.format as "1:1" | "4:5" | "9:16" | "3:4") ?? {
          width: 1024,
          height: 1024,
        };
      const ackKey = dispatchAckKey(billingKey);
      const request: GenerationRequest = {
        authorship: {
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
        origin: "assistant",
        surface: "assistant",
        intent: { mode: "art_variation", objective: null },
        identity: {
          clientProfileId: null,
          referenceImages: [],
          brandConstraints: null,
        },
        format: {
          targetFormat: input.format,
          dimensions,
          constraints: null,
        },
        source: {
          parentId: null,
          sourceVersionId: null,
          lineageId: null,
          packageSource: null,
        },
        prompt: {
          text: `Assistant complete-campaign preview ${reservation.value.derivation.id}`,
        },
        cost: {
          chargeAmount: GENERATION_CREDIT_COSTS.singleDerivation,
          refundPolicy: "default",
        },
        idempotency: {
          billingKey,
          skipWhenOutputExists: true,
        },
        destination: {
          kind: "derivation",
          id: reservation.value.derivation.id,
          storagePrefix: `derivations/${reservation.value.derivation.id}`,
          campaignId: input.campaignId,
        },
      };
      const spend = await chargeForGeneration(request, {
        metadata: {
          actionId: input.actionId,
          campaignId: input.campaignId,
          preview: true,
          derivationId: reservation.value.derivation.id,
          reservationUpdatedAt:
            reservation.value.derivation.updatedAt.toISOString(),
          settlementDispatchAckRequired: true,
          settlementDispatchAckKey: ackKey,
        },
      });
      return toSettlementCharge(spend);
    },
    async resolveReplay() {
      const usage = await getUsageByIdempotencyKey(
        input.workspaceId,
        billingKey,
      );
      const metadata = usage?.metadata as
        | {
            derivationId?: unknown;
            destinationId?: unknown;
            reservationUpdatedAt?: unknown;
            settlementDispatchAckRequired?: unknown;
            settlementDispatchAckKey?: unknown;
          }
        | null
        | undefined;
      const originalId =
        typeof metadata?.derivationId === "string"
          ? metadata.derivationId
          : typeof metadata?.destinationId === "string"
            ? metadata.destinationId
            : null;
      let original = originalId
        ? await getDerivationById(originalId, input.workspaceId)
        : null;
      const reservationUpdatedAt =
        typeof metadata?.reservationUpdatedAt === "string"
          ? new Date(metadata.reservationUpdatedAt)
          : null;
      const refund = batchDispatchRefund({
        workspaceId: input.workspaceId,
        userId: input.userId,
        billingKey,
        amount: GENERATION_CREDIT_COSTS.singleDerivation,
        action: "image_derivation",
        description: "assistant_preview_dispatch_refund",
        metadata: {
          campaignId: input.campaignId,
          derivationId: original?.id,
          preview: true,
        },
      });
      const recordedRefund = await getUsageByIdempotencyKey(
        input.workspaceId,
        refund.idempotencyKey,
      );
      if (recordedRefund && original) {
        return {
          status: "dispatch_failed",
          failure: {
            value: { derivation: original },
            refunds: [refund],
          },
        };
      }
      const ack = settlementDispatchMetadata(metadata);
      const deadline = settlementDeadline({ maxAttempts: SETTLEMENT_POLL_ATTEMPTS, maxMs: 10_000 });
      for (let attempt = 0; original && deadline.shouldContinue(attempt); attempt += 1) {
        // When ack is required, wait for ack or the durable dispatch-refund
        // marker. A fast terminal job failure before completeDispatch writes
        // ack must not look like a sync dispatch failure.
        if (ack.required) {
          const recordedAck =
            ack.key &&
            (await deadline.read(() => getUsageByIdempotencyKey(input.workspaceId, ack.key!)));
          if (recordedAck) {
            await updateCampaign(input.campaignId, input.workspaceId, {
              status: "generating",
            });
            return {
              status: "settled",
              value: { derivation: original },
            };
          }
          const lateRefund = await deadline.read(() => getUsageByIdempotencyKey(
            input.workspaceId,
            refund.idempotencyKey,
          ));
          if (lateRefund) {
            return {
              status: "dispatch_failed",
              failure: {
                value: { derivation: original },
                refunds: [refund],
              },
            };
          }
          await deadline.pause();
          original = await deadline.read(() => getDerivationById(original!.id, input.workspaceId));
          continue;
        }
        if (original.status === "failed") {
          return {
            status: "dispatch_failed",
            failure: {
              value: { derivation: original },
              refunds: [refund],
            },
          };
        }
        if (
          original.status !== "queued" ||
          (reservationUpdatedAt && original.updatedAt > reservationUpdatedAt)
        ) {
          await updateCampaign(input.campaignId, input.workspaceId, {
            status: "generating",
          });
          return {
            status: "settled",
            value: { derivation: original },
          };
        }
        await deadline.pause();
        original = await deadline.read(() => getDerivationById(original!.id, input.workspaceId));
      }
      if (!original) return null;
      // Timeout with ack required: only a successful queued re-send may mint
      // ack. failed without ack/refund stays uncertain so the next replay can retry.
      if (ack.required) {
        const finalAck =
          ack.key &&
          (await getUsageByIdempotencyKey(input.workspaceId, ack.key));
        if (finalAck) {
          await updateCampaign(input.campaignId, input.workspaceId, {
            status: "generating",
          });
          return {
            status: "settled",
            value: { derivation: original },
          };
        }
        const finalRefund = await getUsageByIdempotencyKey(
          input.workspaceId,
          refund.idempotencyKey,
        );
        if (finalRefund) {
          return {
            status: "dispatch_failed",
            failure: {
              value: { derivation: original },
              refunds: [refund],
            },
          };
        }
        if (original.status === "failed") {
          logger.error(
            `[generation-settlement] preview recovery unresolved derivationId=${original.id} status=${original.status}`,
          );
          throw new Error("generation_settlement_dispatch_uncertain");
        }
      }
      if (!usage || (ack.required && !ack.key)) {
        throw new Error("generation_settlement_dispatch_uncertain");
      }
      if (original.status === "queued") {
        try {
          await inngest.send({
            id: derivationGenerateEventId("assistant-preview", original.id),
            name: heavyImageEventName("derivation.generate"),
            data: {
              derivationId: original.id,
              campaignId: input.campaignId,
              workspaceId: input.workspaceId,
              triggeredByUserId: input.userId,
              locale: input.locale,
              generationMode: "art_variation",
              variantIndex: 0,
              ctaText: input.ctaText,
              format: input.format,
              isPreview: true,
              styleAssetId: input.styleAssetId ?? null,
              assistantActionId: input.actionId,
            },
          });
        } catch (error) {
          logger.error(
            `[generation-settlement] preview recovery uncertain derivationId=${original.id}`,
            error,
          );
          throw new Error("generation_settlement_dispatch_uncertain");
        }
      }
      await recordDispatchAck(
        input.workspaceId,
        {
          campaignId: input.campaignId,
          derivationId: original.id,
          preview: true,
        },
        dispatchAckKey(billingKey),
      );
      await touchQueuedDerivation(
        original.id,
        input.workspaceId,
        original.updatedAt,
      );
      await updateCampaign(input.campaignId, input.workspaceId, {
        status: "generating",
      });
      return { status: "settled", value: { derivation: original } };
    },
    release: (reservation) =>
      deleteQueuedDerivation(
        reservation.value.derivation.id,
        input.workspaceId,
      ),
    async dispatch(reservation) {
      await inngest.send({
        id: derivationGenerateEventId(
          "assistant-preview",
          reservation.value.derivation.id,
        ),
        name: heavyImageEventName("derivation.generate"),
        data: {
          derivationId: reservation.value.derivation.id,
          campaignId: input.campaignId,
          workspaceId: input.workspaceId,
          triggeredByUserId: input.userId,
          locale: input.locale,
          generationMode: "art_variation",
          variantIndex: 0,
          ctaText: input.ctaText,
          format: input.format,
          isPreview: true,
          styleAssetId: input.styleAssetId ?? null,
          assistantActionId: input.actionId,
        },
      });
    },
    async failDispatch(reservation, error) {
      logger.error(
        `[assistantPreview] event send FAILED derivationId=${reservation.value.derivation.id}`,
        error,
      );
      const failed = await failQueuedDerivation(
        reservation.value.derivation.id,
        input.workspaceId,
      ).catch(() => null);
      return {
        value: {
          derivation: failed ?? reservation.value.derivation,
        },
        refunds: [
          batchDispatchRefund({
            workspaceId: input.workspaceId,
            userId: input.userId,
            billingKey,
            amount: GENERATION_CREDIT_COSTS.singleDerivation,
            action: "image_derivation",
            description: "assistant_preview_dispatch_refund",
            metadata: {
              campaignId: input.campaignId,
              derivationId: reservation.value.derivation.id,
              preview: true,
            },
          }),
        ],
      };
    },
    async completeDispatch(reservation) {
      await recordDispatchAck(
        input.workspaceId,
        {
          campaignId: input.campaignId,
          derivationId: reservation.value.derivation.id,
          preview: true,
        },
        dispatchAckKey(billingKey),
      );
      await touchQueuedDerivation(
        reservation.value.derivation.id,
        input.workspaceId,
        reservation.value.derivation.updatedAt,
      );
      await updateCampaign(input.campaignId, input.workspaceId, {
        status: "generating",
      });
      return reservation.value;
    },
  };
}

export type CampaignDerivationSettlementValue = {
  derivation: DerivationRow;
};

type CampaignDerivationReservation =
  GenerationSettlementReservation<CampaignDerivationSettlementValue>;

export function campaignDerivationUnitSettlementAdapter(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  billingKey: string;
  amount: number;
  action: CreditAction;
  intentMode: GenerationMode;
  eventIdPrefix: string;
  refundDescription: string;
  billingMetadata?: Record<string, unknown>;
  locale?: string;
  assistantActionId?: string | null;
  promptText: string;
  targetFormat: string;
  parentId?: string | null;
  reserve: () => Promise<CampaignDerivationReservation>;
  buildEventData: (derivation: DerivationRow) => Record<string, unknown>;
  onComplete?: () => Promise<void>;
}): GenerationSettlementAdapter<
  CampaignDerivationSettlementValue,
  CampaignDerivationReservation
> {
  const origin: CreativeWorkOrigin = input.assistantActionId
    ? "assistant"
    : "campaign";
  const surface: GenerationSurface = input.assistantActionId
    ? "assistant"
    : "campaign";
  return {
    reserve: input.reserve,
    async charge(reservation) {
      const ackKey = dispatchAckKey(input.billingKey);
      const dimensions =
        getTargetDimensions(
          input.targetFormat as "1:1" | "4:5" | "9:16" | "3:4",
        ) ?? { width: 1024, height: 1024 };
      const request: GenerationRequest = {
        authorship: {
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
        origin,
        surface,
        intent: { mode: input.intentMode, objective: null },
        identity: {
          clientProfileId: null,
          referenceImages: [],
          brandConstraints: null,
        },
        format: {
          targetFormat: input.targetFormat,
          dimensions,
          constraints: null,
        },
        source: {
          parentId: input.parentId ?? null,
          sourceVersionId: null,
          lineageId: null,
          packageSource: null,
        },
        prompt: { text: input.promptText },
        cost: {
          chargeAmount: input.amount,
          refundPolicy: "default",
        },
        idempotency: {
          billingKey: input.billingKey,
          skipWhenOutputExists: true,
        },
        destination: {
          kind: "derivation",
          id: reservation.value.derivation.id,
          storagePrefix: `derivations/${reservation.value.derivation.id}`,
          campaignId: input.campaignId,
        },
      };
      const spend = await chargeForGeneration(request, {
        action: input.action,
        metadata: {
          campaignId: input.campaignId,
          derivationId: reservation.value.derivation.id,
          reservationUpdatedAt:
            reservation.value.derivation.updatedAt.toISOString(),
          settlementDispatchAckRequired: true,
          settlementDispatchAckKey: ackKey,
          ...input.billingMetadata,
        },
      });
      return toSettlementCharge(spend);
    },
    async resolveReplay(reservation) {
      const usage = await getUsageByIdempotencyKey(
        input.workspaceId,
        input.billingKey,
      );
      const metadata = usage?.metadata as
        | {
            derivationId?: unknown;
            destinationId?: unknown;
            reservationUpdatedAt?: unknown;
            settlementDispatchAckRequired?: unknown;
            settlementDispatchAckKey?: unknown;
          }
        | null
        | undefined;
      const originalId =
        typeof metadata?.derivationId === "string"
          ? metadata.derivationId
          : typeof metadata?.destinationId === "string"
            ? metadata.destinationId
            : null;
      let original = originalId
        ? await getDerivationById(originalId, input.workspaceId)
        : reservation.value.derivation;
      const reservationUpdatedAt =
        typeof metadata?.reservationUpdatedAt === "string"
          ? new Date(metadata.reservationUpdatedAt)
          : null;
      const refund = batchDispatchRefund({
        workspaceId: input.workspaceId,
        userId: input.userId,
        billingKey: input.billingKey,
        amount: input.amount,
        action: input.action,
        description: input.refundDescription,
        metadata: {
          campaignId: input.campaignId,
          derivationId: original?.id,
        },
      });
      const recordedRefund = await getUsageByIdempotencyKey(
        input.workspaceId,
        refund.idempotencyKey,
      );
      if (recordedRefund && original) {
        return {
          status: "dispatch_failed",
          failure: {
            value: { derivation: original },
            refunds: [refund],
          },
        };
      }
      const ack = settlementDispatchMetadata(metadata);
      const deadline = settlementDeadline({ maxAttempts: SETTLEMENT_POLL_ATTEMPTS, maxMs: 10_000 });
      for (let attempt = 0; original && deadline.shouldContinue(attempt); attempt += 1) {
        if (ack.required) {
          const recordedAck =
            ack.key &&
            (await deadline.read(() => getUsageByIdempotencyKey(input.workspaceId, ack.key!)));
          if (recordedAck) {
            await updateCampaign(input.campaignId, input.workspaceId, {
              status: "generating",
            });
            await input.onComplete?.();
            return {
              status: "settled",
              value: { derivation: original },
            };
          }
          const lateRefund = await deadline.read(() => getUsageByIdempotencyKey(
            input.workspaceId,
            refund.idempotencyKey,
          ));
          if (lateRefund) {
            return {
              status: "dispatch_failed",
              failure: {
                value: { derivation: original },
                refunds: [refund],
              },
            };
          }
          await deadline.pause();
          original = await deadline.read(() => getDerivationById(original!.id, input.workspaceId));
          continue;
        }
        if (original.status === "failed") {
          return {
            status: "dispatch_failed",
            failure: {
              value: { derivation: original },
              refunds: [refund],
            },
          };
        }
        if (
          original.status !== "queued" ||
          (reservationUpdatedAt && original.updatedAt > reservationUpdatedAt)
        ) {
          await updateCampaign(input.campaignId, input.workspaceId, {
            status: "generating",
          });
          await input.onComplete?.();
          return {
            status: "settled",
            value: { derivation: original },
          };
        }
        await deadline.pause();
        original = await deadline.read(() => getDerivationById(original!.id, input.workspaceId));
      }
      if (!original) return null;
      if (ack.required) {
        const finalAck =
          ack.key &&
          (await getUsageByIdempotencyKey(input.workspaceId, ack.key));
        if (finalAck) {
          await updateCampaign(input.campaignId, input.workspaceId, {
            status: "generating",
          });
          await input.onComplete?.();
          return {
            status: "settled",
            value: { derivation: original },
          };
        }
        const finalRefund = await getUsageByIdempotencyKey(
          input.workspaceId,
          refund.idempotencyKey,
        );
        if (finalRefund) {
          return {
            status: "dispatch_failed",
            failure: {
              value: { derivation: original },
              refunds: [refund],
            },
          };
        }
        if (original.status === "failed") {
          logger.error(
            `[generation-settlement] campaign unit recovery unresolved derivationId=${original.id}`,
          );
          throw new Error("generation_settlement_dispatch_uncertain");
        }
      }
      if (!usage || (ack.required && !ack.key)) {
        throw new Error("generation_settlement_dispatch_uncertain");
      }
      if (original.status === "queued") {
        try {
          await inngest.send({
            id: derivationGenerateEventId(input.eventIdPrefix, original.id),
            name: heavyImageEventName("derivation.generate"),
            data: input.buildEventData(original),
          });
        } catch (error) {
          logger.error(
            `[generation-settlement] campaign unit recovery uncertain derivationId=${original.id}`,
            error,
          );
          throw new Error("generation_settlement_dispatch_uncertain");
        }
      }
      await recordDispatchAck(
        input.workspaceId,
        {
          campaignId: input.campaignId,
          derivationId: original.id,
        },
        dispatchAckKey(input.billingKey),
      );
      await touchQueuedDerivation(
        original.id,
        input.workspaceId,
        original.updatedAt,
      );
      await updateCampaign(input.campaignId, input.workspaceId, {
        status: "generating",
      });
      await input.onComplete?.();
      return {
        status: "settled",
        value: { derivation: original },
      };
    },
    release: (reservation) =>
      deleteQueuedDerivation(
        reservation.value.derivation.id,
        input.workspaceId,
      ),
    async dispatch(reservation) {
      await inngest.send({
        id: derivationGenerateEventId(
          input.eventIdPrefix,
          reservation.value.derivation.id,
        ),
        name: heavyImageEventName("derivation.generate"),
        data: input.buildEventData(reservation.value.derivation),
      });
    },
    async failDispatch(reservation, error) {
      logger.error(
        `[generation-settlement] ${input.eventIdPrefix} dispatch FAILED derivationId=${reservation.value.derivation.id}`,
        error,
      );
      const failed = await failQueuedDerivation(
        reservation.value.derivation.id,
        input.workspaceId,
      ).catch(() => null);
      return {
        value: {
          derivation: failed ?? reservation.value.derivation,
        },
        refunds: [
          batchDispatchRefund({
            workspaceId: input.workspaceId,
            userId: input.userId,
            billingKey: input.billingKey,
            amount: input.amount,
            action: input.action,
            description: input.refundDescription,
            metadata: {
              campaignId: input.campaignId,
              derivationId: reservation.value.derivation.id,
            },
          }),
        ],
      };
    },
    async completeDispatch(reservation) {
      await recordDispatchAck(
        input.workspaceId,
        {
          campaignId: input.campaignId,
          derivationId: reservation.value.derivation.id,
        },
        dispatchAckKey(input.billingKey),
      );
      await touchQueuedDerivation(
        reservation.value.derivation.id,
        input.workspaceId,
        reservation.value.derivation.updatedAt,
      );
      await updateCampaign(input.campaignId, input.workspaceId, {
        status: "generating",
      });
      await input.onComplete?.();
      return reservation.value;
    },
  };
}

export function restyleCampaignSettlementAdapter(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  billingKey: string;
  billingAction: CreditAction;
  /** Product-resolved unit price; required so settlement does not invent cost. */
  billingAmount: number;
  billingMetadata?: Record<string, unknown>;
  locale?: string;
  assistantActionId?: string | null;
  styleAssetId: string;
  format: string;
}): GenerationSettlementAdapter<
  CampaignDerivationSettlementValue,
  CampaignDerivationReservation
> {
  return campaignDerivationUnitSettlementAdapter({
    workspaceId: input.workspaceId,
    userId: input.userId,
    campaignId: input.campaignId,
    billingKey: input.billingKey,
    amount: input.billingAmount,
    action: input.billingAction,
    intentMode: "restyling",
    eventIdPrefix: "campaign-restyle",
    refundDescription: "restyle_campaign_dispatch_refund",
    billingMetadata: {
      mode: "restyling",
      ...input.billingMetadata,
    },
    locale: input.locale,
    assistantActionId: input.assistantActionId,
    promptText: `Restyle campaign ${input.campaignId}`,
    targetFormat: input.format,
    async reserve() {
      const derivation = await createDerivation({
        campaignId: input.campaignId,
        workspaceId: input.workspaceId,
        status: "queued",
        generationMode: "restyling",
        variantIndex: 0,
        format: input.format,
        styleAssetId: input.styleAssetId,
      });
      return { claimed: true, value: { derivation } };
    },
    buildEventData: (derivation) => ({
      derivationId: derivation.id,
      campaignId: input.campaignId,
      workspaceId: input.workspaceId,
      triggeredByUserId: input.userId,
      locale: input.locale,
      generationMode: "restyling",
      variantIndex: 0,
      format: derivation.format,
      styleAssetId: input.styleAssetId,
      ...(input.assistantActionId
        ? { assistantActionId: input.assistantActionId }
        : {}),
    }),
  });
}

/**
 * Refund keys a failed Creative Work output may carry. Each kind can be
 * compensated by at most one reactivation debit — keyed per refund kind so a
 * later refund of the same kind can never be reactivated twice, and a new
 * refund kind still restores the net debit exactly once.
 */
type CreativeWorkRefundKeyKind = "pregen" | "terminal" | "dispatch";

function creativeWorkRefundIdempotencyKey(
  workItemId: string,
  outputId: string,
  kind: CreativeWorkRefundKeyKind,
): string {
  return `creative-work:${workItemId}:output:${outputId}:${kind}-refund`;
}

/**
 * Idempotent reactivation of the original per-output charge. For every
 * refund kind whose refund ledger row exists without a matching reactivation
 * row, re-debit the product-resolved amount under `...:reactivate-<kind>`.
 * `recordUsage` is idempotent by key, so repeating the manual command never
 * duplicates the debit; a blocked reactivation (insufficient credits) stops
 * the retry before any requeue/enqueue.
 *
 * The caller resolves the price (see CONTEXT.md): settlement executes
 * reactivation but does not define pricing.
 */
export async function reactivateCreativeWorkOutputRefund(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  /** Durable manual ordinal, reserved by the guarded repository CAS. */
  retryAttempt: number;
  amount: number;
  userId?: string;
}): Promise<{ reactivated: CreativeWorkRefundKeyKind[]; reactivates?: string } | { blocked: true }> {
  if (!Number.isInteger(input.retryAttempt) || input.retryAttempt < 1) {
    throw new Error("creative_work_retry_attempt_invalid");
  }
  // A retry restores exactly one prior debit.  Older code looped over every
  // refund kind, which could charge a customer multiple times for one click.
  const refundKeys = input.retryAttempt === 1
    ? [
        creativeWorkCompensatoryRefundIdempotencyKey(input.outputId),
        creativeWorkTerminalRefundIdempotencyKey(input.workItemId, input.outputId),
        creativeWorkRefundIdempotencyKey(input.workItemId, input.outputId, "dispatch"),
        creativeWorkRefundIdempotencyKey(input.workItemId, input.outputId, "pregen"),
      ]
    : [creativeWorkTerminalReactivationRefundIdempotencyKey(
        input.workItemId,
        input.outputId,
        input.retryAttempt - 1,
      )];
  const refundKey = (await Promise.all(refundKeys.map(async (key) =>
    (await getUsageByIdempotencyKey(input.workspaceId, key)) ? key : null,
  ))).find((key): key is string => key !== null);
  if (!refundKey) return { reactivated: [] };

  const reactivationKey = creativeWorkTerminalReactivationIdempotencyKey(
    input.workItemId,
    input.outputId,
    input.retryAttempt,
  );
  const existingReactivation = await getUsageByIdempotencyKey(input.workspaceId, reactivationKey);
  if (existingReactivation) return { reactivated: ["terminal"], reactivates: refundKey };
  const result = await recordUsage({
    workspaceId: input.workspaceId,
    action: "image_derivation",
    idempotencyKey: reactivationKey,
    amount: input.amount,
    metadata: {
      creativeWorkId: input.workItemId,
      outputId: input.outputId,
      description: "creative_work_retry_reactivation",
      reactivates: refundKey,
      manualRetryAttempt: input.retryAttempt,
    },
    userId: input.userId,
  });
  if (result.status === "blocked") return { blocked: true };
  return { reactivated: ["terminal"], reactivates: refundKey };
}

/**
 * Finds the one debit that a terminal/cancel/reconciliation path must
 * compensate.  It intentionally understands historical fixed reactivation
 * keys as well as the modern attempt-scoped ledger, so every terminal path
 * reaches the same answer.
 */
export type CreativeWorkReactivationResolution =
  | { state: "outstanding"; kind: "manual" | "legacy"; retryAttempt: number | null; chargeKey: string; refundKey: string }
  | { state: "already_refunded"; kind: "manual" | "legacy"; retryAttempt: number | null; chargeKey: string; refundKey: string }
  | { state: "none" };

type UsageLedgerRow = NonNullable<Awaited<ReturnType<typeof getUsageByIdempotencyKey>>>;

function isRefundAfterDebit(refund: UsageLedgerRow, debit: UsageLedgerRow): boolean {
  // Historical canonical refunds are only a compensation for a fixed legacy
  // reactivation when they were written later. The original refund commonly
  // predates the reactivation that re-debited it and must not cancel that
  // debit retroactively. Rows without timestamps keep the safer specific-key
  // behavior: only their paired `reactivate-*-refund` key can settle them.
  return refund.createdAt instanceof Date
    && debit.createdAt instanceof Date
    && refund.createdAt.getTime() > debit.createdAt.getTime();
}

type LegacyReactivationCandidate = {
  kind: "terminal" | "pregen" | "dispatch";
  chargeKey: string;
  refundKey: string;
  charge: UsageLedgerRow;
  pairedRefund: UsageLedgerRow | null;
};

export async function resolveCreativeWorkOutputReactivationOutcome(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  manualRetryAttempt: number | null | undefined;
}): Promise<CreativeWorkReactivationResolution> {
  const attempt = input.manualRetryAttempt;
  let alreadyRefunded: Exclude<CreativeWorkReactivationResolution, { state: "outstanding" } | { state: "none" }> | null = null;
  if (attempt && attempt > 0) {
    const chargeKey = creativeWorkTerminalReactivationIdempotencyKey(input.workItemId, input.outputId, attempt);
    const refundKey = creativeWorkTerminalReactivationRefundIdempotencyKey(input.workItemId, input.outputId, attempt);
    if (await getUsageByIdempotencyKey(input.workspaceId, chargeKey)) {
      if (await getUsageByIdempotencyKey(input.workspaceId, refundKey)) {
        alreadyRefunded = { state: "already_refunded", kind: "manual", retryAttempt: attempt, chargeKey, refundKey };
      } else {
        return {
          state: "outstanding",
          kind: "manual",
          retryAttempt: attempt,
          chargeKey,
          refundKey,
        };
      }
    }
  }
  // Historical releases created fixed keys for each refund kind. Generic
  // terminal/compensatory refunds were not keyed to one legacy debit, so they
  // are matched chronologically once: each can settle only the most recent
  // preceding still-unmatched debit. Explicit paired refunds remain exact.
  const candidates: LegacyReactivationCandidate[] = [];
  for (const kind of ["terminal", "pregen", "dispatch"] as const) {
    const chargeKey = kind === "terminal"
      ? creativeWorkLegacyTerminalReactivationIdempotencyKey(input.workItemId, input.outputId)
      : `creative-work:${input.workItemId}:output:${input.outputId}:reactivate-${kind}`;
    const refundKey = kind === "terminal"
      ? creativeWorkLegacyTerminalReactivationRefundIdempotencyKey(input.workItemId, input.outputId)
      : `${chargeKey}-refund`;
    const charge = await getUsageByIdempotencyKey(input.workspaceId, chargeKey);
    if (!charge) continue;
    const pairedRefund = await getUsageByIdempotencyKey(input.workspaceId, refundKey);
    candidates.push({ kind, chargeKey, refundKey, charge, pairedRefund });
  }
  const genericRefunds = (await Promise.all([
    getUsageByIdempotencyKey(input.workspaceId, creativeWorkCompensatoryRefundIdempotencyKey(input.outputId)),
    getUsageByIdempotencyKey(input.workspaceId, creativeWorkTerminalRefundIdempotencyKey(input.workItemId, input.outputId)),
  ])).filter((refund): refund is UsageLedgerRow => Boolean(refund));
  const genericSettled = new Set<string>();
  for (const refund of genericRefunds
    .filter((candidate) => candidate.createdAt instanceof Date)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())) {
    const eligible = candidates
      .filter((candidate) => !candidate.pairedRefund && !genericSettled.has(candidate.chargeKey)
        && isRefundAfterDebit(refund, candidate.charge))
      .sort((left, right) => right.charge.createdAt.getTime() - left.charge.createdAt.getTime()
        || right.chargeKey.localeCompare(left.chargeKey))[0];
    if (eligible) genericSettled.add(eligible.chargeKey);
  }
  for (const candidate of candidates) {
    if (candidate.pairedRefund || genericSettled.has(candidate.chargeKey)) {
      alreadyRefunded ??= { state: "already_refunded", kind: "legacy", retryAttempt: null, chargeKey: candidate.chargeKey, refundKey: candidate.refundKey };
      continue;
    }
    return { state: "outstanding", kind: "legacy", retryAttempt: null, chargeKey: candidate.chargeKey, refundKey: candidate.refundKey };
  }
  return alreadyRefunded ?? { state: "none" };
}

/** Compatibility wrapper for terminal callers that only need an unpaid debit. */
export async function resolveCreativeWorkOutputReactivation(input: Parameters<typeof resolveCreativeWorkOutputReactivationOutcome>[0]) {
  const outcome = await resolveCreativeWorkOutputReactivationOutcome(input);
  return outcome.state === "outstanding" ? outcome : null;
}

export function regenerateDerivationSettlementAdapter(input: {
  workspaceId: string;
  userId: string;
  billingKey: string;
  /** Product-resolved unit price; required so settlement does not invent cost. */
  amount: number;
  billingMetadata?: Record<string, unknown>;
  locale?: string;
  assistantActionId?: string | null;
  source: DerivationRow;
  createInput: Parameters<typeof createDerivation>[0];
}): GenerationSettlementAdapter<
  CampaignDerivationSettlementValue,
  CampaignDerivationReservation
> {
  return campaignDerivationUnitSettlementAdapter({
    workspaceId: input.workspaceId,
    userId: input.userId,
    campaignId: input.source.campaignId,
    billingKey: input.billingKey,
    amount: input.amount,
    action: "regeneration",
    intentMode:
      (input.source.generationMode as GenerationMode | null) ??
      "art_variation",
    eventIdPrefix: "campaign-regenerate",
    refundDescription: "regenerate_derivation_dispatch_refund",
    billingMetadata: {
      sourceDerivationId: input.source.id,
      ...input.billingMetadata,
    },
    locale: input.locale,
    assistantActionId: input.assistantActionId,
    promptText: `Regenerate derivation ${input.source.id}`,
    targetFormat: input.source.format ?? "1:1",
    parentId: input.source.id,
    async reserve() {
      const derivation = await createDerivation(input.createInput);
      return { claimed: true, value: { derivation } };
    },
    buildEventData: (derivation) => ({
      derivationId: derivation.id,
      campaignId: input.source.campaignId,
      workspaceId: input.workspaceId,
      triggeredByUserId: input.userId,
      locale: input.locale,
      generationMode: input.source.generationMode,
      variantIndex: input.source.variantIndex,
      ctaText: input.source.ctaText,
      format: input.source.format,
      ...(input.assistantActionId
        ? { assistantActionId: input.assistantActionId }
        : {}),
    }),
  });
}

export function deliveryPackageSettlementAdapter(input: {
  workspaceId: string;
  userId: string;
  source: DerivationRow;
  formatsToCreate: string[];
  /**
   * Optional caller-owned key (e.g. assistant-action:…). When omitted, the
   * charge key is built from formats actually claimed after reserve so races
   * never bill for rows another request created.
   */
  billingKey?: string;
  /** Product-resolved per-format price. */
  unitChargeAmount: number;
  billingMetadata?: Record<string, unknown>;
  locale?: string;
  assistantActionId?: string | null;
}): GenerationSettlementAdapter<
  DerivationBatchSettlementValue,
  DerivationBatchReservation
> {
  return derivationBatchSettlementAdapter({
    workspaceId: input.workspaceId,
    userId: input.userId,
    campaignId: input.source.campaignId,
    assistantActionId: input.assistantActionId,
    billingKey:
      input.billingKey ??
      `delivery-package:${input.source.id}:pending`,
    amount: 0,
    unitCount: 0,
    unitChargeAmount: input.unitChargeAmount,
    action: "delivery_package_child",
    intentMode: "format_adaptation",
    origin: input.assistantActionId ? "assistant" : "campaign",
    surface: input.assistantActionId ? "assistant" : "campaign",
    eventIdPrefix: "delivery-package",
    refundDescription: "delivery_package_dispatch_refund",
    billingMetadata: {
      sourceDerivationId: input.source.id,
      formatsRequested: input.formatsToCreate,
      ...input.billingMetadata,
    },
    resolveChargePlan: (reservation) => {
      const claimed = new Set(reservation.newlyCreatedIds);
      const formats = reservation.value.derivations
        .filter((row) => claimed.has(row.id) && row.format)
        .map((row) => row.format as string)
        .sort();
      const unitCount = formats.length;
      // Prefer explicit caller key (assistant action). Otherwise bind the
      // charge to claimed child ids so a later attempt after failure/complete
      // cannot replay an earlier settlement for the same formats.
      const billingKey =
        input.billingKey ??
        `delivery-package:${input.source.id}:${formats.join(",")}:${[...claimed].sort().join(",")}`;
      return {
        amount: unitCount * input.unitChargeAmount,
        unitCount,
        unitChargeAmount: input.unitChargeAmount,
        billingKey,
      };
    },
    async reserve() {
      const created = await Promise.all(
        input.formatsToCreate.map((format) =>
          createPackageChildIfAbsent({
            campaignId: input.source.campaignId,
            workspaceId: input.workspaceId,
            planId: input.source.planId ?? undefined,
            parentId: input.source.id,
            status: "queued",
            generationMode: "format_adaptation",
            variantIndex: input.source.variantIndex ?? undefined,
            ctaText: input.source.ctaText ?? undefined,
            format,
          }),
        ),
      );
      const newlyCreated = created.filter((row) => row.created);
      return {
        claimed: newlyCreated.length > 0,
        value: { derivations: created.map((row) => row.child) },
        newlyCreatedIds: newlyCreated.map((row) => row.child.id),
      };
    },
    dispatchIds: (reservation) => reservation.newlyCreatedIds,
    buildEventData: (derivation) => ({
      derivationId: derivation.id,
      campaignId: input.source.campaignId,
      workspaceId: input.workspaceId,
      triggeredByUserId: input.userId,
      locale: input.locale,
      generationMode: "format_adaptation",
      variantIndex: input.source.variantIndex,
      ctaText: input.source.ctaText,
      format: derivation.format,
      ...(input.assistantActionId
        ? { assistantActionId: input.assistantActionId }
        : {}),
    }),
  });
}

export type CampaignBatchDerivationJob = {
  variantIndex: number;
  ctaText: string | null;
  format: string;
  generationMode: string;
  styleAssetId?: string | null;
  creativeLevel?: string | null;
  outputLearningApplication?: Parameters<typeof createDerivation>[0]["outputLearningApplication"];
};

export function campaignBatchDerivationSettlementAdapter(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  billingKey: string;
  amount: number;
  unitCount: number;
  unitChargeAmount: number;
  action: CreditAction;
  intentMode: GenerationBatchCharge["intent"]["mode"];
  locale?: string;
  jobs: CampaignBatchDerivationJob[];
  planId?: string;
  isPreview: boolean;
}): GenerationSettlementAdapter<
  DerivationBatchSettlementValue,
  DerivationBatchReservation
> {
  const jobs = input.jobs;
  const billingMetadata: Record<string, unknown> = {
    operation_key: input.isPreview ? "preview" : "batch",
    ...(input.isPreview ? { preview: true } : {}),
    estimateCredits: input.amount,
    count: input.unitCount,
  };
  return derivationBatchSettlementAdapter({
    workspaceId: input.workspaceId,
    userId: input.userId,
    campaignId: input.campaignId,
    billingKey: input.billingKey,
    amount: input.amount,
    unitCount: input.unitCount,
    unitChargeAmount: input.unitChargeAmount,
    action: input.action,
    intentMode: input.intentMode,
    origin: "campaign",
    surface: "campaign",
    eventIdPrefix: "campaign-batch",
    refundDescription: "campaign_batch_dispatch_refund",
    billingMetadata,
    async reserve() {
      const created = await Promise.all(
        jobs.map((job) =>
          createDerivation({
            campaignId: input.campaignId,
            workspaceId: input.workspaceId,
            ...(input.planId ? { planId: input.planId } : {}),
            status: "queued",
            generationMode: job.generationMode,
            variantIndex: job.variantIndex,
            ...(job.ctaText ? { ctaText: job.ctaText } : {}),
            format: job.format,
            isPreview: input.isPreview,
            ...(job.outputLearningApplication
              ? { outputLearningApplication: job.outputLearningApplication }
              : { outputLearningApplication: null }),
            ...(job.styleAssetId ? { styleAssetId: job.styleAssetId } : {}),
          }),
        ),
      );
      return {
        claimed: true,
        value: { derivations: created },
        newlyCreatedIds: created.map((row) => row.id),
      };
    },
    buildEventData: (derivation) => {
      const job =
        jobs.find(
          (row) =>
            row.format === derivation.format &&
            row.variantIndex === derivation.variantIndex,
        ) ?? jobs.find((row) => row.format === derivation.format);
      return {
        derivationId: derivation.id,
        campaignId: input.campaignId,
        workspaceId: input.workspaceId,
        triggeredByUserId: input.userId,
        locale: input.locale,
        generationMode: job?.generationMode ?? derivation.generationMode,
        variantIndex: job?.variantIndex ?? derivation.variantIndex,
        ctaText: job?.ctaText ?? derivation.ctaText,
        format: derivation.format,
        isPreview: input.isPreview,
        styleAssetId: job?.styleAssetId ?? null,
        ...(input.isPreview ? { preview: true } : {}),
        ...(job?.generationMode === "art_variation"
          ? { creativeLevel: job.creativeLevel ?? "balanced" }
          : {}),
      };
    },
  });
}
