import { describe, it, expect } from "vitest";
import {
  buildDerivationPrompt,
  extractPromptHardRulesSection,
  extractPromptModeSection,
  extractPromptPerModeRulesSection,
  type DerivationPromptConfig,
} from "@/server/ai/prompt-builder";
import {
  artVariationContractFixture,
  derivationConfigFromContract,
  formatAdaptationApprovedDerivationContractFixture,
  restylingContractFixture,
} from "@/server/ai/prompt-builder.test-fixtures";

describe("buildDerivationPrompt creativity level", () => {
  it("art_variation + conservative contains CREATIVITY LEVEL: conservative", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "conservative",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: conservative");
  });

  it("art_variation + conservative emits restraint-oriented operational rules", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "conservative",
    });

    expect(prompt).toContain("OPERATIONAL RULES FOR CONSERVATIVE");
    expect(prompt).toContain("minimal structural change");
    expect(prompt).toContain("same visual universe");
    expect(prompt).toContain("Do not introduce new scenes");
  });

  it("art_variation + balanced contains CREATIVITY LEVEL: balanced", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "balanced",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: balanced");
  });

  it("art_variation + balanced emits sibling-campaign operational rules", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "balanced",
    });

    expect(prompt).toContain("OPERATIONAL RULES FOR BALANCED");
    expect(prompt).toContain("noticeably new composition");
    expect(prompt).toContain("sibling creative from the same campaign");
    expect(prompt).toContain("keeping brand identity recognizable");
  });

  it("art_variation + bold contains CREATIVITY LEVEL: bold", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "bold",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: bold");
  });

  it("art_variation + bold emits high-change-but-on-brand operational rules", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "bold",
    });

    expect(prompt).toContain("OPERATIONAL RULES FOR BOLD");
    expect(prompt).toContain("Change the background structure completely");
    expect(prompt).toContain("Preserve core brand assets");
    expect(prompt).toContain("Do not invent a new brand");
  });

  it("format_adaptation + any creativeLevel does NOT contain CREATIVITY LEVEL", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      creativeLevel: "bold",
    });
    expect(prompt).not.toContain("CREATIVITY LEVEL");
  });

  it("art_variation without creativeLevel defaults to balanced", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: balanced");
  });

  it("art_variation includes approved creative diagnosis when provided", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      creativeDiagnosis: {
        detectedConcept: "Premium skincare promotion.",
        elementsToPreserve: ["product", "logo"],
        variationOpportunities: ["stronger contrast"],
      },
    });
    expect(prompt).toContain("APPROVED CREATIVE DIAGNOSIS");
    expect(prompt).toContain("Premium skincare promotion.");
    expect(prompt).toContain("product; logo");
    expect(prompt).toContain("stronger contrast");
  });

  it("format_adaptation does not include creative diagnosis", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      creativeDiagnosis: {
        detectedConcept: "Test",
        elementsToPreserve: ["a"],
        variationOpportunities: ["b"],
      },
    });
    expect(prompt).not.toContain("APPROVED CREATIVE DIAGNOSIS");
  });
});

describe("buildDerivationPrompt CTA contract", () => {
  it("emits a critical literal CTA rule when ctaText exists", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      ctaText: "Comprar agora",
    });

    expect(prompt).toContain("CRITICAL LITERAL CTA RULE");
    expect(prompt).toContain("Comprar agora");
    expect(prompt).toContain("Do not use synonyms");
    expect(prompt).toContain("Do not translate");
    expect(prompt).toContain("Do not rewrite");
    expect(prompt).toContain("Do not replace");
  });

  it("keeps plan CTA recommendations secondary when literal ctaText exists", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      ctaText: "Comprar agora",
      plan: {
        id: "plan-1",
        strategy: "Use urgency.",
        angles: [],
        hooks: [],
        ctas: ["Garanta sua vaga", "Saiba mais"],
      },
    });

    expect(prompt).toContain("Applied CTA text for this piece: Comprar agora");
    expect(prompt).toContain("CTA Recommendations are secondary context only");
    expect(prompt).toContain("must not override the literal CTA text");
  });
});

describe("buildDerivationPrompt format_adaptation layout contract", () => {
  it("names all source ad modules that must be preserved as separate entities", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
    });

    // The prompt must identify the source modules explicitly so the model
    // treats each one as an independent element to reposition.
    expect(prompt).toContain("headline");
    expect(prompt).toContain("photo/subject");
    expect(prompt).toContain("offer or proof");
    expect(prompt).toContain("CTA");
    expect(prompt).toContain("logo");
    expect(prompt).toContain("badges");
    expect(prompt).toContain("legal copy");
    expect(prompt).toContain("decorative background");
  });

  it("explicitly forbids letterboxing and blank bands", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
    });

    expect(prompt).toContain("letterboxing");
    expect(prompt).toContain("No blank bands");
  });

  it("explicitly forbids a pasted poster over a background", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
    });

    expect(prompt).toContain("no poster pasted over a background");
  });

  it("explicitly forbids stretched edge filler", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "4:5",
    });

    expect(prompt).toContain("no stretched edge filler");
  });

  it("restricts decorative background to bleed at edges; all other modules stay inside safe area", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
    });

    expect(prompt).toContain("only decorative background may bleed to the edges");
  });

  it("requires explicit verbatim copy preservation for factual content", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "4:5",
    });

    expect(prompt).toContain("PRESERVE COPY AND FACTS VERBATIM");
    expect(prompt).toContain("VISUAL PROMINENCE");
  });

  it("includes 9:16 three-zone vertical layout guidance", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
    });

    expect(prompt).toContain("upper zone");
    expect(prompt).toContain("middle zone");
    expect(prompt).toContain("lower zone");
  });

  it("includes 4:5 portrait-feed separated-modules layout guidance", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "4:5",
    });

    expect(prompt).toContain("portrait-feed layout");
    expect(prompt).toContain("CTA/logo their own clean area");
  });

  it("does not apply format_adaptation layout guidance to 1:1 as a vertical-format rule", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "1:1",
    });

    // Square format should not carry 9:16 or 4:5 specific zone instructions
    expect(prompt).not.toContain("upper zone for headline");
    expect(prompt).not.toContain("portrait-feed layout");
  });
});

describe("buildDerivationPrompt contract fixtures", () => {
  it("builds comparable configs from persisted CreativeContract shapes", async () => {
    const art = derivationConfigFromContract(artVariationContractFixture());
    const formatApproved = derivationConfigFromContract(
      formatAdaptationApprovedDerivationContractFixture()
    );
    const restyle = derivationConfigFromContract(restylingContractFixture());

    expect(art.contract?.sourcePackage).toBe("campaign_asset");
    expect(formatApproved.contract?.baseAssetId).toBeNull();
    expect(formatApproved.contract?.sourcePackage).toBe("approved_derivation");
    expect(restyle.contract?.baseAssetId).toBe("asset-base-1");
    expect(restyle.contract?.styleAssetId).toBe("asset-style-1");
  });

  it("snapshots art variation hard rules via shared extractor", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture())
    );
    expect(extractPromptHardRulesSection(prompt)).toContain("Comprar agora");
    expect(extractPromptHardRulesSection(prompt)).toContain("Target format: 1:1");
  });

  it("snapshots format adaptation mode for approved_derivation package", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(formatAdaptationApprovedDerivationContractFixture(), {
        packageSource: "approved_derivation",
        asset: undefined,
      })
    );
    const mode = extractPromptModeSection(prompt);
    expect(mode).toContain("approved winning creative");
    expect(mode).not.toContain("Campaign:");
  });
});

describe("buildDerivationPrompt restyling mode", () => {
  it("separates base image content from style reference design language", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "restyling",
      visualTokenBrief: "Style reference: premium editorial shadows and serif typography.",
      asset: {
        id: "asset-1",
        campaignId: "campaign-1",
        workspaceId: "workspace-1",
        key: "uploads/base-image.png",
        type: "image/png",
        size: 1024,
        width: 1080,
        height: 1080,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    } as DerivationPromptConfig);

    expect(prompt).toContain("MODE: restyling");
    expect(extractPromptPerModeRulesSection(prompt)).toMatch(/FACTUAL ENTITY LOCK|entity lock/i);
    expect(prompt).toMatch(/VISUAL REFERENCE TRANSFER RULE|abstract style attributes/i);
    expect(prompt).toMatch(/base image is the ONLY source of factual content/i);
    expect(extractPromptPerModeRulesSection(prompt)).not.toMatch(/DENYLIST/);
  });
});
