import "server-only";
import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";
import { getCreativeWorkObjectiveVerdict } from "@/lib/creative-work-selection-policy";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { objectStorage } from "@/server/storage";
import { isRetryableProviderError } from "@/server/ai/image-generation";
import { normalizeReferenceBuffers } from "@/server/ai/normalize-image-for-ai";
import { executeCanonicalGeneration } from "@/server/generation/pipeline/execute";
import { resolveImageRenderPolicy } from "@/server/ai/image-render-policy";
import {
  runCreativeWorkPostGeneration,
  runCreativeWorkQualityAssessment,
  type CreativeWorkPostGenerationResult,
  type CreativeWorkQualityAssessmentResult,
} from "@/server/generation/pipeline/post-generation";
import {
  GENERATION_CREDIT_COSTS,
  creativeWorkUnitBillingKey,
  type GenerationResult,
  type GenerationRequest,
  type RefundDecision,
} from "@/server/generation/canonical/types";
import { getClientProfile } from "@/server/repositories/client-reference";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import {
  settleTerminalRefund,
  type TerminalRefundSettlementResult,
} from "@/server/generation/settlement";
import { resolveCreativeWorkOutputReactivation } from "@/server/generation/settlement-adapters";
import {
  CREATIVE_WORK_MAX_IMAGE_CALLS,
  CREATIVE_WORK_OBJECTIVE_QUALITY_REFUND_PENDING,
  CREATIVE_WORK_GENERATION_FAILED_TERMINAL_REFUND_PENDING as INTEGRATED_TERMINAL_REFUND_PENDING,
  CREATIVE_WORK_GENERATION_FAILED,
  clearCreativeWorkOutputGenerationFailedRefundPending,
  clearCreativeWorkOutputObjectiveQualityRefundPending,
  claimCreativeWorkOutputImageCall,
  countCreativeWorkProcessingOutputs,
  getCreativeWork,
  markCreativeWorkOutputProcessing,
  completeCreativeWorkOutput,
  failCreativeWorkOutput,
  failQueuedCreativeWorkOutput,
  refreshCreativeWorkStatus,
  requeueCreativeWorkOutputOnce,
  touchCreativeWorkOutputHeartbeat,
  markCreativeWorkOutputFailureCode,
  recordCreativeWorkGenerationAggregate,
} from "@/server/repositories/creative-work";
import {
  buildCreativeWorkPrompt,
  buildIntegratedSinglePrompt,
  buildSocialPostPrompt,
  type BuildCreativeWorkPromptInput,
  type SocialPostFormat,
} from "@/server/creative-work/prompt";
import {
  normalizeCreativeWorkReferenceImage,
  normalizedCreativeWorkReferenceName,
} from "@/server/creative-work/reference-normalize";
import {
  createCreativeWorkJobTimer,
  creativeWorkQueueWaitMs,
  logCreativeWorkGenerationAggregate,
  logCreativeWorkLateCompletionDiscarded,
  logCreativeWorkOutputStage,
  logCreativeWorkOutputTerminal as writeCreativeWorkOutputTerminal,
  logCreativeWorkRetry,
  observeCreativeWorkStage,
} from "@/server/creative-work/job-telemetry";
import { runExactComposition } from "@/server/creative-work/composite";
import { frozenExactBoxes } from "@/server/creative-work/visual-recipe";
import {
  buildDeterministicBrandFidelity,
  buildResidualBrandFidelityReview,
} from "@/server/creative-work/brand-fidelity";
import {
  runTextComposition,
  type TextCompositionProvenance,
} from "@/server/creative-work/text-composite";
import { buildTypographyPlan, isBrandFontAllowed } from "@/server/creative-work/typography-plan";
import { shouldBuildTypographyPlan } from "@/server/creative-work/identity-policy";
import {
  policyForExactAsset,
  preflightExactComposition,
  type CompositionProvenance,
} from "@/server/creative-work/placement-policy";
import { getTargetDimensions } from "@/lib/formats";
import { canonicalJsonStringify } from "@/server/creative-work/canonical-json";
import {
  resolveCreativeWorkArtRefinement,
  resolveCreativeWorkFactPack,
  resolveGenerationPolicyVersion,
} from "@/server/creative-work/contracts";
import { resolveCreativeWorkProtocol } from "@/server/creative-work/protocol";
import { resolveCreativeWorkRenderPolicy } from "@/server/creative-work/render-policy";
import { createSinglePieceArtDirection, type ArtDirectionResult } from "@/server/creative-work/art-direction";
import { exactPieceReferenceAssets } from "@/server/creative-work/piece-reference";
import {
  CreativeWorkReferenceError,
  planCreativeWorkReferences,
  type CreativeWorkReferencePlanAsset,
  type CreativeWorkReferenceRole,
  type CreativeWorkReferenceSlot,
} from "@/server/creative-work/reference-plan";
import { matchPersonPhotoBuffers, resolveSnapshotPersonSlots, type MatchedPersonPhotoInput } from "@/server/creative-work/identity";
import type {
  CreativeWorkFormat,
  CreativeWorkFactPack,
  CreativeWorkIdentitySnapshot,
  SocialPostCopy,
} from "@/server/creative-work/contracts";
import {
  inspectExactCompositionAsset,
  type AnalyzeCreativeWorkQaReference,
} from "@/server/ai/creative-qa";
import { ensureCreativeWorkOutputInLibrary } from "@/server/application/ensure-creative-work-output-library";
import { refineCreativeWork } from "@/server/application/refine-creative-work";
import { refundCreativeWorkOutputCompensatory } from "@/server/application/refund-creative-work-output";
import type { CreativeWorkOutput } from "@/server/db/schema";
import { inngest } from "./client";
import { heavyImageEventName } from "./heavy-image-events";
import {
  decideCreativeWorkRefund,
  decideJobIdempotency,
} from "@/server/generation/canonical/policies";

interface CreativeWorkGenerateEvent {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  /** New dispatches include this; old queued events resolve it from storage. */
  generationCorrelationId?: string;
}

interface CreativeWorkJobStep {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

interface CreativeWorkFailureEvent {
  data: { event: { data: CreativeWorkGenerateEvent } };
}

const OUTPUT_COST = GENERATION_CREDIT_COSTS.creativeWorkOutput;
const MAX_REFERENCE_IMAGES = 4;
const CREATIVE_WORK_RUNTIME_ENVIRONMENT =
  process.env.RENDER_SERVICE_NAME ?? process.env.RENDER_SERVICE_ID ?? process.env.NODE_ENV ?? "unknown";

type GenerationReferenceEvidence = {
  position: number;
  role: CreativeWorkReferenceRole;
  required: boolean;
  assetKey: string;
  label: string;
  sourceMimeType: string;
  mimeType: string;
  sha256: string;
};

type IntegratedRenderEvidence = {
  artDirection: ArtDirectionResult;
  renderPolicy: "integrated_v1";
  quality: "high";
};

function generationEvidence(
  result: GenerationResult,
  prompt: string,
  references: GenerationReferenceEvidence[],
  directionSnapshot: unknown | null,
) {
  const winner = result.candidates?.find((candidate) => candidate.winner);
  if (!winner) return null;
  return {
    version: 1 as const,
    prompt,
    promptSha256: createHash("sha256").update(prompt).digest("hex"),
    imageOperation: result.imageOperation,
    providerCalls: result.providerCalls ?? 0,
    providerRetries: result.providerRetries ?? 0,
    references,
    directionSnapshot,
    directionSnapshotSha256: directionSnapshot
      ? createHash("sha256").update(canonicalJsonStringify(directionSnapshot)).digest("hex")
      : null,
    winner: {
      provider: winner.provider,
      model: winner.model,
      durationMs: winner.durationMs,
      rawRequestId: winner.rawRequestId ?? null,
    },
    excludedCalls: result.excludedCalls ?? [],
    observations: (result.candidates ?? []).flatMap((candidate) =>
      candidate.observation ? [candidate.observation] : [],
    ),
  };
}


function mergeGenerationEvidence(
  previous: ReturnType<typeof generationEvidence> | null,
  next: ReturnType<typeof generationEvidence> | null,
) {
  if (!next) return previous;
  if (!previous) return next;
  const seen = new Set(
    next.excludedCalls
      .map((call) => call.requestId)
      .filter((requestId) => requestId !== "requestIdMissing"),
  );
  return {
    ...next,
    excludedCalls: [
      ...previous.excludedCalls.filter((call) => call.requestId === "requestIdMissing" || !seen.has(call.requestId)),
      ...next.excludedCalls,
    ],
    observations: [...new Map(
      [...(previous.observations ?? []), ...(next.observations ?? [])].map((item) => [item.callId, item]),
    ).values()],
  };
}

type SerializedCreativeWorkProviderError = {
  message: string;
  name: string;
  code?: string;
  retryable: boolean;
};

function serializeCreativeWorkProviderError(error: unknown): SerializedCreativeWorkProviderError {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const code = typeof (normalized as Error & { code?: unknown }).code === "string"
    ? (normalized as Error & { code: string }).code
    : undefined;
  return {
    message: normalized.message,
    name: normalized.name,
    ...(code ? { code } : {}),
    retryable: isRetryableProviderError(normalized),
  };
}

function restoreCreativeWorkProviderError(error: SerializedCreativeWorkProviderError): Error {
  const restored = new Error(error.message);
  restored.name = error.name;
  Object.assign(restored, {
    ...(error.code ? { code: error.code } : {}),
    retryable: error.retryable,
  });
  return restored;
}

async function recoverPendingCreativeWorkRefund(input: {
  workspaceId: string;
  workItemId: string;
  output: CreativeWorkOutput | null | undefined;
  userId?: string;
}): Promise<boolean> {
  const output = input.output;
  if (!output) return false;
  const qualityFailure = output.status === "completed"
    && output.failureCode === CREATIVE_WORK_OBJECTIVE_QUALITY_REFUND_PENDING
    && getCreativeWorkObjectiveVerdict(output.quality) === "fail" && Boolean(output.outputKey);
  const terminalFailure = output.status === "failed" && output.failureCode === INTEGRATED_TERMINAL_REFUND_PENDING;
  if (!qualityFailure && !terminalFailure) return false;
  let liquidated = false;
  try {
    liquidated = await refundCreativeWorkOutputCompensatory({
      workspaceId: input.workspaceId, workItemId: input.workItemId, outputId: output.id,
      manualRetryAttempt: output.manualRetryAttempt, userId: input.userId,
      failurePhase: "terminal", reason: qualityFailure ? "objective_quality_failed" : CREATIVE_WORK_GENERATION_FAILED,
    });
    if (liquidated) {
      if (qualityFailure && output.outputKey) await clearCreativeWorkOutputObjectiveQualityRefundPending(
        input.workspaceId, input.workItemId, output.id, output.outputKey,
      );
      else await clearCreativeWorkOutputGenerationFailedRefundPending(
        input.workspaceId, input.workItemId, output.id, output.manualRetryAttempt, output.retryCount,
      );
    }
  } catch (error) {
    logger.warn(`[creativeWorkOutputJob] refund recovery pending outputId=${output.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return liquidated;
}

function deserializeCreativeWorkTimestamp(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

async function recordCreativeWorkGenerationAggregateTelemetry(
  workspaceId: string,
  workItemId: string,
  generationCorrelationId?: string,
): Promise<void> {
  const aggregate = await recordCreativeWorkGenerationAggregate(
    workspaceId,
    workItemId,
    generationCorrelationId,
  );
  if (!aggregate) return;
  const fields = {
    workspaceId,
    workItemId,
    generationCorrelationId: aggregate.generationCorrelationId,
    unitCount: aggregate.unitCount,
    terminalCount: aggregate.terminalCount,
    successCount: aggregate.successCount,
    failureCount: aggregate.failureCount,
    result: aggregate.result,
    firstTerminalAt: aggregate.firstTerminalAt,
    completedAt: aggregate.completedAt,
    timeToFirstOutputMs: aggregate.timeToFirstOutputMs,
    totalDurationMs: aggregate.totalDurationMs,
  } as const;
  if (aggregate.firstTerminalEmitted) {
    logCreativeWorkGenerationAggregate({ phase: "first_terminal", ...fields });
  }
  if (aggregate.completionEmitted) {
    logCreativeWorkGenerationAggregate({ phase: "completed", ...fields });
  }
}

async function recordCreativeWorkFunnelEvent(
  workspaceId: string,
  workItemId: string,
  eventKey: "output_ready" | "creative_work_failed",
): Promise<void> {
  const aggregate = await getCreativeWork(workspaceId, workItemId);
  const work = aggregate?.work;
  if (!work?.createdByUserId) return;
  await recordBetaAnalyticsEvent({
    workspaceId,
    userId: work.createdByUserId,
    eventKey,
    source: "server",
    properties: {
      creativeWorkId: workItemId,
      protocol: work.toolKind === "social_post" ? "variations" : work.toolKind,
      outputCount: aggregate?.outputs.length ?? 0,
    },
  });
}

/**
 * Sanitize arbitrary error messages into a short, user-safe slug. The slug is
 * persisted on the output row so retry routes / UI can group failures without
 * leaking provider internals.
 */
export function sanitizeCreativeWorkFailureCode(message: string): string {
  const slug = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (slug.length === 0) return "provider_failed";
  return slug;
}

const creativeWorkOutputJobConfig: {
  id: string;
  retries: 0;
  concurrency: [{ limit: number; scope: "account"; key: string }];
  onFailure: (args: { event: CreativeWorkFailureEvent; error: unknown; step: CreativeWorkJobStep }) => Promise<void>;
} = {
    id: "generate-creative-work-output",
    retries: 0 as const,
    concurrency: [
      // v1 drain only: serial on the 512 MB web serve for unsuffixed
      // creative-work.generate. New work uses generate-creative-work-output-v2
      // (limit 2, key "openai") on adscale-image-worker.
      { limit: 1, scope: "account" as const, key: `"creative-work-image"` },
    ],
    onFailure: async ({ event, error, step }) => {
      const startedAt = performance.now();
      const originalEvent = event.data.event;
      const { workspaceId, workItemId, outputId, generationCorrelationId } = originalEvent.data as CreativeWorkGenerateEvent;
      let recoveredGenerationCorrelationId = generationCorrelationId;
      let interruptedUnitCount = 1;
      let interruptedActiveUnitCount = 1;
  let interruptedImageCallCount = 0;
  let interruptedRetryCount = 0;
      try {
        recoveredGenerationCorrelationId = await step.run(
          "load-interrupted-correlation",
          async () => {
            const aggregate = await getCreativeWork(workspaceId, workItemId);
            const output = aggregate?.outputs.find((candidate) => candidate.id === outputId);
            return output?.generationCorrelationId ?? aggregate?.work.generationCorrelationId;
          },
        ) ?? recoveredGenerationCorrelationId;
      } catch (correlationError) {
        logger.warn(
          `[creativeWorkOutputJob] correlation recovery failed outputId=${outputId}: ${correlationError instanceof Error ? correlationError.message : String(correlationError)}`,
        );
      }
      const recovered = await step.run("recover-interrupted-output", async () => {
        const aggregate = await getCreativeWork(workspaceId, workItemId);
        const output = aggregate?.outputs.find((candidate) => candidate.id === outputId);
        const failureCode = resolveCreativeWorkRenderPolicy(aggregate?.work.inputSnapshot).integrated && (output?.imageCallCount ?? 0) > 0
          ? INTEGRATED_TERMINAL_REFUND_PENDING : "generation_interrupted";
        const failed = await failCreativeWorkOutput(
          workspaceId,
          workItemId,
          outputId,
          failureCode,
        ) ?? await failQueuedCreativeWorkOutput(
          workspaceId,
          workItemId,
          outputId,
          failureCode,
        );
        if (failed) await refreshCreativeWorkStatus(workspaceId, workItemId);
        return Boolean(failed);
      });
      if (!recovered) {
        const currentScope = await getCreativeWork(workspaceId, workItemId);
        const current = currentScope?.outputs.find((candidate) => candidate.id === outputId);
        await recoverPendingCreativeWorkRefund({ workspaceId, workItemId, output: current, userId: currentScope?.work.createdByUserId ?? undefined });
        return;
      }

      const interruptedScope = await getCreativeWork(workspaceId, workItemId);
      const interruptedOutput = interruptedScope?.outputs.find((candidate) => candidate.id === outputId);
      const interruptedIntegrated = resolveCreativeWorkRenderPolicy(interruptedScope?.work.inputSnapshot).integrated;
      // A cached winning failure CAS does not authorize refunding a later
      // completed/retried row or falling back to a different settled key.
      if (interruptedOutput?.status === "completed" || (interruptedIntegrated && interruptedOutput && interruptedOutput.status !== "failed")) {
        await recoverPendingCreativeWorkRefund({ workspaceId, workItemId, output: interruptedOutput, userId: interruptedScope?.work.createdByUserId ?? undefined });
        return;
      }
      if (interruptedOutput?.failureCode === CREATIVE_WORK_GENERATION_FAILED
        && interruptedIntegrated) return;
      const integratedTerminalFailure = interruptedOutput?.failureCode === INTEGRATED_TERMINAL_REFUND_PENDING;
      const refunded = integratedTerminalFailure
        ? await recoverPendingCreativeWorkRefund({ workspaceId, workItemId, output: interruptedOutput, userId: interruptedScope?.work.createdByUserId ?? undefined })
        : await step.run("refund-interrupted-output", async () => {
        const current = (await getCreativeWork(workspaceId, workItemId))?.outputs.find((candidate) => candidate.id === outputId);
        const reactivation = await resolveCreativeWorkOutputReactivation({
          workspaceId,
          workItemId,
          outputId,
          manualRetryAttempt: current?.manualRetryAttempt,
        });
        const canonical = decideCreativeWorkRefund({
          surface: "quick_tool",
          failurePhase: reactivation ? "terminal" : "job_failure",
          workItemId,
          outputId,
        });
        const settlement = await settleTerminalRefund({
          workspaceId,
          decision: reactivation && canonical.refund
            ? { ...canonical, idempotencyKey: reactivation.refundKey, reason: "creative_work_terminal_reactivation_failure" }
            : canonical,
          metadata: {
            creativeWorkId: workItemId,
            outputId,
            reason: error instanceof Error ? error.message : String(error),
            description: "creative_work_output_job_refund",
          },
        });
        return settlement.applied;
      });
      if (refunded === false && !integratedTerminalFailure) {
        await step.run("mark-interrupted-refund-pending", async () => {
          await markCreativeWorkOutputFailureCode(
            workspaceId,
            workItemId,
            outputId,
            "generation_interrupted_refund_pending",
          );
        });
      }
      try {
        const telemetryScope = await step.run("load-interrupted-telemetry-scope", async () => {
          const aggregate = await getCreativeWork(workspaceId, workItemId);
          const scopedOutputs = (aggregate?.outputs ?? []).filter((candidate) =>
            recoveredGenerationCorrelationId
              ? candidate.generationCorrelationId === recoveredGenerationCorrelationId
              : true,
          );
          const output = scopedOutputs.find((candidate) => candidate.id === outputId);
          return {
            unitCount: scopedOutputs.length,
            activeUnitCount: scopedOutputs.filter((candidate) => candidate.status === "processing").length,
            imageCallCount: output?.imageCallCount ?? 0,
            retryCount: output?.retryCount ?? 0,
          };
        });
        interruptedUnitCount = telemetryScope.unitCount || interruptedUnitCount;
        interruptedActiveUnitCount = telemetryScope.activeUnitCount;
        interruptedImageCallCount = telemetryScope.imageCallCount;
        interruptedRetryCount = telemetryScope.retryCount;
      } catch (telemetryScopeError) {
        logger.warn(
          `[creativeWorkOutputJob] interrupted telemetry scope failed outputId=${outputId}: ${telemetryScopeError instanceof Error ? telemetryScopeError.message : String(telemetryScopeError)}`,
        );
      }
      try {
        await step.run("record-generation-aggregate", async () => {
          await recordCreativeWorkGenerationAggregateTelemetry(
            workspaceId,
            workItemId,
            recoveredGenerationCorrelationId,
          );
        });
      } catch (aggregateError) {
        try {
          logger.warn(
            `[creativeWorkOutputJob] interrupted aggregate telemetry failed outputId=${outputId}: ${aggregateError instanceof Error ? aggregateError.message : String(aggregateError)}`,
          );
        } catch {
          // Auxiliary telemetry must never suppress the terminal event.
        }
      }
      writeCreativeWorkOutputTerminal({
        workspaceId,
        workItemId,
        outputId,
        generationCorrelationId: recoveredGenerationCorrelationId,
        protocol: "unknown",
        imageCallCount: interruptedImageCallCount,
        retryCount: interruptedRetryCount,
        unitCount: interruptedUnitCount,
        activeUnitCount: interruptedActiveUnitCount,
        environment: CREATIVE_WORK_RUNTIME_ENVIRONMENT,
        outcome: "failed",
        failureCode: "generation_interrupted",
        refunded: refunded !== false,
        durationMs: Math.round(performance.now() - startedAt),
      });
      logger.error(
        `[creativeWorkOutputJob] INTERRUPTED outputId=${outputId} recovered=true refunded=${refunded !== false}`,
      );
    },
  };

const creativeWorkOutputJobHandler = async ({
  event,
  step,
  attempt,
  runId,
}: {
  event: { data: CreativeWorkGenerateEvent };
  step: CreativeWorkJobStep;
  attempt?: number;
  runId?: string;
}) => {
    const data = event.data as CreativeWorkGenerateEvent;
    const { workspaceId, workItemId, outputId } = data;
    logger.info(
      `[creativeWorkOutputJob] START workspaceId=${workspaceId} workItemId=${workItemId} outputId=${outputId} runId=${runId ?? "n/a"} attempt=${attempt ?? 0}`,
    );

    // R-006/R-007 runtime state shared between the happy path and the
    // catch/terminal paths (terminal refund decision + telemetry).
    const jobTimer = createCreativeWorkJobTimer();
    let providerInvoked = false;
    let isV1Policy = false;
    let isDirectExecution = false;
    let renderPolicy = resolveCreativeWorkRenderPolicy(null);
    let imageCallCount = 0;
    let providerCalls = 0;
    let providerRetries = 0;
    let terminalRefunded = false;
    let leaseLostStage: string | undefined;
    let generationCorrelationId: string | undefined;
    let generationUnitCount = 1;
    let activeUnitCount = 1;
    let terminalTelemetryEmitted = false;
    let outputManualRetryAttempt: number | null = null;
    let workCreatedByUserId: string | undefined;
    const incompleteOutputKeys = new Set<string>();
    let retainedOutputKey: string | null = null;
    const logCreativeWorkOutputTerminal = (
      fields: Parameters<typeof writeCreativeWorkOutputTerminal>[0],
    ): void => {
      if (terminalTelemetryEmitted) return;
      terminalTelemetryEmitted = true;
      writeCreativeWorkOutputTerminal(fields);
    };

    try {
      const scopeRaw = (await step.run("load-scope", async () => {
        const result = await getCreativeWork(workspaceId, workItemId);
        if (!result) return null;
        const output = result.outputs.find((o) => o.id === outputId) ?? null;
        return {
          work: result.work,
          output,
            generationUnitCount: result.outputs.filter(
              (candidate) => candidate.generationCorrelationId === (output?.generationCorrelationId ?? result.work.generationCorrelationId),
            ).length,
            initialProcessingUnitCount: result.outputs.filter(
              (candidate) =>
                candidate.generationCorrelationId === (output?.generationCorrelationId ?? result.work.generationCorrelationId) &&
                candidate.status === "processing",
            ).length,
          parentOutput: output?.parentOutputId
            ? result.outputs.find((candidate) => candidate.id === output.parentOutputId) ?? null
            : null,
        };
      })) as unknown as {
        work: Awaited<ReturnType<typeof getCreativeWork>> extends infer R
          ? R extends { work: infer W }
            ? W
            : never
          : never;
        output: Awaited<ReturnType<typeof getCreativeWork>> extends infer R
          ? R extends { outputs: infer O }
            ? O extends Array<infer Item>
              ? Item | null
              : never
            : never
            : never;
        parentOutput: Awaited<ReturnType<typeof getCreativeWork>> extends infer R
          ? R extends { outputs: infer O }
            ? O extends Array<infer Item>
              ? Item | null
              : never
            : never
            : never;
        generationUnitCount: number;
        initialProcessingUnitCount: number;
      } | null;

      if (
        !scopeRaw ||
        !scopeRaw.output ||
        !scopeRaw.work.brief ||
        !scopeRaw.work.identitySnapshot ||
        !scopeRaw.work.copy
      ) {
        logger.warn(
          `[creativeWorkOutputJob] SKIP missing scope workspaceId=${workspaceId} outputId=${outputId}`,
        );
        return { success: false, skipped: true, outputId };
      }

      const work = scopeRaw.work;
      workCreatedByUserId = work.createdByUserId ?? undefined;
      const brief = work.brief;
      if (!brief) return { success: false, skipped: true, outputId };
      const output = scopeRaw.output;
      outputManualRetryAttempt = output.manualRetryAttempt;
      generationCorrelationId = output.generationCorrelationId ?? scopeRaw.work.generationCorrelationId;
      generationUnitCount = scopeRaw.generationUnitCount;
      activeUnitCount = scopeRaw.initialProcessingUnitCount + (output.status === "queued" ? 1 : 0);
      const creativeLevel = output.creativeLevel;
      const parentOutput = scopeRaw.parentOutput;
      const identitySnapshot = work.identitySnapshot as CreativeWorkIdentitySnapshot;
      const copy = work.copy as SocialPostCopy;

      if (output.status === "failed" && output.failureCode === INTEGRATED_TERMINAL_REFUND_PENDING) {
        const refunded = await recoverPendingCreativeWorkRefund({ workspaceId, workItemId, output, userId: work.createdByUserId ?? undefined });
        return { success: false, skipped: true, outputId, failureCode: refunded ? CREATIVE_WORK_GENERATION_FAILED : INTEGRATED_TERMINAL_REFUND_PENDING };
      }

      // Idempotency: if a duplicate event arrives after the row already
      // completed, skip provider invocation entirely.
      const idempotency = decideJobIdempotency({
        surface: "quick_tool",
        outputStatus: output.status,
      });
      if (idempotency.skip) {
        await recoverPendingCreativeWorkRefund({ workspaceId, workItemId, output, userId: work.createdByUserId ?? undefined });
        logger.info(
          `[creativeWorkOutputJob] SKIP duplicate event outputId=${outputId} status=completed (${idempotency.reason})`,
        );
        return { success: true, skipped: true, outputId, outputKey: output.outputKey };
      }

      const processingOutput = await step.run("mark-processing", async () =>
        markCreativeWorkOutputProcessing(workspaceId, workItemId, outputId)
      );
      if (!processingOutput) {
        return { success: true, skipped: true, outputId };
      }

      try {
        activeUnitCount = await step.run(
          "count-processing-units",
          async () => countCreativeWorkProcessingOutputs(
            workspaceId,
            workItemId,
            generationCorrelationId,
          ),
        );
      } catch (concurrencyError) {
        logger.warn(
          `[creativeWorkOutputJob] concurrency snapshot failed outputId=${outputId}: ${concurrencyError instanceof Error ? concurrencyError.message : String(concurrencyError)}`,
        );
      }

      // Inngest serializes Date values crossing a step boundary as ISO
      // strings. Normalize at this boundary before calculating queue wait;
      // unit tests that run the step callback inline otherwise hide this.
      const queueEnteredAt = deserializeCreativeWorkTimestamp(
        processingOutput.queuedAt ?? processingOutput.createdAt,
      );
      const processingStartedAt = deserializeCreativeWorkTimestamp(processingOutput.updatedAt);
      logCreativeWorkOutputStage({
        workspaceId,
        workItemId,
        outputId,
        generationCorrelationId,
        protocol: "pending",
        stage: "queue_wait",
        status: "completed",
        stageDurationMs: creativeWorkQueueWaitMs({ queueEnteredAt, processingStartedAt }),
        queueEnteredAt: queueEnteredAt.toISOString(),
        processingStartedAt: processingStartedAt.toISOString(),
      });

      // R-011: route by the generation policy version frozen in the input
      // snapshot at prepare time — never by the live env switch — so
      // in-flight outputs finish under their original contract when the
      // switch is flipped.
      // R-001: v1 works resolve protocol, canonical mode and execution policy
      // through the single pure translation; legacy-frozen works (and the
      // explicit legacy social_post toolKind) keep the current adapter.
      const generationPolicyVersion = resolveGenerationPolicyVersion(work.inputSnapshot);
      renderPolicy = resolveCreativeWorkRenderPolicy(work.inputSnapshot);
      isV1Policy = generationPolicyVersion === "quality_recovery_v1";
      imageCallCount = output.imageCallCount ?? 0;
      // A frozen temporary Single reference needs its ordered provider plan
      // even on a legacy-policy row.  This is deliberately derived from the
      // snapshot contract rather than a new rollout flag.
      const hasFrozenPieceReferences = work.toolKind === "single"
        && Boolean(work.inputSnapshot?.sources.some((source) => source.pieceReference));
      const protocol = (isV1Policy || hasFrozenPieceReferences)
        ? resolveCreativeWorkProtocol({
            toolKind: work.toolKind,
            format: output.targetFormat as CreativeWorkFormat,
            targetFormats: work.settings?.targetFormats ?? [],
            revision: Boolean(parentOutput),
            revisionAction: output.revisionContext?.action,
          })
        : null;
      isDirectExecution = protocol?.execution === "direct";
      if (protocol) {
        logger.info(
          `[creativeWorkOutputJob] policy=quality_recovery_v1 outputId=${outputId} mode=${protocol.mode} execution=${protocol.execution}`,
        );
      }

      // R-007: structured telemetry correlation base — every stage/terminal
      // event carries the durable call authority and the requeue counter.
      const telemetryBase = () => ({
        workspaceId,
        workItemId,
        outputId,
        generationCorrelationId,
        protocol: protocol?.mode ?? "legacy",
        imageCallCount,
        providerCalls,
        providerRetries,
        retryCount: output.retryCount,
        unitCount: generationUnitCount,
        activeUnitCount,
        environment: CREATIVE_WORK_RUNTIME_ENVIRONMENT,
      });

      // R-007 lease heartbeat: touches updatedAt ONLY while this job still
      // owns the processing row. A null row means the lease was lost — abort
      // before any further provider call or commit.
      const checkLease = async (stage: string): Promise<boolean> => {
        const alive = await step.run(`heartbeat-${stage}`, async () =>
          Boolean(await touchCreativeWorkOutputHeartbeat(workspaceId, workItemId, outputId))
        );
        if (!alive) {
          leaseLostStage = stage;
          logCreativeWorkOutputStage({
            ...telemetryBase(),
            stage: "lease",
            status: "failed",
            result: "failed",
            leaseStage: stage,
            detail: "lease_lost",
          });
        }
        return alive;
      };

      const renewLease = async (stage: string): Promise<void> => {
        const alive = await touchCreativeWorkOutputHeartbeat(workspaceId, workItemId, outputId);
        if (!alive) {
          leaseLostStage = stage;
          logCreativeWorkOutputStage({
            ...telemetryBase(),
            stage: "lease",
            status: "failed",
            result: "failed",
            leaseStage: stage,
            detail: "lease_lost",
          });
          const leaseError = new Error(`creative_work_lease_lost:${stage}:${outputId}`) as Error & { code: string };
          leaseError.code = "lease_lost";
          throw leaseError;
        }
        logger.info({
          event: "image_pipeline_stage",
          stage: "heartbeat",
          status: "completed",
          heartbeatStage: stage,
          workId: workItemId,
          outputId,
          workspaceId,
          jobType: "creative_work",
          generationCorrelationId,
        });
      };

      const targetFormat = output.targetFormat as SocialPostFormat;
      let executionIdentityAssets: CreativeWorkIdentitySnapshot["assets"];
      try {
        const exactKeys = new Set<string>();
        const trainedExactAssets = identitySnapshot.assets.filter((asset) => asset.usageMode === "exact");
        const occupiedGravities = trainedExactAssets.flatMap((asset) => {
          const gravity = asset.placement?.gravity;
          return gravity === "northwest" || gravity === "northeast" || gravity === "southwest" || gravity === "southeast" ? [gravity] : [];
        });
        // A current Piece instruction is authoritative over an older Brand
        // Training reference with the same asset key. Allocate its corner
        // around trained exact marks before deduplicating the merged set.
        const exactPieceAssets = work.toolKind === "single"
          ? exactPieceReferenceAssets(work.inputSnapshot?.sources ?? [], targetFormat, occupiedGravities)
          : [];
        executionIdentityAssets = [...exactPieceAssets, ...identitySnapshot.assets]
          .filter((asset) => {
            if (asset.usageMode !== "exact") return true;
            if (exactKeys.has(asset.assetKey)) return false;
            exactKeys.add(asset.assetKey);
            return true;
          });
      } catch {
        const refundSettlement = await refundTerminalOutput({
          workspaceId,
          workItemId,
          outputId,
          manualRetryAttempt: output.manualRetryAttempt,
          reason: "exact_asset_preflight_failed",
        });
        terminalRefunded = refundSettlement.refunded && refundSettlement.applied;
        const failureCode = exactPreflightFailureCode(refundSettlement);
        await step.run("mark-failed-exact-plan-preflight", async () =>
          failCreativeWorkOutput(workspaceId, workItemId, outputId, failureCode),
        );
        return { success: false, outputId, failureCode };
      }
      let executionIdentitySnapshot = { ...identitySnapshot, assets: executionIdentityAssets };
      const dimensions = getTargetDimensions(targetFormat) ?? {
        width: 1024,
        height: 1280,
      };
      // Decode and validate every exact asset before prompt/provider work.
      // Omissible graphics/characters are a best-effort decoration: record a
      // deterministic omission and remove them from every later execution
      // input. Required marks remain an all-or-nothing pre-provider gate.
      let exactAssets = executionIdentityAssets.filter((asset) => asset.usageMode === "exact");
      const preflightExactOmissions: CompositionProvenance["omitted"] = [];
      const exactAssetBuffers = new Map<string, Buffer>();
      const exactAssetDimensions = new Map<string, { width: number; height: number }>();
      try {
        for (const asset of exactAssets) {
          const policy = policyForExactAsset(asset.category, targetFormat);
          try {
            const buffer = await objectStorage.get(asset.assetKey);
            const inspection = await inspectExactCompositionAsset(buffer);
            if (!inspection.ok) throw new Error("exact_asset_decode_failed");
            if (asset.hasAlpha && !inspection.hasUsableTransparency) {
              throw new Error("exact_asset_alpha_unusable");
            }
            exactAssetBuffers.set(asset.assetKey, buffer);
            exactAssetDimensions.set(asset.assetKey, { width: inspection.width, height: inspection.height });
          } catch (error) {
            if (!policy?.omissible) throw error;
            preflightExactOmissions.push({
              referenceId: asset.referenceId,
              assetKey: asset.assetKey,
              label: asset.label,
              reason: error instanceof Error && error.message === "exact_asset_alpha_unusable"
                ? "exact_asset_missing_alpha"
                : "exact_asset_load_failed",
            });
          }
        }
      } catch {
        const refundSettlement = await refundTerminalOutput({ workspaceId, workItemId, outputId, manualRetryAttempt: output.manualRetryAttempt, reason: "exact_asset_preflight_failed" });
        terminalRefunded = refundSettlement.refunded && refundSettlement.applied;
        const failureCode = exactPreflightFailureCode(refundSettlement);
        await step.run("mark-failed-exact-binary-preflight", async () =>
          failCreativeWorkOutput(workspaceId, workItemId, outputId, failureCode),
        );
        return { success: false, outputId, failureCode };
      }
      if (preflightExactOmissions.length > 0) {
        const omittedKeys = new Set(preflightExactOmissions.map((entry) => entry.assetKey));
        executionIdentityAssets = executionIdentityAssets.filter((asset) => !omittedKeys.has(asset.assetKey));
        exactAssets = executionIdentityAssets.filter((asset) => asset.usageMode === "exact");
        for (const key of omittedKeys) {
          exactAssetBuffers.delete(key);
          exactAssetDimensions.delete(key);
        }
        executionIdentitySnapshot = { ...identitySnapshot, assets: executionIdentityAssets };
      }
      const exactPreflight = preflightExactComposition({
        format: targetFormat,
        dimensions,
        assets: executionIdentityAssets,
        inspectedAssets: exactAssetDimensions,
        reportOmissions: true,
      });
      if (!exactPreflight.ok) {
        const refundSettlement = await refundTerminalOutput({
          workspaceId,
          workItemId,
          outputId,
          manualRetryAttempt: output.manualRetryAttempt,
          reason: "exact_asset_preflight_failed",
        });
        terminalRefunded = refundSettlement.refunded && refundSettlement.applied;
        const failureCode = exactPreflightFailureCode(refundSettlement);
        const failed = await step.run("mark-failed-exact-preflight", async () =>
          failCreativeWorkOutput(workspaceId, workItemId, outputId, failureCode),
        );
        if (failed) {
          logCreativeWorkOutputTerminal({
            ...telemetryBase(), outcome: "failed", failureCode,
            refunded: terminalRefunded, durationMs: jobTimer.elapsedMs(),
          });
        }
        return { success: false, outputId, failureCode, blocked: exactPreflight.blocked };
      }
      if (exactPreflight.omitted?.length) {
        const omittedKeys = new Set(exactPreflight.omitted.map((entry) => entry.assetKey));
        preflightExactOmissions.push(...exactPreflight.omitted);
        executionIdentityAssets = executionIdentityAssets.filter((asset) => !omittedKeys.has(asset.assetKey));
        exactAssets = executionIdentityAssets.filter((asset) => asset.usageMode === "exact");
        for (const key of omittedKeys) {
          exactAssetBuffers.delete(key);
          exactAssetDimensions.delete(key);
        }
        executionIdentitySnapshot = { ...identitySnapshot, assets: executionIdentityAssets };
      }
      const typographyPlan = !renderPolicy.integrated && shouldBuildTypographyPlan(work.toolKind)
        ? work.inputSnapshot?.typographyPlan ?? buildTypographyPlan({
            format: targetFormat,
            requestedLayout: work.settings?.textLayout,
            selectedFontAssetKey: work.settings?.fontAssetKey,
            fonts: identitySnapshot.brandKit.fontAssets ?? [],
            declaredFontFamilies: identitySnapshot.brandKit.fonts ?? [],
          })
        : null;
      const approvedFont = typographyPlan?.execution === "deterministic"
        ? identitySnapshot.brandKit.fontAssets?.find(
            (font) => font.assetKey === typographyPlan.fontAssetKey
              && isBrandFontAllowed(font, identitySnapshot.brandKit.fonts ?? []),
          ) ?? null
        : null;

      // Pre-generator block: prompt assembly + reference image load. Any
      // failure here happens before the upstream provider is invoked, so
      // we refund the per-output credit and let the outer catch mark the
      // output failed. Failures AFTER the provider follow R-006: v1 outputs
      // settle net zero via the idempotent terminal refund; legacy-frozen
      // works keep the historical no-refund behavior.
      let prompt: string;
      let referenceImages: Array<{ buffer: Buffer; mimeType: string; name: string }>;
      // R-005: v1 direct outputs carry the QA context assembled here (frozen
      // fact pack + role-bound reference plan) into the analyze-quality step.
      let v1FactPack: CreativeWorkFactPack | null = null;
      let v1RequiredReferenceRoles: CreativeWorkReferenceRole[] = [];
      let v1QaReferences: AnalyzeCreativeWorkQaReference[] = [];
      // Plan 03, T3: frozen snapshot people bound to their loaded primary
      // photos for the person-fidelity assessment in analyze-quality.
      let v1PersonPhotos: MatchedPersonPhotoInput[] = [];
      // R-006: frozen prompt inputs reused verbatim by the objective
      // correction — the second call starts from the SAME prompt/sources and
      // only appends the failure codes (R-004 criterion 5).
      let v1PromptInputs: Omit<BuildCreativeWorkPromptInput, "correction"> | null = null;
      let generationReferences: GenerationReferenceEvidence[] = [];
      let renderEvidence: IntegratedRenderEvidence | null = null;
      try {
        if (typographyPlan && typographyPlan.format !== targetFormat) {
          throw new Error("brand_typography_format_mismatch");
        }
        if (typographyPlan?.execution === "deterministic" && !approvedFont) {
          throw new Error("brand_font_snapshot_missing");
        }
        const inputSnapshot = work.inputSnapshot ?? {
          request: work.request,
          settings: work.settings,
          sources: [],
        };

        const exactLogoAssetKeys = new Set(
          executionIdentityAssets
            .filter((asset) => asset.usageMode === "exact" && asset.category === "logo")
            .map((asset) => asset.assetKey),
        );
        const referenceAssets = identitySnapshot.assets
          .filter((asset) => asset.usageMode === "reference")
          // The exact logo is composited after generation. Sending the same
          // logo as a provider reference invites a second, model-drawn mark.
          .filter((asset) => !exactLogoAssetKeys.has(asset.assetKey))
          .slice(0, MAX_REFERENCE_IMAGES);

        // Named people (plan 03, T2): frozen snapshot people become mandatory
        // provider references; secondary photos fill free slots in catalog
        // order. Anything missing fails as reference_failure before the
        // provider. Person asset keys are deduped out of the generic identity
        // list without losing the person association (dedicated slots above).
        const { slots: personSlots, secondaryAssets: personSecondaryAssets } =
          await resolveSnapshotPersonSlots({
            workspaceId,
            clientProfileId: work.clientProfileId,
            people: inputSnapshot.people ?? [],
            identityAssets: identitySnapshot.assets,
          });
        const personAssetKeys = new Set([
          ...personSlots.map((slot) => slot.assetKey),
          ...personSecondaryAssets.map((asset) => asset.assetKey),
        ]);
        const identityReferenceInputs = [
          ...personSecondaryAssets,
          ...referenceAssets.filter((asset) => !personAssetKeys.has(asset.assetKey)),
        ];

        if (output.parentOutputId && (!parentOutput?.outputKey || parentOutput.status !== "completed")) {
          throw new Error("creative_work_revision_parent_missing");
        }
        const revisionAsset = output.revisionAssetId
          ? await getWorkspaceAssetById(output.revisionAssetId, workspaceId)
          : null;
        if (output.revisionAssetId && (!revisionAsset || !revisionAsset.type.startsWith("image/"))) {
          throw new Error("creative_work_revision_asset_missing");
        }
        const revisionReferences = [
          ...(parentOutput?.outputKey ? [{
            assetKey: parentOutput.outputKey,
            mimeType: "image/png",
            label: `Versão ${parentOutput.versionNumber}`,
          }] : []),
          ...(revisionAsset ? [{
            assetKey: revisionAsset.key,
            mimeType: revisionAsset.type,
            label: revisionAsset.name,
          }] : []),
        ];

        // Binary payloads cannot cross an Inngest step boundary. The durable
        // asset keys live in the identity snapshot; buffers stay local to this
        // invocation and are consumed immediately by the provider.
        if (protocol) {
          // R-003 / spec 8: the reference plan is derived from the protocol
          // and reserves mandatory authorities first — the original art for
          // adaptation, content-then-style for restyle. Brand Training
          // identity assets only fill the slots left. A mandatory authority
          // that cannot be honored fails as reference_failure before the
          // provider; adaptation never falls back to reference-less generate.
          const planned = planCreativeWorkReferences({
            mode: protocol.mode,
            sources: work.inputSnapshot?.sources ?? [],
            identityReferenceAssets: identityReferenceInputs.map((asset) => ({
              assetKey: asset.assetKey,
              mimeType: asset.mimeType,
              label: asset.label,
            })),
            revisionReferences,
            personSlots,
            limit: MAX_REFERENCE_IMAGES,
            allowPieceReferences: work.toolKind === "single",
          });
          // Buffers load BEFORE the prompt is assembled: the REFERENCES block
          // binds `#n` to the n-th attached image purely positionally, so the
          // plan is filtered down to the slots that actually loaded and only
          // those reach the prompt builder — a skipped optional slot never
          // desyncs the numbering from the provider image array.
          const loadedReferences = (await Promise.all(
            planned.map(async (slot): Promise<{
              slot: CreativeWorkReferenceSlot;
              reference: { buffer: Buffer; mimeType: string; name: string };
            } | null> => {
              try {
                return {
                  slot,
                  reference: {
                    buffer: await objectStorage.get(slot.assetKey),
                    mimeType: slot.mimeType,
                    name: slot.label,
                  },
                };
              } catch (error) {
                if (slot.required) {
                  throw new CreativeWorkReferenceError(
                    `${slot.role} reference "${slot.label}" could not be loaded`,
                    { cause: error },
                  );
                }
                // Optional slots (Brand Training identity, style guidance)
                // are best-effort: a failed download never fails the whole
                // output — the slot is dropped and generation proceeds with
                // every mandatory authority intact.
                logger.warn(
                  `[creativeWorkOutputJob] optional reference skipped outputId=${outputId} role=${slot.role} assetKey=${slot.assetKey}: ${error instanceof Error ? error.message : String(error)}`,
                );
                return null;
              }
            }),
          )).filter((loaded): loaded is {
            slot: CreativeWorkReferenceSlot;
            reference: { buffer: Buffer; mimeType: string; name: string };
          } => loaded !== null);
          // R-007: normalize references to safe dimension/pixel limits BEFORE
          // the provider, preserving alpha. Raw megapixel downloads stay
          // scoped to `loadedReferences` and become collectable once the
          // normalized copies exist. A required slot that cannot be
          // normalized is a reference_failure; an optional one is dropped.
          const normalizedReferences: Array<{
            slot: CreativeWorkReferenceSlot;
            reference: { buffer: Buffer; mimeType: string; name: string };
          }> = [];
          for (const loaded of loadedReferences) {
            try {
              const normalized = await normalizeCreativeWorkReferenceImage({
                buffer: loaded.reference.buffer,
                mimeType: loaded.reference.mimeType,
              });
              normalizedReferences.push({
                slot: loaded.slot,
                reference: {
                  buffer: normalized.buffer,
                  mimeType: normalized.mimeType,
                  name: normalizedCreativeWorkReferenceName(loaded.reference.name, normalized.mimeType),
                },
              });
            } catch (error) {
              if (loaded.slot.required) {
                throw new CreativeWorkReferenceError(
                  `${loaded.slot.role} reference "${loaded.slot.label}" could not be normalized`,
                  { cause: error },
                );
              }
              logger.warn(
                `[creativeWorkOutputJob] optional reference dropped on normalization outputId=${outputId} role=${loaded.slot.role} assetKey=${loaded.slot.assetKey}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
          const loadedSlots = normalizedReferences.map((loaded) => loaded.slot);
          referenceImages = normalizedReferences.map((loaded) => loaded.reference);
          generationReferences = normalizedReferences.map((loaded, index) => ({
            position: index + 1,
            role: loaded.slot.role,
            required: loaded.slot.required,
            assetKey: loaded.slot.assetKey,
            label: loaded.slot.label,
            sourceMimeType: loaded.slot.mimeType,
            mimeType: loaded.reference.mimeType,
            sha256: createHash("sha256").update(loaded.reference.buffer).digest("hex"),
          }));
          // R-004: v1 direct outputs use the protocol-aware builder fed by the
          // resolved mode, the frozen fact pack, the persisted level/format
          // and the role-bound reference plan. The explicit legacy
          // `social_post` toolKind (legacy_tournament) keeps the legacy
          // builder and its current adapter behavior until its own migration.
          const factPack = protocol.execution === "direct"
            ? resolveCreativeWorkFactPack(work.inputSnapshot)
            : null;
          if (protocol.execution === "direct" && !factPack) {
            // v1 direct outputs always freeze a fact pack at prepare time
            // (R-002); resolving null here means an upstream bug or a
            // corrupted snapshot. Keep the defensive legacy read — never
            // fail — but make the anomaly visible.
            logger.warn(
              `[creativeWorkOutputJob] v1 direct output without frozen fact pack outputId=${outputId} workItemId=${workItemId} — falling back to the snapshot request as sole factual authority`,
            );
          }
          if (protocol.execution === "direct") {
            // R-005: freeze the QA context for the analyze-quality step —
            // the same fact pack and the slots that actually loaded feed the
            // objective evaluator so `#n` stays aligned with the provider call.
            v1FactPack = factPack;
            v1RequiredReferenceRoles = planned
              .filter((slot) => slot.required)
              .map((slot) => slot.role);
            v1QaReferences = normalizedReferences.map((loaded) => ({
              role: loaded.slot.role,
              label: loaded.slot.label,
              required: loaded.slot.required,
              buffer: loaded.reference.buffer,
              mimeType: loaded.reference.mimeType,
            }));
            v1PersonPhotos = matchPersonPhotoBuffers({
              people: inputSnapshot.people ?? [],
              personSlots,
              loaded: normalizedReferences.map((loaded) => ({
                slot: loaded.slot,
                buffer: loaded.reference.buffer,
                mimeType: loaded.reference.mimeType,
              })),
            });
          }
          prompt = protocol.execution === "direct"
            ? buildCreativeWorkPrompt({
                mode: protocol.mode,
                format: targetFormat,
                copy,
                inputSnapshot,
                factPack,
                identitySnapshot: executionIdentitySnapshot,
                creativeLevel,
                references: loadedSlots,
                revisionInstruction: output.revisionInstruction,
                textExecution: typographyPlan?.execution ?? "generative",
              })
            : buildSocialPostPrompt({
                format: targetFormat,
                brief,
                copy,
                identitySnapshot: executionIdentitySnapshot,
                inputSnapshot,
                revisionInstruction: output.revisionInstruction,
                creativeLevel,
              });
          if (protocol.execution === "direct") {
            v1PromptInputs = {
              mode: protocol.mode,
              format: targetFormat,
              copy,
              inputSnapshot,
              factPack,
              identitySnapshot: executionIdentitySnapshot,
              creativeLevel,
              references: loadedSlots,
              revisionInstruction: output.revisionInstruction,
              textExecution: typographyPlan?.execution ?? "generative",
            };
          }
        } else {
          // Legacy-frozen works keep the legacy builder and reference loading
          // byte-identical (R-004 criterion 6).
          prompt = buildSocialPostPrompt({
            format: targetFormat,
            brief,
            copy,
            identitySnapshot: executionIdentitySnapshot,
            inputSnapshot,
            revisionInstruction: output.revisionInstruction,
            creativeLevel,
          });
          const sourceReferences = (work.inputSnapshot?.sources ?? [])
            .filter((source) => (
              work.toolKind === "restyle" || source.usage === "style" || source.usage === "both"
            ) && (work.toolKind !== "single" || source.pieceReference?.treatment !== "exact_application") && source.assetKey && source.mimeType)
            // Same label policy as the v1 plan: frozen display name when the
            // snapshot carries one, otherwise a role label — never the raw id.
            .map((source) => ({ assetKey: source.assetKey!, mimeType: source.mimeType!, label: source.label?.trim() || "Source image" }));

          const orderedReferences = work.toolKind === "restyle"
            ? [...revisionReferences, ...sourceReferences, ...referenceAssets]
            : [...revisionReferences, ...referenceAssets, ...sourceReferences];
          referenceImages = await Promise.all(
            orderedReferences.slice(0, MAX_REFERENCE_IMAGES).map(async (asset) => ({
              buffer: await objectStorage.get(asset.assetKey),
              mimeType: asset.mimeType,
              name: asset.label,
            })),
          );
          referenceImages = await normalizeReferenceBuffers(referenceImages);
        }

        const directionInstruction = output.directionSnapshot?.instruction
          ? [output.directionSnapshot.instruction, inputSnapshot.settings?.directionPool?.manualInstruction?.trim()]
              .filter(Boolean).join("\n")
          : null;
        if (renderPolicy.integrated && v1PromptInputs) {
          const promptInput = v1PromptInputs;
          const artDirection = await step.run("single-piece-art-direction", () =>
            createSinglePieceArtDirection({ ...promptInput, directionInstruction })
          );
          prompt = artDirection.text
            ? buildIntegratedSinglePrompt(promptInput, artDirection.text)
            : buildCreativeWorkPrompt({ ...promptInput, textExecution: "generative" });
          renderEvidence = { artDirection, renderPolicy: "integrated_v1", quality: "high" };
        }
        if (directionInstruction) {
          // The pool's global manual instruction constrains every directional
          // output; rows generated before the pool have neither and keep the
          // legacy prompt untouched.
          prompt += `\n\nDIRECTION INSTRUCTION:\n${directionInstruction}`;
        }
      } catch (error) {
        terminalRefunded = await refundPreGeneratorOutput({
          workspaceId,
          workItemId,
          outputId,
          reason: error instanceof Error ? error.message : String(error),
          failurePhase: "pre_provider",
        });
        throw error;
      }

      const generationRequest: GenerationRequest = {
        authorship: {
          workspaceId,
          userId: work.createdByUserId ?? null,
        },
        origin: "quick_tool",
        surface: "quick_tool",
        intent: {
          mode: protocol?.mode ?? (parentOutput ? "creative_revision" : "social_post"),
          objective: brief.objective ?? null,
        },
        identity: {
          clientProfileId: work.clientProfileId,
          referenceImages,
          brandConstraints: null,
        },
        format: {
          targetFormat,
          dimensions,
          constraints: null,
        },
        source: {
          parentId: parentOutput?.id ?? null,
          sourceVersionId: parentOutput?.id ?? null,
          lineageId: parentOutput ? `${workItemId}:${output.creativeLevel}:${output.targetFormat}` : null,
          packageSource: parentOutput ? "creative_work_output" : "creative_work_brief",
        },
        prompt: { text: prompt },
        cost: {
          chargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
          refundPolicy: "default",
        },
        idempotency: {
          billingKey: parentOutput
            ? `creative-work:${workItemId}:revision:${outputId}`
            : creativeWorkUnitBillingKey(workItemId, outputId),
          skipWhenOutputExists: true,
        },
        destination: {
          kind: "creative_work_output",
          id: outputId,
          storagePrefix: `creative-work/${outputId}`,
          workItemId,
          generationCorrelationId,
        },
        executionPolicy: protocol?.execution,
        attempt: output.retryCount,
        renderPolicy: resolveImageRenderPolicy(work.inputSnapshot?.renderPolicy),
      };

      // R-007: lease re-check between steps — abort BEFORE the provider call
      // when this job no longer owns the processing row.
      if (!(await checkLease("pre-generate"))) {
        return { success: false, skipped: true, leaseLost: true, outputId };
      }

      const generated = await observeCreativeWorkStage(telemetryBase(), "generate_base", async () => {
        const result = await step.run("generate-base", async () => {
          if (protocol) {
            // R-006: the provider call is claimed atomically BEFORE reaching
            // the provider — once image_call_count hits the absolute ceiling
            // (2) the claim fails here and no provider call happens.
            const claimedCall = await claimCreativeWorkOutputImageCall(
              workspaceId,
              workItemId,
              outputId,
              ...(renderPolicy.integrated ? [output.manualRetryAttempt != null ? 2 : renderPolicy.maxImageCalls] as const : [] as const),
            );
            if (!claimedCall) return { outputKey: null as string | null, imageCallCount, providerInvoked: false };
            imageCallCount = claimedCall.imageCallCount;
            logCreativeWorkOutputStage({
              ...telemetryBase(),
              stage: "claim_image_call",
              status: "completed",
              detail: `imageCallCount=${imageCallCount}`,
            });
          }
          providerInvoked = true;
          // Same canonical executor as campaign/assistant (Gate 3 / item 25).
          try {
            const result = await executeCanonicalGeneration(generationRequest, {
              ...(renderPolicy.integrated ? { quality: renderPolicy.quality, callBudget: { remaining: 1 } } : {}),
              telemetry: {
                workId: workItemId,
                outputId,
                workspaceId,
                generationCorrelationId,
                ...(isDirectExecution ? { imageCallCount } : {}),
                inngestRunId: typeof runId === "string" ? runId : undefined,
                inngestAttempt: typeof attempt === "number" ? attempt : undefined,
                jobType: "creative_work",
              },
              onStageHeartbeat: renewLease,
            });
            providerCalls = result.providerCalls ?? providerCalls;
            providerRetries = result.providerRetries ?? providerRetries;
            const generation = generationEvidence(result, prompt, generationReferences, output.directionSnapshot ?? null);
            return {
              outputKey: result.outputKey as string | null,
              imageCallCount,
              providerInvoked,
              ...(renderEvidence ? { renderEvidence } : {}),
              ...(generation ? { generation } : {}),
              ...(result.providerCalls === undefined
                ? {}
                : {
                    providerCalls: result.providerCalls,
                    providerRetries: result.providerRetries ?? 0,
                  }),
            };
          } catch (error) {
            return {
              outputKey: null as string | null,
              imageCallCount,
              providerInvoked,
              ...(renderEvidence ? { renderEvidence } : {}),
              generationError: serializeCreativeWorkProviderError(error),
            };
          }
        });
        imageCallCount = result.imageCallCount ?? imageCallCount;
        providerInvoked = result.providerInvoked ?? (Boolean(result.outputKey) || "generationError" in result);
        if ("generationError" in result && result.generationError) {
          throw restoreCreativeWorkProviderError(result.generationError);
        }
        return result;
      });
      const generatedResult = generated as unknown as {
        outputKey: string | null;
        generation?: ReturnType<typeof generationEvidence>;
        providerCalls?: number;
        providerRetries?: number;
        renderEvidence?: IntegratedRenderEvidence;
      };
      providerCalls = generatedResult.providerCalls ?? providerCalls;
      providerRetries = generatedResult.providerRetries ?? providerRetries;
      const generatedOutputKey = generatedResult.outputKey;
      if (!generatedOutputKey) {
        if (renderPolicy.integrated) throw new Error("image_call_budget_exhausted");
        // Durable budget already consumed before this run (e.g. a stalled
        // run raced a manual retry): terminal failure with ZERO provider
        // calls here, settled net zero by the idempotent terminal refund.
        const refundSettlement = await refundTerminalOutput({
          workspaceId,
          workItemId,
          outputId,
          manualRetryAttempt: output.manualRetryAttempt,
          reason: "image_call_budget_exhausted",
        });
        terminalRefunded = refundSettlement.refunded && refundSettlement.applied;
        const failed = await step.run("mark-failed", async () =>
          failCreativeWorkOutput(workspaceId, workItemId, outputId, "image_call_budget_exhausted")
        );
        if (failed) {
          logCreativeWorkOutputTerminal({
            ...telemetryBase(),
            outcome: "failed",
            failureCode: "image_call_budget_exhausted",
            refunded: terminalRefunded,
            durationMs: jobTimer.elapsedMs(),
          });
        }
        return { success: false, outputId, failureCode: "image_call_budget_exhausted" };
      }
      incompleteOutputKeys.add(generatedOutputKey);
      if (!(await checkLease("after-generate"))) {
        return { success: false, skipped: true, leaseLost: true, outputId };
      }
      // The correction flow may replace the persisted key with its own.
      let finalOutputKey = generatedOutputKey;
      let finalGenerationEvidence = generatedResult.generation ?? null;

      // Exact brand assets (logo etc.) are composited after generation —
      // never drawn by the image model. Policy is per-asset/per-format.
      let compositionProvenance: CompositionProvenance | null = preflightExactOmissions.length > 0
        ? {
            version: 1,
            format: targetFormat,
            dimensions,
            composed: [],
            omitted: [...preflightExactOmissions],
            blocked: [],
          }
        : null;
      let textCompositionProvenance: TextCompositionProvenance | null = null;
      const recipeFrozenBoxes = frozenExactBoxes(work.inputSnapshot?.visualRecipe);

      const composeApprovedText = async (
        outputKey: string,
        stepName: string,
      ): Promise<TextCompositionProvenance | null> => {
        if (!approvedFont || typographyPlan?.execution !== "deterministic") return null;
        return (await step.run(stepName, async () => {
          const [baseBuffer, fontBuffer] = await Promise.all([
            objectStorage.get(outputKey),
            objectStorage.get(approvedFont.assetKey),
          ]);
          const result = await runTextComposition({
            base: baseBuffer,
            dimensions,
            copy,
            font: approvedFont,
            fontBuffer,
            typographyPlan,
            brandColors: identitySnapshot.brandKit.colors,
            occupiedBoxes: compositionProvenance?.composed.flatMap(
              (asset) => asset.box ? [asset.box] : [],
            ) ?? [],
          });
          await objectStorage.put(outputKey, result.buffer, "image/png");
          return result.provenance;
        })) as TextCompositionProvenance;
      };

      if (exactAssets.length > 0) {
        compositionProvenance = (await step.run("compose-exact-layers", async () => {
          const baseBuffer = await objectStorage.get(generatedOutputKey);
          const result = await runExactComposition({
            base: baseBuffer,
            format: targetFormat,
            dimensions,
            assets: executionIdentityAssets,
            loadAsset: async (assetKey) => exactAssetBuffers.get(assetKey) ?? Promise.reject(new Error(`exact_asset_not_preflighted:${assetKey}`)),
            ...(recipeFrozenBoxes ? { frozenBoxes: recipeFrozenBoxes } : {}),
          });
          await objectStorage.put(generatedOutputKey, result.buffer, "image/png");
          return {
            ...result.provenance,
            omitted: [...preflightExactOmissions, ...result.provenance.omitted],
          };
        })) as CompositionProvenance;
      }

      textCompositionProvenance = await composeApprovedText(
        generatedOutputKey,
        "compose-approved-copy",
      );

      // Keep the image buffer out of step results; only its storage key is
      // durable/serializable across Inngest boundaries.
      const finalBuffer = await objectStorage.get(generatedOutputKey);

      const clientProfile = (await step.run("load-client-profile", async () => {
        return getClientProfile(workspaceId, work.clientProfileId);
      })) as unknown as { id: string; name: string } | null;

      // R-005/R-006: v1 direct outputs run the tri-state objective QA —
      // deterministic file/dimension/reference checks plus a visual
      // evaluation contextualized by the frozen fact pack and the role-bound
      // references. The SAME assessment covers the base image and the
      // exclusive objective correction; only the buffer and the claimed
      // attempt (imageCallCount, the durable call authority) differ. The
      // subjective score is advisory only: it never rejects and never
      // triggers a retry. `inconclusive` completes with a review signal.
      const runV1Assessment = (imageBuffer: Buffer, attempt: number) =>
        runCreativeWorkQualityAssessment({
          workItemId,
          outputId,
          attempt,
          imageBuffer,
          expectedDimensions: dimensions,
          requiredReferenceRoles: v1RequiredReferenceRoles,
          attachedReferenceRoles: v1QaReferences
            .filter((reference) => reference.required)
            .map((reference) => reference.role),
          qa: {
            mode: protocol!.mode,
            format: targetFormat,
            request: work.inputSnapshot?.request ?? work.request,
            copy,
            factPack: v1FactPack,
            brandName: v1FactPack?.identity.brandName ?? clientProfile?.name ?? null,
            ...(renderPolicy.integrated ? { brandKit: identitySnapshot.brandKit, revisionInstruction: output.revisionInstruction } : {}),
            references: v1QaReferences,
            locale: "pt-BR",
            // Plan 04, T1: request the same-call art critique only when the
            // snapshot carries an explicitly accepted refinement budget.
            // Legacy and calibration snapshots keep the objective-only QA.
            ...(resolveCreativeWorkArtRefinement(work.inputSnapshot)
              ? { artCritique: { enabled: true } }
              : {}),
          },
          people: v1PersonPhotos,
          score: {
            imageBuffer,
            mimeType: "image/png",
            campaign: {
              name: brief.theme,
              client: clientProfile?.name ?? "",
              product: brief.theme,
              offer: brief.offer ?? "",
              objective: brief.objective,
              audience: brief.audience,
            },
            derivation: {
              ctaText: copy.cta,
              format: targetFormat,
              generationMode: protocol!.mode,
              feedback: null,
              creativeLevel,
              creativeDiagnosis: null,
            },
            locale: "pt-BR",
            contract: null,
          },
          telemetry: {
            workId: workItemId,
            outputId,
            workspaceId,
            generationCorrelationId,
            inngestRunId: typeof runId === "string" ? runId : undefined,
            inngestAttempt: typeof attempt === "number" ? attempt : undefined,
            jobType: "creative_work",
          },
        });

      const analyzed = (await observeCreativeWorkStage(telemetryBase(), "quality_assessment", () => step.run("analyze-quality", async () => {
        // Legacy-frozen works keep the historical score-threshold
        // post-generation byte-identical; v1 direct outputs run the tri-state
        // objective QA (R-005).
        if (protocol?.execution === "direct") {
          const assessment = await runV1Assessment(
            finalBuffer,
            Math.max(imageCallCount, 1),
          );
          logger.info(
            `[creativeWorkOutputJob] objective QA outputId=${outputId} verdict=${assessment.objectiveVerdict} codes=${assessment.quality.objectiveCodes.join(",") || "none"} attempt=${assessment.quality.attempt}`,
          );
          return { kind: "assessment" as const, assessment };
        }
        const postGen = await runCreativeWorkPostGeneration({
          workItemId,
          outputId,
          analyze: {
            imageBuffer: finalBuffer,
            mimeType: "image/png",
            // R5 mapping: brief fields → AnalyzeInput.campaign
            campaign: {
              name: brief.theme,
              client: clientProfile?.name ?? "",
              product: brief.theme,
              offer: brief.offer ?? "",
              objective: brief.objective,
              audience: brief.audience,
            },
            // R5 mapping: copy + format → AnalyzeInput.derivation
            derivation: {
              ctaText: copy.cta,
              format: targetFormat,
              generationMode: "art_variation",
              feedback: null,
              creativeLevel,
              creativeDiagnosis: null,
            },
            locale: "pt-BR",
            contract: null,
          },
          telemetry: {
            workId: workItemId,
            outputId,
            workspaceId,
            generationCorrelationId,
            inngestRunId: typeof runId === "string" ? runId : undefined,
            inngestAttempt: typeof attempt === "number" ? attempt : undefined,
            jobType: "creative_work",
          },
        });
        return { kind: "postgen" as const, postGen };
      }))) as unknown as
        | { kind: "assessment"; assessment: CreativeWorkQualityAssessmentResult }
        | { kind: "postgen"; postGen: CreativeWorkPostGenerationResult };

      if (renderPolicy.integrated && analyzed.kind === "assessment" && !analyzed.assessment.quality.checks.file.ok) {
        throw new Error("unusable_file");
      }

      if (analyzed.kind === "postgen" && analyzed.postGen.decision === "reject_low_quality") {
        // Adapter applies shared post-gen refund decision — does not re-decide policy.
        terminalRefunded = await applyRefundDecision({
          workspaceId,
          workItemId,
          outputId,
          reason: analyzed.postGen.reason,
          decision: analyzed.postGen.refund,
          description: "creative_work_output_low_quality_refund",
        });
        const failed = await failCreativeWorkOutput(workspaceId, workItemId, outputId, "low_quality");
        if (failed) {
          logCreativeWorkOutputTerminal({
            ...telemetryBase(),
            outcome: "failed",
            failureCode: "low_quality",
            refunded: terminalRefunded,
            durationMs: jobTimer.elapsedMs(),
          });
        }
        logger.warn(
          `[creativeWorkOutputJob] low-quality outputId=${outputId} reason=${analyzed.postGen.reason}`,
        );
        return {
          success: false,
          outputId,
          failureCode: "low_quality",
        };
      }

      let completedQuality = analyzed.kind === "assessment"
        ? (analyzed.assessment.quality as unknown as Record<string, unknown>)
        : ((analyzed.postGen.quality as unknown as Record<string, unknown> | null) ?? null);
      let completedVerdict: string | null =
        analyzed.kind === "assessment" ? analyzed.assessment.objectiveVerdict : null;

      // R-006: the second (and final) provider call is EXCLUSIVE — transport
      // retry XOR objective correction, never both, never a third. A
      // confirmed objective fail with budget left claims the correction here;
      // the correction re-uses the same frozen prompt/sources and appends
      // only the failure codes and their surgical instructions. The CAS
      // ceiling enforces the XOR: if a transport retry already consumed call
      // 2, the claim fails and the output settles terminally. `inconclusive`
      // and subjective-only findings never reach this branch.
      if (
        renderPolicy.automaticCorrection &&
        analyzed.kind === "assessment" &&
        analyzed.assessment.objectiveVerdict === "fail" &&
        v1PromptInputs
      ) {
        if (!(await checkLease("pre-correction"))) {
          return { success: false, skipped: true, leaseLost: true, outputId };
        }

        const correction = await observeCreativeWorkStage(telemetryBase(), "objective_correction", async () => {
          const result = await step.run("generate-correction", async () => {
            const claimedCall = await claimCreativeWorkOutputImageCall(
              workspaceId,
              workItemId,
              outputId,
            );
            if (!claimedCall) return { outputKey: null as string | null };
            imageCallCount = claimedCall.imageCallCount;
            logCreativeWorkOutputStage({
              ...telemetryBase(),
              stage: "claim_correction_call",
              status: "completed",
              detail: `imageCallCount=${imageCallCount}`,
            });
            const confirmedNotes = analyzed.assessment.quality.findings
              .filter((finding) => finding.status === "confirmed")
              .map((finding) => finding.note);
            const correctionPrompt = buildCreativeWorkPrompt({
              ...v1PromptInputs!,
              correction: {
                codes: analyzed.assessment.quality.objectiveCodes,
                instructions:
                  confirmedNotes.join(" ") ||
                  "Fix ONLY the confirmed objective failures listed above.",
              },
            });
            try {
              const result = await executeCanonicalGeneration(
                {
                  ...generationRequest,
                  prompt: { text: correctionPrompt },
                  attempt: 1,
                },
                {
                  telemetry: {
                    workId: workItemId,
                    outputId,
                    workspaceId,
                    generationCorrelationId,
                    ...(isDirectExecution ? { imageCallCount } : {}),
                    inngestRunId: typeof runId === "string" ? runId : undefined,
                    inngestAttempt: typeof attempt === "number" ? attempt : undefined,
                    jobType: "creative_work",
                  },
                  onStageHeartbeat: renewLease,
                },
              );
              providerCalls += result.providerCalls ?? 0;
              providerRetries += result.providerRetries ?? 0;
              const generation = generationEvidence(result, correctionPrompt, generationReferences, output.directionSnapshot ?? null);
              return {
                outputKey: result.outputKey as string | null,
                ...(generation ? { generation } : {}),
              };
            } catch (error) {
              return {
                outputKey: null as string | null,
                generationError: serializeCreativeWorkProviderError(error),
              };
            }
          });
          if ("generationError" in result && result.generationError) {
            throw restoreCreativeWorkProviderError(result.generationError);
          }
          return result;
        });
        const correctionResult = correction as unknown as {
          outputKey: string | null;
          generation?: ReturnType<typeof generationEvidence>;
        };
        const correctionOutputKey = correctionResult.outputKey;

        if (!correctionOutputKey) {
          const refundSettlement = await refundTerminalOutput({
            workspaceId,
            workItemId,
            outputId,
            manualRetryAttempt: output.manualRetryAttempt,
            reason: "image_call_budget_exhausted",
          });
          terminalRefunded = refundSettlement.refunded && refundSettlement.applied;
          const failed = await step.run("mark-failed", async () =>
            failCreativeWorkOutput(workspaceId, workItemId, outputId, "image_call_budget_exhausted")
          );
          if (failed) {
            logCreativeWorkOutputTerminal({
              ...telemetryBase(),
              outcome: "failed",
              failureCode: "image_call_budget_exhausted",
              verdict: "fail",
              refunded: terminalRefunded,
              durationMs: jobTimer.elapsedMs(),
            });
          }
          return { success: false, outputId, failureCode: "image_call_budget_exhausted" };
        }
        incompleteOutputKeys.add(correctionOutputKey);

        if (exactAssets.length > 0) {
          compositionProvenance = (await step.run(
            "compose-exact-layers-correction",
            async () => {
              const baseBuffer = await objectStorage.get(correctionOutputKey);
              const result = await runExactComposition({
                base: baseBuffer,
                format: targetFormat,
                dimensions,
                assets: executionIdentityAssets,
                loadAsset: async (assetKey) => exactAssetBuffers.get(assetKey) ?? Promise.reject(new Error(`exact_asset_not_preflighted:${assetKey}`)),
                ...(recipeFrozenBoxes ? { frozenBoxes: recipeFrozenBoxes } : {}),
              });
              await objectStorage.put(
                correctionOutputKey,
                result.buffer,
                "image/png",
              );
              return {
                ...result.provenance,
                omitted: [...preflightExactOmissions, ...result.provenance.omitted],
              };
            },
          )) as CompositionProvenance;
        }
        textCompositionProvenance = await composeApprovedText(
          correctionOutputKey,
          "compose-approved-copy-correction",
        );

        const correctedBuffer = await objectStorage.get(correctionOutputKey);
        const correctionAssessment = (await observeCreativeWorkStage(
          telemetryBase(),
          "correction_assessment",
          () => step.run("analyze-correction", async () =>
            runV1Assessment(correctedBuffer, Math.max(imageCallCount, 1))
          ),
        )) as unknown as CreativeWorkQualityAssessmentResult;

        if (correctionAssessment.objectiveVerdict === "fail") {
          // The correction confirmed the objective failure — terminal. No
          // third call exists; the output settles net zero via the
          // idempotent terminal refund.
          const refundSettlement = await refundTerminalOutput({
            workspaceId,
            workItemId,
            outputId,
            manualRetryAttempt: output.manualRetryAttempt,
            reason: "creative_work_objective_correction_failed",
          });
          terminalRefunded = refundSettlement.refunded && refundSettlement.applied;
          const failed = await step.run("mark-failed", async () =>
            failCreativeWorkOutput(workspaceId, workItemId, outputId, "factual_violation")
          );
          if (failed) {
            logCreativeWorkOutputTerminal({
              ...telemetryBase(),
              outcome: "failed",
              failureCode: "factual_violation",
              verdict: "fail",
              refunded: terminalRefunded,
              durationMs: jobTimer.elapsedMs(),
            });
          }
          return { success: false, outputId, failureCode: "factual_violation" };
        }

        finalOutputKey = correctionOutputKey;
        finalGenerationEvidence = mergeGenerationEvidence(
          finalGenerationEvidence,
          correctionResult.generation ?? null,
        );
        completedQuality = correctionAssessment.quality as unknown as Record<string, unknown>;
        completedVerdict = correctionAssessment.objectiveVerdict;
      }

      // Provenance of exact-asset composition (logo etc.) — which asset, where, policy.
      if (compositionProvenance) {
        completedQuality = {
          ...(completedQuality ?? {}),
          exactComposition: compositionProvenance,
        };
      }
      if (finalGenerationEvidence || generatedResult.renderEvidence) {
        completedQuality = {
          ...(completedQuality ?? {}),
          generation: { ...finalGenerationEvidence, ...generatedResult.renderEvidence },
        };
      }
      if (work.toolKind === "single" && typographyPlan) {
        completedQuality = {
          ...(completedQuality ?? {}),
          textComposition: textCompositionProvenance ?? typographyPlan,
        };
      }
      if (work.toolKind === "single") {
        const brandFidelity = await step.run("verify-brand-fidelity", async () => ({
          deterministic: buildDeterministicBrandFidelity({
            copy,
            format: targetFormat,
            dimensions,
            typographyPlan,
            approvedFont,
            exactAssets: executionIdentityAssets,
            exactComposition: compositionProvenance,
            textComposition: textCompositionProvenance,
            finalArtifact: await objectStorage.get(finalOutputKey),
          }),
          residual: buildResidualBrandFidelityReview(completedQuality),
        }));
        completedQuality = { ...(completedQuality ?? {}), brandFidelity };
        if (identitySnapshot.brandKnowledge) {
          const knowledge = identitySnapshot.brandKnowledge;
          completedQuality = {
            ...(completedQuality ?? {}),
            brandKnowledge: {
              schemaVersion: 1,
              mode: knowledge.mode,
              versionId: knowledge.versionId,
              versionNumber: knowledge.versionNumber,
              versionHash: knowledge.versionHash,
              claimIds: knowledge.claims.map((claim) => claim.id),
              evidenceRefs: knowledge.claims.flatMap((claim) => claim.evidenceRefs),
              selectedAssets: identitySnapshot.assets.map((asset) => ({
                referenceId: asset.referenceId,
                assetKey: asset.assetKey,
                usageMode: asset.usageMode,
                reasons: identitySnapshot.referenceSelection?.reasons[asset.referenceId] ?? [],
              })),
            },
          };
        }
      }

      // R-007: lease re-check before the commit — a job that lost the row
      // must not complete it.
      if (!(await checkLease("pre-complete"))) {
        return { success: false, skipped: true, leaseLost: true, outputId };
      }

      const completed = await step.run("mark-completed", async () =>
        completeCreativeWorkOutput(workspaceId, workItemId, outputId, {
          outputKey: finalOutputKey,
          cost: OUTPUT_COST,
          quality: completedQuality,
        }, ...(renderPolicy.integrated && completedVerdict === "fail"
          ? [{ markObjectiveQualityFailedRefundPending: true }] as const : [] as const))
      );
      if (!completed) {
        // Late completion: the row left `processing` before the commit landed
        // (lease stolen, stale sweep, duplicate delivery). Discard — status
        // and ledger stay untouched (R-006/R-007).
        logCreativeWorkLateCompletionDiscarded({
          ...telemetryBase(),
          outputKey: finalOutputKey,
        });
        return { success: true, skipped: true, outputId };
      }
      retainedOutputKey = finalOutputKey;
      terminalRefunded = await recoverPendingCreativeWorkRefund({
        workspaceId, workItemId, output: completed, userId: work.createdByUserId ?? undefined,
      });

      try {
        await recordCreativeWorkFunnelEvent(workspaceId, workItemId, "output_ready");
      } catch (telemetryError) {
        logger.warn(
          `[creativeWorkOutputJob] output_ready telemetry failed outputId=${outputId}: ${telemetryError instanceof Error ? telemetryError.message : String(telemetryError)}`,
        );
      }

      // Phase 5 / item 37: library on complete (not only on select).
      // Isolated from generation success: a library/storage failure must never
      // reclassify a completed output as failed (retries: 0).
      try {
        if (completedVerdict !== "fail") await step.run("ensure-library", async () => {
          await ensureCreativeWorkOutputInLibrary({
            workspaceId,
            outputKey: finalOutputKey,
            theme: brief.theme,
            creativeLevel,
          });
        });
      } catch (libraryError) {
        const detail =
          libraryError instanceof Error ? libraryError.message : String(libraryError);
        logger.warn(
          `[creativeWorkOutputJob] ensure-library failed outputId=${outputId} (output stays completed): ${detail}`,
        );
      }

      // Plan 04, T2: automatic art refinement after a terminal validated
      // output. Best-effort and isolated like the library step: the output
      // is already COMPLETED, so a refinement failure must never reclassify
      // it. Only budgeted works pay for the aggregate re-read; the
      // coordinator re-validates everything (calibration, root, critique,
      // ceiling) against live rows.
      if (resolveCreativeWorkArtRefinement(work.inputSnapshot)) {
        try {
          await step.run("maybe-refine-art", async () => {
            const aggregate = await getCreativeWork(workspaceId, workItemId);
            const outputs = aggregate?.outputs ?? [];
            const byId = new Map(outputs.map((candidate) => [candidate.id, candidate]));
            let rootId: string | null = null;
            let current = byId.get(outputId);
            const seen = new Set<string>();
            while (current && !seen.has(current.id)) {
              seen.add(current.id);
              rootId = current.id;
              current = current.parentOutputId ? byId.get(current.parentOutputId) : undefined;
            }
            const outcome = await refineCreativeWork({
              workspaceId,
              workItemId,
              rootOutputId: rootId ?? outputId,
              completedOutputId: outputId,
            });
            logger.info(
              `[creativeWorkOutputJob] art-refinement outputId=${outputId} kind=${outcome.kind} reason=${outcome.reason}`,
            );
          });
        } catch (refineError) {
          logger.warn(
            `[creativeWorkOutputJob] art-refinement failed outputId=${outputId} (output stays completed): ${refineError instanceof Error ? refineError.message : String(refineError)}`,
          );
        }
      }

      // R-007.7: telemetry is auxiliary — a failure here must NOT fall into
      // the outer catch as a fake post-provider failure: the output is
      // already COMPLETED and the catch would apply a terminal refund to it
      // (the completion CAS protects the status, not the ledger).
      try {
        logCreativeWorkOutputTerminal({
          ...telemetryBase(),
          outcome: "completed",
          verdict: completedVerdict,
          refunded: terminalRefunded,
          durationMs: jobTimer.elapsedMs(),
        });
      } catch (telemetryError) {
        logger.warn(
          `[creativeWorkOutputJob] terminal telemetry failed outputId=${outputId} (output stays completed): ${telemetryError instanceof Error ? telemetryError.message : String(telemetryError)}`,
        );
      }
      logger.info(
        `[creativeWorkOutputJob] DONE outputId=${outputId} outputKey=${finalOutputKey}`,
      );
      return { success: true, outputId, outputKey: finalOutputKey };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // R-003: reference-plan failures keep their typed code so the UI can
      // distinguish a reference failure from an unknown provider failure.
      const code = error instanceof CreativeWorkReferenceError
        ? error.code
        : sanitizeCreativeWorkFailureCode(message);
      logger.error(
        `[creativeWorkOutputJob] FAIL outputId=${outputId} code=${code} message=${message}`,
      );
      if (renderPolicy.integrated && (providerInvoked || code === "image_call_budget_exhausted")) {
        const failed = await step.run("mark-failed", () =>
          failCreativeWorkOutput(workspaceId, workItemId, outputId, INTEGRATED_TERMINAL_REFUND_PENDING)
        );
        terminalRefunded = await recoverPendingCreativeWorkRefund({ workspaceId, workItemId, output: failed, userId: workCreatedByUserId });
        if (failed) logCreativeWorkOutputTerminal({
          workspaceId, workItemId, outputId, generationCorrelationId,
          protocol: "v1", imageCallCount, providerCalls, providerRetries,
          unitCount: generationUnitCount, activeUnitCount,
          environment: CREATIVE_WORK_RUNTIME_ENVIRONMENT,
          outcome: "failed", failureCode: code, refunded: terminalRefunded, durationMs: jobTimer.elapsedMs(),
        });
        return { success: false, outputId, failureCode: code };
      }
      // R-006: the transport retry consumes the second call ONLY when the
      // durable budget still has one — a correction that timed out
      // (imageCallCount = 2) never earns a third call. Legacy outputs never
      // claim, so their historical requeue behavior is unchanged.
      if (
        !renderPolicy.integrated &&
        isDirectExecution &&
        isRetryableProviderError(error) &&
        imageCallCount < CREATIVE_WORK_MAX_IMAGE_CALLS
      ) {
        try {
          const retried = await requeueCreativeWorkOutputOnce(workspaceId, workItemId, outputId);
          if (retried) {
            try {
              logCreativeWorkRetry({
                workspaceId,
                workItemId,
                outputId,
                generationCorrelationId,
                action: "auto_retry",
                reason: code,
                retryCount: retried.retryCount,
                imageCallCount: retried.imageCallCount,
              });
              await inngest.send({ id: `creative-work-generate:${outputId}:retry-${retried.retryCount}`, name: heavyImageEventName("creative-work.generate"), data: { workspaceId, workItemId, outputId, generationCorrelationId } });
              return { success: false, retrying: true, outputId, failureCode: code };
            } catch (dispatchError) {
              const failed = await failQueuedCreativeWorkOutput(workspaceId, workItemId, outputId, "auto_retry_dispatch_failed");
              logger.error(`[creativeWorkOutputJob] auto-retry dispatch failed outputId=${outputId}`, dispatchError);
              // R-006: the retry never left the gate but the image call was
              // already consumed — for v1 this is a terminal post-provider
              // failure and settles net zero (idempotent key). Legacy keeps
              // its historical no-refund behavior.
              // If the queued->failed CAS lost, Inngest may already be
              // processing the accepted event. Never refund that live debit.
              if (failed && isV1Policy && providerInvoked) {
                const refundSettlement = await refundTerminalOutput({
                  workspaceId,
                  workItemId,
                  outputId,
                  manualRetryAttempt: outputManualRetryAttempt,
                  reason: "auto_retry_dispatch_failed",
                });
                terminalRefunded = refundSettlement.refunded && refundSettlement.applied;
              }
              if (failed) {
                logCreativeWorkOutputTerminal({
                  workspaceId,
                  workItemId,
                  outputId,
                  generationCorrelationId,
                  protocol: isV1Policy ? "v1" : "legacy",
                  imageCallCount,
                  providerCalls,
                  providerRetries,
                  unitCount: generationUnitCount,
                  activeUnitCount,
                  environment: CREATIVE_WORK_RUNTIME_ENVIRONMENT,
                  outcome: "failed",
                  failureCode: "auto_retry_dispatch_failed",
                  refunded: terminalRefunded,
                  durationMs: jobTimer.elapsedMs(),
                });
              }
              return { success: false, outputId, failureCode: "auto_retry_dispatch_failed" };
            }
        }
      } catch (retryError) {
          logger.error(`[creativeWorkOutputJob] auto-retry dispatch failed outputId=${outputId}`, retryError);
      }
      }
      // R-006: a v1 output that fails TERMINALLY after the provider was
      // invoked settles net zero via the idempotent terminal refund (keyed
      // per output — a repeated delivery of this failure is a duplicate,
      // never a second credit). Pre-provider failures were already refunded
      // above; legacy-frozen works keep the historical no-refund behavior.
      if (isV1Policy && providerInvoked) {
        const refundSettlement = await refundTerminalOutput({
          workspaceId,
          workItemId,
          outputId,
          manualRetryAttempt: outputManualRetryAttempt,
          reason: message,
        });
        terminalRefunded = refundSettlement.refunded && refundSettlement.applied;
      } else if (providerInvoked) {
        terminalRefunded = await applyRefundDecision({
          workspaceId,
          workItemId,
          outputId,
          reason: message,
          decision: decideCreativeWorkRefund({
            surface: "quick_tool",
            failurePhase: "post_provider",
            workItemId,
            outputId,
          }),
          description: "creative_work_output_post_provider_refund",
        });
      }
      let failedOutput: Awaited<ReturnType<typeof failCreativeWorkOutput>> = null;
      try {
        failedOutput = await step.run("mark-failed", async () =>
          failCreativeWorkOutput(workspaceId, workItemId, outputId, code)
        );
      } catch (markError) {
        const detail =
          markError instanceof Error ? markError.message : "Unknown error";
        logger.error(
          `[creativeWorkOutputJob] mark-failed error outputId=${outputId}: ${detail}`,
        );
      }
      if (failedOutput) {
        logCreativeWorkOutputTerminal({
          workspaceId,
          workItemId,
          outputId,
          generationCorrelationId,
          protocol: isV1Policy ? "v1" : "legacy",
          imageCallCount,
          providerCalls,
          providerRetries,
          unitCount: generationUnitCount,
          activeUnitCount,
          environment: CREATIVE_WORK_RUNTIME_ENVIRONMENT,
          outcome: leaseLostStage ? "lease_lost" : "failed",
          leaseStage: leaseLostStage,
          failureCode: leaseLostStage ? "lease_lost" : code,
          refunded: terminalRefunded,
          durationMs: jobTimer.elapsedMs(),
        });
      }
      return { success: false, outputId, failureCode: code };
    } finally {
      for (const key of incompleteOutputKeys) {
        if (key === retainedOutputKey) continue;
        try {
          await objectStorage.delete(key);
        } catch (cleanupError) {
          logger.warn(
            `[creativeWorkOutputJob] orphan cleanup failed outputId=${outputId} key=${key}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          );
        }
      }
      let refreshedAsFailed = false;
      try {
        const refreshedStatus = await step.run("refresh-aggregate-status", async () =>
          refreshCreativeWorkStatus(workspaceId, workItemId),
        );
        refreshedAsFailed = refreshedStatus === "failed";
      } catch (statusError) {
        const detail =
          statusError instanceof Error
            ? statusError.message
            : "Unknown error";
        logger.warn(
          `[creativeWorkOutputJob] refresh-status failed outputId=${outputId}: ${detail}`,
        );
      }
      if (refreshedAsFailed) {
        try {
          await recordCreativeWorkFunnelEvent(workspaceId, workItemId, "creative_work_failed");
        } catch (telemetryError) {
          logger.warn(
            `[creativeWorkOutputJob] creative_work_failed telemetry failed outputId=${outputId}: ${telemetryError instanceof Error ? telemetryError.message : String(telemetryError)}`,
          );
        }
      }
      try {
        await step.run("record-generation-aggregate", async () => {
          await recordCreativeWorkGenerationAggregateTelemetry(
            workspaceId,
            workItemId,
            generationCorrelationId,
          );
        });
      } catch (aggregateError) {
        const detail = aggregateError instanceof Error
          ? aggregateError.message
          : "Unknown error";
        logger.warn(
          `[creativeWorkOutputJob] aggregate telemetry failed outputId=${outputId}: ${detail}`,
        );
      }
    }
  };

export const creativeWorkOutputJob = inngest.createFunction(
  {
    ...creativeWorkOutputJobConfig,
    triggers: [{ event: "creative-work.generate" }],
  },
  creativeWorkOutputJobHandler,
);

export function createCreativeWorkOutputJobV2(client: typeof inngest) {
  return client.createFunction(
    {
      ...creativeWorkOutputJobConfig,
      id: "generate-creative-work-output-v2",
      concurrency: [
        { limit: 2, scope: "account" as const, key: `"openai"` },
      ],
      triggers: [{ event: "creative-work.generate.v2" }],
    },
    creativeWorkOutputJobHandler,
  );
}

/**
 * Apply a shared RefundDecision via Generation Settlement. Adapter-only:
 * does not re-decide policy. `description` labels the ledger row per refund
 * kind so analytics never misattributes a terminal refund as pregen.
 */
async function settleCreativeWorkRefundDecision({
  workspaceId,
  workItemId,
  outputId,
  reason,
  decision,
  description,
}: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  reason: string;
  decision: RefundDecision;
  description: string;
}): Promise<TerminalRefundSettlementResult> {
  const result = await settleTerminalRefund({
    decision,
    workspaceId,
    metadata: {
      creativeWorkId: workItemId,
      outputId,
      reason,
      policyReason: decision.reason,
      description,
    },
  });
  if (!result.refunded) {
    logger.info(
      `[creativeWorkOutputJob] skip refund outputId=${outputId} reason=${result.reason}`,
    );
    return result;
  }
  if (!result.applied) {
    logger.error(
      `[creativeWorkOutputJob] terminal refund FAILED outputId=${outputId} description=${description}: ${result.error}`,
    );
    return result;
  }
  logger.info(
    `[creativeWorkOutputJob] terminal refund outputId=${outputId} status=${result.status} description=${description} reason=${reason}`,
  );
  return result;
}

async function applyRefundDecision(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  reason: string;
  decision: RefundDecision;
  description: string;
}): Promise<boolean> {
  return (await settleCreativeWorkRefundDecision(input)).applied;
}

/**
 * R-006 terminal refund: a v1 output that fails after consuming provider
 * calls settles net zero. Idempotent per output (the decision key is
 * content-stable), so a repeated failure/redelivery credits at most once.
 * Returns the canonical settlement result. Callers must distinguish a policy
 * decision from a liquidated refund so the reconciler can retry ambiguity.
 */
type CreativeWorkTerminalRefundAttempt = "original" | "reactivation";
type CreativeWorkTerminalRefundSettlement = TerminalRefundSettlementResult & {
  attempt: CreativeWorkTerminalRefundAttempt;
};

function exactPreflightFailureCode(
  settlement: CreativeWorkTerminalRefundSettlement,
): "exact_asset_preflight_failed" | "exact_asset_preflight_failed_refund_pending" | "exact_asset_preflight_failed_reactivation_refund_pending" {
  if (!settlement.refunded || settlement.applied) return "exact_asset_preflight_failed";
  return settlement.attempt === "reactivation"
    ? "exact_asset_preflight_failed_reactivation_refund_pending"
    : "exact_asset_preflight_failed_refund_pending";
}

async function refundTerminalOutput({
  workspaceId,
  workItemId,
  outputId,
  manualRetryAttempt,
  reason,
}: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  manualRetryAttempt: number | null;
  reason: string;
}): Promise<CreativeWorkTerminalRefundSettlement> {
  const canonicalDecision = decideCreativeWorkRefund({
    surface: "quick_tool",
    failurePhase: "terminal",
    workItemId,
    outputId,
  });
  const reactivation = await resolveCreativeWorkOutputReactivation({
    workspaceId,
    workItemId,
    outputId,
    manualRetryAttempt,
  });
  const attempt: CreativeWorkTerminalRefundAttempt = reactivation
    ? "reactivation"
    : "original";
  const decision = reactivation
    ? {
        ...canonicalDecision,
        idempotencyKey: reactivation.refundKey,
        reason: "creative_work_terminal_reactivation_failure",
      }
    : canonicalDecision;
  const result = await settleCreativeWorkRefundDecision({
    workspaceId,
    workItemId,
    outputId,
    reason,
    decision,
    description: reactivation
      ? "creative_work_output_terminal_reactivation_refund"
      : "creative_work_output_terminal_refund",
  });
  return { ...result, attempt };
}

/**
 * Refund the per-output credit when a failure happens BEFORE the upstream
 * generator was invoked — prompt assembly or reference image load. Policy
 * decision comes from decideCreativeWorkRefund; this only applies it.
 */
async function refundPreGeneratorOutput({
  workspaceId,
  workItemId,
  outputId,
  reason,
  failurePhase,
}: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  reason: string;
  failurePhase: "pre_provider" | "low_quality";
}): Promise<boolean> {
  const decision = decideCreativeWorkRefund({
    surface: "quick_tool",
    failurePhase,
    workItemId,
    outputId,
  });
  return applyRefundDecision({
    workspaceId,
    workItemId,
    outputId,
    reason,
    decision,
    description:
      failurePhase === "low_quality"
        ? "creative_work_output_low_quality_refund"
        : "creative_work_output_pregen_refund",
  });
}
