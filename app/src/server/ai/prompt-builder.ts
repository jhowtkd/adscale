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
  generationMode?: "art_variation" | "format_adaptation";
  variantIndex?: number;
  ctaText?: string | null;
  targetFormat?: string;
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
  } = config;

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
  } else {
    parts.push(
      "MODE: format_adaptation — Adapt the original campaign asset to a DIFFERENT aspect ratio without reinventing the creative.",
      `Target format: ${targetFormat}. Prioritize proportion adaptation. Reflow the layout to fit ${targetFormat} while keeping the original visual DNA, product treatment, and brand identity intact.`,
      "Do NOT change the core concept, offer, or product. Only adapt spacing, cropping, and layout to the target ratio."
    );
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
      // format_adaptation: preserve visual identity but reflow layout for target format
      parts.push("Reflow and reformulate the layout to fit the target format above while preserving the exact brand identity, product placement, colors, typography style, logo position, and visual hierarchy. Do not invent new elements.");
    }
  } else {
    parts.push("\nNo reference asset was found. Produce a conservative ad concept from the campaign fields, but avoid pretending to follow a visual reference.");
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
