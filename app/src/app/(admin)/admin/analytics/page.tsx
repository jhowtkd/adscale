"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { OwnerAnalyticsPanel } from "@/components/feedback/OwnerAnalyticsPanel";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";

export default function AdminAnalyticsPage() {
  const sessionsQuery = useQuery({
    queryKey: ["beta-sessions-list"],
    queryFn: async () => {
      const res = await apiFetch("/api/feedback/sessions");
      if (res.status === 403) return [];
      if (!res.ok) throw new Error("failed");
      const payload = (await res.json()) as {
        sessions?: Array<{ id: string; cohortLabel: string | null; startedAt: string }>;
      };
      return payload.sessions ?? [];
    },
    retry: false,
  });

  const sessionOptions = useMemo(
    () =>
      (sessionsQuery.data ?? []).map((session) => ({
        id: session.id,
        label: session.cohortLabel ?? `Session ${session.id.slice(0, 8)}`,
      })),
    [sessionsQuery.data]
  );

  return (
    <PageFrame width="operational" className="min-w-0 space-y-6 py-8">
      <PageHeader title="Analytics" />
      <OwnerAnalyticsPanel sessionOptions={sessionOptions} />
    </PageFrame>
  );
}
