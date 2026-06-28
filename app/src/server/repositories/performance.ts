import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  creativePerformanceSnapshots,
  type CreativePerformanceSnapshot,
  type NewCreativePerformanceSnapshot,
} from "../db/schema";

export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type UpsertPerformanceSnapshotInput = Omit<
  NewCreativePerformanceSnapshot,
  "id" | "createdAt" | "updatedAt"
>;

const SNAPSHOT_BATCH_SIZE = 500;

const snapshotConflictUpdateSet = {
  clientProfileId: sql`excluded.client_profile_id`,
  campaignId: sql`excluded.campaign_id`,
  derivationId: sql`excluded.derivation_id`,
  platform: sql`excluded.platform`,
  placement: sql`excluded.placement`,
  placementRaw: sql`excluded.placement_raw`,
  adAccountId: sql`excluded.ad_account_id`,
  startDate: sql`excluded.start_date`,
  endDate: sql`excluded.end_date`,
  sourceTimezone: sql`excluded.source_timezone`,
  currency: sql`excluded.currency`,
  impressions: sql`excluded.impressions`,
  clicks: sql`excluded.clicks`,
  spend: sql`excluded.spend`,
  conversions: sql`excluded.conversions`,
  conversionValue: sql`excluded.conversion_value`,
  sourceType: sql`excluded.source_type`,
  externalCampaignId: sql`excluded.external_campaign_id`,
  externalAdGroupId: sql`excluded.external_ad_group_id`,
  externalAdId: sql`excluded.external_ad_id`,
  scopeKind: sql`excluded.scope_kind`,
  scopeDimensions: sql`excluded.scope_dimensions`,
  sourceMetadata: sql`excluded.source_metadata`,
  updatedAt: new Date(),
} as const;

export async function upsertPerformanceSnapshot(
  input: UpsertPerformanceSnapshotInput,
  tx: DbOrTx = db
): Promise<CreativePerformanceSnapshot> {
  const [row] = await tx
    .insert(creativePerformanceSnapshots)
    .values(input)
    .onConflictDoUpdate({
      target: [
        creativePerformanceSnapshots.workspaceId,
        creativePerformanceSnapshots.sourceKey,
      ],
      set: snapshotConflictUpdateSet,
    })
    .returning();

  return row;
}

export async function getPerformanceSnapshotsBySourceKeys(
  sourceKeys: string[],
  workspaceId: string,
  tx: DbOrTx = db
): Promise<Map<string, CreativePerformanceSnapshot>> {
  const bySourceKey = new Map<string, CreativePerformanceSnapshot>();
  if (sourceKeys.length === 0) {
    return bySourceKey;
  }

  const uniqueKeys = [...new Set(sourceKeys)];
  for (let index = 0; index < uniqueKeys.length; index += SNAPSHOT_BATCH_SIZE) {
    const chunk = uniqueKeys.slice(index, index + SNAPSHOT_BATCH_SIZE);
    const rows = await tx
      .select()
      .from(creativePerformanceSnapshots)
      .where(
        and(
          eq(creativePerformanceSnapshots.workspaceId, workspaceId),
          inArray(creativePerformanceSnapshots.sourceKey, chunk)
        )
      );

    for (const row of rows) {
      bySourceKey.set(row.sourceKey, row);
    }
  }

  return bySourceKey;
}

export async function bulkUpsertPerformanceSnapshots(
  inputs: UpsertPerformanceSnapshotInput[],
  tx: DbOrTx = db
): Promise<Map<string, CreativePerformanceSnapshot>> {
  const bySourceKey = new Map<string, CreativePerformanceSnapshot>();
  if (inputs.length === 0) {
    return bySourceKey;
  }

  for (let index = 0; index < inputs.length; index += SNAPSHOT_BATCH_SIZE) {
    const chunk = inputs.slice(index, index + SNAPSHOT_BATCH_SIZE);
    const rows = await tx
      .insert(creativePerformanceSnapshots)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          creativePerformanceSnapshots.workspaceId,
          creativePerformanceSnapshots.sourceKey,
        ],
        set: snapshotConflictUpdateSet,
      })
      .returning();

    for (const row of rows) {
      bySourceKey.set(row.sourceKey, row);
    }
  }

  return bySourceKey;
}

export async function getPerformanceSnapshotBySourceKey(
  sourceKey: string,
  workspaceId: string
): Promise<CreativePerformanceSnapshot | null> {
  const [row] = await db
    .select()
    .from(creativePerformanceSnapshots)
    .where(
      and(
        eq(creativePerformanceSnapshots.sourceKey, sourceKey),
        eq(creativePerformanceSnapshots.workspaceId, workspaceId)
      )
    )
    .limit(1);

  return row ?? null;
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
