import { describe, it, expect } from "vitest";
import {
  buildGenerationDirectionSection,
  extractPromptGenerationDirectionSection,
  GENERATION_DIRECTION_HEADER,
} from "./generation-direction";
import { CENBRAP_VOICE_REVIEW_STATUS } from "../voices/voice-review-gate";
import { artVariationContractFixture } from "../prompt-builder.test-fixtures";

describe("buildGenerationDirectionSection", () => {
  const baseInput = {
    contract: artVariationContractFixture(),
    campaign: {
      name: "CENBRAP NR1",
      client: "CENBRAP",
      product: "NR1 compliance toolkit",
      offer: "Conformidade NR1",
      constraints: "Preserve LGPD badge",
    },
    generationMode: "art_variation" as const,
    creativeLevel: "balanced",
    targetFormat: "1:1",
  };

  it("includes stable art-direction header and sacred facts", () => {
    const section = buildGenerationDirectionSection(baseInput).join("\n");

    expect(section).toContain(GENERATION_DIRECTION_HEADER);
    expect(section).toContain("Dominant idea");
    expect(section).toContain("Sacred facts");
    expect(section).toContain("CTA contract: Comprar agora");
    expect(section).toContain("Client / brand: Acme Corp");
    expect(section).toContain("Offer: Auditoria gratuita");
    expect(section).toContain("Allowed variation");
    expect(section).toContain("Creative level: balanced");
  });

  it("includes global Olhar anti-patterns and export second-pass reminder", () => {
    const section = buildGenerationDirectionSection(baseInput).join("\n");

    expect(section).toMatch(/anti-patterns/i);
    expect(section).toMatch(/generic ai template/i);
    expect(section).toMatch(/Exportacao reminder/i);
    expect(section).toMatch(/second pass/i);
  });

  it("uses base reading gestalt when provided", () => {
    const section = buildGenerationDirectionSection({
      ...baseInput,
      baseReading: {
        dominantIdea: "Professor authority card",
        gestaltRead: "Vertical editorial stack with restrained proof",
        inviteWeight: "balanced",
        thumbnailRead: "Headline survives at 270px",
        brandPresence: "present",
        risks: ["Badge wall competes with hook"],
      },
    }).join("\n");

    expect(section).toContain("Professor authority card");
    expect(section).toContain("Vertical editorial stack");
    expect(section).toContain("Badge wall competes with hook");
  });

  it("does not inject Cenbrap client voice while review is pending", () => {
    expect(CENBRAP_VOICE_REVIEW_STATUS).toBe("pending_review");

    const section = buildGenerationDirectionSection({
      ...baseInput,
      campaign: {
        name: "CENBRAP NR1",
        client: "CENBRAP",
        product: "NR1",
        offer: "Conformidade NR1",
        constraints: null,
      },
      contract: artVariationContractFixture({
        client: "CENBRAP",
        product: "NR1",
        offer: "Conformidade NR1",
      }),
    }).join("\n");

    expect(section).not.toContain("CLIENT VOICE — Cenbrap");
    expect(section).not.toContain("anti-Cenbrap");
  });

  it("injects client voice only when explicitly allowed", () => {
    const section = buildGenerationDirectionSection({
      ...baseInput,
      campaign: {
        name: "CENBRAP NR1",
        client: "CENBRAP",
        product: "NR1",
        offer: "Conformidade NR1",
        constraints: null,
      },
      contract: artVariationContractFixture({
        client: "CENBRAP",
        product: "NR1",
        offer: "Conformidade NR1",
      }),
      allowClientVoice: true,
    }).join("\n");

    expect(section).toContain("CLIENT VOICE — Cenbrap");
    expect(section).toMatch(/institutional|editorial/i);
  });

  it("extractPromptGenerationDirectionSection returns block before MODE", () => {
    const prompt = [
      "prefix",
      buildGenerationDirectionSection(baseInput).join("\n"),
      "MODE: art_variation — test",
      "Campaign: test",
    ].join("\n");

    const extracted = extractPromptGenerationDirectionSection(prompt);
    expect(extracted).toContain(GENERATION_DIRECTION_HEADER);
    expect(extracted).not.toContain("MODE:");
  });
});
