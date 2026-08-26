import type { CreativeWorkIntent } from "@/server/creative-work/contracts";
import { getCuratedInspirations } from "@/server/repositories/workspace-asset";

export type CreativeInspiration = {
  id: string;
  source: "template" | "approved_work" | "curated";
  title: string;
  previewUrl: string | null;
  templateId: string | null;
  assetId: string | null;
  curatedInspirationId?: string | null;
  suggestedIntent: CreativeWorkIntent;
};

type CuratedCandidate = {
  id: string;
  name: string;
  updatedAt: Date;
};

type Dependencies = {
  listCurated: () => Promise<CuratedCandidate[]>;
};

const dependencies: Dependencies = {
  listCurated: getCuratedInspirations,
};

export async function listCreativeInspirations(
  _input: {
    workspaceId: string;
    clientProfileId: string | null;
  },
  deps: Dependencies = dependencies,
): Promise<CreativeInspiration[]> {
  const curated = await deps.listCurated();

  return curated
    .map((asset) => ({
      updatedAt: asset.updatedAt,
      inspiration: {
        id: asset.id,
        source: "curated" as const,
        title: asset.name.replace(/\.[^.]+$/, ""),
        previewUrl: `/api/creative-work/inspirations/${asset.id}/file`,
        templateId: null,
        assetId: null,
        curatedInspirationId: asset.id,
        suggestedIntent: "restyle" as const,
      },
    }))
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime() || left.inspiration.id.localeCompare(right.inspiration.id))
    .map(({ inspiration }) => inspiration);
}
