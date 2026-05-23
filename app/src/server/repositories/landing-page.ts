import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { landingPages } from "../db/schema";

export type LandingPageStatus = "queued" | "completed" | "failed";

export async function createLandingPage(input: {
  workspaceId: string;
  campaignId: string;
  sourceDerivationId: string;
}) {
  const result = await db
    .insert(landingPages)
    .values({
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      sourceDerivationId: input.sourceDerivationId,
      status: "queued",
    })
    .returning();
  return result[0];
}

export async function completeLandingPage(input: {
  id: string;
  workspaceId: string;
  title: string;
  structure: unknown;
  htmlKey: string;
}) {
  const result = await db
    .update(landingPages)
    .set({
      status: "completed",
      title: input.title,
      structure: input.structure,
      htmlKey: input.htmlKey,
      error: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(landingPages.id, input.id),
        eq(landingPages.workspaceId, input.workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}

export async function failLandingPage(input: {
  id: string;
  workspaceId: string;
  error: string;
}) {
  const result = await db
    .update(landingPages)
    .set({
      status: "failed",
      error: input.error,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(landingPages.id, input.id),
        eq(landingPages.workspaceId, input.workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}

export async function getLandingPageById(id: string, workspaceId: string) {
  const result = await db
    .select()
    .from(landingPages)
    .where(and(eq(landingPages.id, id), eq(landingPages.workspaceId, workspaceId)))
    .limit(1);
  return result[0] ?? null;
}

export async function getLandingPagesByDerivation(
  workspaceId: string,
  sourceDerivationId: string
) {
  return db
    .select()
    .from(landingPages)
    .where(
      and(
        eq(landingPages.workspaceId, workspaceId),
        eq(landingPages.sourceDerivationId, sourceDerivationId)
      )
    )
    .orderBy(desc(landingPages.createdAt));
}
