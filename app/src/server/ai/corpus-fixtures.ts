import type { CreativeContract } from "./creative-contract";
import type { CreativeHardFailureCode } from "./creative-quality-gate";
import type { CanonicalCampaignSlug, CorpusRenderTier } from "./creative-corpus";
import type { QualityVerdict } from "./quality-fixtures";

export type CorpusArchetype =
  | "invented_factual_entity"
  | "visual_overload"
  | "generic_template_aesthetic"
  | "format_campaign_drift"
  | "restyling_factual_contamination";

/** Target codes for post-v12.3 gate — includes Phase 120 forward references. */
export type CorpusTargetHardFailureCode =
  | CreativeHardFailureCode
  | "invented_factual_entity"
  | "visual_overload"
  | "generic_template_aesthetic"
  | "format_campaign_drift"
  | "restyling_factual_contamination";

export interface CorpusArchetypeFixture {
  id: string;
  archetype: CorpusArchetype;
  label: string;
  corpusRefIds: string[];
  canonicalSlug: CanonicalCampaignSlug;
  renderTier: CorpusRenderTier;
  contract: CreativeContract;
  rawQaModelOutput: unknown;
  expectedHardFailureCodes: CorpusTargetHardFailureCode[];
  expectedVerdict: QualityVerdict;
  baselineVerdict: QualityVerdict;
}

export const CORPUS_ARCHETYPE_FIXTURES: CorpusArchetypeFixture[] = [];
