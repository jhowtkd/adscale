"use client";

import { Suspense, type ReactNode } from "react";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { MissionInsightProvider } from "@/components/mission-insights/MissionInsightProvider";
import FeedbackBreadcrumbTracker from "@/components/feedback/FeedbackBreadcrumbTracker";
import { AssistantSurfaceProvider } from "@/components/assistant/AssistantSurfaceContext";

export default function V6ShellLayout({ children, sidebar }: { children: ReactNode; sidebar: ReactNode }) {
  return (
    <AssistantSurfaceProvider>
      <FeedbackProvider>
        <MissionInsightProvider>
          <div className="min-h-screen bg-[var(--canvas)]">
            <Suspense fallback={null}>
              <FeedbackBreadcrumbTracker />
            </Suspense>
            {sidebar}
            {children}
          </div>
        </MissionInsightProvider>
      </FeedbackProvider>
    </AssistantSurfaceProvider>
  );
}
