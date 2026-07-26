import { logger } from "@/lib/logger";
import { spend } from "@/server/billing/paywall";
import type { CreativeWorkOutputPlan } from "@/server/creative-work/contracts";
import { chargeForGenerationBatch } from "@/server/generation/canonical/charge";
import {
  GENERATION_CREDIT_COSTS,
  type GenerationBatchCharge,
} from "@/server/generation/canonical/types";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import { inngest } from "@/server/jobs/client";
import { updateCampaign } from "@/server/repositories/campaign";
import {
  createPlannedCreativeWorkOutputs,
  deleteQueuedCreativeWorkOutputs,
  failQueuedCreativeWorkOutput,
  getCreativeWork,
  refreshCreativeWorkStatus,
  setCreativeWorkStatus,
} from "@/server/repositories/creative-work";
import {
  createPackageChildIfAbsent,
  deleteQueuedDerivation,
  getDerivationById,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import type {
  GenerationSettlementAdapter,
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

export function creativeWorkSettlementAdapter(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
  readyWork: CreativeWork;
  plans: CreativeWorkOutputPlan[];
  batch: GenerationBatchCharge;
}): GenerationSettlementAdapter<
  CreativeWorkSettlementValue,
  CreativeWorkReservation
> {
  return {
    async reserve() {
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
    charge: () =>
      chargeForGenerationBatch(input.batch, {
        returnPath: `/quick-tools/create-post?workId=${input.workItemId}`,
        metadata: { creativeWorkId: input.workItemId },
      }),
    release: (reservation) =>
      deleteQueuedCreativeWorkOutputs(
        input.workspaceId,
        input.workItemId,
        reservation.newlyCreatedIds,
      ),
    async dispatch(reservation) {
      await inngest.send(
        reservation.newlyCreatedIds.map((outputId) => ({
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
      const failed = (
        await Promise.all(
          reservation.newlyCreatedIds.map((outputId) =>
            failQueuedCreativeWorkOutput(
              input.workspaceId,
              input.workItemId,
              outputId,
              "dispatch_failed",
            ),
          ),
        )
      ).filter((output) => output != null);
      await refreshCreativeWorkStatus(
        input.workspaceId,
        input.workItemId,
      ).catch(() => undefined);
      return {
        value: reservation.value,
        refunds: failed.map((output) => ({
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
        })),
      };
    },
    async completeDispatch(reservation) {
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
type FormatChild = Awaited<
  ReturnType<typeof createPackageChildIfAbsent>
>["child"];
export type FormatAdaptationSettlementValue = {
  derivation: FormatChild;
  source: FormatSource;
};
type FormatAdaptationReservation =
  GenerationSettlementReservation<FormatAdaptationSettlementValue> & {
    created: boolean;
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
      const { child, created } = await createPackageChildIfAbsent({
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
        claimed: created,
        value: { derivation: child, source: input.source },
        created,
      };
    },
    charge: () =>
      spend({
        workspaceId: input.workspaceId,
        action: "image_derivation",
        amount: GENERATION_CREDIT_COSTS.singleDerivation,
        idempotencyKey: input.billingIdempotencyKey,
        metadata: {
          sourceDerivationId: input.source.id,
          targetFormat: input.targetFormat,
          ...input.billingMetadata,
        },
        userId: input.userId,
      }),
    release: (reservation) =>
      deleteQueuedDerivation(
        reservation.value.derivation.id,
        input.workspaceId,
      ),
    async dispatch(reservation) {
      await inngest.send({
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
      const failed =
        (await updateDerivationStatus(
          reservation.value.derivation.id,
          input.workspaceId,
          "failed",
        )) ?? reservation.value.derivation;
      return {
        value: { derivation: failed, source: input.source },
        refunds: [
          {
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
          },
        ],
      };
    },
    async completeDispatch(reservation) {
      await updateCampaign(input.source.campaignId, input.workspaceId, {
        status: "generating",
      });
      return reservation.value;
    },
  };
}
