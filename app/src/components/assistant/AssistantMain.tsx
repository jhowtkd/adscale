"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import AssistantChatCore from "./AssistantChatCore";
import AssistantStartComposer from "./AssistantStartComposer";
import { useAssistantSurface } from "./AssistantSurfaceContext";
import { useAssistantChat } from "@/lib/hooks/use-assistant-chat";

export default function AssistantMain({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const {
    openCreateClient,
    pendingFirstMessage,
    setPendingFirstMessage,
  } = useAssistantSurface();
  const { sendMessage } = useAssistantChat(threadId ?? null);

  const sendingRef = useRef(false);

  useEffect(() => {
    if (!threadId || !pendingFirstMessage || sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    const message = pendingFirstMessage;
    setPendingFirstMessage(null);
    void sendMessage(message).finally(() => {
      sendingRef.current = false;
    });
  }, [threadId, pendingFirstMessage, sendMessage, setPendingFirstMessage]);

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

  return <AssistantChatCore threadId={threadId} variant="full" />;
}
