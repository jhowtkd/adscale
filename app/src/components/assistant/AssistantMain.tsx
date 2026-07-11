"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AssistantChatCore from "./AssistantChatCore";
import AssistantStartComposer from "./AssistantStartComposer";
import { useAssistantSurface } from "./AssistantSurfaceContext";
import { useAssistantThread } from "@/lib/hooks/use-assistant-threads";

export default function AssistantMain({
  threadId,
  goalAgentEligible = false,
}: {
  threadId?: string;
  goalAgentEligible?: boolean;
}) {
  const router = useRouter();
  const {
    openCreateClient,
    pendingFirstMessage,
    setPendingFirstMessage,
    setWorkspaceMode,
  } = useAssistantSurface();

  // Fetch the active thread so we can switch the shell into workspace mode when
  // the goal projection has candidates. Classic threads keep conversation mode.
  const { data } = useAssistantThread(threadId ?? null);
  const hasCandidates = Boolean(
    data?.goalProjection &&
      (data.goalProjection.candidates.length > 0 ||
        data.goalProjection.packageItems.some((item) => item.status !== "pending") ||
        [
          "choosing_base",
          "reviewing_base",
          "reviewing_package",
          "awaiting_package",
          "generating_package",
        ].includes(data.goalProjection.stage))
  );
  useEffect(() => {
    setWorkspaceMode(hasCandidates);
    return () => setWorkspaceMode(false);
  }, [hasCandidates, setWorkspaceMode]);

  const handleSelectThread = (id: string) => {
    router.replace(`/assistant?threadId=${id}`);
  };

  const handleStartThread = (id: string) => {
    handleSelectThread(id);
  };

  if (!threadId) {
    return (
      <AssistantStartComposer
        onSelectThread={handleStartThread}
        onCreateClient={openCreateClient}
        goalAgentEligible={goalAgentEligible}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AssistantChatCore
        threadId={threadId}
        variant="full"
        pendingFirstMessage={pendingFirstMessage}
        onPendingFirstMessageConsumed={() => setPendingFirstMessage(null)}
      />
    </div>
  );
}
