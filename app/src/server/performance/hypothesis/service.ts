import { getCampaignById } from "../../repositories/campaign";
import { getDerivationById } from "../../repositories/derivation";
import {
  createHypothesis,
  deleteHypothesis,
  getHypothesisById,
  listComparisonsByCampaign,
  listHypothesesByCampaign,
  replaceHypothesisVariants,
  saveVariantComparison,
  updateHypothesis,
  type HypothesisWithVariants,
} from "../../repositories/hypothesis";
import { listPerformanceSnapshotsByDerivation } from "../../repositories/performance";
import type { CreativePerformanceSnapshot } from "../../db/schema";
import { compareVariants } from "./compare";
import type { VariantComparisonReport } from "./types";
import type {
  CreateHypothesisInput,
  ObservationalComparisonInput,
  UpdateHypothesisInput,
} from "./validation";

export class HypothesisDomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
    this.name = "HypothesisDomainError";
  }
}

async function loadSnapshotsMap(
  derivationIds: string[],
  workspaceId: string
): Promise<Map<string, CreativePerformanceSnapshot[]>> {
  const entries = await Promise.all(
    derivationIds.map(async (id) => {
      const snaps = await listPerformanceSnapshotsByDerivation(id, workspaceId);
      return [id, snaps] as const;
    })
  );
  return new Map(entries);
}

async function validateDerivationsForCampaign(
  campaignId: string,
  workspaceId: string,
  derivationIds: string[]
): Promise<void> {
  for (const derivationId of derivationIds) {
    const derivation = await getDerivationById(derivationId, workspaceId);
    if (!derivation) {
      throw new HypothesisDomainError("hypothesisDerivationNotFound", 404);
    }
    if (derivation.campaignId !== campaignId) {
      throw new HypothesisDomainError("hypothesisDerivationCampaignMismatch", 409);
    }
  }
}

export async function createCampaignHypothesis(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  data: CreateHypothesisInput;
}): Promise<HypothesisWithVariants> {
  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    throw new HypothesisDomainError("hypothesisCampaignNotFound", 404);
  }

  await validateDerivationsForCampaign(
    input.campaignId,
    input.workspaceId,
    input.data.variants.map((v) => v.derivationId)
  );

  return createHypothesis(
    {
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      title: input.data.title ?? null,
      variableKey: input.data.variableKey,
      primaryMetric: input.data.primaryMetric,
      expectedDirection: input.data.expectedDirection,
      rationale: input.data.rationale,
      kind: input.data.kind,
      platform: input.data.platform ?? null,
      periodStart: input.data.periodStart ?? null,
      periodEnd: input.data.periodEnd ?? null,
      outcome: null,
      status: "active",
      createdByUserId: input.userId,
    },
    input.data.variants.map((v) => ({
      derivationId: v.derivationId,
      role: v.role,
      label: v.label ?? null,
    }))
  );
}

export async function updateCampaignHypothesis(input: {
  workspaceId: string;
  campaignId: string;
  hypothesisId: string;
  data: UpdateHypothesisInput;
}): Promise<HypothesisWithVariants> {
  const existing = await getHypothesisById(input.hypothesisId, input.workspaceId);
  if (!existing || existing.campaignId !== input.campaignId) {
    throw new HypothesisDomainError("hypothesisNotFound", 404);
  }

  if (input.data.variants) {
    await validateDerivationsForCampaign(
      input.campaignId,
      input.workspaceId,
      input.data.variants.map((v) => v.derivationId)
    );
    await replaceHypothesisVariants(
      input.hypothesisId,
      input.data.variants.map((v) => ({
        derivationId: v.derivationId,
        role: v.role,
        label: v.label ?? null,
      }))
    );
  }

  const { variants: _variants, ...patch } = input.data;
  if (Object.keys(patch).length > 0) {
    await updateHypothesis(input.hypothesisId, input.workspaceId, {
      title: patch.title,
      variableKey: patch.variableKey,
      primaryMetric: patch.primaryMetric,
      expectedDirection: patch.expectedDirection,
      rationale: patch.rationale,
      kind: patch.kind,
      platform: patch.platform,
      periodStart: patch.periodStart,
      periodEnd: patch.periodEnd,
    });
  }

  const updated = await getHypothesisById(input.hypothesisId, input.workspaceId);
  if (!updated) {
    throw new HypothesisDomainError("hypothesisNotFound", 404);
  }
  return updated;
}

export async function removeCampaignHypothesis(input: {
  workspaceId: string;
  campaignId: string;
  hypothesisId: string;
}): Promise<void> {
  const existing = await getHypothesisById(input.hypothesisId, input.workspaceId);
  if (!existing || existing.campaignId !== input.campaignId) {
    throw new HypothesisDomainError("hypothesisNotFound", 404);
  }
  await deleteHypothesis(input.hypothesisId, input.workspaceId);
}

export async function listCampaignHypotheses(input: {
  workspaceId: string;
  campaignId: string;
}): Promise<HypothesisWithVariants[]> {
  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    throw new HypothesisDomainError("hypothesisCampaignNotFound", 404);
  }
  return listHypothesesByCampaign(input.campaignId, input.workspaceId);
}

export async function runHypothesisComparison(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  hypothesisId: string;
}): Promise<{ report: VariantComparisonReport; comparisonId: string }> {
  const [campaign, hypothesis] = await Promise.all([
    getCampaignById(input.campaignId, input.workspaceId),
    getHypothesisById(input.hypothesisId, input.workspaceId),
  ]);

  if (!campaign) {
    throw new HypothesisDomainError("hypothesisCampaignNotFound", 404);
  }
  if (!hypothesis || hypothesis.campaignId !== input.campaignId) {
    throw new HypothesisDomainError("hypothesisNotFound", 404);
  }
  if (hypothesis.variants.length < 2) {
    throw new HypothesisDomainError("hypothesisInsufficientVariants", 400);
  }

  const derivationIds = hypothesis.variants.map((v) => v.derivationId);
  const snapshotsByDerivation = await loadSnapshotsMap(
    derivationIds,
    input.workspaceId
  );

  const report = compareVariants({
    kind: "controlled_hypothesis",
    campaignId: input.campaignId,
    campaignObjective: campaign.objective,
    platform: hypothesis.platform,
    periodStart: hypothesis.periodStart,
    periodEnd: hypothesis.periodEnd,
    primaryMetric: hypothesis.primaryMetric as VariantComparisonReport["primaryMetric"],
    expectedDirection: hypothesis.expectedDirection as "increase" | "decrease",
    variants: hypothesis.variants.map((v) => ({
      derivationId: v.derivationId,
      campaignId: input.campaignId,
      role: v.role as "control" | "variant",
      label: v.label,
    })),
    snapshotsByDerivation,
  });

  const saved = await saveVariantComparison({
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
    hypothesisId: hypothesis.id,
    kind: "controlled_hypothesis",
    verdict: report.verdict,
    primaryMetric: report.primaryMetric,
    expectedDirection: report.expectedDirection,
    winnerDerivationId: report.winnerDerivationId,
    outcome: report.outcome,
    platform: report.platform,
    periodStart: report.period?.startDate ?? null,
    periodEnd: report.period?.endDate ?? null,
    exclusionReasons: report.exclusions,
    variantResults: report,
    createdByUserId: input.userId,
  });

  await updateHypothesis(hypothesis.id, input.workspaceId, {
    outcome: report.outcome,
    lastComparisonAt: new Date(),
    status: "concluded",
  });

  return { report, comparisonId: saved.id };
}

export async function runObservationalComparison(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  data: ObservationalComparisonInput;
}): Promise<{ report: VariantComparisonReport; comparisonId: string }> {
  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    throw new HypothesisDomainError("hypothesisCampaignNotFound", 404);
  }

  await validateDerivationsForCampaign(
    input.campaignId,
    input.workspaceId,
    input.data.derivationIds
  );

  const snapshotsByDerivation = await loadSnapshotsMap(
    input.data.derivationIds,
    input.workspaceId
  );

  const report = compareVariants({
    kind: "observational",
    campaignId: input.campaignId,
    campaignObjective: campaign.objective,
    platform: input.data.platform ?? null,
    periodStart: input.data.periodStart ?? null,
    periodEnd: input.data.periodEnd ?? null,
    primaryMetric: input.data.primaryMetric,
    expectedDirection: null,
    variants: input.data.derivationIds.map((derivationId, index) => ({
      derivationId,
      campaignId: input.campaignId,
      role: "observational",
      label: `Variante ${index + 1}`,
    })),
    snapshotsByDerivation,
  });

  const saved = await saveVariantComparison({
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
    hypothesisId: null,
    kind: "observational",
    verdict: report.verdict,
    primaryMetric: report.primaryMetric,
    expectedDirection: null,
    winnerDerivationId: report.winnerDerivationId,
    outcome: null,
    platform: report.platform,
    periodStart: report.period?.startDate ?? null,
    periodEnd: report.period?.endDate ?? null,
    exclusionReasons: report.exclusions,
    variantResults: report,
    createdByUserId: input.userId,
  });

  return { report, comparisonId: saved.id };
}

export async function listCampaignComparisons(input: {
  workspaceId: string;
  campaignId: string;
}) {
  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    throw new HypothesisDomainError("hypothesisCampaignNotFound", 404);
  }
  return listComparisonsByCampaign(input.campaignId, input.workspaceId);
}
