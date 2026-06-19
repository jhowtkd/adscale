import { describe, it, expect } from "vitest";
import type { CreativeContract } from "@/server/ai/creative-contract";
import { buildCreativeQaPrompt } from "@/server/ai/creative-qa";
import {
  buildDerivationPrompt,
  extractPromptCanonicalContractSection,
  extractPromptHardRulesSection,
  extractPromptIntegritySection,
  extractPromptModeSection,
  extractPromptPerModeRulesSection,
  extractPromptRestylingFactualSourceSection,
} from "@/server/ai/prompt-builder";
import {
  extractPromptInputClassificationSection,
  extractPromptVisualReferenceTransferSection,
} from "@/server/ai/factual-visual-separation";
import { extractObservableRubricSection } from "@/server/ai/observable-rubric";
import {
  artVariationContractFixture,
  derivationConfigFromContract,
  formatAdaptationCampaignAssetContractFixture,
  restylingContractFixture,
} from "@/server/ai/prompt-builder.test-fixtures";

const MODES: Array<{
  name: string;
  contract: () => CreativeContract;
  extra?: (prompt: string) => void;
}> = [
  {
    name: "art_variation",
    contract: () => artVariationContractFixture(),
  },
  {
    name: "format_adaptation",
    contract: () => formatAdaptationCampaignAssetContractFixture(),
  },
  {
    name: "restyling",
    contract: () => restylingContractFixture(),
    extra: (prompt) => {
      expect(extractPromptRestylingFactualSourceSection(prompt)).toMatch(/factual|base/i);
      expect(extractPromptVisualReferenceTransferSection(prompt)).toContain(
        "VISUAL REFERENCE TRANSFER RULE"
      );
    },
  },
];

function qaInputFromContract(contract: CreativeContract) {
  return {
    locale: "pt-BR" as const,
    campaign: {
      name: "CENBRAP NR1",
      client: contract.client ?? "CENBRAP",
      product: contract.product ?? "NR1",
      offer: contract.offer ?? "Oferta",
      objective: "Conversions",
      audience: "Professionals",
    },
    derivation: {
      ctaText:
        contract.ctaSemantics.kind === "explicit" ? contract.ctaSemantics.text : null,
      format: contract.targetFormat,
      generationMode: contract.generationMode,
    },
    contract,
  };
}

describe.each(MODES)("TEST-01 prompt contract — $name", ({ contract, extra }) => {
  it("injects dominant idea, reading-path gestalt budget, secondary CTA, anti-hallucination, simplification", () => {
    const resolved = contract();
    const prompt = buildDerivationPrompt(derivationConfigFromContract(resolved));

    const integrity = extractPromptIntegritySection(prompt);
    const canonical = extractPromptCanonicalContractSection(prompt);
    const hardRules = extractPromptHardRulesSection(prompt);
    const perMode = extractPromptPerModeRulesSection(prompt);
    const classification = extractPromptInputClassificationSection(prompt);

    expect(integrity).toContain("VISUAL HIERARCHY CONTRACT");
    expect(integrity).toContain("ANTI-HALLUCINATION RULES");
    expect(canonical).toContain("RULE PRECEDENCE");
    const modeSection = extractPromptModeSection(prompt);

    expect(canonical).toMatch(/Dominant idea:/i);

    if (resolved.generationMode === "art_variation") {
      expect(perMode).toMatch(/reading-path anchors|READING PATH AND GESTALT BUDGET/i);
    } else if (resolved.generationMode === "format_adaptation") {
      expect(modeSection).toMatch(/three information zones/i);
    } else {
      expect(prompt).toMatch(/three information zones|max three|reading-path/i);
    }

    if (resolved.ctaSemantics.kind === "explicit") {
      expect(hardRules).toMatch(/CTA Recommendations are secondary|secondary context only/i);
    } else {
      expect(prompt).toMatch(
        /CTA Recommendations are secondary|plan-recommended CTAs|secondary context only|use those from the base image only/i
      );
    }
    expect(integrity).toMatch(/do not invent|ANTI-HALLUCINATION/i);
    expect(classification).toMatch(/INPUT SOURCE CLASSIFICATION/i);

    expect(prompt).toMatch(
      /condensable|decorative modules may|may merge, shrink, or omit|Condensable modules|CONTENT TIERS/i
    );

    extra?.(prompt);
  });

  it("QA prompt includes integrity, canonical, observable rubric parity (TEST-01)", () => {
    const resolved = contract();
    const qaPrompt = buildCreativeQaPrompt(qaInputFromContract(resolved));
    const derivationPrompt = buildDerivationPrompt(derivationConfigFromContract(resolved));

    expect(qaPrompt).toMatch(/OBSERVABLE DEFECT NOTES/i);
    expect(qaPrompt).toMatch(/Dominant idea reference|do not invent/i);
    expect(qaPrompt).toMatch(/allowed entity registry|invented_factual_entity/i);

    const qaRubric = extractObservableRubricSection(qaPrompt);
    expect(qaRubric).toMatch(/VISUAL OVERLOAD/i);
    expect(qaRubric).toMatch(/GENERIC TEMPLATE/i);
    expect(qaRubric).toMatch(/THUMBNAIL \/ PREVIEW SCALE/i);
    expect(qaRubric).toMatch(/three information zones|dominant focal/i);
    expect(qaPrompt).not.toMatch(/Export must remain allowed/i);

    if (resolved.generationMode === "restyling") {
      expect(qaPrompt).toMatch(/styleFidelity|style reference|base image/i);
    }

    const modeSection = extractPromptModeSection(derivationPrompt);
    if (resolved.generationMode === "format_adaptation") {
      expect(modeSection).toMatch(/same campaign|CAMPAIGN IDENTITY LOCK/i);
    }
  });
});

describe("TEST-01 forbidden entities — CENBRAP NR1", () => {
  it("derivation and QA prompts include ALLOWED ENTITIES for canonical campaign", () => {
    const contract = restylingContractFixture({
      client: "CENBRAP",
      product: "NR1",
    });
    const config = derivationConfigFromContract(contract, {
      campaign: {
        ...derivationConfigFromContract(contract).campaign!,
        name: "CENBRAP NR1",
        client: "CENBRAP",
      },
    });

    const prompt = buildDerivationPrompt(config);
    const qaPrompt = buildCreativeQaPrompt(qaInputFromContract(contract));

    expect(prompt).toContain("ALLOWED ENTITIES (do not invent beyond this list):");
    expect(prompt).not.toMatch(/Cantona|Manchester United/);
    expect(qaPrompt).toMatch(/allowed entity registry|invented_factual_entity/i);
    expect(qaPrompt).toMatch(/brands: CENBRAP/i);
  });
});
