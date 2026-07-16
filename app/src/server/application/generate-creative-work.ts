import { refundCredits } from "@/server/billing/credits";
import { quoteCreativeWork } from "@/server/creative-work/contracts";
import { buildIdentityOptions, createIdentitySnapshot } from "@/server/creative-work/identity";
import { chargeForGenerationBatch } from "@/server/generation/canonical/charge";
import { GENERATION_CREDIT_COSTS, type GenerationBatchCharge } from "@/server/generation/canonical/types";
import { inngest } from "@/server/jobs/client";
import {
  confirmCreativeWorkIdentity,
  createPlannedCreativeWorkOutputs,
  failCreativeWorkOutput,
  getCreativeWork,
  refreshCreativeWorkStatus,
  setCreativeWorkStatus,
} from "@/server/repositories/creative-work";
import { prepareCreativeWork } from "./prepare-creative-work";

export type GenerateCreativeWorkResult =
  | { ok: true; value: { work: NonNullable<Awaited<ReturnType<typeof getCreativeWork>>>["work"]; outputs: NonNullable<Awaited<ReturnType<typeof getCreativeWork>>>["outputs"]; billingKey: string; brandTrainingSuggestion: string | null } }
  | { ok: false; error: { code: "work_not_found" | "work_not_draft" | "work_not_prepared" | "credit_blocked" | "dispatch_failed"; details?: unknown } };

export async function generateCreativeWork(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
}): Promise<GenerateCreativeWorkResult> {
  const billingKey = `creative-work:${input.workItemId}:initial`;
  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) return { ok: false, error: { code: "work_not_found" } };

  if (existing.outputs.length > 0) {
    return { ok: true, value: { work: existing.work, outputs: existing.outputs, billingKey, brandTrainingSuggestion: null } };
  }
  let work = existing.work;
  let readyWork = existing.work;
  let brandTrainingSuggestion: string | null = null;
  if (work.status === "draft") {
    const prepared = await prepareCreativeWork(input);
    if (!prepared.ok) {
      return { ok: false, error: { code: prepared.error.code === "work_not_found" ? "work_not_found" : "work_not_prepared", details: prepared.error } };
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
    const confirmed = await confirmCreativeWorkIdentity(input.workspaceId, input.workItemId, identitySnapshot);
    if (!confirmed) return { ok: false, error: { code: "work_not_found" } };
    readyWork = confirmed;
    brandTrainingSuggestion = selectedReferenceIds.length === 0 ? "Treine referências visuais para aproximar futuros resultados da marca." : null;
  } else if (work.status !== "ready" || !work.brief || !work.copy || !work.inputSnapshot || !work.identitySnapshot) {
    return { ok: false, error: { code: "work_not_draft" } };
  } else {
    brandTrainingSuggestion = work.identitySnapshot.assets.length === 0 ? "Treine referências visuais para aproximar futuros resultados da marca." : null;
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
    name: "creative-work.generate" as const,
    data: { workspaceId: input.workspaceId, workItemId: input.workItemId, outputId: output.id },
  }));
  try {
    if (events.length > 0) await inngest.send(events);
  } catch {
    await Promise.all(created.newlyCreatedIds.map((outputId) =>
      failCreativeWorkOutput(input.workspaceId, input.workItemId, outputId, "dispatch_failed")
    ));
    await refundCredits({
      workspaceId: input.workspaceId,
      action: "image_derivation",
      idempotencyKey: `${billingKey}:dispatch-refund`,
      amount: quote.credits,
      metadata: { creativeWorkId: input.workItemId, description: "creative_work_dispatch_refund" },
      userId: input.userId,
    });
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
