import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { clientProfiles, clientReferences } from "../db/schema";

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

export interface BrandKitAvailableWorkspace {
  id: string;
  name: string;
}

export class BrandKitAmbiguityError extends Error {
  readonly availableWorkspaces: BrandKitAvailableWorkspace[];

  constructor(
    message = "Multiple client profiles exist; clientProfileId is required for brand kit operations",
    availableWorkspaces: BrandKitAvailableWorkspace[] = []
  ) {
    super(message);
    this.name = "BrandKitAmbiguityError";
    this.availableWorkspaces = availableWorkspaces;
  }
}

export class BrandKitProfileNotFoundError extends Error {
  constructor(message = "Client profile not found") {
    super(message);
    this.name = "BrandKitProfileNotFoundError";
  }
}

async function listWorkspaceProfiles(workspaceId: string) {
  return db
    .select()
    .from(clientProfiles)
    .where(eq(clientProfiles.workspaceId, workspaceId));
}

function toAvailableWorkspaces(
  profiles: Awaited<ReturnType<typeof listWorkspaceProfiles>>
): BrandKitAvailableWorkspace[] {
  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
  }));
}

export async function resolveBrandKitProfileId(
  workspaceId: string,
  clientProfileId?: string | null
): Promise<string> {
  if (clientProfileId) {
    const profile = await db
      .select({ id: clientProfiles.id })
      .from(clientProfiles)
      .where(
        and(
          eq(clientProfiles.workspaceId, workspaceId),
          eq(clientProfiles.id, clientProfileId)
        )
      )
      .limit(1);
    if (!profile[0]) {
      throw new BrandKitProfileNotFoundError();
    }
    return profile[0].id;
  }

  const profiles = await listWorkspaceProfiles(workspaceId);
  if (profiles.length === 1) {
    return profiles[0].id;
  }
  if (profiles.length === 0) {
    throw new BrandKitProfileNotFoundError("No client profile exists for this workspace");
  }
  throw new BrandKitAmbiguityError(
    undefined,
    toAvailableWorkspaces(profiles)
  );
}

async function getBrandKitByProfileId(workspaceId: string, profileId: string) {
  const result = await db
    .select()
    .from(clientProfiles)
    .where(
      and(eq(clientProfiles.workspaceId, workspaceId), eq(clientProfiles.id, profileId))
    )
    .limit(1);
  return result[0] ?? null;
}

/** Legacy read helper: returns the sole workspace profile or null when ambiguous. */
export async function getBrandKitByWorkspace(workspaceId: string) {
  const profiles = await listWorkspaceProfiles(workspaceId);
  if (profiles.length === 1) {
    return profiles[0];
  }
  return null;
}

export async function getBrandKit(
  workspaceId: string,
  clientProfileId?: string | null
) {
  const profileId = await resolveBrandKitProfileId(workspaceId, clientProfileId);
  return getBrandKitByProfileId(workspaceId, profileId);
}

export async function upsertBrandKit(
  workspaceId: string,
  data: BrandKitData,
  clientProfileId?: string | null
) {
  const profiles = await listWorkspaceProfiles(workspaceId);
  let profileId: string | null = null;

  if (clientProfileId) {
    profileId = (
      await db
        .select({ id: clientProfiles.id })
        .from(clientProfiles)
        .where(
          and(
            eq(clientProfiles.workspaceId, workspaceId),
            eq(clientProfiles.id, clientProfileId)
          )
        )
        .limit(1)
    )[0]?.id ?? null;
    if (!profileId) {
      throw new BrandKitProfileNotFoundError();
    }
  } else if (profiles.length === 1) {
    profileId = profiles[0].id;
  } else if (profiles.length > 1) {
    throw new BrandKitAmbiguityError(
      undefined,
      toAvailableWorkspaces(profiles)
    );
  }

  const now = new Date();

  if (profileId) {
    const result = await db
      .update(clientProfiles)
      .set({
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
      })
      .where(eq(clientProfiles.id, profileId))
      .returning();
    return result[0];
  }

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
    .returning();
  return result[0];
}

export async function deleteBrandKit(
  workspaceId: string,
  clientProfileId?: string | null
) {
  const profileId = await resolveBrandKitProfileId(workspaceId, clientProfileId);
  const existing = await getBrandKitByProfileId(workspaceId, profileId);
  if (!existing) return null;

  if (existing.logoAssetKey) {
    await db
      .delete(clientReferences)
      .where(
        and(
          eq(clientReferences.workspaceId, workspaceId),
          eq(clientReferences.clientProfileId, profileId),
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
    .where(eq(clientProfiles.id, profileId))
    .returning();
  return result[0];
}
