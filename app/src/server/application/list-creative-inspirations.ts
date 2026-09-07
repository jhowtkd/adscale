import type { CreativeWorkIntent } from "@/server/creative-work/contracts";
import { getCuratedInspirations } from "@/server/repositories/workspace-asset";
import {
  type CatalogPageInput,
  type CatalogPageResult,
  type CatalogQuery,
  resolveCatalogPage,
} from "@/lib/catalog-page";

export type CreativeInspiration = {
  id: string;
  source: "template" | "approved_work" | "curated";
  title: string;
  previewUrl: string | null;
  templateId: string | null;
  assetId: string | null;
  curatedInspirationId?: string | null;
  /** Inspirations never suggest carousel: it is selected explicitly (no visual reference). */
  suggestedIntent: Exclude<CreativeWorkIntent, "carousel">;
};

type CuratedCandidate = {
  id: string;
  name: string;
  updatedAt: Date;
};

type Dependencies = {
  listCurated: (page?: CatalogQuery) => Promise<CatalogPageResult<CuratedCandidate>>;
};

const dependencies: Dependencies = {
  listCurated: async (page) => {
    const result = await getCuratedInspirations(page);
    return {
      items: result.items.map((asset) => ({
        id: asset.id,
        name: asset.name,
        updatedAt: asset.updatedAt ?? asset.createdAt,
      })),
      nextCursor: result.nextCursor,
    };
  },
};

function toInspiration(asset: CuratedCandidate): CreativeInspiration {
  return {
    id: asset.id,
    source: "curated",
    title: asset.name.replace(/\.[^.]+$/, ""),
    previewUrl: `/api/creative-work/inspirations/${asset.id}/file`,
    templateId: null,
    assetId: null,
    curatedInspirationId: asset.id,
    suggestedIntent: "restyle",
  };
}

export async function listCreativeInspirations(
  input: {
    workspaceId: string;
    clientProfileId: string | null;
  } & CatalogPageInput,
  deps: Dependencies = dependencies,
): Promise<CatalogPageResult<CreativeInspiration>> {
  const page = resolveCatalogPage(input);
  if (page.error) {
    return { items: [], nextCursor: null };
  }
  const curated = await deps.listCurated({ limit: page.limit, cursor: page.cursor });
  return {
    items: curated.items.map(toInspiration),
    nextCursor: curated.nextCursor,
  };
}
