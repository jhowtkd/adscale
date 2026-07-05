import { describe, it, expect } from "vitest";
import type { CreativeContract } from "@/server/ai/creative-contract";
import {
  buildDerivationPrompt,
  extractPromptHardRulesSection,
  extractPromptModeSection,
  extractPromptPerModeRulesSection,
} from "@/server/ai/prompt-builder";
import {
  artVariationContractFixture,
  derivationConfigFromContract,
  formatAdaptationCampaignAssetContractFixture,
  restylingContractFixture,
} from "@/server/ai/prompt-builder.test-fixtures";

const FORMATS = ["1:1", "4:5", "9:16"] as const;

type GenerationMode = CreativeContract["generationMode"];

function baseContract(mode: GenerationMode, format: string): CreativeContract {
  const shared = {
    targetFormat: format,
    ctaSemantics: { kind: "explicit" as const, text: "Inscreva-se agora" },
    client: "CENBRAP",
    product: "NR1",
    offer: "Curso online",
    constraints: "Preserve compliance badge",
  };

  if (mode === "restyling") {
    return restylingContractFixture(shared);
  }

  if (mode === "format_adaptation") {
    return formatAdaptationCampaignAssetContractFixture(shared);
  }

  return artVariationContractFixture(shared);
}

const MODE_FORMAT_MATRIX: Array<{ mode: GenerationMode; format: (typeof FORMATS)[number] }> =
  (["art_variation", "restyling", "format_adaptation"] as const).flatMap((mode) =>
    FORMATS.map((format) => ({ mode, format }))
  );

describe.each(MODE_FORMAT_MATRIX)(
  "TEST-03 mode × format — $mode @ $format",
  ({ mode, format }) => {
    it("builds prompt with correct mode section, target format, and shared campaign identity", async () => {
      const contract = baseContract(mode, format);
      const prompt = await buildDerivationPrompt(derivationConfigFromContract(contract));
      const hardRules = extractPromptHardRulesSection(prompt);
      const modeSection = extractPromptModeSection(prompt);
      const perMode = extractPromptPerModeRulesSection(prompt);

      expect(hardRules).toContain(`Target format: ${format}`);
      expect(modeSection).toContain(`MODE: ${mode}`);
      expect(prompt).toMatch(/Dominant idea:/i);

      if (mode === "art_variation") {
        expect(perMode).toMatch(/DECORATIVE-ONLY|decorative-only/i);
        expect(perMode).toMatch(/READING PATH AND GESTALT BUDGET|reading-path anchors/i);
      }

      if (mode === "format_adaptation") {
        expect(modeSection).toMatch(/CAMPAIGN IDENTITY LOCK|same campaign/i);
        expect(modeSection).toMatch(/CROSS-FORMAT IDENTITY|1:1, 4:5, and 9:16/i);
        expect(modeSection).toContain("PRESERVE FACTS, FLEX EXPRESSION");
      }

      if (mode === "restyling") {
        expect(perMode).toMatch(/FACTUAL ENTITY LOCK|entity lock/i);
        expect(prompt).not.toContain("Extracted Visual Token Brief");
      }
    });
  }
);

describe("TEST-03 cross-format identity consistency", () => {
  it("format_adaptation prompts for 1:1, 4:5, 9:16 share dominant idea and CTA", async () => {
    const prompts = await Promise.all(
      FORMATS.map((format) =>
        buildDerivationPrompt(
          derivationConfigFromContract(baseContract("format_adaptation", format))
        )
      )
    );

    for (const prompt of prompts) {
      expect(prompt).toContain("Inscreva-se agora");
      expect(prompt).toMatch(/Dominant idea:/i);
      expect(extractPromptModeSection(prompt)).toMatch(/same campaign/i);
    }
  });
});
