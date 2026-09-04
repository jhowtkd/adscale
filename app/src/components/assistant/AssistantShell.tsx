"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/hooks/use-media-query";
import AssistantMobileTabs, { type AssistantMobileTab } from "./AssistantMobileTabs";
import { useAssistantSurface } from "./AssistantSurfaceContext";
import { assistantShellClass } from "./assistant-chrome";

export default function AssistantShell({
  sidebar,
  main,
  contextPanel,
  mode,
  hideDesktopSidebar = false,
}: {
  sidebar: ReactNode;
  main: ReactNode;
  contextPanel: ReactNode;
  hideDesktopSidebar?: boolean;
  /**
   * Workspace mode widens the visual workspace column so the goal-agent
   * candidate/package grid never shrinks below 640px. Conversation mode keeps
   * the legacy three-pane chat layout. When omitted, the shell reads the shared
   * surface flag set by AssistantMain from the goal projection.
   */
  mode?: "conversation" | "workspace";
}) {
  const surface = useAssistantSurface();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const activeThreadId = searchParams.get("threadId");
  const hasContext = Boolean(activeThreadId);
  const [contextOpenByThread, setContextOpenByThread] = useState<
    Partial<Record<string, boolean>>
  >({});
  const contextOpen = activeThreadId
    ? contextOpenByThread[activeThreadId] ?? false
    : false;
  // Tab preference is keyed by thread so navigating to a new thread lands on
  // chat without a setState-in-effect sync (lint: react-hooks/set-state-in-effect).
  const threadTabKey = activeThreadId ?? "_none";
  const [mobileTabByThread, setMobileTabByThread] = useState<
    Partial<Record<string, AssistantMobileTab>>
  >({});
  const mobileTab = mobileTabByThread[threadTabKey] ?? "chat";
  const setMobileTab = (tab: AssistantMobileTab) => {
    setMobileTabByThread((prev) => ({ ...prev, [threadTabKey]: tab }));
  };

  const toggleContext = () => {
    if (!activeThreadId) return;
    setContextOpenByThread((prev) => ({
      ...prev,
      [activeThreadId]: !contextOpen,
    }));
  };

  // Workspace mode trades the context panel for a wider visual workspace; the
  // context panel becomes the goal workspace so the candidate/package grid gets
  // the full right column (min 640px). Conversation mode keeps the legacy pane.
  const isWorkspace = mode === "workspace" || surface.workspaceMode;

  const mainPanel = (
    <div
      data-testid={isMobile ? "assistant-mobile-chat" : "assistant-desktop-main"}
      className="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--canvas)]"
    >
      {main}
      {!isMobile && !isWorkspace && hasContext && !contextOpen ? (
        <button
          type="button"
          onClick={toggleContext}
          aria-label="Expand context panel"
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );

  if (isMobile) {
    return (
      <div className={assistantShellClass}>
        <div
          data-testid="assistant-mobile-layout"
          className="shell-offset-bottom-mobile flex min-h-0 flex-1 flex-col"
        >
          {mobileTab === "tree" ? (
            <div data-testid="assistant-mobile-tree" className="min-h-0 flex-1 overflow-y-auto">
              {sidebar}
            </div>
          ) : null}
          {mobileTab === "chat" ? mainPanel : null}
          {mobileTab === "context" ? (
            <div data-testid="assistant-mobile-context" className="min-h-0 flex-1 overflow-y-auto">
              {contextPanel}
            </div>
          ) : null}
        </div>
        <AssistantMobileTabs
          activeTab={mobileTab}
          onTabChange={setMobileTab}
          showContext={hasContext}
        />
      </div>
    );
  }

  return (
    <div className={assistantShellClass}>
        <div
          data-testid="assistant-desktop-layout"
          className={cn(
            "h-full min-h-0 flex-1 overflow-hidden md:grid",
            hideDesktopSidebar
              ? isWorkspace
                ? "grid-cols-[minmax(320px,0.65fr)_minmax(640px,1.35fr)]"
                : hasContext && contextOpen
                  ? "grid-cols-[1fr_320px]"
                  : "grid-cols-1"
              : isWorkspace
                ? "grid-cols-[220px_minmax(320px,0.65fr)_minmax(640px,1.35fr)]"
                : hasContext && contextOpen
                  ? "grid-cols-[240px_1fr_320px]"
                  : "grid-cols-[240px_1fr]"
          )}
        >
          {!hideDesktopSidebar ? (
            <aside
              data-testid="assistant-desktop-sidebar"
              className="border-r border-[var(--border-subtle)] bg-[var(--canvas)]"
            >
              {sidebar}
            </aside>
          ) : null}

          {mainPanel}

          {isWorkspace ? (
            <aside
              data-testid="assistant-desktop-workspace"
              className="relative min-w-[640px] border-l border-[var(--border-subtle)] bg-[var(--canvas)]"
            >
              {contextPanel}
            </aside>
          ) : hasContext && contextOpen ? (
            <aside
              data-testid="assistant-desktop-context"
              className="relative min-h-0 overflow-hidden border-l border-[var(--border-subtle)] bg-[var(--canvas)]"
            >
              <button
                type="button"
                onClick={toggleContext}
                aria-label="Collapse context panel"
                className="absolute left-2 top-2 z-10 flex size-8 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              {contextPanel}
            </aside>
          ) : null}
        </div>
    </div>
  );
}
