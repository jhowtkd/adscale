/**
 * Canonical application command: regenerate a derivation (Phase 4).
 * HTTP POST and Assistente quick_regenerate adapt transport/billing keys only.
 */
import { resolveCtaSemantics } from "@/server/ai/creative-contract";
import type { CreativeContract } from "@/server/ai/creative-contract";
import type { CreativeHardFailure } from "@/server/ai/creative-quality-gate";
import {
  buildRegenerationCorrectionBrief,
  mergeUserRegenerationNotes,
} from "@/server/ai/regeneration-correction-brief";
import type { SpendResult } from "@/server/billing/paywall";
import type { OutputLearningApplicationSnapshot } from "@/server/human-quality/corpus";
import { sanitizeOutputLearningApplication } from "@/server/human-quality/application-schema";
import { regenerateDerivationSettlementAdapter } from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { recordCampaignMemoryEntry } from "@/server/memory/campaign-memory-context";
import { recordOutputDecisionEvidenceBestEffort } from "@/server/output-learning/output-decision-recorder";
import { extractRegenerationReason } from "@/server/output-learning/output-decision-reasons";
import { getCampaignById } from "@/server/repositories/campaign";
import { getDerivationById } from "@/server/repositories/derivation";
import { getLatestOpenFeedbackReportForDerivation } from "@/server/repositories/feedback";

export type RegenerateDerivationInput = {
  workspaceId: string;
  derivationId: string;
  feedback?: string;
  userId: string;
  locale?: string;
  billingIdempotencyKey: string;
  billingMetadata?: Record<string, unknown>;
  /** Assistant job linkage (optional). */
  assistantActionId?: string | null;
  outputLearningApplication?: unknown;
  actorUserId?: string | null;
  evidenceSource?: string;
};

export type RegenerateDerivationError =
  | { code: "derivation_not_found" }
  | { code: "credit_blocked"; spend: Extract<SpendResult, { ok: false }> }
  | { code: "dispatch_failed"; derivationId: string };

export type RegenerateDerivationSuccess = {
  derivation: NonNullable<Awaited<ReturnType<typeof getDerivationById>>>;
  sourceDerivation: NonNullable<Awaited<ReturnType<typeof getDerivationById>>>;
  primaryReason: string;
};

export type RegenerateDerivationResult =
  | { ok: true; value: RegenerateDerivationSuccess }
  | { ok: false; error: RegenerateDerivationError };

function parseHardFailures(value: unknown): CreativeHardFailure[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is CreativeHardFailure =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { code?: unknown }).code === "string" &&
      typeof (item as { message?: unknown }).message === "string"
  );
}

function parseScoreIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
}

function resolveContractFromDerivation(original: {
  creativeContract?: CreativeContract | null;
  ctaText?: string | null;
  format?: string | null;
  generationMode?: string | null;
  styleAssetId?: string | null;
}): CreativeContract {
  if (original.creativeContract) {
    return original.creativeContract;
  }

  const generationMode = (original.generationMode ??
    "art_variation") as CreativeContract["generationMode"];

  return {
    generationMode,
    targetFormat: original.format ?? "1:1",
    ctaSemantics: resolveCtaSemantics(original.ctaText, generationMode),
    baseAssetId: null,
    styleAssetId: original.styleAssetId ?? null,
    client: null,
    product: null,
    offer: null,
    constraints: null,
  };
}

async function resolveRegenerationBrief(
  original: {
    id: string;
    regenerationSuggestion?: string | null;
    hardFailures?: unknown;
    scoreIssues?: unknown;
    qaChecklist?: unknown;
    ctaText?: string | null;
    format?: string | null;
    generationMode?: string | null;
    styleAssetId?: string | null;
    creativeContract?: CreativeContract | null;
  },
  workspaceId: string,
  explicitFeedback?: string
): Promise<{
  promptFeedback: string | undefined;
  structured: ReturnType<typeof buildRegenerationCorrectionBrief>["structured"];
  primaryReason: string;
}> {
  const hardFailures = parseHardFailures(original.hardFailures);
  const scoreIssues = parseScoreIssues(original.scoreIssues);
  const contract = resolveContractFromDerivation(original);

  const feedbackReport = await getLatestOpenFeedbackReportForDerivation(
    workspaceId,
    original.id
  );

  const brief = buildRegenerationCorrectionBrief({
    contract,
    hardFailures,
    scoreIssues,
    qaChecklist: original.qaChecklist as Record<
      string,
      { status?: string; note?: string }
    > | null,
    feedbackCategory: feedbackReport?.category,
    modelSuggestion: original.regenerationSuggestion?.trim() || undefined,
    parentDerivationId: original.id,
  });

  const mergedFeedback = mergeUserRegenerationNotes(
    brief.promptFeedback,
    explicitFeedback
  );

  if (
    !mergedFeedback.trim() &&
    hardFailures.length === 0 &&
    scoreIssues.length === 0
  ) {
    return {
      promptFeedback: undefined,
      structured: brief.structured,
      primaryReason: brief.primaryReason,
    };
  }

  return {
    promptFeedback: mergedFeedback,
    structured: brief.structured,
    primaryReason: brief.primaryReason,
  };
}

export async function regenerateDerivation(
  input: RegenerateDerivationInput
): Promise<RegenerateDerivationResult> {
  const original = await getDerivationById(
    input.derivationId,
    input.workspaceId
  );
  if (!original) {
    return { ok: false, error: { code: "derivation_not_found" } };
  }

  const resolved = await resolveRegenerationBrief(
    original,
    input.workspaceId,
    input.feedback
  );
  const feedback = resolved.promptFeedback;

  const parentContract = original.creativeContract ?? null;
  const regenerationCorrectionBrief = feedback
    ? {
        ...resolved.structured,
        promptFeedback: feedback,
      }
    : undefined;

  let outputLearningApplication: OutputLearningApplicationSnapshot | null =
    (original.outputLearningApplication as OutputLearningApplicationSnapshot | null) ??
    null;
  if (
    input.outputLearningApplication &&
    typeof input.outputLearningApplication === "object"
  ) {
    outputLearningApplication = sanitizeOutputLearningApplication(
      input.outputLearningApplication as Record<string, unknown>
    );
  }

  const settled = await startGenerationSettlement(
    regenerateDerivationSettlementAdapter({
      workspaceId: input.workspaceId,
      userId: input.userId,
      billingKey: input.billingIdempotencyKey,
      billingMetadata: input.billingMetadata,
      locale: input.locale,
      assistantActionId: input.assistantActionId,
      source: original,
      createInput: {
        campaignId: original.campaignId,
        workspaceId: input.workspaceId,
        planId: original.planId ?? undefined,
        parentId: original.id,
        feedback,
        status: "queued",
        generationMode: original.generationMode ?? undefined,
        variantIndex: original.variantIndex ?? undefined,
        ctaText: original.ctaText ?? undefined,
        format: original.format ?? undefined,
        creativeContract: parentContract ?? undefined,
        regenerationCorrectionBrief,
        outputLearningApplication,
      },
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
        error: { code: "credit_blocked", spend },
      };
    }
    return {
      ok: false,
      error: {
        code: "dispatch_failed",
        derivationId: settled.error.value.derivation.id,
      },
    };
  }

  const newDerivation = settled.value.derivation;

  if (feedback?.trim()) {
    await recordCampaignMemoryEntry(original.campaignId, input.workspaceId, {
      type: "regeneration_feedback",
      text: feedback.trim().slice(0, 500),
      derivationId: original.id,
    });
  } else if (resolved.primaryReason.trim()) {
    await recordCampaignMemoryEntry(original.campaignId, input.workspaceId, {
      type: "regeneration_feedback",
      text: resolved.primaryReason.trim().slice(0, 500),
      derivationId: original.id,
    });
  }

  if (input.actorUserId && input.evidenceSource) {
    const campaign = await getCampaignById(
      original.campaignId,
      input.workspaceId
    );
    void recordOutputDecisionEvidenceBestEffort({
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
      clientProfileId: campaign?.clientProfileId ?? null,
      campaignId: original.campaignId,
      derivationId: original.id,
      parentDerivationId: original.id,
      action: "regenerated",
      source: input.evidenceSource,
      snapshotInput: original,
      snapshotExtras: {
        childDerivationId: newDerivation.id,
        reason: extractRegenerationReason({
          hardFailures: original.hardFailures,
          scoreIssues: original.scoreIssues,
          regenerationSuggestion: original.regenerationSuggestion,
          correctionPrimaryReason: resolved.primaryReason,
          userFeedback: input.feedback,
        }),
      },
    });
  }

  return {
    ok: true,
    value: {
      derivation: newDerivation,
      sourceDerivation: original,
      primaryReason: resolved.primaryReason,
    },
  };
}
