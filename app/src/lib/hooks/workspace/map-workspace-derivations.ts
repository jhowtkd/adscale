import type { Derivation as UiDerivation, AdPlatform, CampaignStatus } from "@/lib/mock-data";

/** Raw derivation row from useDerivations (subset used by workspace mapping). */
export type WorkspaceDerivationSource = {
  id: string;
  campaignId: string;
  status: string;
  prompt?: string | null;
  cost?: number | null;
  imageUrl?: string | null;
  outputKey?: string | null;
  generationMode?: string | null;
  variantIndex?: number | null;
  format?: string | null;
  ctaText?: string | null;
  qualityScore?: number | null;
  scoreStatus?: string | null;
  scoreIssues?: unknown;
  regenerationSuggestion?: string | null;
  regenerationPrimaryReason?: string | null;
  regenerationIssueBreakdown?: unknown;
  qaStatus?: string | null;
  qaChecklist?: unknown;
  qaIssues?: unknown;
  qualityVerdict?: string | null;
  hardFailures?: unknown;
  polishSuggestions?: unknown;
  styleAssetId?: string | null;
  isPreview?: boolean;
  autoRetryAttempted?: boolean;
  autoRetryReason?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type CampaignModeHint = {
  generationMode?: string | null;
} | null;

/**
 * Pure map from API derivations → workspace UI cards.
 * Extracted from useCampaignWorkspace (Phase 6 / item 48).
 */
export function mapWorkspaceDerivations(
  items: WorkspaceDerivationSource[],
  campaign: CampaignModeHint,
  t: (key: string) => string
): UiDerivation[] {
  return items.map((d, i) => {
    const status: CampaignStatus =
      d.status === "queued" || d.status === "processing"
        ? "generating"
        : ((d.status as CampaignStatus) ?? "draft");
    const platform: AdPlatform = "Meta";
    type GenMode = "art_variation" | "format_adaptation" | "restyling";
    const generationMode: GenMode | undefined =
      (d.generationMode as GenMode | undefined) ??
      (campaign?.generationMode as GenMode | undefined);
    const variantIndex = d.variantIndex ?? i;
    const format = d.format ?? undefined;
    const ctaText = d.ctaText ?? undefined;
    const name =
      generationMode === "format_adaptation" && format
        ? `${t("format")} ${format}`
        : `${t("piece")} ${variantIndex + 1}`;

    return {
      id: d.id,
      campaignId: d.campaignId,
      name,
      status,
      platform,
      prompt: d.prompt ?? "",
      creditCost: d.cost ? d.cost / 100 : 2.4,
      imageUrl: d.imageUrl ?? undefined,
      outputKey: d.outputKey ?? undefined,
      generationMode,
      variantIndex,
      format,
      ctaText,
      qualityScore: d.qualityScore ?? undefined,
      scoreStatus: d.scoreStatus ?? undefined,
      scoreIssues: d.scoreIssues ?? undefined,
      regenerationSuggestion: d.regenerationSuggestion ?? undefined,
      regenerationPrimaryReason: d.regenerationPrimaryReason ?? undefined,
      regenerationIssueBreakdown: d.regenerationIssueBreakdown ?? undefined,
      qaStatus: d.qaStatus ?? undefined,
      qaChecklist: d.qaChecklist ?? undefined,
      qaIssues: d.qaIssues ?? undefined,
      qualityVerdict: d.qualityVerdict ?? undefined,
      hardFailures: d.hardFailures ?? undefined,
      polishSuggestions: d.polishSuggestions ?? undefined,
      styleAssetId: d.styleAssetId ?? undefined,
      isPreview: d.isPreview,
      autoRetryAttempted: d.autoRetryAttempted,
      autoRetryReason: d.autoRetryReason ?? undefined,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    } as UiDerivation;
  });
}
