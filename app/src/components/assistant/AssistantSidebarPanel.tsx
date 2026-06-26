"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AssistantCreateClientDialog from "./AssistantCreateClientDialog";
import AssistantTreeSidebar from "./AssistantTreeSidebar";
import { useAssistantSurface } from "./AssistantSurfaceContext";

export default function AssistantSidebarPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedThreadId = searchParams.get("threadId") ?? undefined;
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
    router.replace("/assistant");
  }, [router]);

  useEffect(() => {
    registerFocusTree(focusTree);
    registerOpenCreateClient(() => setClientDialogOpen(true));
    registerStartNewChat(startNewChat);
  }, [focusTree, registerFocusTree, registerOpenCreateClient, registerStartNewChat, startNewChat]);

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
        contextClientId={contextClientId}
        onContextClientChange={handleContextClientChange}
        onActiveClientChange={setActiveClientId}
        expandClientId={expandClientId}
        onNewClient={() => setClientDialogOpen(true)}
        onNewThread={handleNewThread}
      />

      <AssistantCreateClientDialog
        open={clientDialogOpen}
        onOpenChange={setClientDialogOpen}
        onSuccess={handleClientCreated}
      />
    </>
  );
}
