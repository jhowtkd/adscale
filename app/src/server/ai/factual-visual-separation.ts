import type { CreativeContract, SourcePackage } from "./creative-contract";
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
  const end = prompt.indexOf("\nMODE:", start);
  return prompt.slice(start, end === -1 ? undefined : end).trimEnd();
}
