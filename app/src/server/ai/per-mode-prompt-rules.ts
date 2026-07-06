export type GenerationMode = "art_variation" | "format_adaptation" | "restyling";

export const DECORATIVE_ONLY_REJECTION = `DECORATIVE-ONLY VARIATION (REJECT):
- Changing only background color/texture, glow, gradient stack, or card chrome WITHOUT a new visual mechanism is NOT a valid art_variation.
- Valid variation requires a NEW composition mechanism: different focal hierarchy, proof presentation, subject framing, or invite and reading-path architecture — not recoloring the same layout.`;

export const READING_PATH_GESTALT_BUDGET = `READING PATH AND GESTALT BUDGET (advisory):
- Three main reading-path anchors — hook (headline/hero focal), proof/offer, and invite (call-to-action text) — are a proven default, not a fixed template.
- Avoid a fourth information group at equal visual weight competing with hook, proof/offer, or invite unless the art direction deliberately calls for it.
- Apply reading path from VISUAL HIERARCHY CONTRACT — decorative chrome, badges, and icon rows should yield to a clear hook / proof-offer / invite hierarchy.`;

export const RESTYLING_ENTITY_LOCK_CHECKLIST = `FACTUAL ENTITY LOCK (base image only):
- People/subject, product, offer, CTA action intent, brand/logo, and factual claims are locked to the factual base per INPUT SOURCE CLASSIFICATION above.
- Do NOT replace or substitute factual entities with content from the style reference; expression may flex, facts may not.`;

export const CAMPAIGN_IDENTITY_LOCK = `CAMPAIGN IDENTITY LOCK:
- This is an EDIT of the same campaign and visual system — preserve people, factual copy meaning, brand, and concept.
- Composition, scale, grouping, safe margins, and non-factual copy expression may change.
- Do not recreate the ad as a new concept or introduce a different narrative.`;

export const CROSS_FORMAT_IDENTITY_RULE = `CROSS-FORMAT IDENTITY:
- The 1:1, 4:5, and 9:16 outputs must remain the SAME campaign: identical people, brand, factual content, and dominant idea.
- Do not introduce a new narrative, new hero photo, new offer, or new concept when adapting aspect ratio.
- Composition, scale, grouping, safe margins, and non-factual copy expression may adapt to the format.`;

export interface PerModeRulesOptions {
  generationMode: GenerationMode;
  targetFormat?: string;
  packageSource?: "approved_derivation" | "campaign_asset" | string;
  dominantIdea?: string | null;
}

export function buildArtVariationModeRulesSection(): string[] {
  return [
    "MODE: art_variation — Recompose the original campaign asset into a new artistic variation while keeping the SAME format/proportions.",
    DECORATIVE_ONLY_REJECTION,
    READING_PATH_GESTALT_BUDGET,
    "CREATIVE MECHANISM REQUIREMENT: require a new composition mechanism — different focal hierarchy, proof presentation, subject framing, or invite and reading-path architecture. Background-only or color-only swaps without mechanism change are invalid.",
    "MANDATORY PRESERVATION: preserve **mandatory tier** content in meaning (hook/headline, offer/proof, logo if present, product/subject). CTA presence is optional — when an invite/call-to-action is rendered, preserve its action intent; literal wording is not required. Condensable information groups (badges, duration labels, bullet pillars, legal copy) may merge, shrink, or relocate per RULE PRECEDENCE and CONTENT TIERS above. Decorative information groups (icon rows, selos, card chrome) may be omitted when hook + offer already communicate the campaign.",
    "ANTI-CROPPING RULE: do not crop, hide, truncate, blur, or cover mandatory-tier text, faces, products, logos, offer cards, any rendered call-to-action text, price/discount badges, or other information-bearing elements.",
    "REARRANGEMENT RULE: when changing the composition, rebuild the layout by resizing, grouping, and repositioning elements so mandatory-tier content remains visible, readable, and intentionally arranged inside the canvas.",
    "LAYOUT SAFETY PASS: before finalizing, check the four canvas edges and all text boxes; if any mandatory-tier information touches an edge, overlaps, or becomes too small to read, reduce scale and rebalance whitespace instead of cropping.",
    "SAFE MARGIN GUIDANCE (advisory): breathing room near the canvas edges — around 8% of the width/height is a useful default — protects logos, call-to-action text, badges, legal copy, mandatory-tier text, faces, and key product/service visuals from platform placements; full-bleed decorative backgrounds remain a valid brand choice.",
    "BRAND LOCKUP RULE: do not place vertical or horizontal logos flush against any edge. Move, scale, or rotate brand marks so the complete logo has visible breathing room and cannot be cut by platform placements.",
    "THUMBNAIL LEGIBILITY GUIDANCE (advisory): check condensable information such as duration, online/onsite labels, start date, badges, and offer details at small preview sizes; increasing contrast, font weight, or grouping — or merging into a single support line per CONTENT TIERS — usually reads better than shrinking.",
    "Do not drop **mandatory tier** meaning to solve a crowded layout. Condense or omit condensable and decorative modules per RULE PRECEDENCE; use hierarchy, grouping, spacing, and background extension so mandatory-tier content remains visible and legible.",
    "Preserve the original brand identity, palette, typography style, product treatment, and overall tone. Do not invent a new brand or unrelated visual universe.",
  ];
}

export function buildRestylingModeRulesSection(): string[] {
  return [
    "MODE: restyling — Apply abstract visual language from style reference to factual base content.",
    RESTYLING_ENTITY_LOCK_CHECKLIST,
    "BRAND LOCK: depict only brands, logos, and wordmarks visibly present in the factual base image. The campaign registry validates identity but does not authorize adding a missing brand mark.",
    "Abstract style attributes (rhythm, texture, typography, lighting, compositional logic) may transfer from the style reference per VISUAL REFERENCE TRANSFER RULE above — never factual tokens.",
    "COLOR TRANSFER: preserve the factual base palette family. Transfer contrast, saturation, temperature, and color distribution only when remapped into that palette.",
    "Do NOT reproduce the style reference ad wholesale (its hero layout, copied text blocks, or full composition paste) — the output must read as the base campaign restyled, not as the style reference ad.",
    "Preserve the base image format/proportions.",
    "Do NOT invent new facts, offers, or CTAs — use those from the base image only.",
    "The result should look like a restyled version of the base image, not a copy of the style reference.",
  ];
}

export function buildFormatAdaptationModeRulesSection(options: {
  targetFormat: string;
  packageSource?: string;
  dominantIdea?: string | null;
}): string[] {
  const { targetFormat, packageSource, dominantIdea } = options;
  const lines: string[] = [
    "MODE: format_adaptation — You are EDITING an existing ad to fit a DIFFERENT aspect ratio.",
    CAMPAIGN_IDENTITY_LOCK,
  ];

  if (dominantIdea?.trim()) {
    lines.push(`Dominant idea (must not change): ${dominantIdea.trim()}`);
  }

  lines.push(
    "You can see the original image. Rebuild the layout for the target format within the same campaign and visual system; facts stay fixed, and you may condense or rewrite non-factual copy (headlines, subheads, supporting lines) to fit the new frame.",
    "This is a layout adaptation, not a resized poster. Treat the source ad as separate modules: headline, photo/subject, offer or proof, CTA, logo, badges, legal copy, and decorative background.",
    "PRESERVE FACTS, FLEX EXPRESSION: the original photo/subject, logo, brand colors, offer/discount facts, prices, dates, and legal meaning must stay correct; non-factual copy may be condensed or rewritten, and a rendered CTA must preserve its action intent.",
    "VISUAL PROMINENCE: factual completeness does not require equal visual weight. The three information zones from VISUAL HIERARCHY CONTRACT and CANONICAL CREATIVE CONTRACT — hook, proof/offer, and CTA — are a proven default; decorative chrome, badges, and icon rows may shrink or yield to clear zones.",
    "PRESERVE VISUAL IDENTITY: background color/texture, decorative shapes, icons, and graphic panels should remain recognizable but may be resized or repositioned for the target format.",
    "DO NOT: create new photos, invent new facts or offers, add unrelated elements, change factual colors, or invent new brand assets.",
    `Target format: ${targetFormat}. Rearrange the existing elements into a native composition for this format. Fill the entire canvas edge-to-edge. No blank bands, blurred padding, or letterboxing.`,
    "HARD LAYOUT FAILURES TO AVOID: no blurred side/top/bottom bars, no poster pasted over a background, no stretched edge filler, no crowded cluster of text/photo/CTA/logo, no overlapping information modules.",
    "Build clear zones with gutters and whitespace. Keep headline, supporting copy, CTA, logo, badges, legal copy, faces, and products inside a central safe area; only decorative background may bleed to the edges.",
    "The result must be immediately recognizable as the same ad — same campaign and visual system, just fitting a different frame.",
    CROSS_FORMAT_IDENTITY_RULE,
  );

  if (packageSource === "approved_derivation") {
    lines.push(
      "The uploaded reference image is the approved winning creative from this campaign.",
      "Preserve this winner's product, offer, factual copy meaning, CTA action intent, brand cues, and design identity.",
      "Only rearrange the approved winner into the target format. Do not return to the original campaign asset or invent a new concept.",
    );
  }

  if (targetFormat === "9:16") {
    lines.push(
      "For 9:16 (vertical story): create a tall story layout with separate vertical zones — for example, upper zone for headline/brand hook, middle zone for the photo or main visual, lower zone for offer/proof/CTA/logo. Do not squeeze the square layout into the center.",
    );
  } else if (targetFormat === "4:5") {
    lines.push(
      "For 4:5 (portrait feed): create a portrait-feed layout with more vertical breathing room than the original. Keep photo prominence, stack text and proof modules intentionally, and give the CTA/logo their own clean area.",
    );
  } else if (targetFormat === "1:1") {
    lines.push(
      "For 1:1 (square): compress layout into a compact square. Keep all key elements visible and readable. Avoid cropping faces, text, or logos.",
    );
  }

  return lines;
}

export function buildPerModeRulesSection(options: PerModeRulesOptions): string[] {
  const { generationMode, targetFormat = "1:1", packageSource, dominantIdea } = options;

  switch (generationMode) {
    case "art_variation":
      return buildArtVariationModeRulesSection();
    case "restyling":
      return buildRestylingModeRulesSection();
    case "format_adaptation":
      return buildFormatAdaptationModeRulesSection({
        targetFormat,
        packageSource,
        dominantIdea,
      });
    default:
      return [];
  }
}

export function shouldIncludePlanHooksForMode(mode: GenerationMode): boolean {
  return mode !== "format_adaptation";
}

export function shouldIncludeCompetitorAnalysesForMode(mode: GenerationMode): boolean {
  return mode !== "format_adaptation";
}

export function buildFormatFlexibleContextSuffix(): string {
  return "Campaign and brand memory above are layout-tone context only — do not introduce new concepts, hooks, or variation angles when adapting format.";
}

export function buildFormatReferenceAssetSuffix(): string {
  return "Same ad, new frame — rearrange modules for target aspect ratio; do not introduce new concepts or hero imagery.";
}

export function extractPromptPerModeRulesSection(prompt: string): string {
  const start = prompt.indexOf("MODE:");
  if (start === -1) return "";

  const end = indexOfEarliest(prompt, start + 5, [
    "\n\nCampaign:",
    "\nCREATIVITY LEVEL:",
  ]);
  return prompt.slice(start, end).trimEnd();
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
