"use client";

import { useSearchParams } from "next/navigation";
import AssistantContextPanel from "./AssistantContextPanel";

export default function AssistantContextPanelSlot() {
  const searchParams = useSearchParams();
  const threadId = searchParams.get("threadId");

  return <AssistantContextPanel threadId={threadId} />;
}
