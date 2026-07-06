import type { CreativeContract } from "./creative-contract";
import type { CreativeHardFailureCode } from "./creative-quality-gate";
import {
  artVariationContractFixture,
  formatAdaptationCampaignAssetContractFixture,
  restylingContractFixture,
} from "./prompt-builder.test-fixtures";

export type QualityFailureMode =
  | "wrong_cta"
  | "cropped_text_logo"
  | "style_reference_contamination"
  | "poor_format_adaptation"
  | "weak_preservation"
  | "low_legibility";

export type QualityVerdict = "acceptable" | "improvable" | "invalid";

export interface QualityFixture {
  id: string;
  failureMode: QualityFailureMode;
  label: string;
  contract: CreativeContract;
  rawQaModelOutput: unknown;
  rawScoreModelOutput?: unknown;
  expectedHardFailureCodes: CreativeHardFailureCode[];
  expectedVerdict: QualityVerdict;
  expectedRegenerationSnippets?: string[];
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
    issues: ["Synthetic fixture — model flagged quality problems."],
    suggestions: ["Regenerate with contract preservation."],
  };
}

export const QUALITY_FIXTURES: QualityFixture[] = [
  {
    id: "fixture-wrong-cta",
    failureMode: "wrong_cta",
    label: "Explicit CTA drift (Comprar agora replaced)",
    contract: artVariationContractFixture({
      ctaSemantics: { kind: "explicit", text: "Comprar agora" },
      targetFormat: "1:1",
    }),
    rawQaModelOutput: qaModelOutput({
      ctaOffer: {
        status: "failed",
        note: "CTA was replaced with a different call to action instead of the contract text.",
      },
    }),
    expectedHardFailureCodes: [],
    expectedVerdict: "improvable",
    expectedRegenerationSnippets: [
      "Comprar agora",
      "1:1",
      "art_variation",
    ],
  },
  {
    id: "fixture-cropped-text-logo",
    failureMode: "cropped_text_logo",
    label: "Logo and CTA zone cropped out of frame",
    contract: artVariationContractFixture({ targetFormat: "1:1" }),
    rawQaModelOutput: qaModelOutput({
      informationPreservation: {
        status: "failed",
        note: "Logo and CTA zone were cropped out of frame.",
      },
    }),
    expectedHardFailureCodes: ["cropped_critical_content"],
    expectedVerdict: "invalid",
    expectedRegenerationSnippets: [
      "cropped_critical_content",
      "Preserve the exact CTA",
      "1:1",
      "art_variation",
    ],
  },
  {
    id: "fixture-style-reference-contamination",
    failureMode: "style_reference_contamination",
    label: "Style reference facts copied into output",
    contract: restylingContractFixture(),
    rawQaModelOutput: qaModelOutput({
      styleFidelity: {
        status: "failed",
        note: "Unrelated discount copied from style reference, not base image.",
      },
    }),
    expectedHardFailureCodes: ["style_reference_contamination"],
    expectedVerdict: "invalid",
    expectedRegenerationSnippets: [
      "style_reference_contamination",
      "restyling",
      "1:1",
    ],
  },
  {
    id: "fixture-poor-format-adaptation",
    failureMode: "poor_format_adaptation",
    label: "Blur bands instead of native 9:16 layout",
    contract: formatAdaptationCampaignAssetContractFixture({ targetFormat: "9:16" }),
    rawQaModelOutput: qaModelOutput({
      formatFit: {
        status: "failed",
        note: "Blur bands and pasted poster layout, not native 9:16.",
      },
    }),
    expectedHardFailureCodes: ["invalid_format_layout"],
    expectedVerdict: "invalid",
    expectedRegenerationSnippets: [
      "invalid_format_layout",
      "9:16",
      "format_adaptation",
    ],
  },
  {
    id: "fixture-weak-preservation",
    failureMode: "weak_preservation",
    label: "Product and offer lost from creative",
    contract: artVariationContractFixture({ targetFormat: "1:1" }),
    rawQaModelOutput: qaModelOutput({
      briefMatch: {
        status: "failed",
        note: "Unsupported offer: Widget Pro product and Auditoria gratuita offer were lost from output.",
      },
    }),
    rawScoreModelOutput: {
      qualityScore: 62,
      scoreBreakdown: {
        textLegibility: 80,
        ctaClarity: 75,
        informationPreservation: 40,
        briefMatch: 35,
        formatFit: 70,
        visualQuality: 65,
      },
      scoreIssues: ["brand mismatch: Acme Corp product Widget Pro not visible"],
      regenerationSuggestion: "",
    },
    expectedHardFailureCodes: ["unsupported_offer", "wrong_brand"],
    expectedVerdict: "invalid",
    expectedRegenerationSnippets: [
      "unsupported_offer",
      "wrong_brand",
      "Widget Pro",
      "Auditoria gratuita",
      "art_variation",
    ],
  },
  {
    id: "fixture-low-legibility",
    failureMode: "low_legibility",
    label: "Required headline and CTA illegible",
    contract: artVariationContractFixture({ targetFormat: "1:1" }),
    rawQaModelOutput: qaModelOutput({
      legibility: {
        status: "failed",
        note: "Required headline and CTA text are illegible due to low contrast.",
      },
    }),
    expectedHardFailureCodes: [],
    expectedVerdict: "improvable",
    expectedRegenerationSnippets: [
      "Comprar agora",
      "art_variation",
    ],
  },
];
