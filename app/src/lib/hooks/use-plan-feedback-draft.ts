"use client";

import { apiFetch } from "@/lib/api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, startTransition } from "react";

const DEBOUNCE_MS = 500;

function planFeedbackDraftQueryKey(threadId: string) {
  return ["assistant", "plan-feedback-draft", threadId] as const;
}

async function fetchPlanFeedbackDraft(threadId: string): Promise<string> {
  const res = await apiFetch(
    `/api/assistant/threads/${threadId}/plan-revisions`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar rascunho do plano");
  }
  const data = (await res.json()) as { draftText?: string };
  return data.draftText ?? "";
}

async function savePlanFeedbackDraft(
  threadId: string,
  draftText: string
): Promise<string> {
  const res = await apiFetch(
    `/api/assistant/threads/${threadId}/plan-revisions`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftText }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao salvar rascunho do plano");
  }
  const data = (await res.json()) as { draftText?: string };
  return data.draftText ?? "";
}

export function usePlanFeedbackDraft(
  threadId: string | null,
  { enabled }: { enabled: boolean }
) {
  const queryClient = useQueryClient();
  const lastServerValueRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftText, setDraftText] = useState("");
  const hydratedThreadRef = useRef<string | null>(null);

  const isActive = enabled && Boolean(threadId);

  const { data: serverDraft, isLoading } = useQuery({
    queryKey: threadId
      ? planFeedbackDraftQueryKey(threadId)
      : ["assistant", "plan-feedback-draft", "none"],
    queryFn: () => fetchPlanFeedbackDraft(threadId!),
    enabled: isActive,
  });

  useEffect(() => {
    startTransition(() => {
      if (!threadId || !isActive) {
        hydratedThreadRef.current = null;
        setDraftText("");
        lastServerValueRef.current = "";
        return;
      }

      if (serverDraft === undefined || hydratedThreadRef.current === threadId) {
        return;
      }

      hydratedThreadRef.current = threadId;
      setDraftText(serverDraft);
      lastServerValueRef.current = serverDraft;
    });
  }, [threadId, isActive, serverDraft]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const onDraftTextChange = useCallback(
    (text: string) => {
      setDraftText(text);
      if (!threadId || !isActive) {
        return;
      }
      if (text === lastServerValueRef.current) {
        return;
      }

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        void savePlanFeedbackDraft(threadId, text)
          .then((saved) => {
            lastServerValueRef.current = saved;
            queryClient.setQueryData(
              planFeedbackDraftQueryKey(threadId),
              saved
            );
          })
          .catch(() => {
            // Autosave failures are non-blocking; user can still send feedback.
          });
      }, DEBOUNCE_MS);
    },
    [threadId, isActive, queryClient]
  );

  const clearDraft = useCallback(async () => {
    if (!threadId || !isActive) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    setDraftText("");
    lastServerValueRef.current = "";

    try {
      await savePlanFeedbackDraft(threadId, "");
      queryClient.setQueryData(planFeedbackDraftQueryKey(threadId), "");
    } catch {
      // Clearing is best-effort after send.
    }
  }, [threadId, isActive, queryClient]);

  return {
    draftText,
    onDraftTextChange,
    clearDraft,
    isLoading: isActive && isLoading,
  };
}
