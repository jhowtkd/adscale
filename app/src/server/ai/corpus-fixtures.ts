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
  | "restyling_factual_contamination"
  | "weak_hierarchy"
  | "illegible_cta"
  | "unfocused_composition";

/** Target codes for post-v12.3 gate — canonical GATE-01 codes plus legacy aliases. */
export type CorpusTargetHardFailureCode =
  | CreativeHardFailureCode
  | "invented_factual_entity"
  | "visual_overload"
  | "generic_template_aesthetic"
  | "campaign_identity_drift"
  | "style_reference_contamination"
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
    baselineVerdict: "invalid",
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
    baselineVerdict: "invalid",
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
    baselineVerdict: "invalid",
  },
  {
    id: "corpus-format-campaign-drift",
    archetype: "format_campaign_drift",
    label: "Format adaptation drifts to unrelated campaign narrative",
    corpusRefIds: ["538246da", "27069645", "a753e357"],
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
    expectedHardFailureCodes: ["campaign_identity_drift"],
    expectedVerdict: "invalid",
    baselineVerdict: "invalid",
  },
  {
    id: "corpus-restyling-factual-contamination",
    archetype: "restyling_factual_contamination",
    label: "Style reference imported people and uniforms into output",
    corpusRefIds: ["d7d9d323", "a5f65b85", "f420bcb2"],
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
    expectedHardFailureCodes: ["style_reference_contamination"],
    expectedVerdict: "invalid",
    baselineVerdict: "invalid",
  },
  {
    id: "corpus-weak-hierarchy",
    archetype: "weak_hierarchy",
    label: "Equal-weight modules with no dominant NR1 visual idea",
    corpusRefIds: ["18cec5e9", "307b2a41"],
    canonicalSlug: "teste-campanha-nr1",
    renderTier: "preview",
    contract: masterNr1ArtVariationContract({ targetFormat: "1:1" }),
    rawQaModelOutput: qaModelOutput({
      creativeRisk: {
        status: "failed",
        note:
          "No campaign-specific visual idea — hook, badge row, and icon strip all compete without a single dominant focal point for the NR1 audit story.",
      },
    }),
    expectedHardFailureCodes: ["missing_dominant_idea"],
    expectedVerdict: "invalid",
    baselineVerdict: "invalid",
  },
  {
    id: "corpus-illegible-cta",
    archetype: "illegible_cta",
    label: "CTA pill illegible at thumbnail preview scale",
    corpusRefIds: ["11cba06e", "a44fcb50"],
    canonicalSlug: "nova-campanha",
    renderTier: "final",
    contract: artVariationContractFixture({
      client: "Instituto Educação+",
      product: "Curso de capacitação docente",
      offer: "Matrículas abertas",
      constraints: "CTA must remain readable at mobile thumbnail scale",
      targetFormat: "1:1",
    }),
    rawQaModelOutput: qaModelOutput({
      legibility: {
        status: "failed",
        note:
          "CTA pill text is illegible at thumbnail scale — low contrast neon on gradient, too small to read.",
      },
      ctaOffer: {
        status: "failed",
        note: "Primary CTA not visible at preview scale; hook merges into background chrome.",
      },
    }),
    expectedHardFailureCodes: ["unreadable_required_text"],
    expectedVerdict: "invalid",
    baselineVerdict: "invalid",
  },
  {
    id: "corpus-unfocused-composition",
    archetype: "unfocused_composition",
    label: "Decorative-only background recolor without composition change",
    corpusRefIds: ["5ded45de", "ceee6a3d"],
    canonicalSlug: "teste-campanha-nr1",
    renderTier: "preview",
    contract: masterNr1ArtVariationContract({ targetFormat: "1:1" }),
    rawQaModelOutput: qaModelOutput({
      creativeRisk: {
        status: "failed",
        note:
          "Decorative-only variation: background-only glow recolor without a new visual mechanism or layout idea.",
      },
    }),
    expectedHardFailureCodes: ["decorative_only_variation"],
    expectedVerdict: "invalid",
    baselineVerdict: "invalid",
  },
];

export const CORPUS_POSITIVE_FIXTURES: CorpusArchetypeFixture[] = [
  {
    id: "corpus-faithful-format-adaptation",
    archetype: "format_campaign_drift",
    label: "Faithful NR1 4:5 adaptation (c2c12774)",
    corpusRefIds: ["c2c12774"],
    canonicalSlug: "teste-3-nr1",
    renderTier: "final",
    contract: nr1FormatAdaptationContract({ targetFormat: "4:5" }),
    rawQaModelOutput: qaModelOutput({
      briefMatch: {
        status: "passed",
        note: "CENBRAP NR1 checklist narrative preserved.",
      },
      formatFit: {
        status: "passed",
        note: "Faithful NR1 format adaptation in native 4:5 layout.",
      },
      creativeRisk: {
        status: "warning",
        note: "badge row could be simplified; hook and CTA remain dominant",
      },
    }),
    expectedHardFailureCodes: [],
    expectedVerdict: "improvable",
    baselineVerdict: "improvable",
  },
];
