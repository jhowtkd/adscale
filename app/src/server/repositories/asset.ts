import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { campaignAssets } from "../db/schema";

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
