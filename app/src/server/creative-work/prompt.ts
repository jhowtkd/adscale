import "server-only";
import type {
  CreativeLevel,
  CreativeWorkIdentityAssetSnapshot,
  CreativeWorkIdentitySnapshot,
  SocialPostCopy,
} from "./contracts";
import { CREATIVE_LEVEL_DIRECTIONS } from "@/server/ai/creative-level-direction";

export type SocialPostFormat = "1:1" | "4:5" | "9:16";

export interface BuildSocialPostPromptInput {
  format: SocialPostFormat;
  copy: SocialPostCopy;
  identitySnapshot: CreativeWorkIdentitySnapshot;
  creativeLevel: CreativeLevel;
}

function buildFixedContract(
  input: Pick<BuildSocialPostPromptInput, "format" | "copy">,
): string {
  return [
    "FIXED CONTRACT:",
    `FORMAT: ${input.format}`,
    `HEADLINE: "${input.copy.headline}"`,
    `BODY: "${input.copy.body}"`,
    `CTA: "${input.copy.cta}"`,
    "Do not paraphrase, translate, omit, or add visible copy.",
    "Exact assets will be composited after generation; leave clean space at their declared placements.",
  ].join("\n");
}

function buildBrandKitBlock(
  brandKit: CreativeWorkIdentitySnapshot["brandKit"],
): string {
  const lines: string[] = ["BRAND KIT:"];
  if (brandKit.colors.length > 0) {
    lines.push(`- Colors: ${brandKit.colors.join(", ")}`);
  } else {
    lines.push("- Colors: (none provided)");
  }
  if (brandKit.fonts.length > 0) {
    lines.push(`- Fonts: ${brandKit.fonts.join(", ")}`);
  } else {
    lines.push("- Fonts: (none provided)");
  }
  lines.push(
    `- Tone of voice: ${brandKit.toneOfVoice ?? "(not provided)"}`,
  );
  lines.push(
    `- Required elements: ${brandKit.requiredElements ?? "(not provided)"}`,
  );
  lines.push(
    `- Prohibited elements: ${brandKit.prohibitedElements ?? "(not provided)"}`,
  );
  return lines.join("\n");
}

function describeAnalysisForRule(
  asset: CreativeWorkIdentityAssetSnapshot,
): string {
  const a = asset.analysis;
  const pieces = [a.description, ...a.rules, ...a.constraints]
    .filter((piece): piece is string => Boolean(piece && piece.trim().length > 0));
  return pieces.join(" | ");
}

function describeAnalysisForReference(
  asset: CreativeWorkIdentityAssetSnapshot,
): string {
  const a = asset.analysis;
  const pieces = [a.description, ...a.visualAttributes]
    .filter((piece): piece is string => Boolean(piece && piece.trim().length > 0));
  return pieces.join(" | ");
}

function buildRuleModeBlock(
  assets: CreativeWorkIdentityAssetSnapshot[],
): string {
  const ruleAssets = assets.filter((asset) => asset.usageMode === "rule");
  if (ruleAssets.length === 0) {
    return "RULE-MODE FINDINGS:\n(none)";
  }
  const lines = ["RULE-MODE FINDINGS:"];
  for (const asset of ruleAssets) {
    const description = describeAnalysisForRule(asset);
    lines.push(
      `- ${asset.label} (${asset.category}, opaque=${
        asset.hasAlpha ? "no" : "yes"
      }): ${description || "(no description)"}`,
    );
  }
  return lines.join("\n");
}

function buildReferenceModeBlock(
  assets: CreativeWorkIdentityAssetSnapshot[],
): string {
  const referenceAssets = assets.filter((asset) => asset.usageMode === "reference");
  if (referenceAssets.length === 0) {
    return "REFERENCE-MODE DESCRIPTIONS:\n(none)";
  }
  const lines = ["REFERENCE-MODE DESCRIPTIONS:"];
  for (const asset of referenceAssets) {
    const description = describeAnalysisForReference(asset);
    lines.push(
      `- ${asset.label} (${asset.category}): ${description || "(no description)"}`,
    );
  }
  return lines.join("\n");
}

function buildReservedPlacementsBlock(
  assets: CreativeWorkIdentityAssetSnapshot[],
): string {
  const exactAssets = assets.filter((asset) => asset.usageMode === "exact");
  if (exactAssets.length === 0) {
    return "RESERVED PLACEMENTS:\n(none)";
  }
  const lines = ["RESERVED PLACEMENTS:"];
  for (const asset of exactAssets) {
    if (!asset.placement) {
      lines.push(
        `- ${asset.label} (${asset.category}, ref=${asset.referenceId}): placement not applicable`,
      );
      continue;
    }
    const { gravity, widthRatio } = asset.placement;
    lines.push(
      `- ${asset.label} (${asset.category}, ref=${asset.referenceId}): keep clean space at gravity=${gravity}, width=${widthRatio.toFixed(2)} of canvas`,
    );
  }
  return lines.join("\n");
}

export function buildSocialPostPrompt(input: BuildSocialPostPromptInput): string {
  const { identitySnapshot, creativeLevel } = input;

  const fixedContract = buildFixedContract(input);
  const brandKitBlock = buildBrandKitBlock(identitySnapshot.brandKit);
  const ruleModeBlock = buildRuleModeBlock(identitySnapshot.assets);
  const referenceModeBlock = buildReferenceModeBlock(identitySnapshot.assets);
  const reservedPlacementsBlock = buildReservedPlacementsBlock(
    identitySnapshot.assets,
  );

  return [
    "STANDALONE BRANDED SOCIAL POST — VISUAL PROMPT",
    `CREATIVE LEVEL: ${creativeLevel}`,
    CREATIVE_LEVEL_DIRECTIONS[creativeLevel],
    "",
    fixedContract,
    "",
    brandKitBlock,
    "",
    ruleModeBlock,
    "",
    referenceModeBlock,
    "",
    reservedPlacementsBlock,
  ].join("\n");
}
