import AssistantShell from "@/components/assistant/AssistantShell";

export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AssistantShell
      sidebar={
        <div className="p-4 text-sm text-[var(--text-muted)]" data-testid="assistant-sidebar-placeholder">
          Tree
        </div>
      }
      main={children}
      contextPanel={
        <div className="p-4 text-sm text-[var(--text-muted)]" data-testid="assistant-context-placeholder">
          Context
        </div>
      }
    />
  );
}
