import { apiFetch } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  initialStepForPath,
  type GuidedFlowPath,
  type GuidedFlowStatus,
} from "@/lib/guided-flow/types";
import { assistantThreadQueryKey } from "./use-assistant-threads";

export type { GuidedFlowPath, GuidedFlowStatus };
export { initialStepForPath };

export interface GuidedFlow {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  path: GuidedFlowPath;
  status: GuidedFlowStatus;
  currentStep: string;
  slots: Record<string, unknown>;
  missingFields: string[];
  assetIds: string[];
  referenceIds: string[];
  campaignId: string | null;
  revision?: number;
  schemaVersion?: number;
  createdAt: string;
  updatedAt: string;
}

async function upsertGuidedFlowRequest(
  threadId: string,
  payload: {
    path: GuidedFlowPath;
    status: GuidedFlowStatus;
    currentStep: string;
    mode?: "upsert" | "patch";
  }
): Promise<GuidedFlow> {
  const res = await apiFetch(`/api/assistant/threads/${threadId}/guided-flow`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao salvar jornada guiada");
  }
  const data = await res.json();
  return data.guidedFlow as GuidedFlow;
}

export function useUpsertGuidedFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      path,
    }: {
      threadId: string;
      path: Exclude<GuidedFlowPath, "unclassified">;
    }) =>
      upsertGuidedFlowRequest(threadId, {
        path,
        status: "active",
        currentStep: initialStepForPath(path),
        mode: "upsert",
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: assistantThreadQueryKey(variables.threadId),
      });
    },
  });
}
