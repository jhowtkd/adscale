"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AssistantCreateCampaignDialog from "./AssistantCreateCampaignDialog";
import AssistantCreateClientDialog from "./AssistantCreateClientDialog";
import AssistantCreateThreadDialog from "./AssistantCreateThreadDialog";
import AssistantTreeSidebar from "./AssistantTreeSidebar";
import { useAssistantSurface } from "./AssistantSurfaceContext";

export default function AssistantSidebarPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedThreadId = searchParams.get("threadId") ?? undefined;
  const { registerFocusTree, registerOpenCreateClient } = useAssistantSurface();

  const [contextClientId, setContextClientId] = useState<string | null>(null);
  const [expandClientId, setExpandClientId] = useState<string | null>(null);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [threadDialogOpen, setThreadDialogOpen] = useState(false);

  const focusTree = useCallback(() => {
    const sidebar = document.querySelector(
      '[data-testid="assistant-tree-sidebar"]'
    );
    sidebar?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  useEffect(() => {
    registerFocusTree(focusTree);
    registerOpenCreateClient(() => setClientDialogOpen(true));
  }, [focusTree, registerFocusTree, registerOpenCreateClient]);

  const navigateToThread = useCallback(
    (threadId: string) => {
      router.replace(`/assistant?threadId=${threadId}`);
    },
    [router]
  );

  const handleClientCreated = (clientId: string) => {
    setContextClientId(clientId);
    setExpandClientId(clientId);
  };

  const handleThreadCreated = (threadId: string) => {
    navigateToThread(threadId);
  };

  return (
    <>
      <AssistantTreeSidebar
        selectedThreadId={selectedThreadId}
        onSelectThread={() => {}}
        contextClientId={contextClientId}
        onContextClientChange={setContextClientId}
        expandClientId={expandClientId}
        onNewClient={() => setClientDialogOpen(true)}
        onNewCampaign={() => setCampaignDialogOpen(true)}
        onNewThread={() => setThreadDialogOpen(true)}
      />

      <AssistantCreateClientDialog
        open={clientDialogOpen}
        onOpenChange={setClientDialogOpen}
        onSuccess={handleClientCreated}
      />

      {contextClientId ? (
        <AssistantCreateCampaignDialog
          open={campaignDialogOpen}
          onOpenChange={setCampaignDialogOpen}
          clientProfileId={contextClientId}
          onSuccess={() => setCampaignDialogOpen(false)}
        />
      ) : null}

      {contextClientId ? (
        <AssistantCreateThreadDialog
          open={threadDialogOpen}
          onOpenChange={setThreadDialogOpen}
          clientProfileId={contextClientId}
          onSuccess={handleThreadCreated}
        />
      ) : null}
    </>
  );
}
