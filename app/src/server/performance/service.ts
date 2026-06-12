import type { CreativePerformanceSnapshot } from "../db/schema";
import { getCampaignById } from "../repositories/campaign";
import { getClientProfile } from "../repositories/client-reference";
import { getDerivationById } from "../repositories/derivation";
import {
  listPerformanceSnapshotsByCampaign,
  upsertPerformanceSnapshot,
} from "../repositories/performance";
import { derivePerformanceMetrics } from "./metrics";
import { normalizePlacement } from "./placement";
import { buildPerformanceSourceKey } from "./source-key";
import type { CanonicalPerformanceSnapshotInput } from "./validation";

export class PerformanceDomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
    this.name = "PerformanceDomainError";
  }
}

export interface PerformanceSnapshotView extends CreativePerformanceSnapshot {
  derivedMetrics: ReturnType<typeof derivePerformanceMetrics>;
}

function toView(snapshot: CreativePerformanceSnapshot): PerformanceSnapshotView {
  return {
    ...snapshot,
    derivedMetrics: derivePerformanceMetrics({
      impressions: snapshot.impressions,
      clicks: snapshot.clicks,
      spend: snapshot.spend,
      conversions: snapshot.conversions,
      conversionValue: snapshot.conversionValue,
    }),
  };
}

export async function recordPerformanceSnapshot(input: {
  workspaceId: string;
  userId: string;
  snapshot: CanonicalPerformanceSnapshotInput;
}): Promise<PerformanceSnapshotView> {
  const [campaign, derivation] = await Promise.all([
    getCampaignById(input.snapshot.campaignId, input.workspaceId),
    getDerivationById(input.snapshot.derivationId, input.workspaceId),
  ]);

  if (!campaign) {
    throw new PerformanceDomainError("performanceCampaignNotFound", 404);
  }
  if (!campaign.clientProfileId) {
    throw new PerformanceDomainError("performanceClientProfileRequired", 409);
  }
  if (!derivation) {
    throw new PerformanceDomainError("performanceDerivationNotFound", 404);
  }
  if (derivation.campaignId !== campaign.id) {
    throw new PerformanceDomainError(
      "performanceDerivationCampaignMismatch",
      409
    );
  }

  const clientProfile = await getClientProfile(
    input.workspaceId,
    campaign.clientProfileId
  );
  if (!clientProfile) {
    throw new PerformanceDomainError("performanceClientProfileNotFound", 409);
  }

  const normalizedPlacement = normalizePlacement(
    input.snapshot.platform,
    input.snapshot.placementRaw
  );
  const sourceKey = buildPerformanceSourceKey({
    derivationId: input.snapshot.derivationId,
    platform: input.snapshot.platform,
    placement: normalizedPlacement.placement,
    adAccountId: input.snapshot.adAccountId,
    startDate: input.snapshot.startDate,
    endDate: input.snapshot.endDate,
    sourceType: input.snapshot.sourceType,
    externalCampaignId: input.snapshot.externalCampaignId,
    externalAdGroupId: input.snapshot.externalAdGroupId,
    externalAdId: input.snapshot.externalAdId,
    scope: input.snapshot.scope,
  });

  const saved = await upsertPerformanceSnapshot({
    workspaceId: input.workspaceId,
    clientProfileId: clientProfile.id,
    campaignId: campaign.id,
    derivationId: derivation.id,
    platform: input.snapshot.platform,
    placement: normalizedPlacement.placement,
    placementRaw: normalizedPlacement.placementRaw,
    adAccountId: input.snapshot.adAccountId ?? null,
    startDate: input.snapshot.startDate,
    endDate: input.snapshot.endDate,
    sourceTimezone: input.snapshot.sourceTimezone,
    currency: input.snapshot.currency,
    impressions: input.snapshot.metrics.impressions,
    clicks: input.snapshot.metrics.clicks,
    spend: input.snapshot.metrics.spend,
    conversions: input.snapshot.metrics.conversions,
    conversionValue: input.snapshot.metrics.conversionValue,
    sourceType: input.snapshot.sourceType,
    externalCampaignId: input.snapshot.externalCampaignId ?? null,
    externalAdGroupId: input.snapshot.externalAdGroupId ?? null,
    externalAdId: input.snapshot.externalAdId ?? null,
    sourceKey,
    scopeKind: input.snapshot.scope.kind,
    scopeDimensions:
      input.snapshot.scope.kind === "segment"
        ? input.snapshot.scope.dimensions
        : null,
    sourceMetadata: input.snapshot.sourceMetadata ?? null,
    createdByUserId: input.userId,
  });

  return toView(saved);
}

export async function getCampaignPerformanceSnapshots(input: {
  campaignId: string;
  workspaceId: string;
}): Promise<PerformanceSnapshotView[]> {
  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    throw new PerformanceDomainError("performanceCampaignNotFound", 404);
  }

  const snapshots = await listPerformanceSnapshotsByCampaign(
    input.campaignId,
    input.workspaceId
  );
  return snapshots.map(toView);
}
