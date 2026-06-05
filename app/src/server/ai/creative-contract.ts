export type CtaSemantics =
  | { kind: "explicit"; text: string }
  | { kind: "inherited" }
  | { kind: "absent" };

export type SourcePackage = "campaign_asset" | "approved_derivation";

export type CampaignAssetSourceDescriptor = {
  kind: "campaign_asset";
  assetId: string;
  assetKey: string;
  assetType?: string | null;
};

export type ApprovedDerivationSourceDescriptor = {
  kind: "approved_derivation";
  derivationId: string;
  outputKey: string;
};

export type SourceDescriptor =
  | CampaignAssetSourceDescriptor
  | ApprovedDerivationSourceDescriptor;

export type FactualSourceRules = {
  /** Visual and copy facts come from the campaign asset. */
  campaignAsset: "visual_and_copy_from_campaign_asset";
  /** Visual facts come from the approved parent derivation output. */
  approvedDerivation: "visual_from_parent_output";
  /** Restyling: base asset is factual; style asset is visual language only. */
  restyling: {
    factual: "base_asset";
    styleOnly: "style_asset";
  };
};

export const FACTUAL_SOURCE_RULES: FactualSourceRules = {
  campaignAsset: "visual_and_copy_from_campaign_asset",
  approvedDerivation: "visual_from_parent_output",
  restyling: {
    factual: "base_asset",
    styleOnly: "style_asset",
  },
};

export type ImageOperation = "edit" | "generation_fallback" | "generate";

export type GenerationMode = "art_variation" | "format_adaptation" | "restyling";

export interface CreativeContract {
  generationMode: GenerationMode;
  targetFormat: string;
  ctaSemantics: CtaSemantics;
  baseAssetId: string | null;
  styleAssetId: string | null;
  client: string | null;
  product: string | null;
  offer: string | null;
  constraints: string | null;
  sourcePackage?: SourcePackage;
  factualSourceRules?: FactualSourceRules;
}

export type PromptProvenance = {
  schemaVersion: 1;
  inputPrompt: string;
  revisedPrompt?: string | null;
  model: string;
  requestedSize: string;
  outputKey?: string | null;
  sourcePackage: SourcePackage;
  source: SourceDescriptor | null;
  imageOperation?: ImageOperation | null;
  generationMode: GenerationMode;
  targetFormat: string;
};

/**
 * Resolves CTA text to a CtaSemantics discriminated union.
 * - Non-empty string → explicit with that text
 * - null, undefined, or empty string → inherited (base CTA preserved; absent not surfaced in v11.1)
 */
export function resolveCtaSemantics(
  ctaText: string | null | undefined,
  _mode: CreativeContract["generationMode"]
): CtaSemantics {
  if (ctaText && ctaText.trim().length > 0) {
    return { kind: "explicit", text: ctaText };
  }
  return { kind: "inherited" };
}
