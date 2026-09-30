import AssistantShell from "@/components/assistant/AssistantShell";
import AssistantContextPanelSlot from "@/components/assistant/AssistantContextPanelSlot";
import AssistantSidebarPanel from "@/components/assistant/AssistantSidebarPanel";
import { getSession } from "@/server/auth/session";
import { getWorkspaceForUser } from "@/server/repositories/workspace";
import { isEquipeEnabledForWorkspace } from "@/server/equipe/module/equipe-enabled";

export default async function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const workspace = session?.user ? await getWorkspaceForUser(session.user.id) : null;
  const equipeEnabled = !!workspace && isEquipeEnabledForWorkspace(workspace.id);
  return (
    <AssistantShell
      sidebar={<AssistantSidebarPanel equipeEnabled={equipeEnabled} />}
      hideDesktopSidebar
      main={children}
      contextPanel={<AssistantContextPanelSlot />}
    />
  );
}
