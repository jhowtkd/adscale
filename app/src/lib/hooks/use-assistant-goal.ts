"use client";

import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { assistantThreadQueryKey } from "./use-assistant-threads";
import { useQueryClient } from "@tanstack/react-query";

export interface GoalCommandInput {
  threadId: string;
  type: "stop" | "resume" | "abandon";
  expectedRevision: number;
  pendingActionId?: string;
  reason?: string;
}

/**
 * Mutations for the goal-agent lifecycle (stop / resume / abandon) plus optional
 * native browser notifications. The server owns the durable state; this hook
 * only issues the command and invalidates the thread projection so the workspace
 * re-renders from the authoritative goal state.
 *
 * Native notifications are requested from a user click (browsers require a
 * gesture) and fire only on transitions into review/completion stages. There is
 * no service-worker or web-push backend in the pilot.
 */
export function useAssistantGoal() {
  const queryClient = useQueryClient();

  const command = useMutation({
    mutationFn: async (input: GoalCommandInput) => {
      const res = await apiFetch(
        `/api/assistant/threads/${input.threadId}/goal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: input.type,
            expectedRevision: input.expectedRevision,
            ...(input.pendingActionId
              ? { pendingActionId: input.pendingActionId }
              : {}),
            ...(input.reason ? { reason: input.reason } : {}),
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao atualizar o objetivo");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: assistantThreadQueryKey(variables.threadId),
      });
    },
  });

  const requestNativeNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        // Permission denial is non-fatal; in-app notification is the contract.
      }
    }
  }, []);

  const notifyIfReviewTransition = useCallback(
    (stage: string) => {
      if (
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      ) {
        return;
      }
      if (
        stage === "choosing_base" ||
        stage === "reviewing_package" ||
        stage === "completed"
      ) {
        try {
          const body =
            stage === "completed"
              ? "Pacote criativo aprovado."
              : stage === "choosing_base"
                ? "Suas três direções criativas estão prontas."
                : "Pacote de formatos pronto para revisão.";
          new Notification("ADScale", { body });
        } catch {
          // Notification construction failures are non-fatal.
        }
      }
    },
    []
  );

  return {
    command,
    requestNativeNotifications,
    notifyIfReviewTransition,
    stop: (input: Omit<GoalCommandInput, "type">) =>
      command.mutate({ ...input, type: "stop" }),
    resume: (input: Omit<GoalCommandInput, "type">) =>
      command.mutate({ ...input, type: "resume" }),
    abandon: (input: Omit<GoalCommandInput, "type">) =>
      command.mutate({ ...input, type: "abandon" }),
  };
}
