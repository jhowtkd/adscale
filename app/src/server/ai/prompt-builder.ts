import type { ExtractedBrandKit } from "./brand-kit-extractor";
import type { CompetitorAnalysisResult } from "./competitor-analyzer";
import type { PreflightResult } from "./preflight-analysis";
import { buildBrandKitPromptSection } from "./brand-kit-extractor";
import { buildCompetitorContextPromptSection } from "./competitor-analyzer";
import { buildPreflightPromptSection } from "./preflight-analysis";
import type { BrandMemoryContext } from "@/server/memory/brand-memory-context";
import type { CreativeContract, CtaSemantics } from "./creative-contract";
import { resolveCtaSemantics } from "./creative-contract";
import {
  buildCanonicalContractPromptSection,
  resolveCanonicalCreative,
} from "./canonical-creative-contract";
import { resolveAllowedEntitiesForCampaign } from "./creative-corpus";
import {
  buildAllowedEntitiesPromptSection,
  buildInputClassificationPromptSection,
  buildVisualReferenceTransferRuleSection,
  resolveInputSourceClassification,
} from "./factual-visual-separation";
import {
  buildFormatFlexibleContextSuffix,
  buildFormatReferenceAssetSuffix,
  buildPerModeRulesSection,
  shouldIncludeCompetitorAnalysesForMode,
  shouldIncludePlanHooksForMode,
} from "./per-mode-prompt-rules";
import { buildOlharAdscaleSection } from "./olhar/constitution";
import { buildGenerationDirectionSection, GENERATION_DIRECTION_HEADER } from "./olhar/generation-direction";
import { buildBrandTastePromptSection } from "@/server/brand-taste/taste-application";

export { extractPromptPerModeRulesSection } from "./per-mode-prompt-rules";
export { buildBrandTastePromptSection } from "@/server/brand-taste/taste-application";



export interface Campaign {
  id: string;
  workspaceId: string;
  name: string;
  client: string | null;
  product: string | null;
  objective: string | null;
  audience: string | null;
  platforms: string[] | null;
  tone: string | null;
  offer: string | null;
  constraints: string | null;
  notes: string | null;
  clientProfileId?: string | null;
  styleIntensity?: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreativeDiagnosis {
  detectedConcept: string;
  elementsToPreserve: string[];
  variationOpportunities: string[];
}

export interface Asset {
  id: string;
  campaignId: string;
  workspaceId: string;
  key: string;
  type: string;
  size: number | null;
  width: number | null;
  height: number | null;
  createdAt: Date | string;
}

export interface Plan {
  id: string;
  strategy: string | null;
  angles: string[] | null;
  hooks: string[] | null;
  ctas: string[] | null;
}

function languageInstruction(locale?: string): string {
  if (locale === "pt-BR") {
    return "\n\nIMPORTANT: Respond entirely in Brazilian Portuguese (pt-BR). All strategy, angles, hooks, and CTAs must be written in Portuguese.";
  }
  return "";
}

function imageLanguageInstruction(locale?: string): string {
  if (locale === "pt-BR") {
    return "\n\nIDIOMA OBRIGATORIO: todo texto visivel, CTA, chamada, legenda e direcao textual deve estar em portugues brasileiro (pt-BR). Nao use ingles, mesmo em palavras promocionais comuns, salvo se ja estiverem na peca original como parte da marca.";
  }
  return "";
}

const conservative = `CREATIVITY LEVEL: conservative.
OPERATIONAL RULES FOR CONSERVATIVE:
- Preserve character/product, brand palette, texture, typography style, and visual structure from the reference.
- Change ONLY: layout/disposition, text content, invite placement and reading path, and minor spacing adjustments.
- Do not introduce new scenes, unrelated motifs, experimental layouts, or major copy shifts.
- Maintain minimal structural change; the result should feel like the same visual universe as the reference.
- Preserve logo behavior, offer structure, and overall campaign recognition.
- Decorative-only changes (background color, glow, card chrome) without a new visual mechanism are invalid — require a new composition mechanism per MODE rules.`;

const balanced = `CREATIVITY LEVEL: balanced.
OPERATIONAL RULES FOR BALANCED:
- Create a noticeably new composition while keeping brand identity recognizable.
- Rebuild layout, visual hierarchy, invite placement and reading path, supporting shapes, rhythm, and spacing.
- The result should feel like a sibling creative from the same campaign, not a near-copy.
- Ensure perceptible difference in background, composition, invite placement, and visual hierarchy.
- Preserve palette, character/product, texture, and brand system from the reference.
- Decorative-only changes (background color, glow, card chrome) without a new visual mechanism are invalid — require a new composition mechanism per MODE rules.`;

const bold = `CREATIVITY LEVEL: bold.
OPERATIONAL RULES FOR BOLD:
- Change the background structure completely. Use a different scene, texture, or environment.
- Reorganize visual hierarchy: resize, reposition, and regroup key elements.
- Apply new lighting treatment, shadows, and color grading while staying within the brand palette.
- Preserve core brand assets (logo, product), campaign message, offer, and CTA.
- INVIOLABLE TEXT (mandatory tier): hook/headline, offer line, CTA, and named people/products from the reference must appear with EXACT spelling and punctuation — no typos, abbreviations, or substitutions.
- CONSOLIDATION (condensable tier only): merge, shrink, or regroup bullets, badges, and icon rows instead of reproducing every block at equal size; decorative modules may yield per RULE PRECEDENCE.
- Do not invent a new brand or unrelated visual universe.
- The result must be clearly a different creative from the same campaign.`;

const extreme = `CREATIVITY LEVEL: extreme.
OPERATIONAL RULES FOR EXTREME:
- Reimagine the entire visual context: new scene, new environment, new background treatment.
- Change product angle, framing, scale, or photo treatment dramatically.
- Rebuild composition from scratch: new hierarchy, new spacing language, new rhythm.
- Apply bold lighting shifts, contrast changes, and atmospheric treatment.
- Preserve only: brand identity (logo behavior, palette family), campaign message, offer, and CTA.
- INVIOLABLE TEXT (mandatory tier): hook/headline, offer line, CTA, and named people/products must be reproduced with EXACT spelling — typos like missing letters are hard failures.
- INVIOLABLE CONTENT BLOCKS (mandatory tier): professor names, offer badges, and legal copy spelling must survive reorganization; condensable and decorative modules may be merged, regrouped, or omitted per RULE PRECEDENCE.
- The result should be almost unrecognizable side-by-side with the reference, yet clearly belong to the same campaign when viewed independently.`;

const CREATIVITY_TEMPLATES: Record<string, string> = {
  conservative,
  balanced,
  bold,
  extreme,
};

const VISUAL_HIERARCHY_CONTRACT = `VISUAL HIERARCHY CONTRACT:
- Express ONE dominant visual idea per piece (the scroll-stopping hook focal point).
- Limit visible text hierarchy to THREE tiers: (1) primary hook/headline, (2) one supporting proof or offer line, (3) one CTA.
- Preserve factual content from the reference in meaning, but do NOT give every fact equal visual weight.
- Secondary facts (duration labels, badge rows, icon lists, legal copy, bullet pillars) may be merged into one support line, grouped smaller, or omitted from the layout when the hook + offer + CTA already communicate the campaign.
- Do not stack competing cards, icon rows, selos, and badges at the same visual weight.
- Use deliberate negative space: leave at least ~20% of the canvas free of text or visible information groups.
- Prefer editorial composition over dashboard-style grid layouts.
- Avoid generic AI tropes unless they already exist in the brand system: neon glow stacks, holographic grids, glassmorphism cards, excessive lens flares, volumetric CTA pills, and "premium tech" gradient stacks.`;

const ANTI_HALLUCINATION_RULES = `ANTI-HALLUCINATION RULES:
- Do NOT invent people, celebrities, athletes, teams, uniforms, products, logos, trademarks, or factual claims not visible in the source reference or campaign brief.
- Do NOT substitute the source photo/subject with a different person, character, or scenario.`;

export function buildIntegrityPromptSection(): string[] {
  return [
    "",
    ...buildOlharAdscaleSection(),
    "",
    VISUAL_HIERARCHY_CONTRACT,
    "",
    ANTI_HALLUCINATION_RULES,
  ];
}

function resolveEffectiveContractForPrompt(
  config: Pick<
    DerivationPromptConfig,
    | "contract"
    | "campaign"
    | "creativeDiagnosis"
    | "generationMode"
    | "targetFormat"
    | "ctaText"
    | "asset"
  >
): CreativeContract {
  const {
    contract,
    campaign,
    creativeDiagnosis,
    generationMode = "art_variation",
    targetFormat = "1:1",
    ctaText,
    asset,
  } = config;

  const base: CreativeContract =
    contract ??
    ({
      generationMode,
      targetFormat,
      ctaSemantics: resolveCtaSemantics(ctaText, generationMode),
      baseAssetId: asset?.id ?? null,
      styleAssetId: null,
      client: campaign?.client ?? null,
      product: campaign?.product ?? null,
      offer: campaign?.offer ?? null,
      constraints: campaign?.constraints ?? null,
    } satisfies CreativeContract);

  if (base.canonicalCreative) {
    return base;
  }

  return {
    ...base,
    canonicalCreative: resolveCanonicalCreative(
      base,
      campaign,
      creativeDiagnosis ?? undefined
    ),
  };
}

export function buildPlanPrompt(campaign: Campaign, asset?: Asset, locale?: string) {
  return `You are a creative strategist. Based on this campaign brief, generate a creative plan.

Campaign: ${campaign.name}
Client/Product: ${campaign.client || campaign.product || "N/A"}
Objective: ${campaign.objective || "N/A"}
Target Audience: ${campaign.audience || "N/A"}
Platforms: ${campaign.platforms?.join(", ") || "N/A"}
Tone: ${campaign.tone || "N/A"}
Offer: ${campaign.offer || "N/A"}
Constraints: ${campaign.constraints || "None"}
Notes: ${campaign.notes || "None"}
${asset ? `Reference Asset: ${asset.key} (${asset.type})` : ""}

Return ONLY a JSON object with this exact structure:
{
  "strategy": "string",
  "angles": ["string"],
  "hooks": ["string"],
  "ctas": ["string"]
}${languageInstruction(locale)}`;
}

export interface ClientReferenceContext {
  id: string;
  kind: "style" | "product" | "layout" | "logo" | "negative" | "other";
  label: string;
  notes: string | null;
  assetKey: string;
}

export interface DerivationPromptConfig {
  campaign?: Campaign | null;
  plan?: Plan | null;
  asset?: Asset | null;
  feedback?: string | null;
  locale?: string;
  generationMode?: "art_variation" | "format_adaptation" | "restyling";
  variantIndex?: number;
  ctaText?: string | null;
  targetFormat?: string;
  visualTokenBrief?: string | null;
  creativeLevel?: string;
  creativeDiagnosis?: CreativeDiagnosis | null;
  packageSource?: "campaign_asset" | "approved_derivation";
  clientReferences?: ClientReferenceContext[];
  brandKit?: (Partial<ExtractedBrandKit> & {
    name?: string;
    description?: string;
    visualNotes?: string;
    toneNotes?: string;
    constraints?: string;
    logoAssetKey?: string | null;
  }) | null;
  competitorAnalyses?: CompetitorAnalysisResult[] | null;
  preflightResult?: PreflightResult | null;
  brandMemory?: BrandMemoryContext | null;
  campaignMemoryBlock?: string | null;
  contract?: CreativeContract | null;
  /** Approved brand taste rule constraint lines from calibration loop. */
  brandTasteConstraints?: string[];
  /** Human-evaluated corpus quality constraints for this client profile. */
  corpusQualitySection?: string[];
}

function buildHardRulesSection(
  config: Pick<DerivationPromptConfig, "ctaText" | "locale" | "targetFormat"> & {
    isArtVariation: boolean;
    hasPlanCtas: boolean;
    generationMode?: DerivationPromptConfig["generationMode"];
    ctaSemantics?: CtaSemantics | null;
  }
): string[] {
  const { ctaText, locale, targetFormat = "1:1", isArtVariation, hasPlanCtas, generationMode, ctaSemantics } = config;
  const rules = [
    "",
    "HARD RULES / NON-NEGOTIABLE CONTRACT:",
    `- Target format: ${targetFormat}. This target format overrides any flexible layout suggestion.`,
    "- CRITICAL LOGO RULE: Do NOT invent a logo. Preserve the logo ONLY if it already exists in the reference asset. If no logo is visible in the reference, do not add one.",
  ];

  if (ctaSemantics?.kind === "explicit") {
    rules.push(
      `- Applied CTA text for this piece: ${ctaSemantics.text}`,
      "- CRITICAL LITERAL CTA RULE: The CTA text above is MANDATORY and FINAL.",
      "- Do not use synonyms, paraphrases, or alternative phrasing for this CTA.",
      "- Do not translate the CTA into any language.",
      "- Do not rewrite or rephrase the CTA text.",
      "- Do not replace it with plan-recommended CTAs or any other text.",
      "- The exact CTA text above must appear verbatim in the generated output."
    );
    if (hasPlanCtas) {
      rules.push("- CTA Recommendations are secondary context only and must not override the literal CTA text.");
    }
  } else if (ctaSemantics?.kind === "inherited") {
    if (generationMode === "format_adaptation") {
      rules.push("- Preserve the CTA exactly as it appears in the source creative. Do not add a different CTA or remove the existing CTA.");
    } else if (generationMode === "restyling") {
      rules.push("- The base image contains the factual CTA that must be preserved. Apply style language from the style reference only; do not replace the CTA with text from the style reference.");
    } else {
      rules.push("- Use the original CTA from the reference creative. Do not add a different CTA or remove the existing CTA.");
    }
  } else if (ctaText) {
    // Fallback: no contract provided, use legacy ctaText behavior
    rules.push(
      `- Applied CTA text for this piece: ${ctaText}`,
      "- CRITICAL LITERAL CTA RULE: The CTA text above is MANDATORY and FINAL.",
      "- Do not use synonyms, paraphrases, or alternative phrasing for this CTA.",
      "- Do not translate the CTA into any language.",
      "- Do not rewrite or rephrase the CTA text.",
      "- Do not replace it with plan-recommended CTAs or any other text.",
      "- The exact CTA text above must appear verbatim in the generated output."
    );
    if (hasPlanCtas) {
      rules.push("- CTA Recommendations are secondary context only and must not override the literal CTA text.");
    }
  } else if (isArtVariation) {
    rules.push("- Applied CTA text for this piece: use the original CTA from the reference.");
  }

  const imageLanguage = imageLanguageInstruction(locale).trim();
  if (imageLanguage) {
    rules.push(`- ${imageLanguage}`);
  }

  rules.push(
    "- Creative strategy, diagnosis, feedback, and client references are flexible guidance only; they must not override these hard rules."
  );

  return rules;
}

function buildArtVariationFallbackPreservation(
  campaign: Campaign | null | undefined,
  asset: Asset | null | undefined,
  ctaText: string | null | undefined
): string[] {
  const fallback: string[] = [];

  const clientOrProduct = campaign?.client || campaign?.product;
  if (clientOrProduct) fallback.push(`- Brand/product from brief: ${clientOrProduct}.`);
  if (campaign?.offer) fallback.push(`- Offer from brief: ${campaign.offer}.`);
  if (ctaText) fallback.push(`- Exact CTA for this variation: ${ctaText}.`);
  if (campaign?.objective) fallback.push(`- Campaign objective: ${campaign.objective}.`);
  if (campaign?.constraints) fallback.push(`- Constraints: ${campaign.constraints}.`);
  if (asset?.width && asset.height) {
    fallback.push(`- Reference asset dimensions: ${asset.width}x${asset.height}px; keep all visible information inside this same proportion.`);
  }

  if (fallback.length === 0) return [];

  return [
    "",
    "BRIEF-BASED PRESERVATION FALLBACK:",
    "No approved creative diagnosis is attached to this generation. Use the reference image plus the brief below as the minimum preservation checklist:",
    ...fallback,
    "Do not let creative exploration override these items; use them to decide what must remain legible and present.",
  ];
}

export async function buildDerivationPrompt(config: DerivationPromptConfig) {
  const {
    campaign,
    plan,
    asset,
    feedback,
    locale,
    generationMode = "art_variation",
    variantIndex = 0,
    ctaText,
    targetFormat = "1:1",
    visualTokenBrief,
    creativeLevel,
    creativeDiagnosis,
    contract,
  } = config;

  let effectiveCreativeLevel = creativeLevel;
  if (generationMode === "art_variation" && !effectiveCreativeLevel) {
    effectiveCreativeLevel = "balanced";
  }

  const isArtVariation = generationMode === "art_variation";

  const parts: string[] = [
    "You are an advertising derivation engine, not a generic creative generator.",
  ];

  parts.push(
    ...buildHardRulesSection({
      ctaText,
      locale,
      targetFormat,
      isArtVariation,
      hasPlanCtas: Boolean(plan?.ctas?.length),
      generationMode,
      ctaSemantics: contract?.ctaSemantics ?? null,
    })
  );

  const effectiveContract = resolveEffectiveContractForPrompt({
    contract,
    campaign,
    creativeDiagnosis,
    generationMode,
    targetFormat,
    ctaText,
    asset,
  });
  parts.push(...buildCanonicalContractPromptSection(effectiveContract));
  parts.push(...buildIntegrityPromptSection());

  if (config.brandTasteConstraints && config.brandTasteConstraints.length > 0) {
    parts.push(...buildBrandTastePromptSection(
      config.brandTasteConstraints.map((line, index) => ({
        id: `inline-${index}`,
        category: "brand_nuance",
        rationale: line,
      }))
    ));
  } else if (config.brandTasteConstraints?.length === 0) {
    // no-op: explicit empty array means no brand taste overlay
  }

  if (config.corpusQualitySection && config.corpusQualitySection.length > 0) {
    parts.push(...config.corpusQualitySection);
  }

  const classification =
    effectiveContract.inputSourceClassification ??
    resolveInputSourceClassification(effectiveContract, {
      hasBrandKit: Boolean(config.brandKit),
      clientReferenceCount: config.clientReferences?.length ?? 0,
      packageSource: config.packageSource,
    });
  parts.push(...buildInputClassificationPromptSection(classification));

  const allowedEntities = resolveAllowedEntitiesForCampaign(campaign);
  if (allowedEntities) {
    parts.push(...buildAllowedEntitiesPromptSection(allowedEntities));
  }

  if (generationMode === "restyling") {
    const hasClientStyleReferences = config.clientReferences?.some(
      (ref) => ref.kind === "style"
    );
    parts.push(
      ...buildVisualReferenceTransferRuleSection({
        hasClientStyleReferences,
      })
    );
  }

  if (generationMode === "restyling") {
    parts.push(...buildRestylingFactualSourceRuleSection());
  }

  parts.push(
    ...(await buildGenerationDirectionSection({
      contract: effectiveContract,
      campaign,
      generationMode,
      creativeLevel: effectiveCreativeLevel,
      targetFormat,
      baseReading: config.preflightResult?.baseReading ?? null,
      locale,
      workspaceId: campaign?.workspaceId,
      clientProfileId: campaign?.clientProfileId,
    }))
  );

  parts.push(
    ...buildPerModeRulesSection({
      generationMode,
      targetFormat,
      packageSource: config.packageSource,
      dominantIdea: effectiveContract.canonicalCreative?.dominantIdea,
    }),
  );

  if (generationMode === "art_variation" && effectiveCreativeLevel) {
    const template = CREATIVITY_TEMPLATES[effectiveCreativeLevel];
    if (template) {
      parts.push(template);
    }
  }

  if (generationMode === "art_variation" && creativeDiagnosis) {
    parts.push(
      "",
      "APPROVED CREATIVE DIAGNOSIS:",
      `- Detected Concept: ${creativeDiagnosis.detectedConcept}`,
      `- Elements to Preserve: ${creativeDiagnosis.elementsToPreserve.join("; ")}`,
      `- Variation Opportunities: ${creativeDiagnosis.variationOpportunities.join("; ")}`,
      "Use the Approved Creative Diagnosis as the primary creative direction. Preserve the listed elements. Explore the listed opportunities within the reading-path and gestalt budget only."
    );
  } else if (generationMode === "art_variation") {
    parts.push(...buildArtVariationFallbackPreservation(campaign, asset, ctaText ?? null));
  }

  parts.push(
    "",
    `Campaign: ${campaign?.name || "N/A"}`,
    `Client/Product: ${campaign?.client || campaign?.product || "N/A"}`,
    `Objective: ${campaign?.objective || "N/A"}`,
    `Constraints: ${campaign?.constraints || "None"}`,
    `Notes: ${campaign?.notes || "None"}`,
  );

  if (config.brandKit) {
    const brandKitSection = buildBrandKitPromptSection(config.brandKit);
    if (brandKitSection.trim()) {
      parts.push("", "--- BRAND KIT GUIDELINES ---", brandKitSection, "--- END BRAND KIT ---");
    }
  }

  if (plan) {
    parts.push(
      `\nCreative Strategy${generationMode === "format_adaptation" ? " (layout tone only)" : ""}: ${plan.strategy}`,
    );
    if (shouldIncludePlanHooksForMode(generationMode)) {
      if (plan.angles && plan.angles.length > 0) {
        parts.push(`\nCreative Angles:\n${plan.angles.map((a, i) => `${i + 1}. ${a}`).join("\n")}`);
      }
      if (plan.hooks && plan.hooks.length > 0) {
        parts.push(`\nHook Copy Options:\n${plan.hooks.map((h) => `- ${h}`).join("\n")}`);
      }
    }
    if (plan.ctas && plan.ctas.length > 0) {
      parts.push(`\nCTA Recommendations:\n${plan.ctas.map((c) => `- ${c}`).join("\n")}`);
    }
  }

  if (
    shouldIncludeCompetitorAnalysesForMode(generationMode) &&
    config.competitorAnalyses &&
    config.competitorAnalyses.length > 0
  ) {
    const competitorSection = buildCompetitorContextPromptSection(config.competitorAnalyses);
    if (competitorSection.trim()) {
      parts.push(competitorSection);
    }
  }

  if (config.campaignMemoryBlock?.trim()) {
    parts.push("", config.campaignMemoryBlock.trim());
  }

  if (config.brandMemory?.block?.trim()) {
    parts.push("", config.brandMemory.block.trim());
  }

  if (generationMode === "format_adaptation") {
    parts.push("", buildFormatFlexibleContextSuffix());
  }

  if (asset || config.packageSource === "approved_derivation") {
    if (asset) {
      parts.push(`\nReference Asset Key: ${asset.key} (${asset.type})`);
    } else {
      parts.push("\nReference Asset: approved winning derivation output (image/png)");
    }
    parts.push("The uploaded reference image is your visual source of truth. Use its actual content — colors, layout, product placement, typography style, logo position, and visual hierarchy — as the foundation.");

    if (isArtVariation) {
      parts.push(
        "Keep the same format/proportions as the reference. Treat this as image-conditioned derivation, not text-to-image creation from scratch.",
        "Use the reference as the complete source of truth for what information must survive. Rearrange the ad, do not crop out mandatory-tier content.",
        "If the original ad is dense, prioritize a cleaner three-zone hierarchy per VISUAL HIERARCHY CONTRACT. Mandatory-tier copy and brand/product elements must remain legible; condensable and decorative modules may yield visual weight per RULE PRECEDENCE.",
      );
    } else if (generationMode === "format_adaptation") {
      parts.push(buildFormatReferenceAssetSuffix());
    } else {
      parts.push(
        "Use the reference as a design system and token source, not as a crop template.",
        "Do not paste, frame, or simply extend the original image. Recreate the ad from the recognizable parts and make the result look purpose-built for the target format.",
        "Avoid cutting off text, faces, bodies, hands, products, logos, CTAs, price/discount boxes, or decorative shapes.",
      );
    }
  } else {
    parts.push("\nNo reference asset was found. Produce a conservative ad concept from the campaign fields, but avoid pretending to follow a visual reference.");
  }

  if (
    !isArtVariation &&
    visualTokenBrief?.trim() &&
    generationMode !== "format_adaptation" &&
    generationMode !== "restyling"
  ) {
    parts.push(
      "\nExtracted Visual Token Brief from the reference image:",
      visualTokenBrief.trim(),
      "Use this brief as the authoritative source for the rebuilt layout. The final image should look like a new ad from the same campaign system, not a reframed copy of the reference."
    );
  }

  if (config.preflightResult) {
    const preflightSection = buildPreflightPromptSection(config.preflightResult);
    if (preflightSection.trim()) {
      parts.push("", "--- PRE-FLIGHT ASSET ANALYSIS ---", preflightSection, "--- END PRE-FLIGHT ---");
    }
  }

  if (feedback && feedback.trim().length > 0) {
    parts.push(`\nRevision Feedback: ${feedback}`);
  }

  if (isArtVariation) {
    parts.push(
      `\nVariant index: ${variantIndex + 1}. Make sure this version is visually distinct from other potential variants.`
    );
  }

  if (config.clientReferences?.length) {
    parts.push("\nCLIENT REFERENCE LIBRARY:");
    for (const ref of config.clientReferences) {
      const intent = ref.kind === "negative" ? "Avoid repeating this pattern" : "Use as auxiliary visual guidance";
      parts.push(`- ${ref.kind}: ${ref.label}. ${intent}. Notes: ${ref.notes ?? "None"}. Asset: ${ref.assetKey}`);
    }
    parts.push("These references are auxiliary context only. They must not override the primary campaign asset, literal CTA, target format, or campaign constraints.");
  }

  parts.push(
    "\nOutput: a polished, professional ad image suitable for paid social, with controlled variation and high brand fidelity."
  );

  return parts.join("\n");
}

function indexOfEarliest(prompt: string, fromIndex: number, markers: string[]): number {
  let end = prompt.length;
  for (const marker of markers) {
    const idx = prompt.indexOf(marker, fromIndex);
    if (idx !== -1 && idx < end) {
      end = idx;
    }
  }
  return end;
}

/** Compact HARD RULES block for prompt regression snapshots. */
export function extractPromptHardRulesSection(prompt: string): string {
  const header = "HARD RULES / NON-NEGOTIABLE CONTRACT";
  const start = prompt.indexOf(header);
  if (start === -1) return "";

  const end = indexOfEarliest(prompt, start + header.length, [
    "\nCANONICAL CREATIVE CONTRACT:",
    "\nVISUAL HIERARCHY CONTRACT:",
    "\nRESTYLING FACTUAL-SOURCE RULE:",
    "\nMODE:",
  ]);
  return prompt.slice(start, end).trimEnd();
}

/** Canonical creative contract block through RULE PRECEDENCE. */
export function extractPromptCanonicalContractSection(prompt: string): string {
  const header = "CANONICAL CREATIVE CONTRACT:";
  const start = prompt.indexOf(header);
  if (start === -1) return "";

  const end = prompt.indexOf("\nVISUAL HIERARCHY CONTRACT:", start + header.length);
  if (end === -1) return prompt.slice(start).trimEnd();
  return prompt.slice(start, end).trimEnd();
}

/** Visual hierarchy and anti-hallucination blocks before MODE or restyling factual-source. */
export function extractPromptIntegritySection(prompt: string): string {
  const header = "VISUAL HIERARCHY CONTRACT:";
  const start = prompt.indexOf(header);
  if (start === -1) return "";

  const end = indexOfEarliest(prompt, start + header.length, [
    "\nINPUT SOURCE CLASSIFICATION:",
    "\nVISUAL REFERENCE TRANSFER RULE:",
    "\nRESTYLING FACTUAL-SOURCE RULE:",
    "\nMODE:",
  ]);
  return prompt.slice(start, end).trimEnd();
}

/** MODE instructions plus format source-package lines (stops before campaign fields). */
export function extractPromptModeSection(prompt: string): string {
  const start = prompt.indexOf("MODE:");
  if (start === -1) return "";

  const end = indexOfEarliest(prompt, start, [
    "\n\nCampaign:",
    "\nCREATIVITY LEVEL:",
    "\nAPPROVED CREATIVE DIAGNOSIS:",
    "\nBRIEF-BASED PRESERVATION FALLBACK:",
  ]);
  return prompt.slice(start, end).trimEnd();
}

/** Restyling factual-source rule block for derivation and correction prompts. */
export function buildRestylingFactualSourceRuleSection(): string[] {
  return [
    "",
    "RESTYLING FACTUAL-SOURCE RULE:",
    "The base image is the ONLY source of factual content (brand name, product name, offer, CTA, price, course name, logo). The style reference provides visual language (color, typography style, layout composition, mood) only. Do NOT copy factual claims, text, prices, offers, brand names, or CTAs from the style reference into the output.",
  ];
}

/** Restyling factual-source rule block when present. */
export function extractPromptRestylingFactualSourceSection(prompt: string): string {
  const header = "RESTYLING FACTUAL-SOURCE RULE:";
  const start = prompt.indexOf(header);
  if (start === -1) return "";

  const end = indexOfEarliest(prompt, start + header.length, [
    `\n${GENERATION_DIRECTION_HEADER}:`,
    "\nMODE:",
    "\n\nCampaign:",
  ]);
  return prompt.slice(start, end).trimEnd();
}
