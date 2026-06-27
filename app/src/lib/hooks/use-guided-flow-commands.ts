"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { GuidedCommandEnvelope, GuidedFlowPresentation } from "@/lib/guided-flow/commands";
import { assistantThreadQueryKey } from "./use-assistant-threads";

interface CommandResponse {
  presentation: GuidedFlowPresentation;
  guidedFlow: Record<string, unknown>;
  noop?: boolean;
}

async function postGuidedCommand(
  threadId: string,
  envelope: GuidedCommandEnvelope
): Promise<CommandResponse> {
  const res = await apiFetch(
    `/api/assistant/threads/${threadId}/guided-flow/commands`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    }
  );

  if (res.status === 409) {
    const data = await res.json();
    const error = new Error("A jornada mudou em outra aba. Estado atualizado; revise e tente novamente.");
    (error as Error & { presentation?: GuidedFlowPresentation }).presentation =
      data.presentation;
    throw error;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? err.error ?? "Command failed");
  }

  return res.json();
}

export function useGuidedFlowCommand(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (envelope: GuidedCommandEnvelope) =>
      postGuidedCommand(threadId, envelope),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assistantThreadQueryKey(threadId),
      });
    },
    onError: (error) => {
      if ((error as Error & { presentation?: GuidedFlowPresentation }).presentation) {
        void queryClient.invalidateQueries({
          queryKey: assistantThreadQueryKey(threadId),
        });
      }
    },
  });
}
