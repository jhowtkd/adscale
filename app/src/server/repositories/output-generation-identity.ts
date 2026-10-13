import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { campaigns, creativeWorkItems, creativeWorkOutputs, derivations } from "../db/schema";
import { snapshotGenerationIdentity, type GenerationIdentity } from "../output-learning/generation-identity";

/** Read the generation record of this Peça only. Never aggregate sibling outputs or preparation attempts. */
export async function loadOutputGenerationIdentity(input: {
  workspaceId: string; clientProfileId?: string | null; campaignId?: string | null;
  derivationId?: string | null; creativeWorkOutputId?: string | null;
}): Promise<GenerationIdentity> {
  if (input.creativeWorkOutputId) {
    const [row] = await db.select({ applications: creativeWorkOutputs.guidanceApplications })
      .from(creativeWorkOutputs).innerJoin(creativeWorkItems, and(
        eq(creativeWorkItems.id, creativeWorkOutputs.workItemId), eq(creativeWorkItems.workspaceId, input.workspaceId),
      )).where(and(eq(creativeWorkOutputs.workspaceId, input.workspaceId),
        eq(creativeWorkOutputs.id, input.creativeWorkOutputId),
        input.clientProfileId ? eq(creativeWorkItems.clientProfileId, input.clientProfileId) : undefined,
      )).limit(1);
    return snapshotGenerationIdentity(row?.applications);
  }
  if (input.derivationId) {
    const [row] = await db.select({ applications: derivations.legacyGuidanceApplications })
      .from(derivations).innerJoin(campaigns, and(
        eq(campaigns.id, derivations.campaignId), eq(campaigns.workspaceId, input.workspaceId),
      )).where(and(eq(derivations.workspaceId, input.workspaceId), eq(derivations.id, input.derivationId),
        input.campaignId ? eq(derivations.campaignId, input.campaignId) : undefined,
        input.clientProfileId ? eq(campaigns.clientProfileId, input.clientProfileId) : undefined,
      )).limit(1);
    return snapshotGenerationIdentity(row?.applications);
  }
  return snapshotGenerationIdentity(null);
}
