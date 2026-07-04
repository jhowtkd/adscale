"use client";

import AssistantGoalWorkspace from "./AssistantGoalWorkspace";
import { useAssistantThread } from "@/lib/hooks/use-assistant-threads";

/**
 * Fetches the thread (including its goal projection) and renders the
 * stage-aware goal workspace. Kept as a separate slot so the context panel can
 * swap between the classic context panel and the goal workspace without each
 * owning thread-fetch logic.
 */
export default function AssistantGoalWorkspaceSlot({
  threadId,
}: {
  threadId: string;
}) {
  const { data, isLoading } = useAssistantThread(threadId);

  if (isLoading || !data?.goalProjection) {
    return (
      <div
        className="flex h-full items-center justify-center p-6 text-sm text-[var(--text-muted)]"
        data-testid="assistant-goal-workspace-loading"
      >
        Carregando…
      </div>
    );
  }

  return (
    <AssistantGoalWorkspace
      threadId={threadId}
      projection={data.goalProjection}
      artifactLineages={data.artifactVersionState?.lineages ?? []}
    />
  );
}
