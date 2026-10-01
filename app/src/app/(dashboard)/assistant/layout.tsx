import AssistantShell from "@/components/assistant/AssistantShell";
import AssistantContextPanelSlot from "@/components/assistant/AssistantContextPanelSlot";
import AssistantSidebarPanel from "@/components/assistant/AssistantSidebarPanel";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { isEquipeEnabledForWorkspace } from "@/server/equipe/module/equipe-enabled";

export default async function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace } = await requireWorkspaceAccess();
  const equipeEnabled = isEquipeEnabledForWorkspace(workspace.id);
  return (
    <AssistantShell
      sidebar={<AssistantSidebarPanel equipeEnabled={equipeEnabled} />}
      hideDesktopSidebar
      main={children}
      contextPanel={<AssistantContextPanelSlot />}
    />
  );
}
