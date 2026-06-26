import { apiFetch } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GuidedBriefingAnswers } from "@/server/ai/guided-briefing";
import type { GuidedFlow } from "./use-guided-flow";
import { assistantThreadQueryKey } from "./use-assistant-threads";

async function saveFromZeroBriefRequest(
  threadId: string,
  answers: GuidedBriefingAnswers
) {
  const res = await apiFetch(
    `/api/assistant/threads/${threadId}/guided-flow/from-zero`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "brief", answers }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Erro ao salvar brief");
  }
  return res.json() as Promise<{ guidedFlow: GuidedFlow }>;
}

async function saveFromZeroReferencesRequest(
  threadId: string,
  referenceIds: string[]
) {
  const res = await apiFetch(
    `/api/assistant/threads/${threadId}/guided-flow/from-zero`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "references", referenceIds }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Erro ao salvar referências");
  }
  return res.json() as Promise<{ guidedFlow: GuidedFlow }>;
}

export function useSaveFromZeroBrief(threadId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: GuidedBriefingAnswers) => {
      if (!threadId) throw new Error("Thread não selecionada");
      return saveFromZeroBriefRequest(threadId, answers);
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

export function useSaveFromZeroReferences(threadId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (referenceIds: string[]) => {
      if (!threadId) throw new Error("Thread não selecionada");
      return saveFromZeroReferencesRequest(threadId, referenceIds);
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
