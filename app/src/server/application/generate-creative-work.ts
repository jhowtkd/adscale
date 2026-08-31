import { quoteCreativeWork, type CreativeWorkInputSnapshot } from "@/server/creative-work/contracts";
import type { SpendResult } from "@/server/billing/paywall";
import { buildCreativeWorkFactPack, creativeWorkFactPackBrandFromKit } from "@/server/creative-work/fact-pack";
import { createIdentitySnapshot } from "@/server/creative-work/identity";
import { resolveCreativeWorkProtocol } from "@/server/creative-work/protocol";
import { GENERATION_CREDIT_COSTS, type GenerationBatchCharge } from "@/server/generation/canonical/types";
import { creativeWorkSettlementAdapter } from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { getBrandKit } from "@/server/repositories/brand-kit";
import {
  confirmCreativeWorkSnapshotsIfUnchanged,
  getCreativeWorkSourceAssetDetails,
  getCreativeWork,
  setCreativeWorkInputSnapshotIfMissing,
  withCreativeWorkPreparationLock,
} from "@/server/repositories/creative-work";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { logger } from "@/lib/logger";
import { logCreativeWorkGenerationLifecycle } from "@/server/creative-work/job-telemetry";
import { env } from "@/server/validation/env";

export type GenerateCreativeWorkResult =
  | { ok: true; value: { work: NonNullable<Awaited<ReturnType<typeof getCreativeWork>>>["work"]; outputs: NonNullable<Awaited<ReturnType<typeof getCreativeWork>>>["outputs"]; billingKey: string; brandTrainingSuggestion: string | null } }
  | { ok: false; error: { code: "work_not_found" | "work_not_draft" | "work_not_prepared" | "stale_input" | "credit_blocked" | "dispatch_failed"; details?: unknown } };

async function buildInputSnapshot(
  workspaceId: string,
  aggregate: NonNullable<Awaited<ReturnType<typeof getCreativeWork>>>,
): Promise<CreativeWorkInputSnapshot> {
  const readySources = aggregate.sources.filter((source) => source.status === "ready");
  const assets = await getCreativeWorkSourceAssetDetails(workspaceId, readySources);
  const brandKit = await getBrandKit(workspaceId, aggregate.work.clientProfileId);
  const protocol = resolveCreativeWorkProtocol({
    toolKind: aggregate.work.toolKind,
    format: aggregate.work.format,
    targetFormats: aggregate.work.settings.targetFormats,
  });
  const sources = readySources.map((source) => ({
    sourceId: source.id,
    updatedAt: source.updatedAt.toISOString(),
    assetKey: assets.get(source.id)?.assetKey ?? null,
    mimeType: assets.get(source.id)?.mimeType ?? null,
    label: assets.get(source.id)?.name ?? null,
    usage: source.usage,
    content: source.contentAnalysis,
    style: source.styleAnalysis,
  }));
  // R-011: intentionally unversioned — pre-switch works resolve to "legacy";
  // the switch is only read at prepare time, never here.
  return {
    // R-002: this builder only runs when the work's whole inputSnapshot is
    // absent (see the caller below) — it never backfills a fact pack into an
    // already-persisted snapshot.
    factPack: buildCreativeWorkFactPack({
      request: aggregate.work.request,
      mode: protocol.mode,
      sources: sources.map((source) => ({
        sourceId: source.sourceId,
        usage: source.usage,
        content: source.content,
      })),
      brand: creativeWorkFactPackBrandFromKit(brandKit),
      clientProfileId: aggregate.work.clientProfileId,
    }),
    request: aggregate.work.request,
    settings: aggregate.work.settings,
    sources,
  };
}

export async function generateCreativeWork(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
  preparedRevision: string;
  studioSessionId?: string;
  rolloutVariant?: "control" | "progressive";
}): Promise<GenerateCreativeWorkResult> {
  const billingKey = `creative-work:${input.workItemId}:initial`;
  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) return { ok: false, error: { code: "work_not_found" } };

  let work = existing.work;
  let readyWork = existing.work;
  let brandTrainingSuggestion: string | null = null;
  if (existing.outputs.length === 0 && work.status === "draft") {
    const revision = new Date(input.preparedRevision);
    if (Number.isNaN(revision.getTime()) || revision.getTime() !== work.updatedAt.getTime()) return { ok: false, error: { code: "stale_input" } };
    if (!work.brief || !work.copy || !work.inputSnapshot) return { ok: false, error: { code: "work_not_prepared" } };

    // Empty selection delegates ranking to the snapshot's single canonical
    // selector. Operator-selected IDs use the same path in confirmSocialPostWork.
    const identitySnapshot = await createIdentitySnapshot({
      workspaceId: input.workspaceId,
      clientProfileId: work.clientProfileId,
      selectedReferenceIds: [],
      brief: work.brief,
      format: work.format,
      includePublishedBrandKnowledge:
        work.toolKind === "single" && env.BRAND_CORTEX_SINGLE_PIECE_ENABLED === "true",
    });
    const confirmed = await withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async (executor) => {
      const fresh = await getCreativeWork(input.workspaceId, input.workItemId, executor);
      if (!fresh?.work.inputSnapshot || !fresh.work.brief || !fresh.work.copy || fresh.work.updatedAt.getTime() !== revision.getTime()) return null;
      return confirmCreativeWorkSnapshotsIfUnchanged(input.workspaceId, input.workItemId, revision, fresh.work.inputSnapshot, identitySnapshot, executor);
    });
    if (!confirmed) return { ok: false, error: { code: "stale_input" } };
    readyWork = confirmed;
    brandTrainingSuggestion = identitySnapshot.assets.length === 0
      ? "missing_visual_references"
      : null;
  } else if (
    existing.outputs.length === 0 &&
    (work.status !== "ready" || !work.brief || !work.copy || !work.identitySnapshot)
  ) {
    return { ok: false, error: { code: "work_not_draft" } };
  } else if (existing.outputs.length === 0) {
    if (!work.identitySnapshot) return { ok: false, error: { code: "work_not_draft" } };
    const hasTrainingReferences = work.identitySnapshot.assets.length > 0;
    // R-002: the snapshot backfill is intentionally all-or-nothing. It only
    // runs when the work has NO inputSnapshot at all; a legacy ready work
    // that already carries a pre-R-002 snapshot keeps following the policy
    // frozen in that snapshot (T1: generationPolicyVersion — the work
    // continues in the contract it was prepared under). The fact pack is
    // rebuilt only together with the entire missing snapshot, never patched
    // into an existing one.
    if (!work.inputSnapshot) {
      const inputSnapshot = await buildInputSnapshot(input.workspaceId, existing);
      const persisted = await setCreativeWorkInputSnapshotIfMissing(input.workspaceId, input.workItemId, inputSnapshot);
      if (!persisted) return { ok: false, error: { code: "stale_input" } };
      work = persisted;
      readyWork = persisted;
    }
    brandTrainingSuggestion = hasTrainingReferences ? null : "missing_visual_references";
  }
  if (!work.brief && existing.outputs.length === 0) {
    return { ok: false, error: { code: "work_not_prepared" } };
  }

  const quote = quoteCreativeWork({
    intent: work.toolKind,
    format: work.format,
    targetFormats: work.settings.targetFormats,
    directionPool: work.settings.directionPool,
  });
  logCreativeWorkGenerationLifecycle({
    event: "creative_work_generation_requested",
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    generationCorrelationId: readyWork.generationCorrelationId,
    unitCount: quote.unitCount,
    credits: quote.credits,
    unitChargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
  });
  const batch: GenerationBatchCharge = {
    kind: "batch",
    authorship: { workspaceId: input.workspaceId, userId: input.userId },
    origin: "quick_tool",
    surface: "quick_tool",
    intent: { mode: "social_post", objective: work.brief?.objective ?? null },
    parentId: input.workItemId,
    unitCount: quote.unitCount,
    chargeAmount: quote.credits,
    unitChargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
    billingKey,
    refundPolicy: "default",
  };
  const settled = await startGenerationSettlement(
    creativeWorkSettlementAdapter({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      userId: input.userId,
      readyWork,
      plans: quote.plans,
      batch,
      existing:
        existing.outputs.length > 0
          ? { work: existing.work, outputs: existing.outputs }
          : undefined,
    }),
  );
  if (!settled.ok) {
    if (settled.error.code === "credit_blocked") {
      const spend: Extract<SpendResult, { ok: false }> = {
        ok: false,
        status: 402,
        conversionPayload: settled.error.details as Extract<
          SpendResult,
          { ok: false }
        >["conversionPayload"],
      };
      return {
        ok: false,
        error: { code: "credit_blocked", details: spend },
      };
    }
    return { ok: false, error: { code: "dispatch_failed" } };
  }
  logCreativeWorkGenerationLifecycle({
    event: "creative_work_generation_accepted",
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    generationCorrelationId: settled.value.work.generationCorrelationId,
    unitCount: settled.value.outputs.length,
    outputIds: settled.value.outputs.map((output) => output.id),
    credits: quote.credits,
    unitChargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
    result: "accepted",
  });
  void recordBetaAnalyticsEvent({ workspaceId: input.workspaceId, userId: input.userId, eventKey: "generation_confirmed", source: "server", properties: { creativeWorkId: input.workItemId, protocol: work.toolKind, outputCount: settled.value.outputs.length, ...(input.studioSessionId ? { studioSessionId: input.studioSessionId } : {}), ...(input.rolloutVariant ? { rolloutVariant: input.rolloutVariant } : {}) } }).catch((error) => logger.warn("[creative-work] generation_confirmed telemetry failed", error));
  return {
    ok: true,
    value: {
      work: settled.value.work,
      outputs: settled.value.outputs,
      billingKey,
      brandTrainingSuggestion,
    },
  };
}
