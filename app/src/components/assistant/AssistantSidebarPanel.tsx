"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AssistantTreeSidebar from "./AssistantTreeSidebar";
import { useAssistantSurface } from "./AssistantSurfaceContext";
import { useAssistantThread } from "@/lib/hooks/use-assistant-threads";

export default function AssistantSidebarPanel({ threadId }: { threadId?: string }) {
  const searchParams = useSearchParams();
  const selectedThreadId = threadId ?? searchParams.get("threadId") ?? undefined;
  const { data } = useAssistantThread(threadId ?? null);
  const mainClientId = data?.thread.clientProfileId;
  const {
    registerFocusTree,
    setActiveClientId,
    activeClientId,
  } = useAssistantSurface();

  const [contextClientId, setContextClientId] = useState<string | null>(
    activeClientId
  );

  const focusTree = useCallback(() => {
    const sidebar = document.querySelector(
      '[data-testid="assistant-tree-sidebar"]'
    );
    sidebar?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  useEffect(() => {
    registerFocusTree(focusTree);
  }, [focusTree, registerFocusTree]);

  const handleContextClientChange = (clientId: string | null) => {
    setContextClientId(clientId);
    if (clientId) {
      setActiveClientId(clientId);
    }
  };

  return (
    <AssistantTreeSidebar
      selectedThreadId={selectedThreadId}
      onSelectThread={() => {}}
      contextClientId={mainClientId ?? contextClientId}
      onContextClientChange={handleContextClientChange}
      onActiveClientChange={setActiveClientId}
      expandClientId={mainClientId}
    />
  );
}
