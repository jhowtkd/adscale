import type { ContentBrief, StyleBrief } from "./image-analysis";

export type StyleIntensity = "soft" | "medium" | "strong";

const RESTYLING_INTENSITY_PROMPTS: Record<StyleIntensity, string> = {
  soft: [
    "STYLE INTENSITY: soft.",
    "Use the style reference lightly.",
    "Prioritize the base ad content and layout.",
    "Borrow mainly palette, subtle texture, and mood.",
  ].join("\n"),
  medium: [
    "STYLE INTENSITY: medium.",
    "Balance base content with reference style.",
    "Apply palette, typography, photo treatment, rhythm, and moderate composition influence.",
  ].join("\n"),
  strong: [
    "STYLE INTENSITY: strong.",
    "Apply the reference visual language with high presence.",
    "Allow stronger typography, texture, composition, and energy shifts while preserving campaign content.",
  ].join("\n"),
};

function normalizeStyleIntensity(value?: string | null): StyleIntensity {
  return value === "soft" || value === "strong" || value === "medium" ? value : "medium";
}

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
  } = config;

  let effectiveCreativeLevel = creativeLevel;
  if (generationMode === "art_variation" && !effectiveCreativeLevel) {
    effectiveCreativeLevel = "balanced";
  }

  const isArtVariation = generationMode === "art_variation";

  const parts: string[] = [
    "You are an advertising derivation engine, not a generic creative generator.",
  ];

  if (isArtVariation) {
    parts.push(
      "MODE: art_variation — Generate a new artistic version of the original campaign asset while keeping the SAME format/proportions.",
      "Requirements: produce a PERCEPTIBLY DIFFERENT result from the reference. Vary background, composition, CTA module placement, and visual hierarchy. Do NOT produce a near-identical copy.",
      "Preserve the original brand identity, palette, typography style, product treatment, and overall tone. Do not invent a new brand or unrelated visual universe."
    );
  } else if (generationMode === "format_adaptation") {
    parts.push(
      "MODE: format_adaptation — Rebuild the ad as a native layout for a DIFFERENT aspect ratio using the same visual tokens.",
      "This is NOT a crop, resize, zoom, pasted reference, framed reference, or letterbox task. Do not place the original full image inside the new canvas.",
      `Target format: ${targetFormat}. Create a new composition for this exact placement while keeping the original brand identity, offer, message hierarchy, and campaign recognition intact.`,
      "Extract and reuse the reference's visual tokens: color palette, typography style, logo if present, main subject/photo treatment, graphic shapes, curved panels, textures, motifs, icons, CTA module, offer card, and spacing language.",
      "Rebuild those tokens into a fresh layered advertising layout. Fill the entire canvas edge-to-edge with intentional background, shapes, and bleed areas. No blank bands, blurred padding, borders, or top/bottom filler.",
      "Preserve the core concept, main subject, offer, CTA, and important copy, but reposition, resize, and regroup them so every key element remains visible and readable in the target format."
    );

    if (targetFormat === "9:16") {
      parts.push("For 9:16, design a native story ad: use vertical hierarchy, extended brand background, and intentionally rebuilt top/bottom zones. Keep essential content inside the central safe area, while decorative tokens can bleed to the edges.");
    } else if (targetFormat === "4:5") {
      parts.push("For 4:5, design a native portrait feed ad: balance the subject and copy blocks, rebuild the offer/CTA area, and avoid any appearance of a square asset padded into portrait.");
    } else if (targetFormat === "1:1") {
      parts.push("For 1:1, design a native square ad: rebalance the subject, headline, benefits, offer, and CTA into a compact composition without side cropping or pasted-format artifacts.");
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

  parts.push(
    "",
    "CRITICAL LOGO RULE: Do NOT invent a logo. Preserve the logo ONLY if it already exists in the reference asset. If no logo is visible in the reference, do not add one.",
    "",
    `Campaign: ${campaign?.name || "N/A"}`,
    `Client/Product: ${campaign?.client || campaign?.product || "N/A"}`,
    `Objective: ${campaign?.objective || "N/A"}`,
    `Constraints: ${campaign?.constraints || "None"}`,
    `Notes: ${campaign?.notes || "None"}`,
  );

  if (ctaText) {
    parts.push(`\nApplied CTA text for this piece: ${ctaText}`);
    parts.push(`
CRITICAL LITERAL CTA RULE: The CTA text above is MANDATORY and FINAL.
- Do not use synonyms, paraphrases, or alternative phrasing for this CTA.
- Do not translate the CTA into any language.
- Do not rewrite or rephrase the CTA text.
- Do not replace it with plan-recommended CTAs or any other text.
- The exact CTA text above must appear verbatim in the generated output.`);
    if (plan?.ctas && plan.ctas.length > 0) {
      parts.push(`\nCTA Recommendations are secondary context only and must not override the literal CTA text.`);
    }
  } else if (isArtVariation) {
    parts.push(`\nApplied CTA text for this piece: (use the original CTA from the reference)`);
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

  if (asset) {
    parts.push(`\nReference Asset Key: ${asset.key} (${asset.type})`);
    parts.push("The uploaded reference image is your visual source of truth. Use its actual content — colors, layout, product placement, typography style, logo position, and visual hierarchy — as the foundation.");

    if (isArtVariation) {
      parts.push("Keep the same format/proportions as the reference. Treat this as image-conditioned derivation, not text-to-image creation from scratch.");
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

  if (!isArtVariation && visualTokenBrief?.trim()) {
    parts.push(
      "\nExtracted Visual Token Brief from the reference image:",
      visualTokenBrief.trim(),
      "Use this brief as the authoritative source for the rebuilt layout. The final image should look like a new ad from the same campaign system, not a reframed copy of the reference."
    );
  }

  if (feedback && feedback.trim().length > 0) {
    parts.push(`\nRevision Feedback: ${feedback}`);
  }

  if (isArtVariation) {
    parts.push(
      `\nVariant index: ${variantIndex + 1}. Make sure this version is visually distinct from other potential variants.`
    );
  }

  parts.push(
    "\nOutput: a polished, professional ad image suitable for paid social, with controlled variation and high brand fidelity."
  );

  parts.push(imageLanguageInstruction(locale));

  return parts.join("\n");
}

export function buildRestylingPrompt(
  content: ContentBrief,
  style: StyleBrief,
  campaign: Campaign,
  ctaText?: string | null,
  locale?: string,
  styleIntensity?: StyleIntensity | string | null
): string {
  const normalizedIntensity = normalizeStyleIntensity(styleIntensity);
  const parts: string[] = [
    "You are an advertising creative engine. Create a completely new advertising image from scratch.",
    "",
    "CONTENT TO COMMUNICATE (from original ad):",
    `- Product/Service: ${content.product}`,
    `- Offer: ${content.offer}`,
    `- Main Visual: ${content.keyVisual}`,
    `- Headline: ${content.textContent.headline}`,
    `- Supporting Points: ${content.textContent.bullets.join(" | ")}`,
    `- Brand Elements: ${content.brandElements.join(", ")}`,
    `- CTA: ${ctaText || content.cta.text}`,
    "",
    "VISUAL STYLE TO APPLY (from reference image):",
    `- Color Palette: ${style.colorPalette.dominant.join(", ")} with accents ${style.colorPalette.accents.join(", ")}`,
    `- Typography Personality: ${style.typography.personality} (${style.typography.effects.join(", ")})`,
    `- Textures: ${style.textures.join(", ")}`,
    `- Composition: ${style.composition}`,
    `- Mood: ${style.mood}`,
    `- Decorative Elements: ${style.decorativeElements.join(", ")}`,
    `- Photo Treatment: ${style.photoTreatment}`,
    "",
    RESTYLING_INTENSITY_PROMPTS[normalizedIntensity],
    "",
    "CRITICAL RULES:",
    "- Do NOT copy content from the style reference. Use ONLY its visual language.",
    "- Reimagine the ad concept through the lens of this aesthetic.",
    "- The result should feel like an original ad, not a collage or pasted overlay.",
    "- Fill the entire canvas edge-to-edge. No blank bands, blurred padding, or borders.",
    "- Do NOT invent new facts, offers, or CTAs — use those from the content brief only.",
    "- Preserve the brand logo and CTA text exactly as specified.",
  ];

  parts.push(imageLanguageInstruction(locale));
  parts.push("\nOutput: a polished, professional ad image suitable for paid social.");

  return parts.join("\n");
}
