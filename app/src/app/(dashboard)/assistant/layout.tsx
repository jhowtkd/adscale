import AssistantShell from "@/components/assistant/AssistantShell";
import AssistantContextPanelSlot from "@/components/assistant/AssistantContextPanelSlot";
import AssistantSidebarPanel from "@/components/assistant/AssistantSidebarPanel";

export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AssistantShell
      sidebar={<AssistantSidebarPanel />}
      hideDesktopSidebar
      main={children}
      contextPanel={<AssistantContextPanelSlot />}
    />
  );
}
