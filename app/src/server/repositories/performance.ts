import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  creativePerformanceSnapshots,
  type CreativePerformanceSnapshot,
  type NewCreativePerformanceSnapshot,
} from "../db/schema";

export type UpsertPerformanceSnapshotInput = Omit<
  NewCreativePerformanceSnapshot,
  "id" | "createdAt" | "updatedAt"
>;

export async function upsertPerformanceSnapshot(
  input: UpsertPerformanceSnapshotInput
): Promise<CreativePerformanceSnapshot> {
  const [row] = await db
    .insert(creativePerformanceSnapshots)
    .values(input)
    .onConflictDoUpdate({
      target: [
        creativePerformanceSnapshots.workspaceId,
        creativePerformanceSnapshots.sourceKey,
      ],
      set: {
        clientProfileId: input.clientProfileId,
        campaignId: input.campaignId,
        derivationId: input.derivationId,
        platform: input.platform,
        placement: input.placement,
        placementRaw: input.placementRaw,
        adAccountId: input.adAccountId,
        startDate: input.startDate,
        endDate: input.endDate,
        sourceTimezone: input.sourceTimezone,
        currency: input.currency,
        impressions: input.impressions,
        clicks: input.clicks,
        spend: input.spend,
        conversions: input.conversions,
        conversionValue: input.conversionValue,
        sourceType: input.sourceType,
        externalCampaignId: input.externalCampaignId,
        externalAdGroupId: input.externalAdGroupId,
        externalAdId: input.externalAdId,
        scopeKind: input.scopeKind,
        scopeDimensions: input.scopeDimensions,
        sourceMetadata: input.sourceMetadata,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function getPerformanceSnapshotById(
  id: string,
  workspaceId: string
): Promise<CreativePerformanceSnapshot | null> {
  const [row] = await db
    .select()
    .from(creativePerformanceSnapshots)
    .where(
      and(
        eq(creativePerformanceSnapshots.id, id),
        eq(creativePerformanceSnapshots.workspaceId, workspaceId)
      )
    )
    .limit(1);

  return row ?? null;
}

export async function listPerformanceSnapshotsByCampaign(
  campaignId: string,
  workspaceId: string
): Promise<CreativePerformanceSnapshot[]> {
  return db
    .select()
    .from(creativePerformanceSnapshots)
    .where(
      and(
        eq(creativePerformanceSnapshots.campaignId, campaignId),
        eq(creativePerformanceSnapshots.workspaceId, workspaceId)
      )
    )
    .orderBy(
      desc(creativePerformanceSnapshots.startDate),
      desc(creativePerformanceSnapshots.createdAt)
    );
}

export async function listPerformanceSnapshotsByDerivation(
  derivationId: string,
  workspaceId: string
): Promise<CreativePerformanceSnapshot[]> {
  return db
    .select()
    .from(creativePerformanceSnapshots)
    .where(
      and(
        eq(creativePerformanceSnapshots.derivationId, derivationId),
        eq(creativePerformanceSnapshots.workspaceId, workspaceId)
      )
    )
    .orderBy(
      desc(creativePerformanceSnapshots.startDate),
      desc(creativePerformanceSnapshots.createdAt)
    );
}
