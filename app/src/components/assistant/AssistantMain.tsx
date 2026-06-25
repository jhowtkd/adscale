"use client";

import AssistantEmptyState from "./AssistantEmptyState";
import { useAssistantSurface } from "./AssistantSurfaceContext";

export default function AssistantMain({ threadId }: { threadId?: string }) {
  const { focusTree, openCreateClient } = useAssistantSurface();

  if (!threadId) {
    return (
      <AssistantEmptyState
        onSelectTree={focusTree}
        onCreateClient={openCreateClient}
      />
    );
  }

  return (
    <div className="flex h-full min-h-[50vh] flex-col p-6">
      <p className="text-sm text-[var(--text-secondary)]">
        Thread:{" "}
        <span className="font-mono text-[var(--text-primary)]">{threadId}</span>
      </p>
      <div className="mt-4 flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--border-dim)] text-sm text-[var(--text-muted)]">
        Chat placeholder
      </div>
    </div>
  );
}
