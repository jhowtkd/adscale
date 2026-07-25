import { refundCredits } from "@/server/billing/credits";
import { quoteCreativeWork, type CreativeWorkInputSnapshot } from "@/server/creative-work/contracts";
import { buildCreativeWorkFactPack, creativeWorkFactPackBrandFromKit } from "@/server/creative-work/fact-pack";
import { buildIdentityOptions, createIdentitySnapshot } from "@/server/creative-work/identity";
import { resolveCreativeWorkProtocol } from "@/server/creative-work/protocol";
import { chargeForGenerationBatch } from "@/server/generation/canonical/charge";
import { GENERATION_CREDIT_COSTS, type GenerationBatchCharge } from "@/server/generation/canonical/types";
import { inngest } from "@/server/jobs/client";
import { getBrandKit } from "@/server/repositories/brand-kit";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import {
  confirmCreativeWorkSnapshotsIfUnchanged,
  createPlannedCreativeWorkOutputs,
  failQueuedCreativeWorkOutput,
  getCreativeWorkSourceAssetDetails,
  getCreativeWork,
  refreshCreativeWorkStatus,
  setCreativeWorkInputSnapshotIfMissing,
  setCreativeWorkStatus,
} from "@/server/repositories/creative-work";
import { prepareCreativeWork } from "./prepare-creative-work";

export type GenerateCreativeWorkResult =
  | { ok: true; value: { work: NonNullable<Awaited<ReturnType<typeof getCreativeWork>>>["work"]; outputs: NonNullable<Awaited<ReturnType<typeof getCreativeWork>>>["outputs"]; billingKey: string; brandTrainingSuggestion: string | null } }
  | { ok: false; error: { code: "work_not_found" | "work_not_draft" | "work_not_prepared" | "invalid_context" | "brand_conflict" | "stale_input" | "credit_blocked" | "dispatch_failed"; details?: unknown } };

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

async function refundDispatchFailedOutputs(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
}, outputs: Array<{ id: string; failureCode: string | null }>): Promise<boolean> {
  let ok = true;
  for (const output of outputs.filter((row) => row.failureCode === "dispatch_failed")) {
    try {
      await refundCredits({
        workspaceId: input.workspaceId,
        action: "image_derivation",
        idempotencyKey: `creative-work:${input.workItemId}:output:${output.id}:dispatch-refund`,
        amount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
        metadata: { creativeWorkId: input.workItemId, outputId: output.id, description: "creative_work_dispatch_refund" },
        userId: input.userId,
      });
    } catch {
      ok = false;
    }
  }
  return ok;
}

export async function generateCreativeWork(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
}): Promise<GenerateCreativeWorkResult> {
  const billingKey = `creative-work:${input.workItemId}:initial`;
  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) return { ok: false, error: { code: "work_not_found" } };

  if (existing.outputs.length > 0) {
    if (!await refundDispatchFailedOutputs(input, existing.outputs)) {
      return { ok: false, error: { code: "dispatch_failed" } };
    }
    return { ok: true, value: { work: existing.work, outputs: existing.outputs, billingKey, brandTrainingSuggestion: null } };
  }
  let work = existing.work;
  let readyWork = existing.work;
  let brandTrainingSuggestion: string | null = null;
  if (work.status === "draft") {
    const prepared = await prepareCreativeWork(input);
    if (!prepared.ok) {
      // R-002: an invalid fact pack/copy surfaces its own typed error, still
      // before any charge or image call; everything else stays work_not_prepared.
      if (prepared.error.code === "work_not_found") {
        return { ok: false, error: { code: "work_not_found" as const } };
      }
      if (prepared.error.code === "invalid_context") {
        // Forward the violations payload unwrapped so the HTTP edge returns
        // details.violations exactly like the prepare route does.
        return { ok: false, error: { code: "invalid_context" as const, details: prepared.error.details } };
      }
      if (prepared.error.code === "brand_conflict") {
        // R-003: same forwarding as invalid_context — the 422 details carry
        // the two brand choices and billing stays blocked until the user
        // resolves the conflict.
        return { ok: false, error: { code: "brand_conflict" as const, details: prepared.error.details } };
      }
      return { ok: false, error: { code: "work_not_prepared" as const, details: prepared.error } };
    }
    work = prepared.value.work;
    if (!work.brief) return { ok: false, error: { code: "work_not_prepared" } };

    const ranked = await buildIdentityOptions(input.workspaceId, work.clientProfileId, work.brief);
    const selectedReferenceIds = ranked.slice(0, 3).map((option) => option.referenceId);
    const identitySnapshot = await createIdentitySnapshot({
      workspaceId: input.workspaceId,
      clientProfileId: work.clientProfileId,
      selectedReferenceIds,
    });
    if (!work.inputSnapshot) return { ok: false, error: { code: "work_not_prepared" } };
    const confirmed = await confirmCreativeWorkSnapshotsIfUnchanged(
      input.workspaceId,
      input.workItemId,
      work.updatedAt,
      work.inputSnapshot,
      identitySnapshot,
    );
    if (!confirmed) return { ok: false, error: { code: "stale_input" } };
    readyWork = confirmed;
    brandTrainingSuggestion = selectedReferenceIds.length === 0 ? "missing_visual_references" : null;
  } else if (work.status !== "ready" || !work.brief || !work.copy || !work.identitySnapshot) {
    return { ok: false, error: { code: "work_not_draft" } };
  } else {
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
  if (!work.brief) return { ok: false, error: { code: "work_not_prepared" } };

  const quote = quoteCreativeWork({ intent: work.toolKind, format: work.format, targetFormats: work.settings.targetFormats });
  const batch: GenerationBatchCharge = {
    kind: "batch",
    authorship: { workspaceId: input.workspaceId, userId: input.userId },
    origin: "quick_tool",
    surface: "quick_tool",
    intent: { mode: "social_post", objective: work.brief.objective },
    parentId: input.workItemId,
    unitCount: quote.unitCount,
    chargeAmount: quote.credits,
    unitChargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
    billingKey,
    refundPolicy: "default",
  };
  const spend = await chargeForGenerationBatch(batch, {
    returnPath: `/quick-tools/create-post?workId=${input.workItemId}`,
    metadata: { creativeWorkId: input.workItemId },
  });
  if (!spend.ok) return { ok: false, error: { code: "credit_blocked", details: spend } };

  const created = await createPlannedCreativeWorkOutputs(input.workspaceId, input.workItemId, quote.plans);
  const newIds = new Set(created.newlyCreatedIds);
  const events = created.outputs.filter((output) => newIds.has(output.id)).map((output) => ({
    name: heavyImageEventName("creative-work.generate"),
    data: { workspaceId: input.workspaceId, workItemId: input.workItemId, outputId: output.id },
  }));
  try {
    if (events.length > 0) await inngest.send(events);
  } catch {
    const compensated = (await Promise.all(created.newlyCreatedIds.map((outputId) =>
      failQueuedCreativeWorkOutput(input.workspaceId, input.workItemId, outputId, "dispatch_failed")
    ))).filter((output) => output != null);
    await refundDispatchFailedOutputs(input, compensated);
    await refreshCreativeWorkStatus(input.workspaceId, input.workItemId).catch(() => undefined);
    return { ok: false, error: { code: "dispatch_failed" } };
  }

  const generatingWork = await setCreativeWorkStatus(input.workspaceId, input.workItemId, "generating") ?? readyWork;
  return {
    ok: true,
    value: {
      work: generatingWork,
      outputs: created.outputs,
      billingKey,
      brandTrainingSuggestion,
    },
  };
}
