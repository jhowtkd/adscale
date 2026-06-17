import type { OutputDecisionEvent } from "../db/schema";
import type { OutputDecisionSnapshot } from "./output-decision-events";
import {
  OUTPUT_SUPPORTED_VARIABLE_KEYS,
  type OutputSupportedVariableKey,
} from "./types";

export function normalizeOutputVariableKey(
  variableKey: string
): OutputSupportedVariableKey | null {
  const key = variableKey.trim().toLowerCase();
  if (key === "cta_text") return "cta";
  if (key === "recipe") return "generation_mode";
  if (key === "style" || key === "style_intensity") return "style_policy";
  if ((OUTPUT_SUPPORTED_VARIABLE_KEYS as readonly string[]).includes(key)) {
    return key as OutputSupportedVariableKey;
  }
  return null;
}

export function normalizeScopeValue(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || "";
}

export interface ExtractedVariable {
  variableKey: OutputSupportedVariableKey;
  variableValue: string;
}

export function extractVariablesFromEvent(
  event: OutputDecisionEvent
): ExtractedVariable[] {
  const snapshot = event.contextSnapshot as OutputDecisionSnapshot;
  const results: ExtractedVariable[] = [];

  const cta = snapshot.ctaText?.trim();
  if (cta) {
    results.push({ variableKey: "cta", variableValue: cta });
  }

  const format = snapshot.format?.trim();
  if (format) {
    results.push({ variableKey: "format", variableValue: format });
  }

  const mode = snapshot.generationMode?.trim();
  if (mode) {
    results.push({ variableKey: "generation_mode", variableValue: mode });
  }

  const reasonCode =
    snapshot.reason?.code?.trim() ||
    snapshot.hardFailures?.[0]?.code?.trim() ||
    null;
  if (reasonCode) {
    results.push({ variableKey: "avoid_pattern", variableValue: reasonCode });
  }

  return results;
}

export function buildOutputLearningStatement(input: {
  variableKey: string;
  variableValue: string;
  preferenceDirection: "prefer" | "avoid";
  confidence: string;
  supportingCount: number;
  contradictingCount: number;
  scopeGenerationMode: string;
  scopeFormat: string;
}): string {
  const scopeParts: string[] = [];
  if (input.scopeGenerationMode) {
    scopeParts.push(`modo ${input.scopeGenerationMode}`);
  }
  if (input.scopeFormat) {
    scopeParts.push(`formato ${input.scopeFormat}`);
  }
  const scopeSuffix =
    scopeParts.length > 0 ? ` (${scopeParts.join(", ")})` : "";

  const variable = normalizeOutputVariableKey(input.variableKey) ?? input.variableKey;
  const label =
    variable === "cta"
      ? `CTA "${input.variableValue}"`
      : variable === "format"
        ? `formato ${input.variableValue}`
        : variable === "generation_mode"
          ? `modo ${input.variableValue}`
          : variable === "style_policy"
            ? `política de estilo ${input.variableValue}`
            : variable === "avoid_pattern"
              ? `padrão ${input.variableValue}`
              : `${variable}=${input.variableValue}`;

  const verb = input.preferenceDirection === "avoid" ? "evitar" : "preferir";

  return `${verb} ${label}${scopeSuffix} (${input.confidence}; ${input.supportingCount} evidência(s) favorável(is), ${input.contradictingCount} contraditória(s)).`;
}
