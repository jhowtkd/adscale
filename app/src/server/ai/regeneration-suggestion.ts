import type { CreativeContract } from "./creative-contract";

export function ctaTextFromContract(contract: CreativeContract): string | null {
  if (contract.ctaSemantics.kind === "explicit") {
    return contract.ctaSemantics.text;
  }
  return null;
}

export interface BuildSuggestionInput {
  ctaText: string | null | undefined;
  format: string | null | undefined;
  generationMode: string | null | undefined;
  scoreIssues: string[];
  modelSuggestion: string;
  contract?: CreativeContract | null;
}

export function buildRegenerationSuggestion(input: BuildSuggestionInput): string {
  const parts: string[] = [];

  if (input.scoreIssues.length > 0) {
    parts.push(`Issues: ${input.scoreIssues.join("; ")}.`);
  }

  parts.push(`Suggestion: ${input.modelSuggestion}`);

  const fmt = input.contract?.targetFormat ?? input.format ?? "unknown";
  const mode = input.contract?.generationMode ?? input.generationMode ?? "unknown";

  const ctaSemantics = input.contract?.ctaSemantics;
  if (ctaSemantics?.kind === "explicit") {
    parts.push(
      `Preserve the exact CTA "${ctaSemantics.text}", the ${fmt} format, and the ${mode} generation mode.`
    );
  } else if (ctaSemantics?.kind === "inherited") {
    parts.push(
      `Preserve the CTA from the base creative (do not invent or drop the CTA), the ${fmt} format, and the ${mode} generation mode.`
    );
  } else {
    const cta = input.ctaText ?? "none";
    parts.push(`Preserve the exact CTA "${cta}", the ${fmt} format, and the ${mode} generation mode.`);
  }

  if (input.contract?.generationMode === "restyling") {
    if (input.contract.baseAssetId) parts.push(`Base asset: ${input.contract.baseAssetId}.`);
    if (input.contract.styleAssetId) parts.push(`Style reference: ${input.contract.styleAssetId}.`);
  }

  return parts.join(" ");
}
