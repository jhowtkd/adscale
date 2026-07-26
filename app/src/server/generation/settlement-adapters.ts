import { logger } from "@/lib/logger";
import { getTargetDimensions } from "@/lib/formats";
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
} from "@/server/repositories/derivation";
import { getUsageByIdempotencyKey } from "@/server/repositories/usage";
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
    async join(reservation) {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (
          await getUsageByIdempotencyKey(
            input.workspaceId,
            input.batch.billingKey,
          )
        ) {
          return reservation.value;
        }
        const aggregate = await getCreativeWork(
          input.workspaceId,
          input.workItemId,
        );
        if (!aggregate?.outputs.length) return null;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("generation_settlement_join_timeout");
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
    charge(reservation) {
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
      return chargeForGeneration(request, {
        metadata: {
          sourceDerivationId: input.source.id,
          derivationId: reservation.value.derivation.id,
          targetFormat: input.targetFormat,
          ...input.billingMetadata,
        },
      });
    },
    async resolveReplay(reservation) {
      const usage = await getUsageByIdempotencyKey(
        input.workspaceId,
        input.billingIdempotencyKey,
      );
      const metadata = usage?.metadata as
        | { derivationId?: unknown; destinationId?: unknown }
        | null
        | undefined;
      const originalId =
        typeof metadata?.derivationId === "string"
          ? metadata.derivationId
          : typeof metadata?.destinationId === "string"
            ? metadata.destinationId
            : null;
      const original = originalId
        ? await getDerivationById(originalId, input.workspaceId)
        : reservation.previous;
      return original
        ? { derivation: original, source: input.source }
        : null;
    },
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
      const failed = await failQueuedDerivation(
        reservation.value.derivation.id,
        input.workspaceId,
      );
      return {
        value: {
          derivation: failed ?? reservation.value.derivation,
          source: input.source,
        },
        refunds: failed
          ? [{
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
          }]
          : [],
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
