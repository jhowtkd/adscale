import type { ExtractedBrandKit } from "./brand-kit-extractor";
import type { CompetitorAnalysisResult } from "./competitor-analyzer";
import type { PreflightResult } from "./preflight-analysis";
import { buildBrandKitPromptSection } from "./brand-kit-extractor";
import { buildCompetitorContextPromptSection } from "./competitor-analyzer";
import { buildPreflightPromptSection } from "./preflight-analysis";
import type { BrandMemoryContext } from "@/server/memory/brand-memory-context";
import type { CreativeContract, CtaSemantics } from "./creative-contract";



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
- Change ONLY: layout/disposition, text content, CTA module placement, and minor spacing adjustments.
- Do not introduce new scenes, unrelated motifs, experimental layouts, or major copy shifts.
- Maintain minimal structural change; the result should feel like the same visual universe as the reference.
- Preserve logo behavior, offer structure, and overall campaign recognition.`;

const balanced = `CREATIVITY LEVEL: balanced.
OPERATIONAL RULES FOR BALANCED:
- Create a noticeably new composition while keeping brand identity recognizable.
- Rebuild layout, visual hierarchy, CTA module placement, supporting shapes, rhythm, and spacing.
- The result should feel like a sibling creative from the same campaign, not a near-copy.
- Ensure perceptible difference in background, composition, CTA module, and visual hierarchy.
- Preserve palette, character/product, texture, and brand system from the reference.`;

const bold = `CREATIVITY LEVEL: bold.
OPERATIONAL RULES FOR BOLD:
- Change the background structure completely. Use a different scene, texture, or environment.
- Reorganize visual hierarchy: resize, reposition, and regroup key elements.
- Apply new lighting treatment, shadows, and color grading while staying within the brand palette.
- Preserve core brand assets (logo, product), campaign message, offer, and CTA.
- Do not invent a new brand or unrelated visual universe.
- The result must be clearly a different creative from the same campaign.`;

const extreme = `CREATIVITY LEVEL: extreme.
OPERATIONAL RULES FOR EXTREME:
- Reimagine the entire visual context: new scene, new environment, new background treatment.
- Change product angle, framing, scale, or photo treatment dramatically.
- Rebuild composition from scratch: new hierarchy, new spacing language, new rhythm.
- Apply bold lighting shifts, contrast changes, and atmospheric treatment.
- Preserve only: brand identity (logo behavior, palette family), campaign message, offer, and CTA.
- The result should be almost unrecognizable side-by-side with the reference, yet clearly belong to the same campaign when viewed independently.`;

const CREATIVITY_TEMPLATES: Record<string, string> = {
  conservative,
  balanced,
  bold,
  extreme,
};

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
  contract?: CreativeContract | null;
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

export function buildDerivationPrompt(config: DerivationPromptConfig) {
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

  if (generationMode === "restyling" && contract?.styleAssetId) {
    parts.push(
      "",
      "RESTYLING FACTUAL-SOURCE RULE:",
      "The base image is the ONLY source of factual content (brand name, product name, offer, CTA, price, course name, logo). The style reference provides visual language (color, typography style, layout composition, mood) only. Do NOT copy factual claims, text, prices, offers, brand names, or CTAs from the style reference into the output."
    );
  }

  if (isArtVariation) {
    parts.push(
      "MODE: art_variation — Recompose the original campaign asset into a new artistic variation while keeping the SAME format/proportions.",
      "Requirements: produce a PERCEPTIBLY DIFFERENT result from the reference. Vary background, composition, CTA module placement, and visual hierarchy. Do NOT produce a near-identical copy.",
      "MANDATORY PRESERVATION: preserve every important piece of campaign information from the reference: visible headline, offer, discount/price, CTA, product/service, logo if present, legal/small-print text if present, and key visual subject.",
      "ANTI-CROPPING RULE: do not crop, hide, truncate, blur, or cover text, faces, products, logos, offer cards, CTA buttons, price/discount badges, or other information-bearing elements.",
      "REARRANGEMENT RULE: when changing the composition, rebuild the layout by resizing, grouping, and repositioning elements so all preserved information remains visible, readable, and intentionally arranged inside the canvas.",
      "LAYOUT SAFETY PASS: before finalizing, check the four canvas edges and all text boxes; if any important information touches an edge, overlaps, or becomes too small to read, reduce scale and rebalance whitespace instead of cropping.",
      "SAFE MARGIN RULE: keep logos, CTA buttons, badges, legal copy, all text, faces, and key product/service visuals at least 8% of the canvas width/height away from the edges unless the original brand system intentionally uses full-bleed decorative background only.",
      "BRAND LOCKUP RULE: do not place vertical or horizontal logos flush against any edge. Move, scale, or rotate brand marks so the complete logo has visible breathing room and cannot be cut by platform placements.",
      "THUMBNAIL LEGIBILITY RULE: secondary information such as duration, online/onsite labels, start date, badges, and offer details must remain readable when the image is viewed small; increase contrast, font weight, or grouping instead of shrinking them.",
      "Do not solve a crowded layout by deleting information. Use hierarchy, grouping, spacing, and background extension to make the preserved information fit.",
      "Preserve the original brand identity, palette, typography style, product treatment, and overall tone. Do not invent a new brand or unrelated visual universe."
    );
  } else if (generationMode === "format_adaptation") {
    parts.push(
      "MODE: format_adaptation — You are EDITING an existing ad to fit a DIFFERENT aspect ratio.",
      "You can see the original image. Your job is to PRESERVE every visual element exactly as it appears, and rebuild the layout so it feels native to the target format.",
      "This is a layout adaptation, not a resized poster. Treat the source ad as separate modules: headline, photo/subject, offer or proof, CTA, logo, badges, legal copy, and decorative background.",
      "PRESERVE EXACTLY: the original photo/subject, all text copy (headlines, subheads, bullets, CTA), the logo, brand colors, background color/texture, offer cards, discount badges, decorative shapes, icons, and graphic panels.",
      "DO NOT: create new photos, rewrite text, add new elements, remove elements, change colors, or invent new brand assets.",
      `Target format: ${targetFormat}. Rearrange the existing elements into a native composition for this format. Fill the entire canvas edge-to-edge. No blank bands, blurred padding, or letterboxing.`,
      "HARD LAYOUT FAILURES TO AVOID: no blurred side/top/bottom bars, no poster pasted over a background, no stretched edge filler, no crowded cluster of text/photo/CTA/logo, no overlapping information modules.",
      "Build clear zones with gutters and whitespace. Keep headline, supporting copy, CTA, logo, badges, legal copy, faces, and products inside a central safe area; only decorative background may bleed to the edges.",
      "The result must be immediately recognizable as the same ad — same content, same visual identity, just fitting a different frame."
    );

    if (config.packageSource === "approved_derivation") {
      parts.push(
        "The uploaded reference image is the approved winning creative from this campaign.",
        "Preserve this winner's visible copy, CTA, product, offer, brand cues, and design identity.",
        "Only rearrange the approved winner into the target format. Do not return to the original campaign asset or invent a new concept."
      );
    }

    if (targetFormat === "9:16") {
      parts.push("For 9:16 (vertical story): create a tall story layout with separate vertical zones. Use the upper zone for headline/brand hook, the middle zone for the photo or main visual, and the lower zone for offer/proof/CTA/logo. Do not squeeze the square layout into the center.");
    } else if (targetFormat === "4:5") {
      parts.push("For 4:5 (portrait feed): create a portrait-feed layout with more vertical breathing room than the original. Keep photo prominence, stack text and proof modules intentionally, and give the CTA/logo their own clean area.");
    } else if (targetFormat === "1:1") {
      parts.push("For 1:1 (square): compress layout into a compact square. Keep all key elements visible and readable. Avoid cropping faces, text, or logos.");
    }
  } else if (generationMode === "restyling") {
    parts.push(
      "MODE: restyling — Apply the visual style of a reference image to the content of a base image.",
      "BASE IMAGE CONTENT SOURCE: The base image provides the subject, product, offer, CTA, and factual content. preserve the base image subject, product, offer, CTA, and factual content.",
      "STYLE REFERENCE DESIGN LANGUAGE: The style reference provides layout, visual style, typography aesthetic, color treatment, and design language. borrow only visual language from the style reference.",
      "RULES:",
      "- Preserve the base image subject, product, offer, CTA, and factual content exactly.",
      "- do not copy factual content from the style reference.",
      "- Apply the style reference's visual language (colors, typography style, layout rhythm, decorative elements) to the base image's content.",
      "- The result should look like a restyled version of the base image, not a copy of the style reference.",
      "- Keep the same format/proportions as the base image.",
      "- Do NOT invent new facts, offers, or CTAs — use those from the base image only."
    );
  }

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
      "Use the Approved Creative Diagnosis as the primary creative direction. Preserve the listed elements. Explore the listed opportunities within the selected creativity level."
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
    parts.push(`\nCreative Strategy: ${plan.strategy}`);
    if (plan.angles && plan.angles.length > 0) {
      parts.push(`\nCreative Angles:\n${plan.angles.map((a, i) => `${i + 1}. ${a}`).join("\n")}`);
    }
    if (plan.hooks && plan.hooks.length > 0) {
      parts.push(`\nHook Copy Options:\n${plan.hooks.map((h) => `- ${h}`).join("\n")}`);
    }
    if (plan.ctas && plan.ctas.length > 0) {
      parts.push(`\nCTA Recommendations:\n${plan.ctas.map((c) => `- ${c}`).join("\n")}`);
    }
  }

  if (config.competitorAnalyses && config.competitorAnalyses.length > 0) {
    const competitorSection = buildCompetitorContextPromptSection(config.competitorAnalyses);
    if (competitorSection.trim()) {
      parts.push(competitorSection);
    }
  }

  if (config.brandMemory?.block?.trim()) {
    parts.push("", config.brandMemory.block.trim());
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
        "Use the reference as the complete source of truth for what information must survive. Rearrange the ad, do not crop out content.",
        "If the original ad is dense, prioritize a cleaner hierarchy that still includes all critical copy and brand/product elements."
      );
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

  if (!isArtVariation && visualTokenBrief?.trim() && generationMode !== "format_adaptation") {
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

/** Restyling factual-source rule block when present. */
export function extractPromptRestylingFactualSourceSection(prompt: string): string {
  const header = "RESTYLING FACTUAL-SOURCE RULE:";
  const start = prompt.indexOf(header);
  if (start === -1) return "";

  const end = indexOfEarliest(prompt, start + header.length, ["\nMODE:", "\n\nCampaign:"]);
  return prompt.slice(start, end).trimEnd();
}
