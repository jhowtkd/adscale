"use client";

import { useSearchParams } from "next/navigation";
import AssistantContextPanel from "./AssistantContextPanel";
import AssistantGoalWorkspaceSlot from "./AssistantGoalWorkspaceSlot";
import { useAssistantSurface } from "./AssistantSurfaceContext";

/**
 * Renders the goal-agent workspace when the active thread is in workspace mode,
 * otherwise the classic context panel. The workspace-mode flag is set by
 * AssistantMain from the goal projection; the shell widens the right column to
 * host the workspace here.
 */
export default function AssistantContextPanelSlot() {
  const searchParams = useSearchParams();
  const threadId = searchParams.get("threadId");
  const { workspaceMode } = useAssistantSurface();

  if (workspaceMode && threadId) {
    return <AssistantGoalWorkspaceSlot threadId={threadId} />;
  }

  return <AssistantContextPanel threadId={threadId} />;
}
