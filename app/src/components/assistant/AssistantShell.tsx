"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import AssistantMobileTabs, { type AssistantMobileTab } from "./AssistantMobileTabs";
import { useAssistantSurface } from "./AssistantSurfaceContext";

const CONTEXT_OPEN_KEY = "adscale:assistant-context-open";

export default function AssistantShell({
  sidebar,
  main,
  contextPanel,
  mode,
}: {
  sidebar: ReactNode;
  main: ReactNode;
  contextPanel: ReactNode;
  /**
   * Workspace mode widens the visual workspace column so the goal-agent
   * candidate/package grid never shrinks below 640px. Conversation mode keeps
   * the legacy three-pane chat layout. When omitted, the shell reads the shared
   * surface flag set by AssistantMain from the goal projection.
   */
  mode?: "conversation" | "workspace";
}) {
  const surface = useAssistantSurface();
  const [contextOpen, setContextOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.sessionStorage.getItem(CONTEXT_OPEN_KEY);
    return stored === null ? true : stored === "true";
  });
  const [mobileTab, setMobileTab] = useState<AssistantMobileTab>("chat");

  const toggleContext = () => {
    const next = !contextOpen;
    setContextOpen(next);
    window.sessionStorage.setItem(CONTEXT_OPEN_KEY, String(next));
  };

  // Workspace mode trades the context panel for a wider visual workspace; the
  // context panel becomes the goal workspace so the candidate/package grid gets
  // the full right column (min 640px). Conversation mode keeps the legacy pane.
  const isWorkspace = mode === "workspace" || surface.workspaceMode;

  return (
    <div className="min-h-screen bg-[var(--surface-base)]">
        <div
          data-testid="assistant-desktop-layout"
          className={cn(
            "hidden min-h-screen md:grid",
            isWorkspace
              ? "grid-cols-[220px_minmax(320px,0.65fr)_minmax(640px,1.35fr)]"
              : contextOpen
                ? "grid-cols-[240px_1fr_320px]"
                : "grid-cols-[240px_1fr]"
          )}
        >
          <aside
            data-testid="assistant-desktop-sidebar"
            className="border-r border-[var(--border-subtle)] bg-[var(--surface-base)]"
          >
            {sidebar}
          </aside>

          <main
            id="main"
            data-testid="assistant-desktop-main"
            className="relative min-w-0 bg-[var(--surface-base)]"
          >
            {main}
            {!isWorkspace && !contextOpen ? (
              <button
                type="button"
                onClick={toggleContext}
                aria-label="Expand context panel"
                className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
            ) : null}
          </main>

          {isWorkspace ? (
            <aside
              data-testid="assistant-desktop-workspace"
              className="relative min-w-[640px] border-l border-[var(--border-subtle)] bg-[var(--surface-base)]"
            >
              {contextPanel}
            </aside>
          ) : contextOpen ? (
            <aside
              data-testid="assistant-desktop-context"
              className="relative border-l border-[var(--border-subtle)] bg-[var(--surface-base)]"
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

        <div
          data-testid="assistant-mobile-layout"
          className="shell-offset-bottom-mobile min-h-screen md:hidden"
        >
          {mobileTab === "tree" ? (
            <div data-testid="assistant-mobile-tree">{sidebar}</div>
          ) : null}
          {mobileTab === "chat" ? (
            <div data-testid="assistant-mobile-chat">{main}</div>
          ) : null}
          {mobileTab === "context" ? (
            <div data-testid="assistant-mobile-context">{contextPanel}</div>
          ) : null}
        </div>

      <AssistantMobileTabs activeTab={mobileTab} onTabChange={setMobileTab} />
    </div>
  );
}
