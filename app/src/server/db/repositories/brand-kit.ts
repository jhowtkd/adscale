import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import { clientProfiles, clientReferences } from "../../db/schema";

export interface BrandKitData {
  name?: string;
  description?: string;
  visualNotes?: string;
  toneNotes?: string;
  constraints?: string;
  brandColors?: string[];
  brandFonts?: string[];
  logoAssetKey?: string | null;
  toneOfVoice?: string;
  prohibitedElements?: string;
  requiredElements?: string;
}

export async function getBrandKitByWorkspace(workspaceId: string) {
  const result = await db
    .select()
    .from(clientProfiles)
    .where(eq(clientProfiles.workspaceId, workspaceId));
  return result[0] ?? null;
}

export async function upsertBrandKit(workspaceId: string, data: BrandKitData) {
  const now = new Date();
  const result = await db
    .insert(clientProfiles)
    .values({
      workspaceId,
      name: data.name || "Brand Kit",
      description: data.description ?? null,
      visualNotes: data.visualNotes ?? null,
      toneNotes: data.toneNotes ?? null,
      constraints: data.constraints ?? null,
      brandColors: data.brandColors ?? null,
      brandFonts: data.brandFonts ?? null,
      logoAssetKey: data.logoAssetKey ?? null,
      toneOfVoice: data.toneOfVoice ?? null,
      prohibitedElements: data.prohibitedElements ?? null,
      requiredElements: data.requiredElements ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: clientProfiles.workspaceId,
      set: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.visualNotes !== undefined && { visualNotes: data.visualNotes }),
        ...(data.toneNotes !== undefined && { toneNotes: data.toneNotes }),
        ...(data.constraints !== undefined && { constraints: data.constraints }),
        ...(data.brandColors !== undefined && { brandColors: data.brandColors }),
        ...(data.brandFonts !== undefined && { brandFonts: data.brandFonts }),
        ...(data.logoAssetKey !== undefined && { logoAssetKey: data.logoAssetKey }),
        ...(data.toneOfVoice !== undefined && { toneOfVoice: data.toneOfVoice }),
        ...(data.prohibitedElements !== undefined && {
          prohibitedElements: data.prohibitedElements,
        }),
        ...(data.requiredElements !== undefined && {
          requiredElements: data.requiredElements,
        }),
        updatedAt: now,
      },
    })
    .returning();
  return result[0];
}

export async function deleteBrandKit(workspaceId: string) {
  const existing = await getBrandKitByWorkspace(workspaceId);
  if (!existing) return null;

  // Delete associated logo client_reference if present
  if (existing.logoAssetKey) {
    await db
      .delete(clientReferences)
      .where(
        and(
          eq(clientReferences.workspaceId, workspaceId),
          eq(clientReferences.assetKey, existing.logoAssetKey),
          eq(clientReferences.kind, "logo")
        )
      )
      .catch(() => {
        // Ignore errors — reference may not exist
      });
  }

  const result = await db
    .update(clientProfiles)
    .set({
      brandColors: null,
      brandFonts: null,
      logoAssetKey: null,
      toneOfVoice: null,
      prohibitedElements: null,
      requiredElements: null,
      updatedAt: new Date(),
    })
    .where(eq(clientProfiles.id, existing.id))
    .returning();
  return result[0];
}
