import type { CreativeWorkIntent, CreativeWorkOutputStatus } from "@/server/creative-work/contracts";
import {
  listCreativeWorkInspirationCandidates,
  type CreativeWorkInspirationCandidate,
} from "@/server/repositories/creative-work";
import { getTemplates } from "@/server/repositories/template";
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

type TemplateCandidate = {
  id: string;
  workspaceId: string;
  name: string;
  generationMode: string;
  updatedAt: Date;
};

type ApprovedWorkCandidate = CreativeWorkInspirationCandidate & {
  status: CreativeWorkOutputStatus;
  isSelected: boolean;
};

type CuratedCandidate = {
  id: string;
  name: string;
  updatedAt: Date;
};

type Dependencies = {
  listTemplates: (workspaceId: string) => Promise<TemplateCandidate[]>;
  listApprovedWork: (workspaceId: string, clientProfileId: string) => Promise<ApprovedWorkCandidate[]>;
  listCurated: () => Promise<CuratedCandidate[]>;
};

const dependencies: Dependencies = {
  listTemplates: getTemplates,
  listApprovedWork: listCreativeWorkInspirationCandidates,
  listCurated: getCuratedInspirations,
};

function templateIntent(generationMode: string): CreativeWorkIntent {
  if (generationMode === "format_adaptation") return "format_adaptation";
  if (generationMode === "restyling") return "restyle";
  return "variations";
}

export async function listCreativeInspirations(
  input: {
    workspaceId: string;
    clientProfileId: string | null;
  },
  deps: Dependencies = dependencies,
): Promise<CreativeInspiration[]> {
  const [templates, approvedWork, curated] = await Promise.all([
    input.clientProfileId
      ? deps.listTemplates(input.workspaceId)
      : Promise.resolve([]),
    input.clientProfileId
      ? deps.listApprovedWork(input.workspaceId, input.clientProfileId)
      : Promise.resolve([]),
    deps.listCurated(),
  ]);

  return [
    ...templates
      .filter((template) => template.workspaceId === input.workspaceId)
      .map((template) => ({
        updatedAt: template.updatedAt,
        inspiration: {
          id: template.id,
          source: "template" as const,
          title: template.name,
          previewUrl: null,
          templateId: template.id,
          assetId: null,
          suggestedIntent: templateIntent(template.generationMode),
        },
      })),
    ...approvedWork
      .filter((output) =>
        input.clientProfileId !== null
        && output.workspaceId === input.workspaceId
        && output.clientProfileId === input.clientProfileId
        && output.status === "completed"
        && output.isSelected,
      )
      .map((output) => ({
        updatedAt: output.updatedAt,
        inspiration: {
          id: output.id,
          source: "approved_work" as const,
          title: output.title,
          previewUrl: `/api/workspace/assets/${output.assetId}/file`,
          templateId: null,
          assetId: output.assetId,
          suggestedIntent: "restyle" as const,
        },
      })),
    ...curated.map((asset) => ({
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
    })),
  ]
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime() || left.inspiration.id.localeCompare(right.inspiration.id))
    .map(({ inspiration }) => inspiration);
}
