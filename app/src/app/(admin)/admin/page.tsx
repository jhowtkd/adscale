"use client";

import { useTranslations } from "next-intl";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import DashboardSummary from "@/components/admin/DashboardSummary";

export default function AdminDashboardPage() {
  const t = useTranslations("admin.dashboard");

  return (
    <PageFrame width="operational" className="space-y-6 py-8">
      <PageHeader title={t("title")} description={t("description")} />
      <DashboardSummary />
    </PageFrame>
  );
}
