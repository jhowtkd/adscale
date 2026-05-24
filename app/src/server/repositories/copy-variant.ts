import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { derivationCopyVariants } from "../db/schema";

export interface CreateCopyVariantInput {
  derivationId: string;
  workspaceId: string;
  headline: string;
  ctaText?: string | null;
  toneLabel?: string | null;
  confidenceScore?: number | null;
  metadata?: Record<string, unknown>;
}

export async function createCopyVariant(data: CreateCopyVariantInput) {
  const result = await db
    .insert(derivationCopyVariants)
    .values({
      derivationId: data.derivationId,
      workspaceId: data.workspaceId,
      headline: data.headline,
      ctaText: data.ctaText ?? null,
      toneLabel: data.toneLabel ?? null,
      confidenceScore: data.confidenceScore ?? null,
      metadata: data.metadata ?? null,
    })
    .returning();
  return result[0];
}

export async function getCopyVariantsByDerivation(
  derivationId: string,
  workspaceId: string
) {
  return db
    .select()
    .from(derivationCopyVariants)
    .where(
      and(
        eq(derivationCopyVariants.derivationId, derivationId),
        eq(derivationCopyVariants.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(derivationCopyVariants.confidenceScore));
}

export async function selectCopyVariant(
  id: string,
  derivationId: string,
  workspaceId: string,
  isSelected: boolean
) {
  const result = await db
    .update(derivationCopyVariants)
    .set({ isSelected })
    .where(
      and(
        eq(derivationCopyVariants.id, id),
        eq(derivationCopyVariants.derivationId, derivationId),
        eq(derivationCopyVariants.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}

export async function deleteCopyVariantsByDerivation(
  derivationId: string,
  workspaceId: string
) {
  return db
    .delete(derivationCopyVariants)
    .where(
      and(
        eq(derivationCopyVariants.derivationId, derivationId),
        eq(derivationCopyVariants.workspaceId, workspaceId)
      )
    )
    .returning();
}
