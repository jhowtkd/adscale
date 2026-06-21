"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import WorkspaceDetailPanel from "@/components/admin/WorkspaceDetailPanel";

export default function AdminWorkspaceDetailPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
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

      <WorkspaceDetailPanel workspaceId={workspaceId} />
    </PageFrame>
  );
}
