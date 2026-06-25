import AssistantShell from "@/components/assistant/AssistantShell";
import AssistantContextPanelSlot from "@/components/assistant/AssistantContextPanelSlot";
import AssistantSidebarPanel from "@/components/assistant/AssistantSidebarPanel";
import { AssistantSurfaceProvider } from "@/components/assistant/AssistantSurfaceContext";

export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AssistantSurfaceProvider>
      <AssistantShell
        sidebar={<AssistantSidebarPanel />}
        main={children}
        contextPanel={<AssistantContextPanelSlot />}
      />
    </AssistantSurfaceProvider>
  );
}
