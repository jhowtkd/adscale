import "server-only";
import { logger } from "@/lib/logger";
import type { GenerationMode } from "@/server/generation/canonical/types";
import type {
  CreativeFact,
  CreativeLevel,
  CreativeWorkFactPack,
  CreativeWorkIdentityAssetSnapshot,
  CreativeWorkIdentitySnapshot,
  CreativeWorkInputSnapshot,
  SocialPostBrief,
  SocialPostCopy,
} from "./contracts";
import type { CreativeWorkReferenceSlot } from "./reference-plan";
import { CREATIVE_LEVEL_DIRECTIONS } from "@/server/ai/creative-level-direction";

export type SocialPostFormat = "1:1" | "4:5" | "9:16";

export interface BuildSocialPostPromptInput {
  format: SocialPostFormat;
  copy: SocialPostCopy;
  brief: SocialPostBrief;
  inputSnapshot: CreativeWorkInputSnapshot;
  revisionInstruction?: string | null;
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
  if (!a) return "";
  const pieces = [a.description, ...(a.rules ?? []), ...(a.constraints ?? [])]
    .filter((piece): piece is string => Boolean(piece && piece.trim().length > 0));
  return pieces.join(" | ");
}

function describeAnalysisForReference(
  asset: CreativeWorkIdentityAssetSnapshot,
): string {
  const a = asset.analysis;
  if (!a) return "";
  const pieces = [a.description, ...(a.visualAttributes ?? [])]
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
  const sourceAnalysisBlock = [
    "PERSISTED BRIEF AND INPUT:",
    `REQUEST: ${input.inputSnapshot.request}`,
    `BRIEF: ${JSON.stringify(input.brief)}`,
    ...(input.revisionInstruction ? [`REVISION INSTRUCTION: ${input.revisionInstruction}`] : []),
    ...input.inputSnapshot.sources.map((source) =>
      `- source=${source.sourceId} usage=${source.usage} content=${JSON.stringify(source.content)} style=${JSON.stringify(source.style)}`
    ),
  ].join("\n");

  return [
    "STANDALONE BRANDED SOCIAL POST — VISUAL PROMPT",
    `CREATIVE LEVEL: ${creativeLevel}`,
    CREATIVE_LEVEL_DIRECTIONS[creativeLevel],
    "",
    fixedContract,
    "",
    sourceAnalysisBlock,
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

// ---------------------------------------------------------------------------
// R-004 / spec 6.2 + 8 — protocol-aware Creative Work prompt (v1 direct path).
//
// One canonical builder with per-mode policy blocks — no per-protocol classes.
// It is fed by the protocol translation (resolved mode), the frozen fact pack,
// the persisted creative level/format and the planned reference slots with
// their roles. The legacy builder above stays untouched for legacy-frozen
// works and the explicit legacy `social_post` toolKind.
// ---------------------------------------------------------------------------

/**
 * Contract for the objective correction (second and final image call, R-005 /
 * R-006). T7/T8 wire the trigger; the prompt side is already complete here:
 * the correction RE-USES this same builder with the same frozen inputs, so the
 * correction prompt always starts from the original prompt and sources and
 * only appends the failure codes and their surgical instructions — it never
 * generically "refines" the previous output (R-004 criterion 5).
 */
export interface CreativeWorkObjectiveCorrection {
  /** Objective failure codes from the persisted QA verdict (e.g. "wrong_brand"). */
  codes: readonly string[];
  /** Surgical fix instructions derived from those codes — never a generic refine. */
  instructions: string;
}

export interface BuildCreativeWorkPromptInput {
  /** Canonical mode resolved by the protocol translation for THIS output. */
  mode: GenerationMode;
  format: SocialPostFormat;
  /** Validated copy contract (R-002) — fixed for every mode. */
  copy: SocialPostCopy;
  inputSnapshot: CreativeWorkInputSnapshot;
  /** Frozen fact pack from the snapshot; null only on defensive legacy reads. */
  factPack: CreativeWorkFactPack | null;
  identitySnapshot: CreativeWorkIdentitySnapshot;
  creativeLevel: CreativeLevel;
  /** Planned reference slots (roles + labels) from the reference plan (R-003). */
  references: readonly CreativeWorkReferenceSlot[];
  revisionInstruction?: string | null;
  /** Objective correction contract — appended last when present (T7/T8 wire it). */
  correction?: CreativeWorkObjectiveCorrection | null;
}

function factLine(fact: CreativeFact): string {
  const source = fact.sourceId ? `, source: ${fact.sourceId}` : "";
  return `- [${fact.class}] "${fact.value}" (origin: ${fact.origin}${source})`;
}

/**
 * The auditable factual contract shared verbatim by every output of the work
 * (R-002 criterion 4): same fact pack in, same block out. The full request —
 * never a truncated title — is the factual authority of origin "request".
 */
function buildFactPackBlock(
  input: Pick<BuildCreativeWorkPromptInput, "factPack" | "inputSnapshot">,
): string {
  const pack = input.factPack;
  const lines = [
    "FACT PACK — AUDITABLE FACTUAL CONTRACT:",
    `REQUEST: ${pack?.request ?? input.inputSnapshot.request}`,
    "The request above is complete and untruncated; facts come only from this contract, never from titles or inferred placeholders.",
  ];
  if (!pack) {
    lines.push("(no frozen fact pack — the REQUEST above is the sole factual authority)");
  } else {
    const required = pack.facts.filter((fact) => fact.required);
    const allowed = pack.facts.filter((fact) => !fact.required);
    lines.push("REQUIRED FACTS (must survive into the piece):");
    lines.push(...(required.length > 0 ? required.map(factLine) : ["- (none stated)"]));
    lines.push("ALLOWED FACTS (may be used, never required):");
    lines.push(...(allowed.length > 0 ? allowed.map(factLine) : ["- (none stated)"]));
    lines.push(`BRAND NAME: ${pack.identity.brandName ?? "(none stated)"}`);
    lines.push(
      `BRAND REQUIRED ELEMENTS: ${pack.brand.requiredElements.join("; ") || "(none)"}`,
    );
    lines.push(
      `BRAND PROHIBITED ELEMENTS: ${pack.brand.prohibitedElements.join("; ") || "(none)"}`,
    );
    lines.push(`BRAND AUTHORITY: ${pack.identity.brandAuthority ?? "active"}`);
  }
  lines.push(
    "Missing information stays missing: never invent prices, discounts, dates, deadlines, modality, benefits, proof, guarantees, commercial conditions, credentials, brands, products or services.",
  );
  return lines.join("\n");
}

function buildReferenceRolesBlock(
  references: readonly CreativeWorkReferenceSlot[],
): string {
  if (references.length === 0) {
    return "REFERENCES (ordered, role-bound):\n(none — textual authorities only)";
  }
  const lines = ["REFERENCES (ordered, role-bound):"];
  references.forEach((slot, index) => {
    lines.push(
      `- #${index + 1} [${slot.role}] "${slot.label}" (${slot.required ? "required" : "optional"})`,
    );
  });
  // The `#n` ↔ provider-array binding is purely positional: the caller filters
  // the plan down to the slots whose buffers actually loaded, so the numbering
  // below always matches the attached image order.
  lines.push(
    "The numbering above is positional: image #1 is the first attached image, #2 the second, and so on, in the exact order listed.",
  );
  return lines.join("\n");
}

function referenceLabels(
  references: readonly CreativeWorkReferenceSlot[],
  role: CreativeWorkReferenceSlot["role"],
): string {
  const labels = references
    .filter((slot) => slot.role === role)
    .map((slot) => `"${slot.label}"`);
  return labels.length > 0 ? labels.join(", ") : "(none)";
}

/**
 * Per-mode policy blocks (spec 6.2 + 8). The block names the authorities and
 * states preservations and prohibitions — never just the mode name.
 */
function buildModePolicyBlock(input: BuildCreativeWorkPromptInput): string {
  switch (input.mode) {
    case "art_variation": {
      // Variações: identical fact pack/brand across the three outputs; only the
      // visual direction differs, driven by the persisted creative level.
      const direction =
        CREATIVE_LEVEL_DIRECTIONS[input.creativeLevel] ??
        CREATIVE_LEVEL_DIRECTIONS.balanced;
      return [
        "MODE POLICY — VARIATION:",
        `CREATIVE LEVEL: ${input.creativeLevel}`,
        `VISUAL DIRECTION: ${direction}`,
        "All variations of this work share the SAME fact pack, the SAME copy contract and the SAME brand authority — facts and brand identity are identical across them.",
        "Only the visual direction differentiates this variation: composition, atmosphere, hierarchy and art direction follow the creative level above, never the facts.",
      ].join("\n");
    }
    case "format_adaptation":
      return [
        "MODE POLICY — FORMAT ADAPTATION:",
        "Preserve the SAME piece from the ORIGINAL ART reference: facts, essential text, brand, concept and visual direction stay intact.",
        `ONLY composition, scale and spatial distribution change to fit the target format ${input.format}.`,
        "DO NOT reinvent or reinterpret the concept, the brand, the facts or the essential text — this is a re-layout of the original piece, never a new creative.",
      ].join("\n");
    case "restyling": {
      const brandAuthority = input.factPack?.identity.brandAuthority ?? "active";
      const brandName = input.factPack?.identity.brandName?.trim() || null;
      const brandAuthorityLabel =
        brandAuthority === "source"
          ? `the brand of the content art${brandName ? ` (${brandName})` : ""} — user-chosen; the active workspace kit's required/prohibited elements do NOT apply`
          : `the active workspace brand${brandName ? ` (${brandName})` : ""} — its required/prohibited elements apply`;
      return [
        "MODE POLICY — RESTYLE:",
        `CONTENT AUTHORITY: ${referenceLabels(input.references, "content")} — the sole source of facts, subject, product, people, copy and essential elements; preserve them.`,
        `STYLE AUTHORITY: ${referenceLabels(input.references, "style")} — transfers ONLY abstract visual language: palette, typography, texture, light, rhythm and atmosphere.`,
        `BRAND AUTHORITY: ${brandAuthorityLabel}.`,
        "The STYLE AUTHORITY never transfers brand, product, copy, claims or a complete ad — factual contamination from the style source is a hard failure.",
      ].join("\n");
    }
    case "creative_revision":
      return [
        "MODE POLICY — REVISION:",
        "Apply the REVISION INSTRUCTION to the parent piece (the revision reference) while honoring the original contract in this prompt — every element the instruction does not name stays unchanged.",
        `REVISION INSTRUCTION: ${input.revisionInstruction?.trim() || "(none)"}`,
      ].join("\n");
    case "social_post":
      // Peça única: one direct high-quality call from request + active brand.
      return [
        "MODE POLICY — SINGLE PIECE:",
        "Transform the full request and the resolved brand into ONE branded piece, in high quality.",
        "The fact pack is the only factual authority; the brand kit governs identity. Optional references guide visually without adding facts.",
      ].join("\n");
  }
  // No `default` above: a future GenerationMode member becomes a compile error
  // here instead of silently falling into the SINGLE PIECE block.
  const exhaustiveModeCheck: never = input.mode;
  return exhaustiveModeCheck;
}

function buildObjectiveCorrectionBlock(
  correction: CreativeWorkObjectiveCorrection,
): string {
  return [
    "OBJECTIVE CORRECTION — SECOND AND FINAL CALL:",
    "This correction starts from the ORIGINAL prompt and sources above — it is NOT a generic refinement of the previous output and must not reinterpret anything the failure codes do not name.",
    "FAILURE CODES:",
    ...correction.codes.map((code) => `- ${code}`),
    `SURGICAL INSTRUCTIONS: ${correction.instructions}`,
    "Apply ONLY these corrections; every other element of the contract stays exactly as specified above.",
  ].join("\n");
}

/**
 * Soft prompt-size guard (observability only): the assembled prompt is never
 * truncated, but an oversized prompt is logged with its size and mode so
 * provider-side rejections can be correlated with prompt bulk.
 */
const PROMPT_SIZE_WARN_CHARS = 8000;

/**
 * Protocol-aware prompt for v1 direct Creative Work outputs (R-004). Fed by
 * the resolved mode, the frozen fact pack, the persisted creative level and
 * format, and the role-bound reference plan. Campaign/derivation prompts and
 * the legacy builder are untouched by this function.
 */
export function buildCreativeWorkPrompt(input: BuildCreativeWorkPromptInput): string {
  const fixedContract = buildFixedContract(input);
  const factPackBlock = buildFactPackBlock(input);
  const modePolicyBlock = buildModePolicyBlock(input);
  const referenceRolesBlock = buildReferenceRolesBlock(input.references);
  const brandKitBlock = buildBrandKitBlock(input.identitySnapshot.brandKit);
  const ruleModeBlock = buildRuleModeBlock(input.identitySnapshot.assets);
  const referenceModeBlock = buildReferenceModeBlock(input.identitySnapshot.assets);
  const reservedPlacementsBlock = buildReservedPlacementsBlock(
    input.identitySnapshot.assets,
  );

  const prompt = [
    `CREATIVE WORK ${input.mode.toUpperCase()} — VISUAL PROMPT`,
    "",
    factPackBlock,
    "",
    fixedContract,
    "",
    modePolicyBlock,
    "",
    referenceRolesBlock,
    "",
    brandKitBlock,
    "",
    ruleModeBlock,
    "",
    referenceModeBlock,
    "",
    reservedPlacementsBlock,
    ...(input.correction ? ["", buildObjectiveCorrectionBlock(input.correction)] : []),
  ].join("\n");

  if (prompt.length > PROMPT_SIZE_WARN_CHARS) {
    logger.warn(
      `[creativeWorkPrompt] oversized prompt mode=${input.mode} chars=${prompt.length} threshold=${PROMPT_SIZE_WARN_CHARS}`,
    );
  }

  return prompt;
}
