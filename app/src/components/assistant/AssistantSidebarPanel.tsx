"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AssistantCreateClientDialog from "./AssistantCreateClientDialog";
import AssistantTreeSidebar from "./AssistantTreeSidebar";
import { useAssistantSurface } from "./AssistantSurfaceContext";
import { useAssistantThread } from "@/lib/hooks/use-assistant-threads";

export default function AssistantSidebarPanel({ threadId, equipeEnabled = false }: {
  threadId?: string;
  equipeEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedThreadId = threadId ?? searchParams.get("threadId") ?? undefined;
  const { data } = useAssistantThread(threadId ?? null);
  const mainClientId = data?.thread.clientProfileId;
  const {
    registerFocusTree,
    registerOpenCreateClient,
    registerStartNewChat,
    setActiveClientId,
    activeClientId,
  } = useAssistantSurface();

  const [contextClientId, setContextClientId] = useState<string | null>(
    activeClientId
  );
  const [expandClientId, setExpandClientId] = useState<string | null>(null);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);

  const focusTree = useCallback(() => {
    const sidebar = document.querySelector(
      '[data-testid="assistant-tree-sidebar"]'
    );
    sidebar?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const startNewChat = useCallback(() => {
    if (!equipeEnabled) router.replace("/assistant");
  }, [equipeEnabled, router]);

  useEffect(() => {
    registerFocusTree(focusTree);
    registerOpenCreateClient(() => {
      if (!equipeEnabled) setClientDialogOpen(true);
    });
    registerStartNewChat(startNewChat);
  }, [equipeEnabled, focusTree, registerFocusTree, registerOpenCreateClient, registerStartNewChat, startNewChat]);

  const handleClientCreated = (clientId: string) => {
    setContextClientId(clientId);
    setExpandClientId(clientId);
    setActiveClientId(clientId);
    router.replace("/assistant");
  };

  const handleNewThread = (clientId: string) => {
    setContextClientId(clientId);
    setActiveClientId(clientId);
    setExpandClientId(clientId);
    router.replace("/assistant");
  };

  const handleContextClientChange = (clientId: string | null) => {
    setContextClientId(clientId);
    if (clientId) {
      setActiveClientId(clientId);
    }
  };

  return (
    <>
      <AssistantTreeSidebar
        selectedThreadId={selectedThreadId}
        onSelectThread={() => {}}
        contextClientId={mainClientId ?? contextClientId}
        onContextClientChange={handleContextClientChange}
        onActiveClientChange={setActiveClientId}
        expandClientId={mainClientId ?? expandClientId}
        onNewClient={!equipeEnabled ? () => setClientDialogOpen(true) : undefined}
        onNewThread={!equipeEnabled ? handleNewThread : undefined}
      />
      {!equipeEnabled ? (
        <AssistantCreateClientDialog
          open={clientDialogOpen}
          onOpenChange={setClientDialogOpen}
          onSuccess={handleClientCreated}
        />
      ) : null}
    </>
  );
}
