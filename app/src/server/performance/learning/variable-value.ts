import type { DerivationRow } from "./aggregate";

export function normalizeVariableKey(variableKey: string): string {
  const key = variableKey.trim().toLowerCase();
  if (key === "cta_text") return "cta";
  if (key === "generation_mode") return "recipe";
  if (key === "style_intensity") return "style";
  return key;
}

export function extractVariableValue(
  variableKey: string,
  derivation: DerivationRow,
  campaign: { generationMode: string; styleIntensity: string }
): string | null {
  const key = normalizeVariableKey(variableKey);

  switch (key) {
    case "cta":
      return derivation.ctaText?.trim() || null;
    case "format":
      return derivation.format?.trim() || null;
    case "recipe":
      return (
        derivation.generationMode?.trim() ||
        campaign.generationMode?.trim() ||
        null
      );
    case "style":
      return (
        campaign.styleIntensity?.trim() ||
        derivation.styleAssetId?.trim() ||
        null
      );
    default:
      return null;
  }
}

export function buildLearningStatement(input: {
  variableKey: string;
  variableValue: string;
  primaryMetric: string;
  expectedDirection: "increase" | "decrease" | null;
  confidence: string;
  supportingCount: number;
  contradictingCount: number;
}): string {
  const metric = input.primaryMetric.toUpperCase();
  const direction =
    input.expectedDirection === "decrease" ? "reduzir" : "aumentar";
  const variable = normalizeVariableKey(input.variableKey);
  const label =
    variable === "cta"
      ? `CTA "${input.variableValue}"`
      : variable === "format"
        ? `formato ${input.variableValue}`
        : variable === "recipe"
          ? `receita ${input.variableValue}`
          : variable === "style"
            ? `estilo ${input.variableValue}`
            : `${variable}=${input.variableValue}`;

  return `${label} tende a ${direction} ${metric} (${input.confidence}; ${input.supportingCount} evidência(s) favorável(is), ${input.contradictingCount} contraditória(s)).`;
}
