"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import WorkspaceDetailPanel from "@/components/admin/WorkspaceDetailPanel";

type AdminWorkspaceDetailPageProps = {
  params: { id: string };
};

export default function AdminWorkspaceDetailPage({ params }: AdminWorkspaceDetailPageProps) {
  const t = useTranslations("admin.workspaces.detail");

  return (
    <PageFrame width="operational" className="space-y-6 py-8">
      <div className="space-y-2">
        <Link
          href="/admin/users"
          className="text-sm text-[var(--accent-green)] hover:underline"
        >
          {t("backToUsers")}
        </Link>
        <PageHeader title={t("title")} description={t("description")} />
      </div>

      <WorkspaceDetailPanel workspaceId={params.id} />
    </PageFrame>
  );
}
