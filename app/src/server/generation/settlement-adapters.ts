import { logger } from "@/lib/logger";
import { getTargetDimensions } from "@/lib/formats";
import type { SpendResult } from "@/server/billing/paywall";
import type { CreativeWorkOutputPlan } from "@/server/creative-work/contracts";
import {
  chargeForGeneration,
  chargeForGenerationBatch,
} from "@/server/generation/canonical/charge";
import {
  GENERATION_CREDIT_COSTS,
  type GenerationBatchCharge,
  type GenerationRequest,
} from "@/server/generation/canonical/types";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import { inngest } from "@/server/jobs/client";
import { updateCampaign } from "@/server/repositories/campaign";
import {
  createCreativeWorkRevision,
  createPlannedCreativeWorkOutputs,
  deleteQueuedCreativeWorkOutputs,
  failQueuedCreativeWorkOutput,
  getCreativeWork,
  refreshCreativeWorkStatus,
  setCreativeWorkStatus,
} from "@/server/repositories/creative-work";
import {
  createDerivation,
  deleteQueuedDerivation,
  failQueuedDerivation,
  getDerivationById,
  getLatestFormatAdaptationChild,
  touchQueuedDerivation,
} from "@/server/repositories/derivation";
import {
  getUsageByIdempotencyKey,
  trackUsage,
} from "@/server/repositories/usage";
import type {
  GenerationSettlementAdapter,
  GenerationSettlementChargeResult,
  GenerationSettlementReservation,
} from "./settlement";

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

export function creativeWorkSettlementAdapter(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
  readyWork: CreativeWork;
  plans: CreativeWorkOutputPlan[];
  batch: GenerationBatchCharge;
  existing?: CreativeWorkSettlementValue;
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
      const created = await createPlannedCreativeWorkOutputs(
        input.workspaceId,
        input.workItemId,
        input.plans,
      );
      return {
        claimed: created.newlyCreatedIds.length > 0,
        value: { work: input.readyWork, outputs: created.outputs },
        newlyCreatedIds: created.newlyCreatedIds,
      };
    },
    async join() {
      let lastAggregate: Awaited<ReturnType<typeof getCreativeWork>> = null;
      let missingRequiredAck = false;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const aggregate = await getCreativeWork(
          input.workspaceId,
          input.workItemId,
        );
        if (!aggregate?.outputs.length) return null;
        lastAggregate = aggregate;
        const chargeUsage = await getUsageByIdempotencyKey(
          input.workspaceId,
          input.batch.billingKey,
        );
        const ack = settlementDispatchMetadata(chargeUsage?.metadata);
        missingRequiredAck =
          ack.required &&
          (!ack.key ||
            !(await getUsageByIdempotencyKey(input.workspaceId, ack.key)));
        const failed = aggregate.outputs.filter(
          (output) => output.failureCode === "dispatch_failed",
        );
        const hasRecordedRefund = (
          await Promise.all(
            aggregate.outputs.map((output) =>
              getUsageByIdempotencyKey(
                input.workspaceId,
                creativeWorkDispatchRefundKey(input.workItemId, output.id),
              ),
            ),
          )
        ).some((usage) => usage != null);
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
          await new Promise((resolve) => setTimeout(resolve, 25));
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
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      // Missing ack is not proof of dispatch. Resume idempotent send for still-
      // queued rows, then write ack and settle. Already-progressed rows settle.
      if (lastAggregate) {
        const queuedIds = lastAggregate.outputs
          .filter((output) => output.status === "queued")
          .map((output) => output.id);
        if (queuedIds.length > 0) {
          try {
            await inngest.send(
              queuedIds.map((outputId) => ({
                id: creativeWorkGenerateEventId(outputId),
                name: heavyImageEventName("creative-work.generate"),
                data: {
                  workspaceId: input.workspaceId,
                  workItemId: input.workItemId,
                  outputId,
                },
              })),
            );
          } catch {
            return {
              status: "dispatch_failed",
              failure: {
                value: {
                  work: lastAggregate.work,
                  outputs: lastAggregate.outputs,
                },
                refunds: creativeWorkDispatchRefunds(
                  input,
                  queuedIds.map((id) => ({ id })),
                ),
                resumeAfterCompensation: Boolean(input.existing),
              },
            };
          }
        }
        await recordDispatchAck(
          input.workspaceId,
          {
            creativeWorkId: input.workItemId,
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
      await inngest.send(
        reservation.newlyCreatedIds.map((outputId) => ({
          id: creativeWorkGenerateEventId(outputId),
          name: heavyImageEventName("creative-work.generate"),
          data: {
            workspaceId: input.workspaceId,
            workItemId: input.workItemId,
            outputId,
          },
        })),
      );
    },
    async failDispatch(reservation) {
      await Promise.allSettled(
        reservation.newlyCreatedIds.map((outputId) =>
          failQueuedCreativeWorkOutput(
            input.workspaceId,
            input.workItemId,
            outputId,
            "dispatch_failed",
          ),
        ),
      );
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
      };
    },
    async completeDispatch(reservation) {
      await recordDispatchAck(
        input.workspaceId,
        {
          creativeWorkId: input.workItemId,
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
          input.targetFormat as "1:1" | "4:5" | "9:16",
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
      for (let attempt = 0; original && attempt < 80; attempt += 1) {
        if (original.status === "failed") {
          return {
            status: "dispatch_failed",
            failure: {
              value: { derivation: original, source: input.source },
              refunds: [dispatchRefund],
            },
          };
        }
        if (ack.required) {
          const recordedAck =
            ack.key &&
            (await getUsageByIdempotencyKey(input.workspaceId, ack.key));
          if (recordedAck) {
            await updateCampaign(input.source.campaignId, input.workspaceId, {
              status: "generating",
            });
            return {
              status: "settled",
              value: { derivation: original, source: input.source },
            };
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
          original = await getDerivationById(original.id, input.workspaceId);
          continue;
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
        await new Promise((resolve) => setTimeout(resolve, 25));
        original = await getDerivationById(original.id, input.workspaceId);
      }
      if (!original) return null;
      // Missing ack is not proof of dispatch. Resume idempotent send while
      // still queued, then write ack and settle.
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
        } catch {
          return {
            status: "dispatch_failed",
            failure: {
              value: { derivation: original, source: input.source },
              refunds: [dispatchRefund],
            },
          };
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
}): GenerationSettlementAdapter<
  CreativeWorkRevisionSettlementValue,
  CreativeWorkRevisionReservation
> {
  return {
    async reserve() {
      const reservation = await createCreativeWorkRevision(
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
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const recordedRefund = await getUsageByIdempotencyKey(
          input.workspaceId,
          refund.idempotencyKey,
        );
        if (output.failureCode === "dispatch_failed" || recordedRefund) {
          return {
            status: "dispatch_failed",
            failure: { value: { output }, refunds: [refund] },
          };
        }
        if (ack.required) {
          const recordedAck =
            ack.key &&
            (await getUsageByIdempotencyKey(input.workspaceId, ack.key));
          if (recordedAck) {
            return { status: "settled", value: { output } };
          }
        } else if (output.status !== "queued") {
          return { status: "settled", value: { output } };
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
        output =
          (
            await getCreativeWork(input.workspaceId, input.workItemId)
          )?.outputs.find((row) => row.id === output.id) ?? output;
      }
      // Missing ack is not proof of dispatch. Resume idempotent send while
      // still queued, then write ack and settle.
      if (output.status === "queued") {
        try {
          await inngest.send({
            id: creativeWorkRevisionEventId(output.id),
            name: heavyImageEventName("creative-work.generate"),
            data: {
              workspaceId: input.workspaceId,
              workItemId: input.workItemId,
              outputId: output.id,
            },
          });
        } catch {
          return {
            status: "dispatch_failed",
            failure: { value: { output }, refunds: [refund] },
          };
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
      await inngest.send({
        id: creativeWorkRevisionEventId(reservation.value.output.id),
        name: heavyImageEventName("creative-work.generate"),
        data: {
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          outputId: reservation.value.output.id,
        },
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
