import { apiFetch } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GuidedFlow } from "./use-guided-flow";
import { assistantThreadQueryKey } from "./use-assistant-threads";

export interface SelectExistingCreativeResult {
  campaignId: string;
  campaignAssetId: string;
  guidedFlow: GuidedFlow;
  missingFields: string[];
}

async function selectExistingCreativeRequest(
  threadId: string,
  workspaceAssetId: string
): Promise<SelectExistingCreativeResult> {
  const res = await apiFetch(
    `/api/assistant/threads/${threadId}/guided-flow/select-creative`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceAssetId }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao selecionar criativo");
  }
  return res.json() as Promise<SelectExistingCreativeResult>;
}

async function acknowledgeDiagnosisRequest(
  threadId: string
): Promise<{ guidedFlow: GuidedFlow }> {
  const res = await apiFetch(
    `/api/assistant/threads/${threadId}/guided-flow/select-creative`,
    { method: "PATCH" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao avançar jornada");
  }
  return res.json() as Promise<{ guidedFlow: GuidedFlow }>;
}

export function useSelectExistingCreative(threadId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceAssetId: string) => {
      if (!threadId) {
        throw new Error("Thread não selecionada");
      }
      return selectExistingCreativeRequest(threadId, workspaceAssetId);
    },
    onSuccess: () => {
      if (threadId) {
        queryClient.invalidateQueries({
          queryKey: assistantThreadQueryKey(threadId),
        });
      }
    },
  });
}

export function useAcknowledgeExistingDiagnosis(threadId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!threadId) {
        throw new Error("Thread não selecionada");
      }
      return acknowledgeDiagnosisRequest(threadId);
    },
    onSuccess: () => {
      if (threadId) {
        queryClient.invalidateQueries({
          queryKey: assistantThreadQueryKey(threadId),
        });
      }
    },
  });
}
