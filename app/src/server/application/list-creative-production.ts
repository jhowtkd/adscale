import type { CreativeProductionItem, CreativeProductionPage } from "@/lib/creative-production";
import {
  readCreativeProductionPage,
  type ProductionQuery,
  type ProductionRow,
} from "@/server/repositories/creative-production";
import { objectStorage } from "@/server/storage";

export async function productionItem(row: ProductionRow): Promise<CreativeProductionItem> {
  const reviewHref = row.workId
    ? row.campaignId ? `/campaigns/${row.campaignId}?creativeWork=${row.workId}` : `/creative-work/${row.workId}`
    : `/campaigns/${row.campaignId}`;
  const previewUrl = row.kind === "output"
    ? `/api/creative-work/${row.workId}/outputs/${row.sourceId}/download`
    : row.kind === "slide"
      ? `/api/creative-work/${row.workId}/carousel/slides/${row.sourceId}/download`
      : await objectStorage.signedDownloadUrl(row.outputKey);
  return {
    id: row.id,
    kind: row.kind,
    workId: row.workId,
    campaignId: row.campaignId,
    title: row.title,
    format: row.format,
    previewUrl,
    reviewHref,
    createdAt: row.createdAt.toISOString(),
    deckId: row.kind === "slide" ? row.workId : null,
    position: row.position,
  };
}

export async function listCreativeProduction(input: ProductionQuery): Promise<CreativeProductionPage> {
  const page = await readCreativeProductionPage(input);
  return {
    production: await Promise.all(page.rows.map(productionItem)),
    nextCursor: page.nextCursor,
  };
}
