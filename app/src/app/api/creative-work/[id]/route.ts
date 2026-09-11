import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { confirmSocialPostWork } from "@/server/application/confirm-social-post-work";
import {
  detectCreativeWorkDraftBrandConflict,
  prepareCreativeWork,
} from "@/server/application/prepare-creative-work";
import { prepareCarouselWork } from "@/server/application/prepare-carousel-work";
import { approveCarouselDeck } from "@/server/application/export-carousel-work";
import { analyzeCreativeWorkSource } from "@/server/application/analyze-creative-work-source";
import { contentBriefSchema, styleBriefSchema } from "@/server/ai/image-analysis";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { requestCreativeWorkLayerization } from "@/server/application/request-creative-work-layerization";
import {
  handleCreativeWorkLayerizationCallback,
} from "@/server/application/handle-creative-work-layerization-callback";
import { recoverExpiredCreativeWorkLayerizations } from "@/server/application/recover-expired-creative-work-layerizations";
import { saveCommercialOfferFromWork } from "@/server/application/save-commercial-offer";
import { toPublicLayerizationState } from "@/server/layerize/contracts";
import { toPublicLayerEditorSummary } from "@/server/layer-editor/contracts";
import { getLayerEditorAccess } from "@/server/layer-editor/quota";
import {
  acceptCreativeWorkLayerRegenerationCandidate,
  discardCreativeWorkLayerRegenerationCandidate,
  heartbeatCreativeWorkLayerEditor,
  openCreativeWorkLayerEditor,
  releaseCreativeWorkLayerEditor,
  saveCreativeWorkLayerEditor,
} from "@/server/application/manage-creative-work-layer-editor";
import { layerEditorMutableSnapshotSchema } from "@/server/layer-editor/contracts";
import { requestCreativeWorkLayerRegeneration } from "@/server/application/request-creative-work-layer-regeneration";
import { publishCreativeWorkLayerEditor } from "@/server/application/publish-creative-work-layer-editor";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import { projectPreparedPlanV1 } from "@/server/creative-work/prepared-plan";
import {
  CREATIVE_SOURCE_USAGES,
  CREATIVE_WORK_BRAND_CHOICES,
  creativeWorkFormatSchema,
  creativeWorkIntentSchema,
  creativeWorkPreparationSchema,
  creativeWorkSettingsSchema,
  creativeWorkBriefingOverridesSchema,
  CREATIVE_WORK_BRIEFING_FIELDS,
  displayRequestForCreativeWork,
  resolveCreativeWorkFactPack,
  resolveCreativeWorkInferredBriefing,
  resolveCreativeWorkStatus,
  socialPostBriefSchema,
  type CreativeWorkBriefingField,
  type CreativeWorkBriefingOverrides,
  type InferredBriefing,
  type CreativeWorkFactPack,
  socialPostCopySchema,
} from "@/server/creative-work/contracts";
import {
  failStaleQueuedCreativeWorkOutputs,
  failStaleProcessingCreativeWorkOutputs,
  failStaleCreativeWorkSources,
  createCreativeWorkSource,
  promoteCreativeWorkPieceReference,
  getCreativeWork,
  linkCreativeWorkCampaign,
  listCreativeWorkOutputsNeedingRefund,
  markCreativeWorkOutputFailureCode,
  recordCreativeWorkGenerationAggregate,
  refreshCreativeWorkStatus,
  updateCreativeWorkSourceIfUnchanged,
  updateCreativeWorkDraftIfUnchanged,
  autosaveCreativeWorkDraft,
  mutateCreativeWorkPieceReference,
  mutateCreativeWorkDraftSource,
  isCreativeWorkRevisionConflict,
} from "@/server/repositories/creative-work";
import { listCurrentCarouselSlides } from "@/server/repositories/creative-work-carousel";
import { resolveCarouselPlanSlideId, resolveCarouselPreparedSnapshot } from "@/server/creative-work/carousel-contracts";
import { readCarouselEditorial, toPublicCarouselEditorial } from "@/server/creative-work/carousel-editorial-state";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { getTemplateById } from "@/server/repositories/template";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import {
  decideCreativeWorkRefund,
} from "@/server/generation/canonical/policies";
import { settleTerminalRefund } from "@/server/generation/settlement";
import { resolveCreativeWorkOutputReactivationOutcome } from "@/server/generation/settlement-adapters";
import type { CreativeWorkSource } from "@/server/db/schema";
import { PIECE_REFERENCE_CATEGORIES, type PieceReferenceCategory } from "@/server/creative-work/piece-reference";
import { logger } from "@/lib/logger";
import { env } from "@/server/validation/env";
import {
  logCreativeWorkGenerationAggregate,
  logCreativeWorkOutputTerminal,
} from "@/server/creative-work/job-telemetry";

const QUEUED_GENERATION_LEASE_MS = 60 * 60 * 1000;
const PROCESSING_GENERATION_LEASE_MS = 10 * 60 * 1000;
const SOURCE_ANALYSIS_LEASE_MS = 5 * 60 * 1000;

function withoutPrivateArtifactFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPrivateArtifactFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !["outputKey", "operationKey", "publishedPsdKey", "candidateKey", "storageKey"].includes(key))
    .map(([key, child]) => [key, withoutPrivateArtifactFields(child)]));
}

async function refundCreativeWorkOutputCompensatory(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  reason: string;
  manualRetryAttempt?: number | null;
  failurePhase?: "job_failure" | "terminal";
}): Promise<boolean> {
  const outcome = await resolveCreativeWorkOutputReactivationOutcome({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputId: input.outputId,
    manualRetryAttempt: input.manualRetryAttempt,
  });
  if (outcome.state === "already_refunded") return true;
  const reactivation = outcome.state === "outstanding" ? outcome : null;
  const canonicalFailurePhase: "job_failure" | "terminal" = reactivation || input.failurePhase === "terminal"
    ? "terminal"
    : "job_failure";
  const canonicalDecision = decideCreativeWorkRefund({
    surface: "quick_tool",
    failurePhase: canonicalFailurePhase,
    workItemId: input.workItemId,
    outputId: input.outputId,
  });
  const decision = reactivation && canonicalDecision.refund
    ? {
        ...canonicalDecision,
        idempotencyKey: reactivation.refundKey,
        reason: "creative_work_terminal_reactivation_failure",
      }
    : canonicalDecision;
  if (!decision.refund) return true;
  const settled = await settleTerminalRefund({
    decision,
    workspaceId: input.workspaceId,
    action: "image_derivation",
    metadata: {
      creativeWorkId: input.workItemId,
      outputId: input.outputId,
      reason: input.reason,
      description: "creative_work_compensatory_refund",
    },
  });
  if (!settled.applied) {
    logger.warn({
      event: "image_pipeline_stage",
      stage: "compensatory_refund",
      status: "failed",
      outputId: input.outputId,
      errorMessage: settled.error,
    });
    return false;
  }
  return true;
}

const confirmCreativeWorkSchema = z
  .object({
    // Legacy wizard body — mapped to CanonicalBriefing write inside the command.
    copy: socialPostCopySchema,
    // Empty is allowed: Create Post can lock a Brand-Kit-only identity
    // snapshot when the brand has no approved training references yet.
    selectedReferenceIds: z.array(z.string().uuid()).max(8),
  })
  .strict();

const autosaveSchema = z.object({
  action: z.literal("autosave"),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  request: z.string(),
  intent: creativeWorkIntentSchema,
  format: creativeWorkFormatSchema,
  settings: creativeWorkSettingsSchema,
}).strict().superRefine((value, context) => {
  const parsed = creativeWorkPreparationSchema.safeParse(value);
  if (!parsed.success) parsed.error.issues.forEach((issue) => context.addIssue(issue));
});
const prepareSchema = z.object({ action: z.literal("prepare") }).strict();
const approveCarouselSchema = z.object({
  action: z.literal("approveCarousel"),
  revision: z.string().min(1),
}).strict();
const editBriefingSchema = z.object({
  action: z.literal("editBriefing"),
  field: z.enum(CREATIVE_WORK_BRIEFING_FIELDS),
  value: z.string().max(240).nullable(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();
// R-003: persists the restyle brand-conflict choice ("source" | "active") in
// CreativeWorkSettings so the same draft resumes without a new question.
const resolveBrandConflictSchema = z.object({
  action: z.literal("resolveBrandConflict"),
  choice: z.enum(CREATIVE_WORK_BRAND_CHOICES),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();
const layerizeOutputSchema = z.object({
  action: z.literal("layerizeOutput"),
  outputId: z.string().uuid(),
  operationId: z.string().uuid(),
  retry: z.boolean().optional(),
}).strict();
const openLayerEditorSchema = z.object({ action: z.literal("openLayerEditor"), outputId: z.string().uuid(), mode: z.enum(["inspect", "edit"]) }).strict();
const heartbeatLayerEditorSchema = z.object({ action: z.literal("heartbeatLayerEditor"), outputId: z.string().uuid(), leaseId: z.string().uuid() }).strict();
const releaseLayerEditorSchema = z.object({ action: z.literal("releaseLayerEditor"), outputId: z.string().uuid(), leaseId: z.string().uuid() }).strict();
const saveLayerEditorSchema = z.object({ action: z.literal("saveLayerEditor"), outputId: z.string().uuid(), leaseId: z.string().uuid(), expectedRevision: z.number().int().positive(), snapshot: layerEditorMutableSnapshotSchema }).strict();
const regenerateLayerSchema=z.object({action:z.literal("regenerateLayer"),outputId:z.string().uuid(),leaseId:z.string().uuid(),expectedRevision:z.number().int().positive(),operationId:z.string().uuid(),layerId:z.string().uuid(),instruction:z.string().trim().min(1).max(2000)}).strict();
const candidateActionSchema=z.object({action:z.enum(["acceptLayerCandidate","discardLayerCandidate"]),outputId:z.string().uuid(),leaseId:z.string().uuid(),expectedRevision:z.number().int().positive(),operationId:z.string().uuid()}).strict();
const publishLayerEditorSchema=z.object({action:z.literal("publishLayerEditor"),outputId:z.string().uuid(),leaseId:z.string().uuid(),expectedRevision:z.number().int().positive(),operationId:z.string().uuid()}).strict();
const saveAsOfferSchema = z.object({
  action: z.literal("saveAsOffer"),
  validFrom: z.string().datetime({ offset: true }).optional(),
  validUntil: z.string().datetime({ offset: true }),
}).strict();
const linkCampaignSchema = z.object({ action: z.literal("linkCampaign"), campaignId: z.string().min(1).nullable() }).strict();
const sourceUsageSchema = z.enum(CREATIVE_SOURCE_USAGES);
const attachSourceSchema = z.union([
  z.object({ action: z.literal("attachSource"), expectedUpdatedAt: z.string().datetime({ offset: true }), assetId: z.string().min(1), usage: sourceUsageSchema }).strict(),
  z.object({ action: z.literal("attachSource"), expectedUpdatedAt: z.string().datetime({ offset: true }), templateId: z.string().min(1), usage: sourceUsageSchema }).strict(),
]);
const updateSourceSchema = z.object({ action: z.literal("updateSource"), expectedUpdatedAt: z.string().datetime({ offset: true }), sourceId: z.string().min(1), usage: sourceUsageSchema }).strict();
const retrySourceSchema = z.object({ action: z.literal("retrySource"), expectedUpdatedAt: z.string().datetime({ offset: true }), sourceId: z.string().min(1) }).strict();
const removeSourceSchema = z.object({ action: z.literal("removeSource"), expectedUpdatedAt: z.string().datetime({ offset: true }), sourceId: z.string().min(1) }).strict();

const updatePieceReferenceSchema = z.object({
  action: z.literal("updatePieceReference"), expectedUpdatedAt: z.string().datetime({ offset: true }), sourceId: z.string().uuid(),
  category: z.enum(PIECE_REFERENCE_CATEGORIES).optional(), userInstruction: z.string().trim().max(240).nullable().optional(),
}).strict().refine((value) => value.category !== undefined || value.userInstruction !== undefined);
const replacePieceReferenceSchema = z.object({
  action: z.literal("replacePieceReference"), expectedUpdatedAt: z.string().datetime({ offset: true }), sourceId: z.string().uuid(), assetId: z.string().uuid(),
}).strict();
const promotePieceReferenceSchema = z.object({ action: z.literal("promotePieceReference"), expectedUpdatedAt: z.string().datetime({ offset: true }), sourceId: z.string().uuid() }).strict();
const editSourceAnalysisSchema = z.object({
  action: z.literal("editSourceAnalysis"),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  sourceId: z.string().min(1),
  content: contentBriefSchema.nullable(),
  style: styleBriefSchema.nullable(),
}).strict();
const patchCreativeWorkSchema = z.union([
  autosaveSchema, prepareSchema, approveCarouselSchema, editBriefingSchema, attachSourceSchema, updateSourceSchema,
  retrySourceSchema, removeSourceSchema, updatePieceReferenceSchema, replacePieceReferenceSchema, promotePieceReferenceSchema, editSourceAnalysisSchema, confirmCreativeWorkSchema,
  linkCampaignSchema, resolveBrandConflictSchema,
  layerizeOutputSchema,
  openLayerEditorSchema, heartbeatLayerEditorSchema, releaseLayerEditorSchema, saveLayerEditorSchema,
  regenerateLayerSchema,candidateActionSchema,
  publishLayerEditorSchema,
  saveAsOfferSchema,
]);

function briefingFieldValue(value: string | null) {
  const normalized = value?.trim() || null;
  return normalized
    ? { value: normalized, state: "sourced" as const }
    : { value: null, state: "unknown" as const };
}

function applyBriefingEdit(input: {
  briefing: InferredBriefing;
  factPack: CreativeWorkFactPack;
  field: CreativeWorkBriefingField;
  value: string | null;
  overrides: CreativeWorkBriefingOverrides;
}) {
  const value = briefingFieldValue(input.value);
  const nextBriefing = {
    ...input.briefing,
    [input.field]: value,
  } as InferredBriefing;
  const hasDirection = Boolean(nextBriefing.message.value && nextBriefing.objective.value);
  const hasFacts = input.factPack.facts.some((fact) => [
    "price", "date", "offer", "benefit", "proof", "condition", "credential", "modality", "guarantee", "product", "service",
  ].includes(fact.class));
  const readiness = !hasDirection ? "blocked" : hasFacts ? "ready" : "exploratory";
  nextBriefing.readiness = readiness;
  nextBriefing.confidence = readiness === "exploratory" ? "low" : readiness === "blocked" ? "high" : "medium";

  const previous = input.overrides[input.field];
  const overrideClass = input.field === "offer" ? "offer" : "text";
  const facts = input.factPack.facts.filter((fact) =>
    !(fact.origin === "request" && previous && fact.class === overrideClass && fact.value === previous.trim()),
  );
  const normalized = input.value?.trim() || null;
  if (normalized) {
    facts.push({
      value: normalized,
      class: input.field === "offer" ? "offer" : "text",
      required: true,
      origin: "request",
    });
  }
  return {
    briefing: nextBriefing,
    factPack: { ...input.factPack, facts },
    overrides: { ...input.overrides, [input.field]: normalized },
  };
}

function dispatchSourceAnalysis(workspaceId: string, workItemId: string, sourceId: string) {
  return inngest.send({ name: heavyImageEventName("creative-work.source.analyze"), data: { workspaceId, workItemId, sourceId } });
}

async function dispatchSourceAnalysisOrFail(workspaceId: string, workItemId: string, source: CreativeWorkSource) {
  try {
    await dispatchSourceAnalysis(workspaceId, workItemId, source.id);
  } catch (error) {
    await updateCreativeWorkSourceIfUnchanged(
      workspaceId,
      workItemId,
      source.id,
      { status: "uploaded", usage: source.usage, updatedAt: source.updatedAt },
      { status: "failed", failureCode: "dispatch_failed" },
    );
    throw error;
  }
}

async function projectSourceDto(workspaceId: string, source: CreativeWorkSource) {
  if (source.templateId) {
    const template = await getTemplateById(source.templateId, workspaceId);

    return {
      ...source,
      name: template?.name ?? "Template",
      previewUrl: null,
      origin: "template" as const,
    };
  }

  const asset = source.assetId
    ? await getWorkspaceAssetById(source.assetId, workspaceId)
    : null;

  return {
    ...source,
    name: asset?.name ?? "Arte",
    previewUrl: asset
      ? `/api/workspace/assets/${asset.id}/file`
      : null,
    origin: asset?.source === "creative_work"
      ? "approved_work" as const
      : "upload" as const,
  };
}

/**
 * Standalone create-post detail. Attaches CanonicalCreativeWork projection
 * (Phase 5 / item 36).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const [staleQueued, staleProcessing] = await Promise.all([
      failStaleQueuedCreativeWorkOutputs(
        workspace.id,
        id,
        new Date(Date.now() - QUEUED_GENERATION_LEASE_MS),
      ),
      failStaleProcessingCreativeWorkOutputs(
        workspace.id,
        id,
        new Date(Date.now() - PROCESSING_GENERATION_LEASE_MS),
      ),
    ]);
    await failStaleCreativeWorkSources(
      workspace.id,
      id,
      new Date(Date.now() - SOURCE_ANALYSIS_LEASE_MS),
    );
    const staleOutputs = Array.from(
      new Map(
        [...staleQueued, ...staleProcessing].map((output) => [output.id, output]),
      ).values(),
    );
    const staleRefunds = new Map<string, boolean>();
    if (staleOutputs.length > 0) {
      await Promise.all(
        staleOutputs.map(async (output) => {
          const refunded = await refundCreativeWorkOutputCompensatory({
              workspaceId: workspace.id,
              workItemId: id,
            outputId: output.id,
            reason: "stale_generation_timeout",
            manualRetryAttempt: output.manualRetryAttempt,
            });
          staleRefunds.set(output.id, refunded);
          if (!refunded) {
            await markCreativeWorkOutputFailureCode(
              workspace.id,
              id,
              output.id,
              "generation_timeout_refund_pending",
            );
          }
        }),
      );
      await refreshCreativeWorkStatus(workspace.id, id);
    }

    const pendingRefunds = await listCreativeWorkOutputsNeedingRefund(workspace.id, id);
    if (pendingRefunds.length > 0) {
      await Promise.all(
        pendingRefunds.map(async (output) => {
          const refunded = await refundCreativeWorkOutputCompensatory({
            workspaceId: workspace.id,
            workItemId: id,
            outputId: output.id,
            reason: "retry_pending_compensatory_refund",
            manualRetryAttempt: output.manualRetryAttempt,
            // Terminal rows keep the original policy unless the shared ledger
            // resolver finds an outstanding modern/legacy reactivation debit.
            failurePhase: output.failureCode === "generation_canceled_refund_pending"
              || output.failureCode === "exact_asset_preflight_failed_refund_pending"
              ? "terminal"
              : "job_failure",
          });
          if (refunded) {
            const settledCode = (output.failureCode === "exact_asset_preflight_failed_reactivation_refund_pending"
              ? "exact_asset_preflight_failed"
              : output.failureCode ?? "generation_timeout").replace(
              /_refund_pending$/,
              "",
            );
            await markCreativeWorkOutputFailureCode(
              workspace.id,
              id,
              output.id,
              settledCode || "generation_timeout",
            );
          }
        }),
      );
    }
    let result = await getCreativeWork(workspace.id, id);
    if (!result) {
      return apiError("creativeWorkNotFound", 404);
    }
    // Output jobs persist terminal rows before the aggregate status step.
    // A GET poll can therefore observe completed/failed outputs while the
    // work is still "generating". Catch up here so clients do not wait on
    // Inngest finally to learn partial/completed/failed.
    if (
      result.work.toolKind !== "carousel"
      && result.work.status === "generating"
      && resolveCreativeWorkStatus(result.outputs.map((output) => output.status)) !== "generating"
    ) {
      await refreshCreativeWorkStatus(workspace.id, id);
      result = await getCreativeWork(workspace.id, id) ?? result;
    }
    if (staleOutputs.length > 0) {
      const generationUnits = new Map<string, typeof result.outputs>();
      for (const output of result.outputs) {
        const correlation = output.generationCorrelationId ?? result.work.generationCorrelationId;
        const units = generationUnits.get(correlation) ?? [];
        units.push(output);
        generationUnits.set(correlation, units);
      }
      for (const stale of staleOutputs) {
        const output = result.outputs.find((candidate) => candidate.id === stale.id);
        if (!output) continue;
        const correlation = output.generationCorrelationId ?? result.work.generationCorrelationId;
        const units = generationUnits.get(correlation) ?? [output];
        const queuedAt = output.queuedAt ?? output.createdAt;
        const terminalAt = output.terminalAt ?? output.createdAt;
        logCreativeWorkOutputTerminal({
          workspaceId: workspace.id,
          workItemId: id,
          outputId: output.id,
          generationCorrelationId: correlation,
          protocol: "unknown",
          imageCallCount: output.imageCallCount,
          retryCount: output.retryCount,
          unitCount: units.length,
          activeUnitCount: units.filter((unit) => unit.status === "processing").length,
          environment: process.env.RENDER_SERVICE_NAME ?? process.env.NODE_ENV ?? "unknown",
          outcome: "failed",
          failureCode: output.failureCode ?? "generation_timeout",
          refunded: staleRefunds.get(output.id) ?? false,
          durationMs: Math.max(0, terminalAt.getTime() - queuedAt.getTime()),
        });
      }
      for (const generationCorrelationId of new Set(
        staleOutputs.map((stale) =>
          result.outputs.find((output) => output.id === stale.id)?.generationCorrelationId
          ?? result.work.generationCorrelationId,
        ),
      )) {
        try {
          const aggregate = await recordCreativeWorkGenerationAggregate(
            workspace.id,
            id,
            generationCorrelationId,
          );
          if (!aggregate) continue;
          const fields = {
            workspaceId: workspace.id,
            workItemId: id,
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
        } catch (error) {
          logger.warn(
            `[creativeWork] stale aggregate telemetry failed workItemId=${id} correlation=${generationCorrelationId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    // Carousel works generate through creative_work_carousel_slides and never
    // own creative_work_outputs rows: the canonical projection's output-based
    // state machine would reject every generating/completed carousel aggregate,
    // so the detail GET projects the deck through carouselSlides instead.
    const canonical = result.work.toolKind === "carousel"
      ? null
      : withoutPrivateArtifactFields(projectCreativeWorkAsCanonicalWork(
          result.work,
          result.outputs
        ));
    const sources = await Promise.all((result.sources ?? []).map((source) => projectSourceDto(workspace.id, source)));
    const inferredBriefing = result.work.toolKind === "single"
      ? resolveCreativeWorkInferredBriefing(result.work.inputSnapshot)
      : null;
    const layerEditorAccess = await getLayerEditorAccess(workspace.id, new Date());
    const canLayerize = layerEditorAccess.enabled && Boolean(env.ATLASCLOUD_API_KEY?.trim());
    const recoveredLayerizations = await recoverExpiredCreativeWorkLayerizations({
      workspaceId: workspace.id,
      workItemId: id,
      outputs: result.outputs,
      ...(!layerEditorAccess.enabled ? { cleanupOnly: true } : {}),
    });
    const outputs = result.outputs.map((output) => ({
      id: output.id,
      workItemId: output.workItemId,
      creativeLevel: output.creativeLevel,
      targetFormat: output.targetFormat,
      versionNumber: output.versionNumber,
      parentOutputId: output.parentOutputId,
      revisionInstruction: output.revisionInstruction,
      revisionAssetId: output.revisionAssetId,
      retryCount: output.retryCount,
      imageCallCount: output.imageCallCount,
      status: output.status,
      hasOutput: Boolean(output.outputKey),
      failureCode: output.failureCode,
      quality: output.quality,
      isSelected: output.isSelected,
      directionId: output.directionId,
      directionSnapshot: output.directionSnapshot,
      createdAt: output.createdAt,
      updatedAt: output.updatedAt,
      layerization: layerEditorAccess.enabled ? toPublicLayerizationState(recoveredLayerizations.get(output.id) ?? output.layerization) : null,
      layerEditor: toPublicLayerEditorSummary(output.layerEditor),
    }));
    const { inputSnapshot: _inputSnapshot, carouselQuality, ...publicWork } = result.work;
    const editorial = readCarouselEditorial(publicWork.settings);
    const publicSettings = publicWork.settings
      ? (() => {
          const { carouselEditorial: _ignored, ...restSettings } = publicWork.settings;
          return editorial
            ? { ...restSettings, carouselEditorial: toPublicCarouselEditorial(editorial) }
            : restSettings;
        })()
      : publicWork.settings;
    const carouselSlideRows = result.work.toolKind === "carousel"
      ? await listCurrentCarouselSlides(workspace.id, id)
      : [];
    const carouselDeck = resolveCarouselPreparedSnapshot(result.work.inputSnapshot)?.deck ?? null;
    const carouselSlides = carouselSlideRows.map((slide) => {
      const {
        providerBaseKey: _providerBaseKey,
        outputKey,
        previewKey: _previewKey,
        anchorKey: _anchorKey,
        generationOperationKey,
        ...publicSlide
      } = slide;
      return {
        ...publicSlide,
        hasOutput: Boolean(outputKey),
        planSlideId: resolveCarouselPlanSlideId(
          {
            position: slide.position,
            deckRevision: slide.deckRevision,
            generationOperationKey,
          },
          carouselDeck,
        ),
      };
    });
    return NextResponse.json({
      work: {
        ...publicWork,
        settings: publicSettings,
        request: displayRequestForCreativeWork(result.work),
      },
      preparedPlan: projectPreparedPlanV1(result.work),
      outputs,
      canLayerize,
      layerEditorAccess,
      sources,
      inferredBriefing,
      briefingFactPack: inferredBriefing ? resolveCreativeWorkFactPack(result.work.inputSnapshot) : null,
      canonical,
      carouselSlides,
      carouselQuality: carouselQuality
        ? {
            version: carouselQuality.version,
            objectivePassed: carouselQuality.objectivePassed,
            advisoryWarnings: carouselQuality.advisoryWarnings,
            reviewedAt: carouselQuality.reviewedAt,
            hasContactSheet: Boolean(carouselQuality.contactSheetKey),
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].GET");
  }
}

/**
 * Confirm the work: persist copy (via canonical briefing map) and lock
 * identity snapshot. Domain: confirmSocialPostWork (Phase 5 / item 36).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace, user }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const parsed = patchCreativeWorkSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    if ("action" in parsed.data && parsed.data.action === "layerizeOutput") {
      const callbackOrigin = env.APP_URL?.trim() || env.BETTER_AUTH_URL?.trim();
      const callbackUrl = new URL(callbackOrigin ? `/api/creative-work/${id}` : request.url, callbackOrigin ?? undefined);
      callbackUrl.search = "";
      const result = await requestCreativeWorkLayerization({
        workspaceId: workspace.id,
        workItemId: id,
        outputId: parsed.data.outputId,
        userId: user.id,
        operationId: parsed.data.operationId,
        callbackUrl: callbackUrl.toString(),
        retry: parsed.data.retry,
      });
      if (!result.ok) {
        switch (result.error.code) {
          case "work_not_found": return apiError("creativeWorkNotFound", 404);
          case "output_not_found": return apiError("creativeWorkOutputNotFound", 404);
          case "output_not_eligible": return apiError("creativeWorkLayerizationNotEligible", 409);
          case "layerization_not_configured": return apiError("creativeWorkLayerizationNotConfigured", 409);
          case "layer_editor_not_available": return apiError("layer_editor_not_available", 403);
          case "layer_editor_quota_exhausted": return apiError("layer_editor_quota_exhausted", 429);
          case "layerization_replay_conflict": return apiError("layer_editor_revision_conflict", 409);
          case "already_running": return NextResponse.json({ state: toPublicLayerizationState(result.error.state), replay: true }, { status: 200 });
          case "submission_unknown": return NextResponse.json({ state: toPublicLayerizationState(result.error.state), replay: true }, { status: 409 });
          case "failed": return NextResponse.json({ state: toPublicLayerizationState(result.error.state), replay: true }, { status: 409 });
          case "dispatch_failed": return apiError("creativeWorkLayerizationDispatchFailed", 503);
        }
      }
      return NextResponse.json({
        state: toPublicLayerizationState(result.state),
        accepted: result.accepted,
        replay: result.replay,
      }, { status: result.accepted ? 202 : 200 });
    }

    if ("action" in parsed.data && parsed.data.action === "openLayerEditor") {
      const result = await openCreativeWorkLayerEditor({ workspaceId: workspace.id, workItemId: id, outputId: parsed.data.outputId, userId: user.id, userName: user.name ?? null, mode: parsed.data.mode });
      return result.ok ? NextResponse.json({ document: result.document, access: result.access }) : NextResponse.json({ code: result.code, details: { document: result.document ?? null } }, { status: result.status });
    }
    if ("action" in parsed.data && parsed.data.action === "heartbeatLayerEditor") {
      const result = await heartbeatCreativeWorkLayerEditor({ workspaceId: workspace.id, workItemId: id, outputId: parsed.data.outputId, userId: user.id, userName: user.name ?? null, leaseId: parsed.data.leaseId });
      return result.ok ? NextResponse.json({ document: result.document, access: result.access }) : NextResponse.json({ code: result.code, document: result.document ?? null, details: { document: result.document ?? null } }, { status: result.status });
    }
    if ("action" in parsed.data && parsed.data.action === "saveLayerEditor") {
      const result = await saveCreativeWorkLayerEditor({ workspaceId: workspace.id, workItemId: id, outputId: parsed.data.outputId, userId: user.id, userName: user.name ?? null, leaseId: parsed.data.leaseId, expectedRevision: parsed.data.expectedRevision, snapshot: parsed.data.snapshot });
      return result.ok ? NextResponse.json({ document: result.document, access: result.access }) : NextResponse.json({ code: result.code, document: result.document ?? null, details: { document: result.document ?? null } }, { status: result.status });
    }
    if ("action" in parsed.data && parsed.data.action === "releaseLayerEditor") {
      return NextResponse.json(await releaseCreativeWorkLayerEditor({ workspaceId: workspace.id, workItemId: id, outputId: parsed.data.outputId, userId: user.id, leaseId: parsed.data.leaseId }));
    }
    if ("action" in parsed.data && parsed.data.action === "regenerateLayer") {
      const result=await requestCreativeWorkLayerRegeneration({...parsed.data,workspaceId:workspace.id,workItemId:id,userId:user.id});
      if (result.ok) return NextResponse.json(result, { status: result.accepted ? 202 : 200 });
      if (result.code === "disabled") return apiError("layer_editor_not_available", 403);
      if (result.code === "quota_exhausted") return apiError("layer_editor_quota_exhausted", 429);
      return apiError(result.code, result.code === "layer_regeneration_dispatch_failed" ? 503 : 409);
    }
    if ("action" in parsed.data && (parsed.data.action === "acceptLayerCandidate" || parsed.data.action === "discardLayerCandidate")) {
      const command = parsed.data.action === "acceptLayerCandidate"
        ? acceptCreativeWorkLayerRegenerationCandidate
        : discardCreativeWorkLayerRegenerationCandidate;
      const result = await command({ ...parsed.data, workspaceId: workspace.id, workItemId: id, userId: user.id });
      return result.ok ? NextResponse.json({ ok: true }) : apiError(result.code, result.code === "layer_editor_not_available" ? 403 : 409);
    }
    if ("action" in parsed.data && parsed.data.action === "publishLayerEditor") { const result=await publishCreativeWorkLayerEditor({...parsed.data,workspaceId:workspace.id,workItemId:id,userId:user.id}); if(!result.ok)return apiError(result.code,result.code === "layer_editor_not_available" ? 403 : 409); const output=result.output; return NextResponse.json({ok:true,replay:result.replay,output:{id:output.id,parentOutputId:output.parentOutputId,status:output.status,isSelected:output.isSelected,creativeLevel:output.creativeLevel,targetFormat:output.targetFormat,versionNumber:output.versionNumber}},{status:result.replay?200:201}); }

    if ("action" in parsed.data && parsed.data.action === "autosave") {
      const autosaved = await autosaveCreativeWorkDraft({
        workspaceId: workspace.id,
        workItemId: id,
        expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
        request: parsed.data.request,
        intent: parsed.data.intent,
        format: parsed.data.format,
        settings: parsed.data.settings,
      });
      if (autosaved.error === "carousel_reference_limit") return apiError("creativeWorkCarouselReferenceLimit", 409);
      if (autosaved.error === "single_piece_reference_limit") return apiError("creativeWorkPieceReferenceLimit", 409);
      if (autosaved.error === "not_draft") return apiError("creativeWorkNotDraft", 409);
      if (!autosaved.work) return apiError("creativeWorkNotFound", 404);
      // The repository committed the mode transition and every source's new
      // CAS version before any event is emitted. A replay finds persisted
      // Single and returns an empty list, so it cannot enqueue duplicates.
      await Promise.all((autosaved.sourcesNeedingSingleAnalysis ?? []).map((source) =>
        dispatchSourceAnalysisOrFail(workspace.id, id, source),
      ));
      return NextResponse.json({ work: autosaved.work });
    }

    if ("action" in parsed.data && parsed.data.action === "editBriefing") {
      const aggregate = await getCreativeWork(workspace.id, id);
      if (!aggregate) return apiError("creativeWorkNotFound", 404);
      if (aggregate.work.status !== "draft") return apiError("creativeWorkNotDraft", 409);
      if (aggregate.work.toolKind !== "single") return apiError("invalidInput", 400);
      if (aggregate.work.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) {
        return apiError("stale_input", 409);
      }
      const snapshot = aggregate.work.inputSnapshot;
      const briefing = resolveCreativeWorkInferredBriefing(snapshot);
      const factPack = resolveCreativeWorkFactPack(snapshot);
      if (!snapshot || !briefing || !factPack) return apiError("creativeWorkNotReady", 409);
      const parsedOverrides = creativeWorkBriefingOverridesSchema.safeParse(
        snapshot.briefingOverrides ?? aggregate.work.settings.briefingOverrides ?? {},
      );
      if (!parsedOverrides.success) return apiError("creativeWorkNotReady", 409);
      const edited = applyBriefingEdit({
        briefing,
        factPack,
        field: parsed.data.field,
        value: parsed.data.value,
        overrides: parsedOverrides.data,
      });
      const nextOverrides = creativeWorkBriefingOverridesSchema.parse(edited.overrides);
      const nextVersion = (aggregate.work.settings.briefingVersion ?? 0) + 1;
      const nextSettings = {
        ...aggregate.work.settings,
        briefingOverrides: nextOverrides,
        briefingVersion: nextVersion,
      };
      const nextBrief = aggregate.work.brief && ["message", "objective", "audience", "offer"].includes(parsed.data.field)
        ? {
            ...aggregate.work.brief,
            ...(parsed.data.field === "message" ? { theme: parsed.data.value?.trim() ?? "" } : {}),
            ...(parsed.data.field === "objective" ? { objective: parsed.data.value?.trim() ?? "" } : {}),
            ...(parsed.data.field === "audience" ? { audience: parsed.data.value?.trim() ?? "" } : {}),
            ...(parsed.data.field === "offer" ? { offer: parsed.data.value?.trim() || null } : {}),
          }
        : aggregate.work.brief;
      const parsedNextBrief = nextBrief ? socialPostBriefSchema.safeParse(nextBrief) : null;
      const updatedSnapshot = {
        ...snapshot,
        settings: nextSettings,
        briefingOverrides: nextOverrides,
        inferredBriefing: edited.briefing,
        factPack: edited.factPack,
      };
      const work = await updateCreativeWorkDraftIfUnchanged(
        workspace.id,
        id,
        aggregate.work.updatedAt,
        {
          settings: nextSettings,
          brief: parsedNextBrief?.success ? parsedNextBrief.data : null,
          copy: null,
          identitySnapshot: null,
          inputSnapshot: updatedSnapshot,
        },
      );
      if (!work) return apiError("stale_input", 409);
      return NextResponse.json({
        work,
        briefing: edited.briefing,
        briefingFactPack: edited.factPack,
        briefingOverrides: nextOverrides,
        briefingVersion: nextVersion,
      });
    }

    if ("action" in parsed.data && parsed.data.action === "saveAsOffer") {
      const saved = await saveCommercialOfferFromWork({
        workspaceId: workspace.id,
        workItemId: id,
        validFrom: parsed.data.validFrom,
        validUntil: parsed.data.validUntil,
      });
      if (!saved.ok) {
        if (saved.error.code === "work_not_found") return apiError("creativeWorkNotFound", 404);
        if (saved.error.code === "brand_required") return apiError("commercialOfferBrandRequired", 409);
        if (saved.error.code === "missing_product") return apiError("commercialOfferMissingProduct", 422);
        if (saved.error.code === "missing_offer") return apiError("commercialOfferMissingOffer", 422);
        if (saved.error.code === "missing_validity" || saved.error.code === "invalid_window") {
          return apiError("commercialOfferInvalidWindow", 422);
        }
        return apiError("creativeWorkNotReady", 409);
      }
      return NextResponse.json({
        offer: {
          id: saved.value.offer.id,
          version: saved.value.offer.version,
          document: saved.value.offer.document,
        },
      }, { status: 201 });
    }

    if ("action" in parsed.data && parsed.data.action === "prepare") {
      // One aggregate read decides the prepare path: carousel has its own
      // frozen-snapshot command; every other intent keeps the legacy one.
      const aggregate = await getCreativeWork(workspace.id, id);
      if (!aggregate) return apiError("creativeWorkNotFound", 404);
      if (aggregate.work.toolKind === "carousel") {
        const prepared = await prepareCarouselWork({ workspaceId: workspace.id, workItemId: id });
        if (!prepared.ok) {
          switch (prepared.error.code) {
            case "work_not_found": return apiError("creativeWorkNotFound", 404);
            case "work_not_carousel": return apiError("creativeWorkNotCarousel", 409, prepared.error.details);
            case "work_not_draft": return apiError("creativeWorkNotDraft", 409, prepared.error.details);
            case "sources_not_ready": return apiError("creativeWorkSourcesNotReady", 409);
            case "temporary_reference_limit": return apiError("creativeWorkCarouselReferenceLimit", 409, prepared.error.details);
            case "stale_input": return apiError("stale_input", 409);
            case "blocking_questions": return apiError("blocking_questions", 409, prepared.error.details);
            case "editorial_invalid": return apiError("editorial_invalid", 422, prepared.error.details);
            case "invalid_context": return apiError("invalid_context", 422, prepared.error.details);
            case "invalid_generation_gate": return apiError("creativeWorkNotReady", 409, prepared.error.details);
          }
        }
        return NextResponse.json(prepared.value);
      }
      const prepared = await prepareCreativeWork({ workspaceId: workspace.id, workItemId: id });
      if (!prepared.ok) {
        if (prepared.error.code === "work_not_found") return apiError("creativeWorkNotFound", 404);
        if (prepared.error.code === "missing_input") return apiError("creativeWorkInputRequired", 422);
        if (prepared.error.code === "piece_reference_required") return apiError("creativeWorkPieceReferenceRequired", 422);
        if (prepared.error.code === "piece_reference_exact_incompatible") return apiError("creativeWorkPieceReferenceExactIncompatible", 422);
        // R-002: copy that cannot be grounded in the fact pack is a 422 with
        // its violations payload preserved — never a bare 409.
        if (prepared.error.code === "invalid_context") return apiError("invalid_context", 422, prepared.error.details);
        // R-003: an explicit brand conflict is a 422 whose details carry the
        // two short choices (source/active) — billing stays blocked.
        if (prepared.error.code === "brand_conflict") return apiError("brand_conflict", 422, prepared.error.details);
        if (prepared.error.code === "briefing_blocked") return apiError("briefing_blocked", 422, prepared.error.details);
        if (prepared.error.code === "offer_expired") return apiError("commercialOfferExpired", 409);
        return apiError("creativeWorkNotReady", 409);
      }
      return NextResponse.json(prepared.value);
    }

    if ("action" in parsed.data && parsed.data.action === "approveCarousel") {
      // Objective-only deck approval: the command re-validates workspace,
      // revision and every slide inside one transaction before writing.
      const approved = await approveCarouselDeck({
        workspaceId: workspace.id,
        workItemId: id,
        revision: parsed.data.revision,
      });
      if (!approved.ok) {
        switch (approved.error.code) {
          case "work_not_found": return apiError("creativeWorkNotFound", 404);
          case "work_not_carousel": return apiError("creativeWorkNotCarousel", 409, approved.error.details);
          case "stale_input": return apiError("stale_input", 409, approved.error.details);
          case "revision_conflict": return apiError("carouselDeckRevisionConflict", 409, approved.error.details);
          case "deck_not_ready": return apiError("carouselDeckNotReady", 409, approved.error.details);
        }
      }
      return NextResponse.json(
        {
          approvedRevision: approved.value.work.carouselApprovedRevision,
          replay: approved.value.replay,
        },
        { status: approved.value.replay ? 200 : 201 },
      );
    }

    if ("action" in parsed.data && parsed.data.action === "resolveBrandConflict") {
      const aggregate = await getCreativeWork(workspace.id, id);
      if (!aggregate) return apiError("creativeWorkNotFound", 404);
      if (aggregate.work.status !== "draft") return apiError("creativeWorkNotDraft", 409);
      // The brand choice exists only for restyle — the single new visible
      // decision of spec 11; other protocols never grow this wizard.
      if (aggregate.work.toolKind !== "restyle") return apiError("invalidInput", 400);
      const expectedUpdatedAt = new Date(parsed.data.expectedUpdatedAt);
      if (aggregate.work.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) {
        return apiError("stale_input", 409);
      }
      // R-003: the choice is bound to the conflict it answers. It is only
      // accepted while that exact conflict is detectable in the current
      // draft — a draft without a detectable conflict has nothing to
      // resolve, and a different future conflict asks again.
      const conflict = await detectCreativeWorkDraftBrandConflict({
        workspaceId: workspace.id,
        work: aggregate.work,
        sources: aggregate.sources,
      });
      if (!conflict) return apiError("invalidInput", 400);
      const work = await updateCreativeWorkDraftIfUnchanged(workspace.id, id, expectedUpdatedAt, {
        settings: {
          ...aggregate.work.settings,
          brandConflictChoice: parsed.data.choice,
          brandConflictDetectedBrand: conflict.detectedBrand,
        },
        // The fact pack/copy depend on the resolved brand authority, so the
        // prepared blocks are rebuilt by the next prepare of the same draft.
        brief: null,
        copy: null,
        inputSnapshot: null,
      });
      if (!work) return apiError("stale_input", 409);
      return NextResponse.json({ work });
    }

    if ("action" in parsed.data && parsed.data.action === "linkCampaign") {
      const work = await linkCreativeWorkCampaign(workspace.id, id, parsed.data.campaignId);
      if (!work) return apiError("creativeWorkCampaignMismatch", 409);
      return NextResponse.json({ work });
    }

    if ("action" in parsed.data && parsed.data.action === "attachSource") {
      // This is authorization/lifecycle validation only. The repository reads
      // toolKind again after its shared lock and owns Single normalization.
      const aggregate = await getCreativeWork(workspace.id, id);
      if (!aggregate) return apiError("creativeWorkNotFound", 404);
      const asset = "assetId" in parsed.data ? await getWorkspaceAssetById(parsed.data.assetId, workspace.id) : null;
      const template = "templateId" in parsed.data ? await getTemplateById(parsed.data.templateId, workspace.id) : null;
      if ("assetId" in parsed.data && (!asset || !asset.type.startsWith("image/"))) return apiError("invalidInput", 400);
      if ("templateId" in parsed.data && !template) return apiError("invalidInput", 400);
      const sourceClaim = await createCreativeWorkSource({
        workspaceId: workspace.id,
        workItemId: id,
        ...(asset ? { assetId: asset.id } : { templateId: template!.id }),
        usage: parsed.data.usage,
        expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
        // The repository replaces this from the tool kind it reads under the
        // source lock. This legacy-compatible value is never authoritative.
        usageConfirmed: true,
        status: "uploaded",
      });
      if (!sourceClaim) return apiError("invalidInput", 400);
      if ("limitReached" in sourceClaim) {
        return apiError(
          sourceClaim.reason === "carousel_reference_limit"
            ? "creativeWorkCarouselReferenceLimit"
            : "creativeWorkPieceReferenceLimit",
          409,
        );
      }
      const source = sourceClaim.source;
      if (!sourceClaim.claimedForAnalysis) return NextResponse.json({ source });
      if (source.templateId) {
        const analyzed = await analyzeCreativeWorkSource({ workspaceId: workspace.id, workItemId: id, sourceId: source.id });
        const canonical = analyzed ?? (await getCreativeWork(workspace.id, id))?.sources
          .find((candidate) => candidate.id === source.id) ?? source;
        return NextResponse.json({ source: canonical });
      }
      await dispatchSourceAnalysisOrFail(workspace.id, id, source);
      return NextResponse.json({ source });
    }

    if ("sourceId" in parsed.data) {
      const sourceId = parsed.data.sourceId;
      const aggregate = await getCreativeWork(workspace.id, id);
      if (!aggregate) return apiError("creativeWorkNotFound", 404);
      const source = aggregate.sources.find((candidate) => candidate.id === sourceId);
      if (!source) return apiError("invalidInput", 404);

      if (parsed.data.action === "updatePieceReference") {
        if (aggregate.work.toolKind !== "single" || !source.assetId || source.status !== "ready" || !source.pieceReference) return apiError("invalidInput", 409);
        const updated = await mutateCreativeWorkPieceReference({
          workspaceId: workspace.id,
          workItemId: id,
          expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
          sourceId: source.id,
          mutation: {
            kind: "correct",
            ...(parsed.data.category === undefined ? {} : { category: parsed.data.category }),
            ...(parsed.data.userInstruction === undefined ? {} : { userInstruction: parsed.data.userInstruction }),
          },
        });
        if (!updated) return apiError("invalidInput", 409);
        return NextResponse.json({ source: updated });
      }
      if (parsed.data.action === "replacePieceReference") {
        if (aggregate.work.toolKind !== "single" || !source.assetId || !source.pieceReference) return apiError("invalidInput", 409);
        const asset = await getWorkspaceAssetById(parsed.data.assetId, workspace.id);
        if (!asset || !asset.type.startsWith("image/")) return apiError("invalidInput", 400);
        const updated = await mutateCreativeWorkPieceReference({
          workspaceId: workspace.id,
          workItemId: id,
          expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
          sourceId: source.id,
          mutation: { kind: "replace", assetId: asset.id },
        });
        if (!updated) return apiError("invalidInput", 409);
        await dispatchSourceAnalysisOrFail(workspace.id, id, updated);
        return NextResponse.json({ source: updated });
      }
      if (parsed.data.action === "promotePieceReference") {
        if (aggregate.work.toolKind !== "single" || !aggregate.work.clientProfileId || !source.assetId || source.status !== "ready" || !source.pieceReference?.category) return apiError("invalidInput", 409);
        if (aggregate.work.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) return apiError("stale_input", 409);
        const pieceReference = source.pieceReference;
        const asset = await getWorkspaceAssetById(source.assetId, workspace.id);
        if (!asset || !asset.type.startsWith("image/")) return apiError("invalidInput", 400);
        const dispatchTrainingAnalysis = (referenceId: string) => inngest.send({
          name: heavyImageEventName("brand.training.analyze"),
          data: { workspaceId: workspace.id, clientProfileId: aggregate.work.clientProfileId, referenceId, assetKey: asset.key, mimeType: asset.type, hasAlpha: pieceReference.hasTransparency },
        });
        const claim = await promoteCreativeWorkPieceReference({
          workspaceId: workspace.id,
          workItemId: id,
          sourceId: source.id,
          clientProfileId: aggregate.work.clientProfileId,
          assetKey: asset.key,
          label: asset.name,
          expected: { assetId: source.assetId, assetKey: asset.key, updatedAt: source.updatedAt, category: pieceReference.category as PieceReferenceCategory },
        });
        if (!claim) return apiError("invalidInput", 409);
        // A pending row is intentionally retained if enqueueing fails. Brand
        // Training serializes analysis by reference id, so retrying this
        // dispatch is safe without holding the transaction across the call.
        if (claim.claimed || claim.reference.reviewStatus === "pending_analysis") {
          await dispatchTrainingAnalysis(claim.reference.id);
        }
        return NextResponse.json(
          { reference: claim.reference, alreadySaved: !claim.claimed },
          claim.claimed ? { status: 201 } : undefined,
        );
      }

      if (parsed.data.action === "removeSource") {
        const removed = await mutateCreativeWorkDraftSource({
          workspaceId: workspace.id, workItemId: id, sourceId: source.id,
          expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
          mutation: { kind: "remove" },
        });
        if (!removed) return apiError("invalidInput", 409);
        return NextResponse.json({ removed: true });
      }
      if (parsed.data.action === "editSourceAnalysis") {
        const updated = await mutateCreativeWorkDraftSource({
          workspaceId: workspace.id, workItemId: id, sourceId: source.id,
          expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
          mutation: {
            kind: "update",
            patch: {
              contentAnalysis: source.usage === "style" ? null : parsed.data.content,
              styleAnalysis: source.usage === "content" ? null : parsed.data.style,
              status: "ready",
              failureCode: null,
            },
            expected: { status: source.status, usage: source.usage, updatedAt: source.updatedAt },
          },
        });
        if (!updated) return apiError("invalidInput", 409);
        return NextResponse.json({ source: updated });
      }
      // Allow retry for failed (normal) and uploaded (stuck: Inngest never claimed).
      // Analyzing/ready must not re-dispatch — that races an in-flight job.
      if (parsed.data.action === "retrySource" && source.status !== "failed" && source.status !== "uploaded") {
        return apiError("invalidInput", 409);
      }
      const updated = await mutateCreativeWorkDraftSource({
        workspaceId: workspace.id,
        workItemId: id,
        expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
        sourceId: source.id,
        mutation: parsed.data.action === "updateSource"
          ? { kind: "update", patch: { usage: parsed.data.usage, usageConfirmed: true, status: "uploaded", failureCode: null } }
          : {
              kind: "update",
              patch: { status: "uploaded", failureCode: null },
              expected: { status: source.status, usage: source.usage, updatedAt: source.updatedAt },
            },
      });
      if (!updated) return apiError("invalidInput", 409);
      if (updated.templateId) {
        const analyzed = await analyzeCreativeWorkSource({ workspaceId: workspace.id, workItemId: id, sourceId: source.id });
        return NextResponse.json({ source: analyzed });
      }
      await dispatchSourceAnalysisOrFail(workspace.id, id, updated);
      return NextResponse.json({ source: updated });
    }

    if ("action" in parsed.data) return apiError("invalidInput", 400);

    const result = await confirmSocialPostWork({
      workspaceId: workspace.id,
      workItemId: id,
      copy: parsed.data.copy,
      selectedReferenceIds: parsed.data.selectedReferenceIds,
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found":
          return apiError("creativeWorkNotFound", 404);
        case "invalid_copy":
          return apiError("invalidInput", 400);
        case "identity_reference_not_approved":
          return apiError("identityReferenceNotApproved", 422, {
            referenceId: result.error.referenceId,
          });
        case "identity_reference_missing_alpha":
          return apiError("identityReferenceMissingAlpha", 422, {
            referenceId: result.error.referenceId,
            category: result.error.category,
          });
        default:
          return apiError("invalidRequest", 400);
      }
    }

    return NextResponse.json({
      work: result.value.work,
      canonical: result.value.canonical,
    });
  } catch (error) {
    if (isCreativeWorkRevisionConflict(error)) return apiError("stale_input", 409);
    return handleApiError(error, "creative-work.[id].PATCH");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const url = new URL(request.url);
  if (url.searchParams.get("layerizeCallback") !== "1") {
    return apiError("invalidRequest", 400);
  }
  try {
    const { id } = await params;
    const outputId = url.searchParams.get("outputId");
    const attemptId = url.searchParams.get("attemptId");
    const token = url.searchParams.get("token");
    const advertisedLength = Number(request.headers.get("content-length"));
    if (!outputId || !attemptId || !token || outputId.length > 128 || attemptId.length > 128 || token.length > 128 || (Number.isFinite(advertisedLength) && advertisedLength > 256 * 1024)) {
      return apiError("invalidRequest", 400);
    }
    const body = await request.arrayBuffer();
    if (body.byteLength > 256 * 1024) return apiError("invalidRequest", 413);
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(body)) as unknown;
    } catch {
      return apiError("invalidRequest", 400);
    }
    const result = await handleCreativeWorkLayerizationCallback({
      workItemId: id,
      outputId,
      attemptId,
      token,
      payload,
    });
    if (!result.ok) {
      return apiError(result.code === "unknown_attempt" ? "creativeWorkLayerizationNotFound" : "unauthorized", result.code === "unknown_attempt" ? 404 : 401);
    }
    return NextResponse.json({ accepted: true, replay: result.replay }, { status: 202 });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].POST.layerize-callback");
  }
}
