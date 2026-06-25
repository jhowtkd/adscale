"use client";

import AssistantChatCore from "./AssistantChatCore";
import AssistantEmptyState from "./AssistantEmptyState";
import { useAssistantSurface } from "./AssistantSurfaceContext";

export default function AssistantMain({ threadId }: { threadId?: string }) {
  const { focusTree, openCreateClient } = useAssistantSurface();

  if (!threadId) {
    return (
      <AssistantEmptyState
        onSelectTree={focusTree}
        onCreateClient={openCreateClient}
      />
    );
  }

  return <AssistantChatCore threadId={threadId} variant="full" />;
}
