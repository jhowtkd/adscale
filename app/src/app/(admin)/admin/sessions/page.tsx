"use client";

import { useTranslations } from "next-intl";
import { BetaSessionsPanel } from "@/components/feedback/BetaSessionsPanel";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";

export default function AdminSessionsPage() {
  const t = useTranslations("admin.sessions");

  return (
    <PageFrame width="operational" className="min-w-0 space-y-6 py-8">
      <PageHeader title={t("title")} description={t("description")} />
      <BetaSessionsPanel />
    </PageFrame>
  );
}
