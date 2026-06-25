"use client";

import { usePathname } from "next/navigation";
import AppShell from "./AppShell";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { MissionInsightProvider } from "@/components/mission-insights/MissionInsightProvider";

export default function DashboardShellSwitcher({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAssistant = pathname.startsWith("/assistant");

  if (isAssistant) {
    return (
      <FeedbackProvider>
        <MissionInsightProvider>{children}</MissionInsightProvider>
      </FeedbackProvider>
    );
  }

  return <AppShell>{children}</AppShell>;
}
