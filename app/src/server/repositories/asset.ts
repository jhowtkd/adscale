import { eq, and, desc, lt, or, sql, isNull } from "drizzle-orm";
import { db } from "../db";
import { campaignAssets, pendingUploads } from "../db/schema";

export interface CreateAssetInput {
  key: string;
  type: string;
  size?: number;
  width?: number;
  height?: number;
  role?: string;
}

export async function createAsset(
  workspaceId: string,
  campaignId: string,
  data: CreateAssetInput
) {
  const result = await db
    .insert(campaignAssets)
    .values({
      workspaceId,
      campaignId,
      key: data.key,
      type: data.type,
      size: data.size ?? null,
      width: data.width ?? null,
      height: data.height ?? null,
      ...(data.role ? { role: data.role } : {}),
    })
    .returning();
  return result[0];
}

export async function getAssetsByCampaign(
  campaignId: string,
  workspaceId: string
) {
  return db
    .select()
    .from(campaignAssets)
    .where(
      and(
        eq(campaignAssets.campaignId, campaignId),
        eq(campaignAssets.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(campaignAssets.createdAt));
}

export async function deleteAsset(id: string, workspaceId: string) {
  const result = await db
    .delete(campaignAssets)
    .where(
      and(
        eq(campaignAssets.id, id),
        eq(campaignAssets.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}

export async function isWorkspaceAssetKey(workspaceId: string, key: string) {
  const result = await db
    .select({ id: campaignAssets.id })
    .from(campaignAssets)
    .where(and(eq(campaignAssets.workspaceId, workspaceId), eq(campaignAssets.key, key)))
    .limit(1);
  return result.length > 0;
}

export async function createPendingUpload(input: {
  workspaceId: string;
  campaignId: string;
  key: string;
  filename: string;
  contentType: string;
  contentLength: number;
  expiresAt: Date;
}) {
  const result = await db
    .insert(pendingUploads)
    .values({
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      key: input.key,
      filename: input.filename,
      contentType: input.contentType,
      contentLength: input.contentLength,
      expiresAt: input.expiresAt,
    })
    .returning();
  return result[0];
}

export async function getPendingUpload(
  workspaceId: string,
  campaignId: string,
  key: string
) {
  const result = await db
    .select()
    .from(pendingUploads)
    .where(
      and(
        eq(pendingUploads.workspaceId, workspaceId),
        eq(pendingUploads.campaignId, campaignId),
        eq(pendingUploads.key, key),
        eq(pendingUploads.status, "pending")
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function markPendingUploadCompleted(id: string, workspaceId: string) {
  const result = await db
    .update(pendingUploads)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(pendingUploads.id, id), eq(pendingUploads.workspaceId, workspaceId)))
    .returning();
  return result[0] ?? null;
}

export async function failExpiredPendingUploads(now = new Date()) {
  return db
    .update(pendingUploads)
    .set({ status: "expired" })
    .where(and(eq(pendingUploads.status, "pending"), lt(pendingUploads.expiresAt, now)))
    .returning();
}

export async function updateAssetMetadata(
  assetId: string,
  workspaceId: string,
  metadata: Record<string, unknown>,
  analysisStatus: "pending" | "analyzing" | "completed" | "failed"
) {
  // Read existing metadata first to merge (preserve other fields)
  const existing = await db
    .select({ metadata: campaignAssets.metadata })
    .from(campaignAssets)
    .where(
      and(
        eq(campaignAssets.id, assetId),
        eq(campaignAssets.workspaceId, workspaceId)
      )
    )
    .limit(1);

  const mergedMetadata = {
    ...(existing[0]?.metadata ?? {}),
    ...metadata,
  };

  const result = await db
    .update(campaignAssets)
    .set({
      metadata: mergedMetadata,
      analysisStatus,
      analyzedAt: new Date(),
    })
    .where(
      and(
        eq(campaignAssets.id, assetId),
        eq(campaignAssets.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}

export async function getAssetWithMetadata(
  assetId: string,
  workspaceId: string
) {
  const result = await db
    .select()
    .from(campaignAssets)
    .where(
      and(
        eq(campaignAssets.id, assetId),
        eq(campaignAssets.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return result[0] ?? null;
}

const DEFAULT_ANALYSIS_STALE_MS = 5 * 60 * 1000;

export async function claimAssetAnalysis(
  assetId: string,
  workspaceId: string,
  staleAfterMs = DEFAULT_ANALYSIS_STALE_MS
): Promise<"claimed" | "in_progress" | "not_found"> {
  const staleBefore = new Date(Date.now() - staleAfterMs);

  const claimed = await db
    .update(campaignAssets)
    .set({
      analysisStatus: "analyzing",
      analyzedAt: new Date(),
    })
    .where(
      and(
        eq(campaignAssets.id, assetId),
        eq(campaignAssets.workspaceId, workspaceId),
        or(
          sql`${campaignAssets.analysisStatus} IS DISTINCT FROM 'analyzing'`,
          and(
            eq(campaignAssets.analysisStatus, "analyzing"),
            or(
              isNull(campaignAssets.analyzedAt),
              lt(campaignAssets.analyzedAt, staleBefore)
            )
          )
        )
      )
    )
    .returning({ id: campaignAssets.id });

  if (claimed.length > 0) {
    return "claimed";
  }

  const existing = await getAssetWithMetadata(assetId, workspaceId);
  if (!existing) {
    return "not_found";
  }

  if (existing.analysisStatus === "analyzing") {
    return "in_progress";
  }

  return "claimed";
}
