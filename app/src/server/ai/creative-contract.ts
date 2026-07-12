import type { CanonicalCreative } from "./canonical-creative-contract";
import type { InputSourceClassification } from "./factual-visual-separation";
import type { CreativeLevel } from "../repositories/campaign";

/**
 * Fidelity band for creative generation. Aliases the persisted campaign
 * `CreativeLevel` vocabulary so old rows stay readable without migration.
 */
export type CreativeFidelityLevel = CreativeLevel;

const CREATIVE_FIDELITY_LEVELS: readonly CreativeFidelityLevel[] = [
  "conservative",
  "balanced",
  "bold",
  "extreme",
];

/**
 * Normalizes a persisted creative level to the fidelity vocabulary.
 * Unknown, null, or missing values resolve "balanced" so old rows stay
 * readable without migration.
 */
export function resolveCreativeFidelityLevel(
  value: string | null | undefined
): CreativeFidelityLevel {
  return (CREATIVE_FIDELITY_LEVELS as readonly string[]).includes(value ?? "")
    ? (value as CreativeFidelityLevel)
    : "balanced";
}

export type FidelityVerdict = "inside_range" | "outside_range";

export type GenerationMode = "art_variation" | "format_adaptation" | "restyling";

/**
 * Resolved generation policy attached to the persisted contract.
 * Objective facts stay fixed; CTA presence and copy expression are flexible;
 * layout numbers are advisory heuristics, never validity rules.
 */
export interface CanonicalCreativePolicy {
  generationMode: GenerationMode;
  fidelityLevel: CreativeFidelityLevel;
  cta: { presence: "optional"; wording: "preserve_action_intent" };
  copy: "facts_fixed_expression_flexible";
  heuristics: readonly [
    "three_zones",
    "free_space_20_percent",
    "safe_margin_8_percent",
    "thumbnail_25_percent",
  ];
}

/** Objective integrity codes — single source for gate, retry, and ranking. */
export const OBJECTIVE_INTEGRITY_FAILURE_CODES = [
  "wrong_brand",
  "unsupported_offer",
  "invented_factual_entity",
  "copied_style_reference_facts",
  "style_reference_contamination",
  "replaced_source_subject",
  "unauthorized_brand_or_ip",
  "cropped_critical_content",
  "invalid_format_layout",
] as const;

export type ObjectiveIntegrityFailureCode = (typeof OBJECTIVE_INTEGRITY_FAILURE_CODES)[number];

export const RETRYABLE_OBJECTIVE_FAILURE_CODES = new Set<ObjectiveIntegrityFailureCode>(
  OBJECTIVE_INTEGRITY_FAILURE_CODES
);

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

export type { CanonicalCreative, ContentTiers, InvariantIdentity } from "./canonical-creative-contract";

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
  canonicalCreative?: CanonicalCreative;
  inputSourceClassification?: InputSourceClassification;
  /** Requested fidelity band; absent on old rows, which resolve "balanced". */
  creativeLevel?: CreativeFidelityLevel;
  /** Resolved creative policy; absent on old rows, which resolve "balanced". */
  policy?: CanonicalCreativePolicy;
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
  clientProfileId?: string | null;
  brandReferenceIds?: string[];
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
