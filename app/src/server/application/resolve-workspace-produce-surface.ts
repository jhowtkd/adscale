/**
 * Phase 6 / item 49: produce-surface rules computed on the server.
 * Client must not import strategy-recipes / preview-gate for these decisions.
 */
import {
  getReadyPreviewDerivation,
  shouldAutoContinuePreview,
  shouldShowPreviewGate,
  type PreviewGateDerivation,
} from "@/server/ai/preview-gate";
import {
  getBatchCreditBreakdown,
  type BatchCreditBreakdown,
  type RecipeGenerationConfig,
} from "@/server/ai/strategy-recipes";

export type WorkspaceProduceSurfaceInput = {
  campaign: {
    generationMode?: string | null;
    creativeLevel?: string | null;
    ctaVariants?: string[] | null;
    targetFormats?: string[] | null;
  } | null;
  derivations: PreviewGateDerivation[];
};

export type WorkspaceProduceSurface = {
  batchCreditBreakdown: BatchCreditBreakdown | null;
  batchCreditEstimate: number;
  showPreviewGate: boolean;
  shouldAutoContinuePreview: boolean;
  activePreviewId: string | null;
};

function buildRecipeConfig(
  campaign: WorkspaceProduceSurfaceInput["campaign"]
): RecipeGenerationConfig | null {
  if (!campaign) return null;
  const generationMode =
    campaign.generationMode === "format_adaptation"
      ? "format_adaptation"
      : "art_variation";
  return {
    generationMode,
    creativeLevel:
      (campaign.creativeLevel as RecipeGenerationConfig["creativeLevel"]) ??
      "balanced",
    ctaVariants: (campaign.ctaVariants ?? [])
      .map((cta) => cta.trim())
      .filter(Boolean),
    targetFormats:
      generationMode === "format_adaptation"
        ? (campaign.targetFormats ?? [])
        : undefined,
    preservationEmphasis: "medium",
  };
}

export function resolveWorkspaceProduceSurface(
  input: WorkspaceProduceSurfaceInput
): WorkspaceProduceSurface {
  const config = buildRecipeConfig(input.campaign);
  const batchCreditBreakdown = config
    ? getBatchCreditBreakdown(config)
    : null;
  const active = getReadyPreviewDerivation(input.derivations);

  return {
    batchCreditBreakdown,
    batchCreditEstimate: batchCreditBreakdown?.totalCredits ?? 0,
    showPreviewGate: shouldShowPreviewGate(input.derivations),
    shouldAutoContinuePreview: shouldAutoContinuePreview(input.derivations),
    activePreviewId: active?.id ?? null,
  };
}
