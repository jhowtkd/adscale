import type { CreativeWorkIntent, CreativeWorkOutputStatus } from "@/server/creative-work/contracts";
import {
  listCreativeWorkInspirationCandidates,
  type CreativeWorkInspirationCandidate,
} from "@/server/repositories/creative-work";
import { getTemplates } from "@/server/repositories/template";

export type CreativeInspiration = {
  id: string;
  source: "template" | "approved_work";
  title: string;
  previewUrl: string | null;
  templateId: string | null;
  assetId: string | null;
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

type Dependencies = {
  listTemplates: (workspaceId: string) => Promise<TemplateCandidate[]>;
  listApprovedWork: (workspaceId: string, clientProfileId: string) => Promise<ApprovedWorkCandidate[]>;
};

const dependencies: Dependencies = {
  listTemplates: getTemplates,
  listApprovedWork: listCreativeWorkInspirationCandidates,
};

function templateIntent(generationMode: string): CreativeWorkIntent {
  if (generationMode === "format_adaptation") return "format_adaptation";
  if (generationMode === "restyling") return "restyle";
  return "variations";
}

export async function listCreativeInspirations(
  input: { workspaceId: string; clientProfileId: string },
  deps: Dependencies = dependencies,
): Promise<CreativeInspiration[]> {
  const [templates, approvedWork] = await Promise.all([
    deps.listTemplates(input.workspaceId),
    deps.listApprovedWork(input.workspaceId, input.clientProfileId),
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
        output.workspaceId === input.workspaceId
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
  ]
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime() || left.inspiration.id.localeCompare(right.inspiration.id))
    .map(({ inspiration }) => inspiration);
}
