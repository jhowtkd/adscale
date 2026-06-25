import { apiFetch } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { assistantThreadQueryKey } from "./use-assistant-threads";

async function confirmAssistantAction(actionId: string) {
  const res = await apiFetch(`/api/assistant/actions/${actionId}/confirm`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao confirmar ação");
  }
  return res.json();
}

async function cancelAssistantAction(actionId: string) {
  const res = await apiFetch(`/api/assistant/actions/${actionId}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao cancelar ação");
  }
  return res.json();
}

export function useConfirmAssistantAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      actionId,
    }: {
      actionId: string;
      threadId: string;
    }) => confirmAssistantAction(actionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: assistantThreadQueryKey(variables.threadId),
      });
    },
  });
}

export function useCancelAssistantAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      actionId,
    }: {
      actionId: string;
      threadId: string;
    }) => cancelAssistantAction(actionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: assistantThreadQueryKey(variables.threadId),
      });
    },
  });
}
