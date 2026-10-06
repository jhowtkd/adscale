import AssistantShell from "@/components/assistant/AssistantShell";
import AssistantContextPanelSlot from "@/components/assistant/AssistantContextPanelSlot";
import AssistantSidebarPanel from "@/components/assistant/AssistantSidebarPanel";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { usesEquipeProduct } from "@/server/equipe/module/free-plan";

export default async function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace } = await requireWorkspaceAccess();
  const equipeEnabled = await usesEquipeProduct(workspace.id);
  // The pilot's conversation screen brings its own panel and chat (the rail shell is the layout above it).
  if (equipeEnabled) return <>{children}</>;
  return (
    <AssistantShell
      sidebar={<AssistantSidebarPanel />}
      hideDesktopSidebar
      main={children}
      contextPanel={<AssistantContextPanelSlot />}
    />
  );
}
