import type { CreativeContract } from "./creative-contract";
import type { CreativeHardFailureCode } from "./creative-quality-gate";
import type { CanonicalCampaignSlug, CorpusRenderTier } from "./creative-corpus";
import type { QualityVerdict } from "./quality-fixtures";
import {
  artVariationContractFixture,
  formatAdaptationCampaignAssetContractFixture,
  restylingContractFixture,
} from "./prompt-builder.test-fixtures";

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

const passed = { status: "passed" as const, note: "OK." };

function qaModelOutput(
  failed: Partial<
    Record<
      string,
      {
        status: "passed" | "warning" | "failed";
        note: string;
      }
    >
  >
) {
  return {
    status: "failed" as const,
    checklist: {
      legibility: failed.legibility ?? passed,
      ctaOffer: failed.ctaOffer ?? passed,
      informationPreservation: failed.informationPreservation ?? passed,
      briefMatch: failed.briefMatch ?? passed,
      formatFit: failed.formatFit ?? passed,
      creativeRisk: failed.creativeRisk ?? passed,
      ...("styleFidelity" in failed ? { styleFidelity: failed.styleFidelity } : {}),
    },
    issues: ["Synthetic corpus fixture — mirrors June 2026 audit observation."],
    suggestions: ["Regenerate with canonical contract preservation."],
  };
}

function nr1ArtVariationContract(
  overrides: Partial<CreativeContract> = {}
): CreativeContract {
  return artVariationContractFixture({
    client: "CENBRAP",
    product: "NR1 compliance toolkit",
    offer: "Conformidade NR1",
    constraints: "Preserve checklist card hierarchy; no athlete imagery",
    ...overrides,
  });
}

function nr1FormatAdaptationContract(
  overrides: Partial<CreativeContract> = {}
): CreativeContract {
  return formatAdaptationCampaignAssetContractFixture({
    client: "CENBRAP",
    product: "NR1 compliance toolkit",
    offer: "Conformidade NR1",
    constraints: "Preserve NR1 checklist narrative; no sports celebrity imports",
    ...overrides,
  });
}

function masterNr1ArtVariationContract(
  overrides: Partial<CreativeContract> = {}
): CreativeContract {
  return artVariationContractFixture({
    client: "Master NR1",
    product: "NR1 audit cards",
    offer: "Auditoria NR1",
    constraints: "Limit to three information zones; no module grid overload",
    ...overrides,
  });
}

function educationRestylingContract(
  overrides: Partial<CreativeContract> = {}
): CreativeContract {
  return restylingContractFixture({
    client: "Instituto Educação+",
    product: "Curso de capacitação docente",
    offer: "Matrículas abertas",
    constraints: "Style-only transfer; no people or uniforms from reference",
    ...overrides,
  });
}

export const CORPUS_ARCHETYPE_FIXTURES: CorpusArchetypeFixture[] = [
  {
    id: "corpus-invented-factual-entity",
    archetype: "invented_factual_entity",
    label: "Invented athlete and club not in allowedEntities",
    corpusRefIds: ["27069645", "a753e357", "20c0cc8c"],
    canonicalSlug: "teste-3-nr1",
    renderTier: "final",
    contract: nr1FormatAdaptationContract({ targetFormat: "9:16" }),
    rawQaModelOutput: qaModelOutput({
      briefMatch: {
        status: "failed",
        note:
          "Output depicts Eric Cantona in Manchester United kit — neither person nor club appear in allowedEntities for CENBRAP NR1.",
      },
      creativeRisk: {
        status: "failed",
        note: "Hallucinated celebrity athlete imported into NR1 compliance creative.",
      },
    }),
    expectedHardFailureCodes: ["invented_factual_entity"],
    expectedVerdict: "invalid",
    baselineVerdict: "acceptable",
  },
  {
    id: "corpus-visual-overload",
    archetype: "visual_overload",
    label: "Dense module grid with more than three competing zones",
    corpusRefIds: ["8a2bebf9", "c32bf93c"],
    canonicalSlug: "teste-campanha-nr1",
    renderTier: "preview",
    contract: masterNr1ArtVariationContract({ targetFormat: "1:1" }),
    rawQaModelOutput: qaModelOutput({
      creativeRisk: {
        status: "failed",
        note:
          "More than three competing information zones; NR1 card grid dominates frame and crowds headline, CTA, and badge.",
      },
    }),
    expectedHardFailureCodes: ["visual_overload"],
    expectedVerdict: "invalid",
    baselineVerdict: "acceptable",
  },
  {
    id: "corpus-generic-template-aesthetic",
    archetype: "generic_template_aesthetic",
    label: "Premium tech neon template with no campaign-specific idea",
    corpusRefIds: ["3dffb311", "47541eb5"],
    canonicalSlug: "teste-campanha-nr1",
    renderTier: "preview",
    contract: masterNr1ArtVariationContract({ targetFormat: "1:1" }),
    rawQaModelOutput: qaModelOutput({
      creativeRisk: {
        status: "failed",
        note:
          "Generic premium-tech neon template aesthetic; no NR1 audit-specific visual idea or module semantics.",
      },
    }),
    expectedHardFailureCodes: ["generic_template_aesthetic"],
    expectedVerdict: "invalid",
    baselineVerdict: "acceptable",
  },
  {
    id: "corpus-format-campaign-drift",
    archetype: "format_campaign_drift",
    label: "Format adaptation drifts to unrelated campaign narrative",
    corpusRefIds: ["538246da", "27069645"],
    canonicalSlug: "teste-3-nr1",
    renderTier: "final",
    contract: nr1FormatAdaptationContract({ targetFormat: "1.91:1" }),
    rawQaModelOutput: qaModelOutput({
      briefMatch: {
        status: "failed",
        note:
          "Adapted creative shows education/professor enrollment narrative instead of CENBRAP NR1 checklist story.",
      },
      formatFit: {
        status: "failed",
        note: "Layout reads as a different campaign identity, not a faithful NR1 format adaptation.",
      },
    }),
    expectedHardFailureCodes: ["format_campaign_drift", "wrong_brand"],
    expectedVerdict: "invalid",
    baselineVerdict: "invalid",
  },
  {
    id: "corpus-restyling-factual-contamination",
    archetype: "restyling_factual_contamination",
    label: "Style reference imported people and uniforms into output",
    corpusRefIds: ["d7d9d323", "a5f65b85"],
    canonicalSlug: "nova-campanha",
    renderTier: "final",
    contract: educationRestylingContract(),
    rawQaModelOutput: qaModelOutput({
      styleFidelity: {
        status: "failed",
        note:
          "Reference image imported athlete portraits and team uniforms; factual entities from style reference leaked into base education creative.",
      },
    }),
    expectedHardFailureCodes: [
      "restyling_factual_contamination",
      "copied_style_reference_facts",
    ],
    expectedVerdict: "invalid",
    baselineVerdict: "invalid",
  },
];
