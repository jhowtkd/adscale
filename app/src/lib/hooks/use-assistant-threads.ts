import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GuidedFlow } from "./use-guided-flow";
import type { GuidedFlowPresentation } from "@/lib/guided-flow/commands";
import {
  artifactVersionPresentationSchema,
  type ArtifactVersionPresentation,
} from "@/lib/assistant/artifact-version";

export interface AssistantThread {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  campaignId: string | null;
  name: string;
  isDefault: boolean;
  migratedFromThreadId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssistantMessage {
  id: string;
  workspaceId: string;
  threadId: string;
  sequence: number;
  type: string;
  content: string;
  payload: Record<string, unknown>;
  actionRecordId: string | null;
  createdAt: Date;
}

export interface AssistantThreadDetail {
  thread: AssistantThread;
  messages: AssistantMessage[];
  artifactVersionState?: { lineages: ArtifactVersionPresentation[] };
  guidedFlow?: GuidedFlow;
  guidedPresentation?: GuidedFlowPresentation;
}

function mapThread(thread: AssistantThread): AssistantThread {
  return {
    ...thread,
    createdAt: new Date(thread.createdAt),
    updatedAt: new Date(thread.updatedAt),
  };
}

function mapMessage(message: AssistantMessage): AssistantMessage {
  return {
    ...message,
    createdAt: new Date(message.createdAt),
  };
}

function buildThreadsUrl(
  clientProfileId: string,
  campaignId?: string | null
): string {
  const params = new URLSearchParams({ clientProfileId });
  if (campaignId !== undefined) {
    params.set("campaignId", campaignId ?? "null");
  }
  return `/api/assistant/threads?${params}`;
}

async function fetchAssistantThreads(
  clientProfileId: string,
  campaignId?: string | null
): Promise<AssistantThread[]> {
  const res = await apiFetch(buildThreadsUrl(clientProfileId, campaignId));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar threads");
  }
  const data = await res.json();
  return (data.threads as AssistantThread[]).map(mapThread);
}

async function fetchAssistantThread(
  threadId: string
): Promise<AssistantThreadDetail> {
  const res = await apiFetch(`/api/assistant/threads/${threadId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar conversa");
  }
  const data = await res.json();
  return {
    thread: mapThread(data.thread as AssistantThread),
    messages: (data.messages as AssistantMessage[]).map(mapMessage),
    ...(data.artifactVersionState
      ? {
          artifactVersionState: {
            lineages: (data.artifactVersionState.lineages as unknown[]).map(
              (lineage) => artifactVersionPresentationSchema.parse(lineage)
            ),
          },
        }
      : {}),
    ...(data.guidedFlow
      ? {
          guidedFlow: data.guidedFlow as GuidedFlow,
          guidedPresentation: data.guidedPresentation as
            | GuidedFlowPresentation
            | undefined,
        }
      : {}),
  };
}

async function createAssistantThread(payload: {
  clientProfileId: string;
  campaignId?: string;
  name?: string;
  isDefault?: boolean;
  experience?: "agent" | "classic";
}): Promise<AssistantThread> {
  const res = await apiFetch("/api/assistant/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar thread");
  }
  const data = await res.json();
  return mapThread(data.thread as AssistantThread);
}

export function assistantThreadsQueryKey(
  clientProfileId: string,
  campaignId?: string | null
) {
  return ["assistant", "threads", clientProfileId, campaignId ?? "all"] as const;
}

export function assistantThreadQueryKey(threadId: string) {
  return ["assistant", "thread", threadId] as const;
}

export function useAssistantThreads(
  clientProfileId: string | null,
  campaignId?: string | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: clientProfileId
      ? assistantThreadsQueryKey(clientProfileId, campaignId)
      : ["assistant", "threads", "disabled"],
    queryFn: () => fetchAssistantThreads(clientProfileId!, campaignId),
    enabled: !!clientProfileId && (options?.enabled ?? true),
    staleTime: STALE_TIME.DYNAMIC,
  });
}

const ACTIVE_ACTION_CARD_STATUSES = new Set([
  "pending",
  "confirmed",
  "running",
]);

function threadHasActiveActionCards(
  messages: AssistantMessage[] | undefined
): boolean {
  return (
    messages?.some((message) => {
      if (message.type !== "action_card") {
        return false;
      }
      const status = message.payload.status;
      return (
        typeof status === "string" && ACTIVE_ACTION_CARD_STATUSES.has(status)
      );
    }) ?? false
  );
}

export function useAssistantThread(
  threadId: string | null,
  options?: { pollWhileActive?: boolean }
) {
  return useQuery({
    queryKey: threadId
      ? assistantThreadQueryKey(threadId)
      : ["assistant", "thread", "disabled"],
    queryFn: () => fetchAssistantThread(threadId!),
    enabled: !!threadId,
    staleTime: STALE_TIME.DYNAMIC,
    refetchInterval: options?.pollWhileActive
      ? (query) => {
          const data = query.state.data as AssistantThreadDetail | undefined;
          return threadHasActiveActionCards(data?.messages)
            ? STALE_TIME.REALTIME
            : false;
        }
      : false,
  });
}

export function useCreateAssistantThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAssistantThread,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant", "threads"] });
    },
  });
}
