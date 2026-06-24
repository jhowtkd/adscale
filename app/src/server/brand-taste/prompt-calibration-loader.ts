import { RULE_CATEGORIES } from "./calibration-signal-types";
import { buildBrandTasteProfile } from "./taste-profile";
import {
  buildBrandTastePromptSection,
  selectApplicableRules,
} from "./taste-application";
import { buildCorpusQualityPromptSection } from "@/server/human-quality/learning/corpus-quality-prompt";
import { listApprovedCalibrationRulesByCategories } from "@/server/repositories/calibration-rule";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";

const BRAND_TASTE_CATEGORIES = RULE_CATEGORIES.filter((c) => c !== "corpus_quality");
const MAX_CORPUS_QUALITY_RULES = 10;

export interface PromptCalibrationContext {
  brandTasteSection: string[];
  corpusQualitySection: string[];
  appliedBrandRuleIds: string[];
  appliedCorpusRuleIds: string[];
}

export async function loadPromptCalibrationContext(input: {
  workspaceId: string;
  clientProfileId: string | null;
}): Promise<PromptCalibrationContext> {
  if (!input.clientProfileId) {
    return {
      brandTasteSection: [],
      corpusQualitySection: [],
      appliedBrandRuleIds: [],
      appliedCorpusRuleIds: [],
    };
  }

  const [signals, brandRules, corpusRules] = await Promise.all([
    listCalibrationSignalsForClientProfile({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    }),
    listApprovedCalibrationRulesByCategories({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      categories: [...BRAND_TASTE_CATEGORIES],
    }),
    listApprovedCalibrationRulesByCategories({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      categories: ["corpus_quality"],
    }),
  ]);

  const profile = buildBrandTasteProfile({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    signals,
  });
  const brandApply = selectApplicableRules({ approvedRules: brandRules, profile });

  const appliedBrandRules = brandRules.filter((rule) =>
    brandApply.appliedRuleIds.includes(rule.id)
  );
  const brandTasteSection =
    appliedBrandRules.length > 0
      ? buildBrandTastePromptSection(
          appliedBrandRules.map((rule) => ({
            id: rule.id,
            category: rule.category,
            rationale: rule.rationale,
          }))
        )
      : [];

  const cappedCorpusRules = corpusRules.slice(0, MAX_CORPUS_QUALITY_RULES);
  const corpusQualitySection = buildCorpusQualityPromptSection(cappedCorpusRules);

  return {
    brandTasteSection,
    corpusQualitySection,
    appliedBrandRuleIds: brandApply.appliedRuleIds,
    appliedCorpusRuleIds: cappedCorpusRules.map((rule) => rule.id),
  };
}
