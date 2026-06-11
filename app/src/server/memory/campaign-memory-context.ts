import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { campaigns } from "../db/schema";
import {
  appendCampaignMemoryEntry,
  buildCampaignMemoryPromptBlock,
  normalizeCampaignMemory,
  type CampaignMemoryEntry,
  type CampaignMemoryRecord,
} from "./campaign-memory";

export async function getCampaignMemory(
  campaignId: string,
  workspaceId: string
): Promise<CampaignMemoryRecord> {
  const rows = await db
    .select({ campaignMemory: campaigns.campaignMemory })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, workspaceId)))
    .limit(1);

  return normalizeCampaignMemory(rows[0]?.campaignMemory ?? null);
}

export async function recordCampaignMemoryEntry(
  campaignId: string,
  workspaceId: string,
  entry: Omit<CampaignMemoryEntry, "createdAt">
): Promise<CampaignMemoryRecord> {
  const current = await getCampaignMemory(campaignId, workspaceId);
  const next = appendCampaignMemoryEntry(current, entry);

  await db
    .update(campaigns)
    .set({ campaignMemory: next, updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, workspaceId)));

  return next;
}

export async function getCampaignMemoryPromptBlock(
  campaignId: string,
  workspaceId: string
): Promise<string> {
  const memory = await getCampaignMemory(campaignId, workspaceId);
  return buildCampaignMemoryPromptBlock(memory);
}
