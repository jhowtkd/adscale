import type { CreativeContract, SourcePackage } from "./creative-contract";
import type { CanonicalCampaignAllowedEntities } from "./creative-corpus";
import type { CreativeHardFailureCode } from "./creative-quality-gate";

export type InputSourceRole =
  | "factual_base"
  | "visual_reference"
  | "brand_kit"
  | "auxiliary_reference";

export type InputSourceClassification = {
  factualBase: { role: InputSourceRole; label: string };
  visualReference: { role: InputSourceRole; label: string } | null;
  brandKit: { role: InputSourceRole; label: string } | null;
  auxiliaryReferences: { role: InputSourceRole; count: number; label: string };
};

export const CONTAMINATION_FAILURE_CODES: ReadonlySet<CreativeHardFailureCode> =
  new Set([
    "copied_style_reference_facts",
    "wrong_brand",
    "unsupported_offer",
    "invented_factual_entity",
  ]);

export type ResolveInputSourceClassificationContext = {
  hasBrandKit: boolean;
  clientReferenceCount: number;
  packageSource?: SourcePackage;
};

export function resolveInputSourceClassification(
  contract: CreativeContract,
  ctx: ResolveInputSourceClassificationContext
): InputSourceClassification {
  const packageSource =
    ctx.packageSource ?? contract.sourcePackage ?? "campaign_asset";

  const factualSourceLabel =
    packageSource === "approved_derivation"
      ? "approved parent derivation output (visual facts only if parent passed factual gate)"
      : "campaign base asset";

  const visualReference =
    contract.styleAssetId != null
      ? {
          role: "visual_reference" as const,
          label:
            "style_reference asset — abstract style only (see VISUAL REFERENCE TRANSFER RULE)",
        }
      : null;

  const brandKit = ctx.hasBrandKit
    ? {
        role: "brand_kit" as const,
        label: "palette, typography, tone — not factual claims",
      }
    : null;

  const auxiliaryCount = ctx.clientReferenceCount;

  return {
    factualBase: {
      role: "factual_base",
      label: factualSourceLabel,
    },
    visualReference,
    brandKit,
    auxiliaryReferences: {
      role: "auxiliary_reference",
      count: auxiliaryCount,
      label:
        auxiliaryCount > 0
          ? "layout/mood guidance only; never override factual base"
          : "none",
    },
  };
}

function indexOfEarliestMarker(
  prompt: string,
  fromIndex: number,
  markers: string[]
): number {
  let end = prompt.length;
  for (const marker of markers) {
    const idx = prompt.indexOf(marker, fromIndex);
    if (idx !== -1 && idx < end) {
      end = idx;
    }
  }
  return end;
}

export function buildVisualReferenceTransferRuleSection(
  options?: { hasClientStyleReferences?: boolean }
): string[] {
  const lines = [
    "",
    "VISUAL REFERENCE TRANSFER RULE:",
    "The style reference is visual-only — transfer abstract design attributes, never factual content.",
    "The base image remains the sole factual source for people, products, brands, logos, copy, offers, CTAs, and claims.",
    "ALLOWLIST (abstract style attributes only): ritmo/rhythm, textura/texture, cromia/chroma, tipografia/typography, iluminação/lighting, lógica compositiva/compositional logic.",
    "DENYLIST (never copy from style reference): pessoas/people, uniformes/uniforms, produtos/products, marcas/brands, logos, textos/texts, alegações/claims.",
    "Never copy factual content from the style reference.",
  ];

  if (options?.hasClientStyleReferences) {
    lines.push(
      "Client library style references are visual-only auxiliary guidance — same allowlist/denylist as the style reference asset."
    );
  }

  return lines;
}

export function extractPromptVisualReferenceTransferSection(
  prompt: string
): string {
  const header = "VISUAL REFERENCE TRANSFER RULE:";
  const start = prompt.indexOf(header);
  if (start === -1) return "";

  const end = indexOfEarliestMarker(prompt, start + header.length, [
    "\nRESTYLING FACTUAL-SOURCE RULE:",
    "\nMODE:",
    "\n\nCampaign:",
  ]);
  return prompt.slice(start, end).trimEnd();
}

export function buildInputClassificationPromptSection(
  classification: InputSourceClassification
): string[] {
  const lines = [
    "",
    "INPUT SOURCE CLASSIFICATION:",
    `- Factual base: ${classification.factualBase.label} — sole source of people, products, brands, logos, copy, offers, CTAs, claims.`,
  ];

  if (classification.visualReference) {
    lines.push(`- Visual reference: ${classification.visualReference.label}.`);
  } else {
    lines.push("- Visual reference: none.");
  }

  if (classification.brandKit) {
    lines.push(`- Brand kit: ${classification.brandKit.label}.`);
  } else {
    lines.push("- Brand kit: not attached.");
  }

  if (classification.auxiliaryReferences.count > 0) {
    lines.push(
      `- Auxiliary references (${classification.auxiliaryReferences.count}): ${classification.auxiliaryReferences.label}.`
    );
  } else {
    lines.push("- Auxiliary references: none.");
  }

  return lines;
}

export function extractPromptInputClassificationSection(prompt: string): string {
  const header = "INPUT SOURCE CLASSIFICATION:";
  const start = prompt.indexOf(header);
  if (start === -1) return "";
  const end = indexOfEarliestMarker(prompt, start + header.length, [
    "\nALLOWED ENTITIES (do not invent beyond this list):",
    "\nVISUAL REFERENCE TRANSFER RULE:",
    "\nRESTYLING FACTUAL-SOURCE RULE:",
    "\nMODE:",
  ]);
  return prompt.slice(start, end).trimEnd();
}

export function buildAllowedEntitiesPromptSection(
  entities: CanonicalCampaignAllowedEntities
): string[] {
  const lines = [
    "",
    "ALLOWED ENTITIES (do not invent beyond this list):",
  ];

  if (entities.people.length > 0) {
    lines.push(`- People: ${entities.people.join("; ")}`);
  }
  if (entities.brands.length > 0) {
    lines.push(`- Brands: ${entities.brands.join("; ")}`);
  }
  if (entities.products.length > 0) {
    lines.push(`- Products: ${entities.products.join("; ")}`);
  }
  if (entities.claims.length > 0) {
    lines.push(`- Claims: ${entities.claims.join("; ")}`);
  }

  return lines;
}

export function extractPromptAllowedEntitiesSection(prompt: string): string {
  const header = "ALLOWED ENTITIES (do not invent beyond this list):";
  const start = prompt.indexOf(header);
  if (start === -1) return "";
  const end = indexOfEarliestMarker(prompt, start + header.length, [
    "\nVISUAL REFERENCE TRANSFER RULE:",
    "\nRESTYLING FACTUAL-SOURCE RULE:",
    "\nMODE:",
    "\n\nCampaign:",
  ]);
  return prompt.slice(start, end).trimEnd();
}
