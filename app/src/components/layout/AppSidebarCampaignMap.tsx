"use client";

import { Suspense } from "react";
import AssistantSidebarPanel from "@/components/assistant/AssistantSidebarPanel";

export default function AppSidebarCampaignMap() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={null}>
        <AssistantSidebarPanel />
      </Suspense>
    </div>
  );
}
