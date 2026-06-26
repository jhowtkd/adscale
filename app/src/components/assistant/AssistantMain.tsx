"use client";

import { useRouter } from "next/navigation";
import AssistantChatCore from "./AssistantChatCore";
import AssistantStartComposer from "./AssistantStartComposer";
import { useAssistantSurface } from "./AssistantSurfaceContext";

export default function AssistantMain({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const { openCreateClient, pendingFirstMessage, setPendingFirstMessage } =
    useAssistantSurface();

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
      />
    );
  }

  return (
    <AssistantChatCore
      threadId={threadId}
      variant="full"
      pendingFirstMessage={pendingFirstMessage}
      onPendingFirstMessageConsumed={() => setPendingFirstMessage(null)}
    />
  );
}
