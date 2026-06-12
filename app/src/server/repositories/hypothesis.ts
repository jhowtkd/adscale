import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  creativeHypotheses,
  hypothesisVariants,
  variantComparisons,
  type CreativeHypothesis,
  type HypothesisVariant,
  type NewCreativeHypothesis,
  type NewHypothesisVariant,
  type NewVariantComparison,
  type VariantComparison,
} from "../db/schema";
import type { VariantComparisonReport } from "../performance/hypothesis/types";

export interface HypothesisWithVariants extends CreativeHypothesis {
  variants: HypothesisVariant[];
}

export async function createHypothesis(
  input: NewCreativeHypothesis,
  variants: Omit<NewHypothesisVariant, "hypothesisId" | "id" | "createdAt">[]
): Promise<HypothesisWithVariants> {
  return db.transaction(async (tx) => {
    const [hypothesis] = await tx
      .insert(creativeHypotheses)
      .values(input)
      .returning();

    const variantRows =
      variants.length > 0
        ? await tx
            .insert(hypothesisVariants)
            .values(
              variants.map((v) => ({
                ...v,
                hypothesisId: hypothesis!.id,
              }))
            )
            .returning()
        : [];

    return { ...hypothesis!, variants: variantRows };
  });
}

export async function updateHypothesis(
  id: string,
  workspaceId: string,
  patch: Partial<NewCreativeHypothesis>
): Promise<CreativeHypothesis | null> {
  const [row] = await db
    .update(creativeHypotheses)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(creativeHypotheses.id, id),
        eq(creativeHypotheses.workspaceId, workspaceId)
      )
    )
    .returning();
  return row ?? null;
}

export async function replaceHypothesisVariants(
  hypothesisId: string,
  variants: Omit<NewHypothesisVariant, "hypothesisId" | "id" | "createdAt">[]
): Promise<HypothesisVariant[]> {
  return db.transaction(async (tx) => {
    await tx
      .delete(hypothesisVariants)
      .where(eq(hypothesisVariants.hypothesisId, hypothesisId));

    if (variants.length === 0) return [];

    return tx
      .insert(hypothesisVariants)
      .values(variants.map((v) => ({ ...v, hypothesisId })))
      .returning();
  });
}

export async function getHypothesisById(
  id: string,
  workspaceId: string
): Promise<HypothesisWithVariants | null> {
  const [hypothesis] = await db
    .select()
    .from(creativeHypotheses)
    .where(
      and(
        eq(creativeHypotheses.id, id),
        eq(creativeHypotheses.workspaceId, workspaceId)
      )
    )
    .limit(1);

  if (!hypothesis) return null;

  const variants = await db
    .select()
    .from(hypothesisVariants)
    .where(eq(hypothesisVariants.hypothesisId, id));

  return { ...hypothesis, variants };
}

export async function listHypothesesByCampaign(
  campaignId: string,
  workspaceId: string
): Promise<HypothesisWithVariants[]> {
  const rows = await db
    .select()
    .from(creativeHypotheses)
    .where(
      and(
        eq(creativeHypotheses.campaignId, campaignId),
        eq(creativeHypotheses.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(creativeHypotheses.createdAt));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const variants = await db
    .select()
    .from(hypothesisVariants)
    .where(inArray(hypothesisVariants.hypothesisId, ids));

  const byHypothesis = new Map<string, HypothesisVariant[]>();
  for (const v of variants) {
    const list = byHypothesis.get(v.hypothesisId) ?? [];
    list.push(v);
    byHypothesis.set(v.hypothesisId, list);
  }

  return rows.map((h) => ({
    ...h,
    variants: byHypothesis.get(h.id) ?? [],
  }));
}

export async function deleteHypothesis(
  id: string,
  workspaceId: string
): Promise<boolean> {
  const deleted = await db
    .delete(creativeHypotheses)
    .where(
      and(
        eq(creativeHypotheses.id, id),
        eq(creativeHypotheses.workspaceId, workspaceId)
      )
    )
    .returning({ id: creativeHypotheses.id });
  return deleted.length > 0;
}

export async function saveVariantComparison(
  input: NewVariantComparison
): Promise<VariantComparison> {
  const [row] = await db.insert(variantComparisons).values(input).returning();
  return row!;
}

export async function listComparisonsByCampaign(
  campaignId: string,
  workspaceId: string
): Promise<VariantComparison[]> {
  return db
    .select()
    .from(variantComparisons)
    .where(
      and(
        eq(variantComparisons.campaignId, campaignId),
        eq(variantComparisons.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(variantComparisons.createdAt));
}

export async function listComparisonsByHypothesis(
  hypothesisId: string,
  workspaceId: string
): Promise<VariantComparison[]> {
  return db
    .select()
    .from(variantComparisons)
    .where(
      and(
        eq(variantComparisons.hypothesisId, hypothesisId),
        eq(variantComparisons.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(variantComparisons.createdAt));
}

export function comparisonReportFromRow(
  row: VariantComparison
): VariantComparisonReport | null {
  return row.variantResults ?? null;
}
