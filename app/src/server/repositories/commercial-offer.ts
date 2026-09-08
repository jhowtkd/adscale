import { and, desc, eq, gt, isNull, lte, lt, or } from "drizzle-orm";
import { db } from "../db";
import { brandCommercialOffers, type BrandCommercialOffer } from "../db/schema";
import {
  boundCatalogLimit,
  takeCatalogPage,
  type CatalogQuery,
  type CatalogPageResult,
} from "@/lib/catalog-page";
import type { CommercialOfferDocument } from "../creative-work/commercial-offer";

export async function insertCommercialOffer(input: {
  workspaceId: string;
  clientProfileId: string;
  document: CommercialOfferDocument;
}): Promise<BrandCommercialOffer> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(brandCommercialOffers)
      .where(and(
        eq(brandCommercialOffers.workspaceId, input.workspaceId),
        eq(brandCommercialOffers.clientProfileId, input.clientProfileId),
        eq(brandCommercialOffers.slug, input.document.slug),
        isNull(brandCommercialOffers.supersededAt),
      ))
      .limit(1);

    if (current) {
      await tx
        .update(brandCommercialOffers)
        .set({ supersededAt: new Date(), updatedAt: new Date() })
        .where(eq(brandCommercialOffers.id, current.id));
    }

    const version = (current?.version ?? 0) + 1;
    const [created] = await tx.insert(brandCommercialOffers).values({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      version,
      slug: input.document.slug,
      document: input.document,
      originWorkId: input.document.originWorkId,
      validFrom: new Date(input.document.validFrom),
      validUntil: new Date(input.document.validUntil),
    }).returning();
    return created!;
  });
}

export async function getCommercialOfferInWorkspace(
  workspaceId: string,
  offerId: string,
): Promise<BrandCommercialOffer | null> {
  const [row] = await db.select().from(brandCommercialOffers).where(and(
    eq(brandCommercialOffers.id, offerId),
    eq(brandCommercialOffers.workspaceId, workspaceId),
  )).limit(1);
  return row ?? null;
}

export async function listActiveCommercialOffers(
  workspaceId: string,
  clientProfileId: string,
  now: Date,
  page: CatalogQuery = {},
): Promise<CatalogPageResult<BrandCommercialOffer>> {
  const limit = boundCatalogLimit(page.limit);
  const cursorWhere = page.cursor
    ? or(
        lt(brandCommercialOffers.updatedAt, page.cursor.at),
        and(eq(brandCommercialOffers.updatedAt, page.cursor.at), lt(brandCommercialOffers.id, page.cursor.id)),
      )
    : undefined;
  const active = and(
    eq(brandCommercialOffers.workspaceId, workspaceId),
    eq(brandCommercialOffers.clientProfileId, clientProfileId),
    isNull(brandCommercialOffers.supersededAt),
    lte(brandCommercialOffers.validFrom, now),
    gt(brandCommercialOffers.validUntil, now),
  );
  const rows = await db
    .select()
    .from(brandCommercialOffers)
    .where(cursorWhere ? and(active, cursorWhere) : active)
    .orderBy(desc(brandCommercialOffers.updatedAt), desc(brandCommercialOffers.id))
    .limit(limit + 1);
  return takeCatalogPage(rows, limit, (row) => ({ at: row.updatedAt, id: row.id }));
}
