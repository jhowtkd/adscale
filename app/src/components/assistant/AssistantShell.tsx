"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import AssistantMobileTabs, { type AssistantMobileTab } from "./AssistantMobileTabs";

const CONTEXT_OPEN_KEY = "adscale:assistant-context-open";

export default function AssistantShell({
  sidebar,
  main,
  contextPanel,
}: {
  sidebar: ReactNode;
  main: ReactNode;
  contextPanel: ReactNode;
}) {
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

  return (
    <div className="min-h-[var(--shell-min-height-below-topbar,100vh)] bg-[var(--surface-base)]">
        <div
          data-testid="assistant-desktop-layout"
          className={cn(
            "hidden min-h-[var(--shell-min-height-below-topbar,100vh)] md:grid",
            contextOpen ? "grid-cols-[240px_1fr_320px]" : "grid-cols-[240px_1fr]"
          )}
        >
          <aside
            data-testid="assistant-desktop-sidebar"
            className="border-r border-[var(--border-dim)] bg-[var(--surface-base)]"
          >
            {sidebar}
          </aside>

          <main
            id="main"
            data-testid="assistant-desktop-main"
            className="relative min-w-0 border-[var(--border-dim)] bg-[var(--surface-base)]"
          >
            {main}
            {!contextOpen ? (
              <button
                type="button"
                onClick={toggleContext}
                aria-label="Expand context panel"
                className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
            ) : null}
          </main>

          {contextOpen ? (
            <aside
              data-testid="assistant-desktop-context"
              className="relative border-l border-[var(--border-dim)] bg-[var(--surface-base)]"
            >
              <button
                type="button"
                onClick={toggleContext}
                aria-label="Collapse context panel"
                className="absolute left-2 top-2 z-10 flex size-8 items-center justify-center rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              {contextPanel}
            </aside>
          ) : null}
        </div>

        <div
          data-testid="assistant-mobile-layout"
          className="shell-offset-bottom-mobile min-h-[var(--shell-min-height-below-topbar,100vh)] md:hidden"
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
