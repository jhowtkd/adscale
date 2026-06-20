import type { CalibrationRule } from "@/server/db/schema";
import type { BrandTasteProfile, RuleCategory } from "./calibration-signal-types";
import { ruleConstraintText } from "./rule-extraction";

export interface TasteApplicationResult {
  appliedRuleIds: string[];
  constraintLines: string[];
  explanationRefs: string[];
}

export function buildBrandTastePromptSection(
  rules: Array<{ id: string; category: string; rationale: string }>
): string[] {
  if (rules.length === 0) {
    return [];
  }

  return [
    "BRAND TASTE CONSTRAINTS (approved calibration rules — bounded, do not override export safety):",
    ...rules.map((rule) =>
      ruleConstraintText({
        id: rule.id,
        category: rule.category as RuleCategory,
        rationale: rule.rationale,
      })
    ),
    "These constraints refine brand-specific taste on top of global Olhar ADScale. Do not weaken factual text, CTA spelling, or export compliance.",
  ];
}

export function applyBrandTasteToVerdictExplanation(input: {
  baseExplanation: string;
  appliedRules: Pick<CalibrationRule, "id" | "category" | "rationale">[];
}): string {
  if (input.appliedRules.length === 0) {
    return input.baseExplanation;
  }

  const refs = input.appliedRules.map((rule) => `rule:${rule.id}`).join(", ");
  return `${input.baseExplanation} [brand-taste rules: ${refs}]`;
}

export function selectApplicableRules(input: {
  approvedRules: CalibrationRule[];
  profile: BrandTasteProfile | null;
}): TasteApplicationResult {
  if (!input.profile || input.profile.evidenceLevel === "uncalibrated") {
    return { appliedRuleIds: [], constraintLines: [], explanationRefs: [] };
  }

  const rules = input.approvedRules.filter((rule) => rule.status === "approved");
  const constraintLines = buildBrandTastePromptSection(rules);

  return {
    appliedRuleIds: rules.map((r) => r.id),
    constraintLines,
    explanationRefs: rules.map((r) => `rule:${r.id}`),
  };
}

export function mergeOlharAndBrandTasteSections(input: {
  olharSection: string[];
  brandTasteSection: string[];
}): string[] {
  return [...input.olharSection, ...input.brandTasteSection];
}
