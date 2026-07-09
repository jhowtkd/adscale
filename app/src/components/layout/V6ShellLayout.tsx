"use client";

import { Suspense, type ReactNode } from "react";
import TopBar from "./TopBar";
import AppSidebar from "./AppSidebar";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { MissionInsightProvider } from "@/components/mission-insights/MissionInsightProvider";
import FeedbackBreadcrumbTracker from "@/components/feedback/FeedbackBreadcrumbTracker";
import { AssistantSurfaceProvider } from "@/components/assistant/AssistantSurfaceContext";

export default function V6ShellLayout({
  children,
  sidebarVariant = "production",
}: {
  children: ReactNode;
  sidebarVariant?: "production" | "preview";
}) {
  return (
    <AssistantSurfaceProvider>
      <FeedbackProvider>
        <MissionInsightProvider>
          <div className="min-h-screen bg-[var(--canvas)]">
            <Suspense fallback={null}>
              <FeedbackBreadcrumbTracker />
            </Suspense>
            <AppSidebar variant={sidebarVariant} />
            <TopBar variant="v6-floating" />
            {children}
          </div>
        </MissionInsightProvider>
      </FeedbackProvider>
    </AssistantSurfaceProvider>
  );
}
