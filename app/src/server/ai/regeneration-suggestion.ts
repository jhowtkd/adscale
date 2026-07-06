import type { CreativeContract } from "./creative-contract";
import { buildRegenerationPreservationInstruction } from "./canonical-creative-contract";

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

  if (input.contract) {
    parts.push(buildRegenerationPreservationInstruction(input.contract));
  } else {
    const fmt = input.format ?? "unknown";
    const mode = input.generationMode ?? "unknown";
    const cta = input.ctaText ?? "none";
    parts.push(
      `Preserve campaign facts, the ${fmt} format, and the ${mode} generation mode. If a CTA is rendered, preserve action intent for "${cta}" without requiring literal wording.`
    );
  }

  if (input.contract?.generationMode === "restyling") {
    if (input.contract.baseAssetId) parts.push(`Base asset: ${input.contract.baseAssetId}.`);
    if (input.contract.styleAssetId) parts.push(`Style reference: ${input.contract.styleAssetId}.`);
  }

  return parts.join(" ");
}
