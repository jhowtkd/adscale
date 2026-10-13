import { RULE_CATEGORIES } from "./calibration-signal-types";
import { hashGuidanceContent, type LearnedGuidanceRef } from "./learned-guidance";
import { buildBrandTasteProfile } from "./taste-profile";
import {
  buildBrandTastePromptSection,
  selectApplicableRules,
} from "./taste-application";
import {
  buildCorpusQualityPromptSection,
  MAX_CORPUS_QUALITY_RULES,
} from "@/server/human-quality/learning/corpus-quality-prompt";
import { listApprovedCalibrationRulesByCategories } from "@/server/repositories/calibration-rule";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import {
  requireLocalLearningAuthorization,
  type LocalLearningAuthorizationPort,
  type LocalLearningScope,
} from "./local-learning-authorization";

const BRAND_TASTE_CATEGORIES = RULE_CATEGORIES.filter((c) => c !== "corpus_quality");

export interface PromptCalibrationContext {
  brandTasteSection: string[];
  corpusQualitySection: string[];
  appliedBrandRuleIds: string[];
  appliedCorpusRuleIds: string[];
  appliedRefs: LearnedGuidanceRef[];
}

// New consumers enter here; legacy derivation keeps its existing loader and behavior.
export async function loadLocalLearningPromptCalibrationContext(
  input: LocalLearningScope,
  authorize?: LocalLearningAuthorizationPort
): Promise<PromptCalibrationContext> {
  await requireLocalLearningAuthorization(input, authorize);
  return loadPromptCalibrationContext(input);
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
      appliedRefs: [],
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

  const sortedCorpusRules = [...corpusRules]
    .sort(
      (a, b) =>
        (a.approvedAt ?? a.createdAt).getTime() - (b.approvedAt ?? b.createdAt).getTime()
    )
    .slice(-MAX_CORPUS_QUALITY_RULES);
  const corpusQualitySection = buildCorpusQualityPromptSection(sortedCorpusRules);

  return {
    brandTasteSection,
    corpusQualitySection,
    appliedBrandRuleIds: brandApply.appliedRuleIds,
    appliedCorpusRuleIds: sortedCorpusRules.map((rule) => rule.id),
    appliedRefs: [...appliedBrandRules, ...sortedCorpusRules].map((rule) => ({
      ruleId: rule.id,
      revision: "legacy",
      contentHash: hashGuidanceContent(rule.rationale),
    })),
  };
}
