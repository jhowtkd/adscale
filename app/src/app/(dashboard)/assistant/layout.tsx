import AssistantShell from "@/components/assistant/AssistantShell";
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
        contextPanel={
          <div className="p-4 text-sm text-[var(--text-muted)]" data-testid="assistant-context-placeholder">
            Context
          </div>
        }
      />
    </AssistantSurfaceProvider>
  );
}
