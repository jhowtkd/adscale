import type {
  CreativeHypothesis,
  HypothesisVariant,
  VariantComparison,
} from "../../db/schema";
import {
  computeLearningConfidence,
  shouldApproveLearning,
} from "./confidence";
import type {
  DerivedLearningDraft,
  LearningEvidenceRef,
  LearningStatus,
} from "./types";
import { LEARNING_ALGORITHM_VERSION } from "./types";
import {
  buildLearningStatement,
  extractVariableValue,
  normalizeVariableKey,
} from "./variable-value";

export interface DerivationRow {
  id: string;
  campaignId: string;
  format: string | null;
  generationMode: string | null;
  ctaText: string | null;
  styleAssetId: string | null;
}

export interface ComparisonEvidenceInput {
  comparison: VariantComparison;
  hypothesis: CreativeHypothesis | null;
  variants: HypothesisVariant[];
  derivations: Map<string, DerivationRow>;
  campaigns: Map<
    string,
    {
      id: string;
      name: string;
      objective: string | null;
      generationMode: string;
      styleIntensity: string;
    }
  >;
}

function learningGroupKey(
  variableKey: string,
  variableValue: string,
  primaryMetric: string
) {
  return `${normalizeVariableKey(variableKey)}::${variableValue.trim().toLowerCase()}::${primaryMetric}`;
}

function impressionsFromComparison(comparison: VariantComparison): number {
  const report = comparison.variantResults;
  if (!report?.variants?.length) return 0;
  return report.variants.reduce(
    (sum, variant) => sum + Number(variant.raw.impressions ?? 0),
    0
  );
}

function buildEvidenceRef(input: {
  comparison: VariantComparison;
  hypothesis: CreativeHypothesis | null;
  campaign: { id: string; name: string; objective: string | null };
  derivationId: string;
  variableKey: string;
  variableValue: string;
  polarity: LearningEvidenceRef["polarity"];
}): LearningEvidenceRef {
  return {
    comparisonId: input.comparison.id,
    hypothesisId: input.comparison.hypothesisId,
    campaignId: input.campaign.id,
    campaignName: input.campaign.name,
    derivationId: input.derivationId,
    variableValue: input.variableValue,
    polarity: input.polarity,
    outcome: input.comparison.outcome,
    verdict: input.comparison.verdict,
    primaryMetric: input.comparison.primaryMetric,
    impressions: impressionsFromComparison(input.comparison),
    platform: input.comparison.platform,
    objective: input.campaign.objective ?? input.comparison.variantResults?.objective ?? null,
    periodStart: input.comparison.periodStart,
    periodEnd: input.comparison.periodEnd,
    recordedAt: input.comparison.createdAt.toISOString(),
    variableKey: normalizeVariableKey(input.variableKey),
  };
}

export function extractEvidenceFromComparison(
  input: ComparisonEvidenceInput
): LearningEvidenceRef[] {
  const { comparison, hypothesis, variants, derivations, campaigns } = input;

  if (comparison.kind !== "controlled_hypothesis" || !hypothesis) {
    return [];
  }

  if (
    comparison.verdict !== "winner" ||
    !comparison.outcome ||
    comparison.outcome === "inconclusive"
  ) {
    return [];
  }

  const campaign = campaigns.get(comparison.campaignId);
  if (!campaign) return [];

  const variantDerivation =
    variants.find((v) => v.role === "variant") ??
    variants.find((v) => v.role === "control");
  if (!variantDerivation) return [];

  const derivation = derivations.get(variantDerivation.derivationId);
  if (!derivation) return [];

  const variableValue = extractVariableValue(
    hypothesis.variableKey,
    derivation,
    campaign
  );
  if (!variableValue) return [];

  const polarity: LearningEvidenceRef["polarity"] =
    comparison.outcome === "supported" ? "supporting" : "contradicting";

  return [
    buildEvidenceRef({
      comparison,
      hypothesis,
      campaign,
      derivationId: variantDerivation.derivationId,
      variableKey: hypothesis.variableKey,
      variableValue,
      polarity,
    }),
  ];
}

export function aggregateLearningsFromComparisons(
  inputs: ComparisonEvidenceInput[]
): DerivedLearningDraft[] {
  const evidence = inputs.flatMap((input) => extractEvidenceFromComparison(input));

  const groups = new Map<
    string,
    {
      variableKey: string;
      variableValue: string;
      primaryMetric: string;
      expectedDirection: "increase" | "decrease" | null;
      supporting: LearningEvidenceRef[];
      contradicting: LearningEvidenceRef[];
    }
  >();

  for (const item of evidence) {
    const variableKey = normalizeVariableKey(item.variableKey);
    const groupKey = learningGroupKey(
      variableKey,
      item.variableValue,
      item.primaryMetric
    );

    const input = inputs.find(
      (candidate) => candidate.comparison.id === item.comparisonId
    );
    const expectedDirection =
      (input?.hypothesis?.expectedDirection as "increase" | "decrease" | null) ??
      null;

    const bucket =
      groups.get(groupKey) ??
      {
        variableKey,
        variableValue: item.variableValue,
        primaryMetric: item.primaryMetric,
        expectedDirection,
        supporting: [],
        contradicting: [],
      };

    if (item.polarity === "supporting") {
      bucket.supporting.push(item);
    } else {
      bucket.contradicting.push(item);
    }
    groups.set(groupKey, bucket);
  }

  const drafts: DerivedLearningDraft[] = [];

  for (const group of groups.values()) {
    const supporting = [...group.supporting].sort((a, b) =>
      b.recordedAt.localeCompare(a.recordedAt)
    );
    const contradicting = [...group.contradicting].sort((a, b) =>
      b.recordedAt.localeCompare(a.recordedAt)
    );
    const { confidence, confidenceScore } = computeLearningConfidence(
      supporting,
      contradicting
    );

    const campaignIds = new Set([
      ...supporting.map((item) => item.campaignId),
      ...contradicting.map((item) => item.campaignId),
    ]);
    const platforms = [
      ...new Set(
        [...supporting, ...contradicting]
          .map((item) => item.platform)
          .filter((value): value is string => Boolean(value))
      ),
    ];
    const objectives = [
      ...new Set(
        [...supporting, ...contradicting]
          .map((item) => item.objective)
          .filter((value): value is string => Boolean(value))
      ),
    ];
    const sampleImpressions = supporting.reduce(
      (sum, item) => sum + item.impressions,
      0
    );
    const lastEvidenceAt = [...supporting, ...contradicting]
      .map((item) => new Date(item.recordedAt))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const status: LearningStatus = shouldApproveLearning(
      supporting,
      contradicting,
      confidence
    )
      ? "approved"
      : "draft";

    drafts.push({
      variableKey: group.variableKey,
      variableValue: group.variableValue,
      primaryMetric: group.primaryMetric,
      expectedDirection: group.expectedDirection,
      statement: buildLearningStatement({
        variableKey: group.variableKey,
        variableValue: group.variableValue,
        primaryMetric: group.primaryMetric,
        expectedDirection: group.expectedDirection,
        confidence,
        supportingCount: supporting.length,
        contradictingCount: contradicting.length,
      }),
      confidence,
      confidenceScore,
      sampleImpressions,
      sampleCampaignCount: campaignIds.size,
      contextPlatforms: platforms,
      contextObjectives: objectives,
      supportingEvidence: supporting,
      contradictingEvidence: contradicting,
      lastEvidenceAt,
      status,
    });
  }

  return drafts;
}

export { LEARNING_ALGORITHM_VERSION };
